import type { Artifact, Metrics, TestProfile, TestRun } from '../shared/types';
import { blockedUrlPatterns } from '../shared/network';

type Debuggee = chrome.debugger.Debuggee;
interface NetworkRecord { request?: any; response?: any; started?: number; finished?: number; encodedDataLength?: number; }

const send = (target: Debuggee, method: string, params?: object) => chrome.debugger.sendCommand(target, method, params);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cdpEvent(target: Debuggee, method: string, timeout = 30_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.debugger.onEvent.removeListener(listener); reject(new Error(`Timeout: ${method}`)); }, timeout);
    const listener = (source: Debuggee, event: string, params: any) => {
      if (source.tabId === target.tabId && event === method) { clearTimeout(timer); chrome.debugger.onEvent.removeListener(listener); resolve(params); }
    };
    chrome.debugger.onEvent.addListener(listener);
  });
}

function toHar(records: Map<string, NetworkRecord>): string {
  const entries = [...records.values()].filter(record => record.request && record.response).map(record => ({
    startedDateTime: new Date().toISOString(), time: Math.max(0, ((record.finished ?? record.started ?? 0) - (record.started ?? 0)) * 1000),
    request: { method: record.request.method, url: record.request.url, httpVersion: 'HTTP/1.1', headers: Object.entries(record.request.headers ?? {}).map(([name, value]) => ({ name, value: String(value) })), queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
    response: { status: record.response.status, statusText: record.response.statusText ?? '', httpVersion: 'HTTP/1.1', headers: Object.entries(record.response.headers ?? {}).map(([name, value]) => ({ name, value: String(value) })), cookies: [], content: { size: record.encodedDataLength ?? 0, mimeType: record.response.mimeType ?? '' }, redirectURL: '', headersSize: -1, bodySize: record.encodedDataLength ?? -1 },
    cache: {}, timings: { send: 0, wait: -1, receive: -1 }
  }));
  return JSON.stringify({ log: { version: '1.2', creator: { name: 'Deploy Speed Tester', version: '0.1.0' }, entries } }, null, 2);
}

async function runActions(target: Debuggee, profile: TestProfile): Promise<void> {
  const tabId = target.tabId;
  if (tabId === undefined) throw new Error('Brak karty dla interakcji.');
  for (const action of profile.actions) {
    if (action.type === 'wait') { await sleep(action.durationMs); continue; }
    const deadline = Date.now() + (action.type === 'click' ? action.timeoutMs : 0);
    let found = false;
    do {
      const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (step: typeof action) => {
      if (step.type === 'scroll') { window.scrollTo(step.x, step.y); return true; }
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center', inline: 'center' }); const rect = el.getBoundingClientRect();
      return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, args: [action] });
      const value = result[0]?.result as boolean | { found: boolean; x?: number; y?: number } | undefined;
      if (action.type === 'scroll') found = value === true;
      else if (value && typeof value !== 'boolean' && value.found && typeof value.x === 'number' && typeof value.y === 'number') { await send(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: value.x, y: value.y, button: 'left', clickCount: 1 }); await send(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: value.x, y: value.y, button: 'left', clickCount: 1 }); found = true; }
      if (!found && action.type === 'click') await sleep(100);
    } while (!found && Date.now() < deadline);
    if (!found) throw new Error(`Nie znaleziono elementu dla kroku: ${action.type === 'click' ? action.selector : 'scroll'}`);
    if (action.type === 'click') await sleep(Math.min(action.timeoutMs, 1_000));
  }
}

async function pageMetrics(tabId: number, started: number): Promise<Metrics> {
  const [snapshot] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find(p => p.name === 'first-contentful-paint')?.startTime;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return { nav: navigation && { responseStart: navigation.responseStart, domContentLoadedEventEnd: navigation.domContentLoadedEventEnd, loadEventEnd: navigation.loadEventEnd, duration: navigation.duration }, fcp, bytes: resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0), vitals: (window as any).__deploySpeedVitals };
  } });
  const value = snapshot.result as any;
  return { totalMs: Math.round(performance.now() - started), ttfbMs: value.nav?.responseStart, domContentLoadedMs: value.nav?.domContentLoadedEventEnd, loadMs: value.nav?.loadEventEnd, fcpMs: value.fcp, lcpMs: value.vitals?.lcp, cls: value.vitals?.cls, inpMs: value.vitals?.inp, transferBytes: value.bytes };
}

async function readTrace(target: Debuggee, stream: string): Promise<string> {
  let output = '';
  while (true) { const chunk = await send(target, 'IO.read', { handle: stream }) as { data?: string; eof?: boolean }; output += chunk.data ?? ''; if (chunk.eof) break; }
  await send(target, 'IO.close', { handle: stream });
  return output;
}

