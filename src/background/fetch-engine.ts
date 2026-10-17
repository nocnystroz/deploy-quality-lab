import type { TestProfile, TestRun } from '../shared/types';

/** Performs a local extension fetch. It measures the initial response (TTFB) and full body transfer. */
export async function runFetch(profile: TestProfile, url: string, index: number): Promise<TestRun> {
  const startedAt = new Date().toISOString(); const start = performance.now();
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), profile.requestTimeoutMs ?? 30_000);
  try {
    const response = await fetch(url, { cache: profile.disableCache ? 'no-store' : 'default', redirect: 'follow', signal: controller.signal, headers: profile.disableCache ? { 'Cache-Control': 'no-cache' } : undefined });
    const ttfbMs = performance.now() - start;
    const body = await response.arrayBuffer();
    const totalMs = performance.now() - start;
    const headers: Record<string, string> = {}; response.headers.forEach((value, key) => { headers[key] = value; });
    return { id: crypto.randomUUID(), url, index, startedAt, durationMs: totalMs, metrics: { totalMs, ttfbMs, status: response.status, transferBytes: body.byteLength }, artifacts: profile.debugMode ? [{ kind: 'debug', filename: `run-${index}-fetch-headers.json`, mimeType: 'application/json', content: JSON.stringify({ status: response.status, url: response.url, headers }, null, 2) }] : undefined };
  } catch (error) { return { id: crypto.randomUUID(), url, index, startedAt, durationMs: performance.now() - start, error: String(error) }; } finally { clearTimeout(timeout); }
}
