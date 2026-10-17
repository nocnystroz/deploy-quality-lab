import type {
  Artifact,
  SmokeCase,
  SmokeCheckResult,
  SmokeSuite,
} from "../shared/types";
import { blockedUrlPatterns } from "../shared/network";
import { smokeUrl } from "../shared/smoke";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const send = (
  target: chrome.debugger.Debuggee,
  method: string,
  params?: object,
) => chrome.debugger.sendCommand(target, method, params);
function event(
  target: chrome.debugger.Debuggee,
  name: string,
  timeout: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(listener);
      reject(new Error(`Timeout: ${name}`));
    }, timeout);
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params: any,
    ) => {
      if (source.tabId === target.tabId && method === name) {
        clearTimeout(timer);
        chrome.debugger.onEvent.removeListener(listener);
        resolve(params);
      }
    };
    chrome.debugger.onEvent.addListener(listener);
  });
}
async function trace(
  target: chrome.debugger.Debuggee,
  timeout: number,
): Promise<Artifact | undefined> {
  const complete = event(target, "Tracing.tracingComplete", timeout);
  await send(target, "Tracing.end");
  const info = await complete;
  if (!info.stream) return undefined;
  let output = "";
  while (true) {
    const chunk = (await send(target, "IO.read", { handle: info.stream })) as {
      data?: string;
      eof?: boolean;
    };
    output += chunk.data ?? "";
    if (chunk.eof) break;
  }
  await send(target, "IO.close", { handle: info.stream });
  return {
    kind: "trace",
    filename: "smoke-trace.json",
    mimeType: "application/json",
    content: output,
  };
}

type Interaction = NonNullable<SmokeCheckResult["interactions"]>[number];
async function snapshot(tabId: number) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const resources = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      return {
        at: performance.now(),
        url: location.href,
        resources: resources.length,
        bytes: resources.reduce(
          (sum, item) => sum + (item.transferSize || 0),
          0,
        ),
      };
    },
  });
  return result[0]?.result as {
    at: number;
    url: string;
    resources: number;
    bytes: number;
  };
}
async function actions(
  tabId: number,
  steps: SmokeCase["actions"],
  failures: string[],
): Promise<Interaction[]> {
  const measurements: Interaction[] = [];
  for (const step of steps) {
    if (step.type === "wait") {
      await sleep(step.durationMs);
      continue;
    }
    if (step.type === "scroll") {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (x, y) => window.scrollTo(x, y),
        args: [step.x, step.y],
      });
      continue;
    }
    const before = await snapshot(tabId);
    const deadline = Date.now() + step.timeoutMs;
    let found = false;
    while (Date.now() < deadline && !found) {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const item = document.querySelector(selector) as HTMLElement | null;
          item?.click();
          return Boolean(item);
        },
        args: [step.selector],
      });
      found = Boolean(result[0]?.result);
      if (!found) await sleep(100);
    }
    if (!found && !step.optional)
      failures.push(`Required click not found: ${step.selector}`);
    if (found) {
      await sleep(500);
      const after = await snapshot(tabId);
      measurements.push({
        action: `click ${step.selector}`,
        durationMs: Math.round(after.at - before.at),
        routeChanged: after.url !== before.url,
        resources: Math.max(0, after.resources - before.resources),
        transferBytes: Math.max(0, after.bytes - before.bytes),
      });
    }
  }
  return measurements;
}

