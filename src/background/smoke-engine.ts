import type { Artifact, SmokeCase, SmokeCheckResult, SmokeSuite } from '../shared/types';
import { blockedUrlPatterns } from '../shared/network';
import { smokeUrl } from '../shared/smoke';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const send = (target: chrome.debugger.Debuggee, method: string, params?: object) => chrome.debugger.sendCommand(target, method, params);
function event(target: chrome.debugger.Debuggee, name: string, timeout: number): Promise<any> { return new Promise((resolve, reject) => { const timer = setTimeout(() => { chrome.debugger.onEvent.removeListener(listener); reject(new Error(`Timeout: ${name}`)); }, timeout); const listener = (source: chrome.debugger.Debuggee, method: string, params: any) => { if (source.tabId === target.tabId && method === name) { clearTimeout(timer); chrome.debugger.onEvent.removeListener(listener); resolve(params); } }; chrome.debugger.onEvent.addListener(listener); }); }
async function trace(target: chrome.debugger.Debuggee, timeout: number): Promise<Artifact | undefined> { const complete = event(target, 'Tracing.tracingComplete', timeout); await send(target, 'Tracing.end'); const info = await complete; if (!info.stream) return undefined; let output = ''; while (true) { const chunk = await send(target, 'IO.read', { handle: info.stream }) as { data?: string; eof?: boolean }; output += chunk.data ?? ''; if (chunk.eof) break; } await send(target, 'IO.close', { handle: info.stream }); return { kind: 'trace', filename: 'smoke-trace.json', mimeType: 'application/json', content: output }; }

async function actions(tabId: number, steps: SmokeCase['actions'], failures: string[]) {
  for (const step of steps) {
    if (step.type === 'wait') { await sleep(step.durationMs); continue; }
    if (step.type === 'scroll') { await chrome.scripting.executeScript({ target: { tabId }, func: (x, y) => window.scrollTo(x, y), args: [step.x, step.y] }); continue; }
    const deadline = Date.now() + step.timeoutMs; let found = false;
    while (Date.now() < deadline && !found) { const result = await chrome.scripting.executeScript({ target: { tabId }, func: selector => { const item = document.querySelector(selector) as HTMLElement | null; item?.click(); return Boolean(item); }, args: [step.selector] }); found = Boolean(result[0]?.result); if (!found) await sleep(100); }
    if (!found && !step.optional) failures.push(`Required click not found: ${step.selector}`);
  }
}

export async function runSmokeCase(suite: SmokeSuite, item: SmokeCase): Promise<SmokeCheckResult> {
  const url = smokeUrl(suite, item.path); const started = performance.now(); const failures: string[] = []; const records: any[] = [];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false }); if (tab.id === undefined) throw new Error('Could not create test tab.'); const target = { tabId: tab.id };
  const listener = (source: chrome.debugger.Debuggee, method: string, params: any) => { if (source.tabId !== tab.id) return; if (method === 'Network.requestWillBeSent') records.push({ id: params.requestId, url: params.request.url, method: params.request.method, started: params.timestamp, type: params.type }); if (method === 'Network.responseReceived') { const record = records.find(value => value.id === params.requestId); if (record) Object.assign(record, { status: params.response.status, mimeType: params.response.mimeType }); } if (method === 'Network.loadingFinished') { const record = records.find(value => value.id === params.requestId); if (record) Object.assign(record, { finished: params.timestamp, bytes: params.encodedDataLength }); } };
  chrome.debugger.onEvent.addListener(listener);
  try {
    await chrome.debugger.attach(target, '1.3'); await send(target, 'Network.enable'); await send(target, 'Page.enable'); await send(target, 'Tracing.start', { categories: 'devtools.timeline,loading', transferMode: 'ReturnAsStream' }); const blocked = blockedUrlPatterns(suite.blockedPatterns); if (blocked.length) await send(target, 'Network.setBlockedURLs', { urls: blocked });
    const loaded = event(target, 'Page.loadEventFired', suite.requestTimeoutMs); await chrome.tabs.update(tab.id, { url }); await loaded;
    await actions(tab.id, item.actions, failures);
    const data = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (selector?: string) => ({ text: document.body?.innerText ?? '', selectorFound: selector ? Boolean(document.querySelector(selector)) : true }), args: [item.expectedSelector] });
    const main = records.find(record => record.url === url) ?? records.find(record => record.type === 'Document'); if (main?.status !== item.expectedStatus) failures.push(`Expected HTTP ${item.expectedStatus}, got ${main?.status ?? 'no response'}.`);
    if (item.expectedText && !data[0]?.result?.text.includes(item.expectedText)) failures.push(`Text not found: ${item.expectedText}`);
    if (item.expectedSelector && !data[0]?.result?.selectorFound) failures.push(`Selector not found: ${item.expectedSelector}`);
    const artifacts: Artifact[] = []; if (failures.length) { artifacts.push({ kind: 'har', filename: 'smoke-network.json', mimeType: 'application/json', content: JSON.stringify(records, null, 2) }); const output = await trace(target, suite.requestTimeoutMs); if (output) artifacts.push(output); const shot = await send(target, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }) as { data?: string }; if (shot.data) artifacts.push({ kind: 'screenshot', filename: 'smoke-failure.png', mimeType: 'image/png', content: shot.data }); } else await trace(target, suite.requestTimeoutMs);
    return { id: crypto.randomUUID(), caseId: item.id, caseName: item.name, url, status: failures.length ? 'failed' : 'passed', durationMs: performance.now() - started, actualStatus: main?.status, failures, artifacts: artifacts.length ? artifacts : undefined };
  } catch (error) { return { id: crypto.randomUUID(), caseId: item.id, caseName: item.name, url, status: 'failed', durationMs: performance.now() - started, failures: [String(error)] }; } finally { chrome.debugger.onEvent.removeListener(listener); await chrome.debugger.detach(target).catch(() => undefined); await chrome.tabs.remove(tab.id).catch(() => undefined); }
}