export async function runBrowser(profile: TestProfile, url: string, index: number): Promise<TestRun> {
  const startedAt = new Date().toISOString(); const start = performance.now();
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  if (tab.id === undefined) throw new Error('Nie udało się utworzyć karty testowej.');
  const target = { tabId: tab.id }; const records = new Map<string, NetworkRecord>(); const debugEvents: { at: string; method: string }[] = [];
  const onEvent = (source: Debuggee, method: string, params: any) => {
    if (source.tabId !== tab.id) return;
    if (profile.debugMode && debugEvents.length < 500) debugEvents.push({ at: new Date().toISOString(), method });
    if (method === 'Network.requestWillBeSent') records.set(params.requestId, { request: params.request, started: params.timestamp });
    if (method === 'Network.responseReceived') { const r = records.get(params.requestId) ?? {}; r.response = params.response; records.set(params.requestId, r); }
    if (method === 'Network.loadingFinished') { const r = records.get(params.requestId) ?? {}; r.finished = params.timestamp; r.encodedDataLength = params.encodedDataLength; records.set(params.requestId, r); }
  };
  chrome.debugger.onEvent.addListener(onEvent);
  try {
    await chrome.debugger.attach(target, '1.3');
    await send(target, 'Network.enable'); await send(target, 'Performance.enable'); await send(target, 'Page.enable');
    await send(target, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
    await send(target, 'Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const vitals = window.__deploySpeedVitals = { lcp: undefined, cls: 0, inp: undefined }; const observe = (type, callback, options = {}) => { try { new PerformanceObserver(list => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...options }); } catch {} }; observe('largest-contentful-paint', entry => { vitals.lcp = Math.max(vitals.lcp || 0, entry.startTime || 0); }); observe('layout-shift', entry => { if (!entry.hadRecentInput) vitals.cls += entry.value || 0; }); observe('event', entry => { if (entry.interactionId) vitals.inp = Math.max(vitals.inp || 0, entry.duration || 0); }, { durationThreshold: 16 }); })()` });
    await send(target, 'Network.setCacheDisabled', { cacheDisabled: profile.disableCache });
    if (profile.userAgent) await send(target, 'Network.setUserAgentOverride', { userAgent: profile.userAgent });
    const blockedPatterns = blockedUrlPatterns(profile.blockedPatterns);
    if (blockedPatterns.length) await send(target, 'Network.setBlockedURLs', { urls: blockedPatterns });
    if (profile.network) await send(target, 'Network.emulateNetworkConditions', { offline: false, latency: profile.network.latencyMs, downloadThroughput: profile.network.downloadKbps * 1024 / 8, uploadThroughput: profile.network.uploadKbps * 1024 / 8, connectionType: 'other' });
    if (profile.cpuSlowdown && profile.cpuSlowdown !== 1) await send(target, 'Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    if (profile.viewport) await send(target, 'Emulation.setDeviceMetricsOverride', profile.viewport);
    await send(target, 'Tracing.start', { categories: 'devtools.timeline,blink.user_timing,loading', transferMode: 'ReturnAsStream' });
    const loaded = cdpEvent(target, 'Page.loadEventFired', profile.requestTimeoutMs ?? 30_000);
    await chrome.tabs.update(tab.id, { url }); await loaded;
    await runActions(target, profile); await sleep(1_000);
    const metrics = await pageMetrics(tab.id, start);
    const status = [...records.values()].find(r => r.request?.url === url)?.response?.status;
    metrics.status = status;
    const traceComplete = cdpEvent(target, 'Tracing.tracingComplete', profile.requestTimeoutMs ?? 30_000); await send(target, 'Tracing.end');
    const traceInfo = await traceComplete; const artifacts: Artifact[] = [{ kind: 'har', filename: `run-${index}.har`, mimeType: 'application/json', content: toHar(records) }];
    if (traceInfo.stream) artifacts.push({ kind: 'trace', filename: `run-${index}.json`, mimeType: 'application/json', content: await readTrace(target, traceInfo.stream) });
    if (profile.debugMode) artifacts.push({ kind: 'debug', filename: `run-${index}-debug.json`, mimeType: 'application/json', content: JSON.stringify({ url, config: { disableCache: profile.disableCache, blockedPatterns, network: profile.network, viewport: profile.viewport }, events: debugEvents }, null, 2) });
    return { id: crypto.randomUUID(), url, index, startedAt, durationMs: performance.now() - start, metrics, artifacts };
  } catch (error) { return { id: crypto.randomUUID(), url, index, startedAt, durationMs: performance.now() - start, error: String(error), artifacts: profile.debugMode ? [{ kind: 'debug', filename: `run-${index}-debug.json`, mimeType: 'application/json', content: JSON.stringify({ url, error: String(error), events: debugEvents }, null, 2) }] : undefined }; }
  finally { chrome.debugger.onEvent.removeListener(onEvent); await chrome.debugger.detach(target).catch(() => undefined); await chrome.tabs.remove(tab.id).catch(() => undefined); }
}