export async function runSmokeCase(
  suite: SmokeSuite,
  item: SmokeCase,
): Promise<SmokeCheckResult> {
  const url = smokeUrl(suite, item.path);
  const started = performance.now();
  const failures: string[] = [];
  const records: any[] = [];
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (tab.id === undefined) throw new Error("Could not create test tab.");
  const target = { tabId: tab.id };
  const listener = (
    source: chrome.debugger.Debuggee,
    method: string,
    params: any,
  ) => {
    if (source.tabId !== tab.id) return;
    if (method === "Network.requestWillBeSent")
      records.push({
        id: params.requestId,
        url: params.request.url,
        method: params.request.method,
        started: params.timestamp,
        type: params.type,
      });
    if (method === "Network.responseReceived") {
      const record = records.find((value) => value.id === params.requestId);
      if (record)
        Object.assign(record, {
          status: params.response.status,
          mimeType: params.response.mimeType,
        });
    }
    if (method === "Network.loadingFinished") {
      const record = records.find((value) => value.id === params.requestId);
      if (record)
        Object.assign(record, {
          finished: params.timestamp,
          bytes: params.encodedDataLength,
        });
    }
  };
  chrome.debugger.onEvent.addListener(listener);
  try {
    await chrome.debugger.attach(target, "1.3");
    await send(target, "Network.enable");
    await send(target, "Page.enable");
    await send(target, "Tracing.start", {
      categories: "devtools.timeline,loading",
      transferMode: "ReturnAsStream",
    });
    const blocked = blockedUrlPatterns(suite.blockedPatterns);
    if (blocked.length)
      await send(target, "Network.setBlockedURLs", { urls: blocked });
    const loaded = event(target, "Page.loadEventFired", suite.requestTimeoutMs);
    await chrome.tabs.update(tab.id, { url });
    await loaded;
    const interactions = await actions(tab.id, item.actions, failures);
    const data = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selector?: string, seoChecks: string[] = []) => {
        const text = document.body?.innerText ?? "";
        const seo: Record<string, boolean> = {};
        for (const check of seoChecks) {
          seo[check] =
            check === "title"
              ? Boolean(document.title.trim())
              : check === "metaDescription"
                ? Boolean(
                    document
                      .querySelector('meta[name="description"]')
                      ?.getAttribute("content")
                      ?.trim(),
                  )
                : check === "canonical"
                  ? Boolean(
                      document
                        .querySelector('link[rel~="canonical"]')
                        ?.getAttribute("href")
                        ?.trim(),
                    )
                  : check === "hreflang"
                    ? Array.from(
                        document.querySelectorAll(
                          'link[rel~="alternate"][hreflang]',
                        ),
                      ).some((link) =>
                        Boolean(
                          link.getAttribute("hreflang")?.trim() &&
                          link.getAttribute("href")?.trim(),
                        ),
                      )
                    : check === "robots"
                      ? Boolean(
                          document
                            .querySelector('meta[name="robots"]')
                            ?.getAttribute("content")
                            ?.trim(),
                        )
                      : check === "htmlLang"
                        ? Boolean(document.documentElement.lang.trim())
                        : check === "h1"
                          ? Boolean(
                              document.querySelector("h1")?.textContent?.trim(),
                            )
                          : false;
        }
        return {
          text,
          seo,
          selectorFound: selector
            ? Boolean(document.querySelector(selector))
            : true,
          framework:
            document.querySelector("#__next") ||
            (window as any).__NEXT_DATA__ ||
            (window as any).next
              ? "nextjs"
              : document.querySelector("#root,[data-reactroot]") ||
                  Object.keys(window).some((key) => key.startsWith("__REACT"))
                ? "react"
                : "unknown",
        };
      },
      args: [item.expectedSelector, item.seoChecks ?? []],
    });
    const main =
      records.find((record) => record.url === url) ??
      records.find((record) => record.type === "Document");
    if (main?.status !== item.expectedStatus)
      failures.push(
        `Expected HTTP ${item.expectedStatus}, got ${main?.status ?? "no response"}.`,
      );
    if (item.expectedText && !data[0]?.result?.text.includes(item.expectedText))
      failures.push(`Text not found: ${item.expectedText}`);
    if (item.expectedSelector && !data[0]?.result?.selectorFound)
      failures.push(`Selector not found: ${item.expectedSelector}`);
    for (const check of item.seoChecks ?? [])
      if (!data[0]?.result?.seo?.[check])
        failures.push(`SEO: missing or empty ${check}.`);
    const artifacts: Artifact[] = [];
    if (failures.length) {
      artifacts.push({
        kind: "har",
        filename: "smoke-network.json",
        mimeType: "application/json",
        content: JSON.stringify(records, null, 2),
      });
      const output = await trace(target, suite.requestTimeoutMs);
      if (output) artifacts.push(output);
      const shot = (await send(target, "Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      })) as { data?: string };
      if (shot.data)
        artifacts.push({
          kind: "screenshot",
          filename: "smoke-failure.png",
          mimeType: "image/png",
          content: shot.data,
        });
    } else await trace(target, suite.requestTimeoutMs);
    return {
      id: crypto.randomUUID(),
      caseId: item.id,
      caseName: item.name,
      url,
      status: failures.length ? "failed" : "passed",
      durationMs: performance.now() - started,
      actualStatus: main?.status,
      framework: data[0]?.result?.framework as SmokeCheckResult["framework"],
      interactions: interactions.length ? interactions : undefined,
      failures,
      artifacts: artifacts.length ? artifacts : undefined,
    };
  } catch (error) {
    return {
      id: crypto.randomUUID(),
      caseId: item.id,
      caseName: item.name,
      url,
      status: "failed",
      durationMs: performance.now() - started,
      failures: [String(error)],
    };
  } finally {
    chrome.debugger.onEvent.removeListener(listener);
    await chrome.debugger.detach(target).catch(() => undefined);
    await chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}
