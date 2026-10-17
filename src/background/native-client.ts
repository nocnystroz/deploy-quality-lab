import type { NativeRequest, NativeResponse, TestProfile, TestRun } from '../shared/types';

const HOST = 'com.deploy_speed_tester.host';

async function send(request: NativeRequest): Promise<NativeResponse> {
  try { return await chrome.runtime.sendNativeMessage(HOST, request) as NativeResponse; }
  catch (error) { return { ok: false, error: `Companion niedostępny: ${String(error)}` }; }
}

export async function runCurl(profile: TestProfile, url: string, index: number): Promise<TestRun> {
  const startedAt = new Date().toISOString();
  const response = await send({ type: 'curl', payload: { profile, url } });
  if (!response.ok) return { id: crypto.randomUUID(), url, index, startedAt, durationMs: 0, error: response.error };
  return { ...(response.data as TestRun), id: crypto.randomUUID(), url, index, startedAt };
}

export async function runLighthouse(profile: TestProfile, url: string): Promise<NativeResponse> {
  return send({ type: 'lighthouse', payload: { profile, url } });
}
