import { afterEach, describe, expect, it, vi } from 'vitest';
import { newProfile } from '../shared/defaults';
import { runFetch } from './fetch-engine';

afterEach(() => vi.unstubAllGlobals());

describe('runFetch', () => {
  it('records status, TTFB and transferred body size locally', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello', { status: 200, headers: { 'x-test': 'yes' } })));
    const profile = newProfile(); profile.engine = 'fetch'; profile.debugMode = true;
    const result = await runFetch(profile, 'https://example.test', 1);
    expect(result.metrics).toMatchObject({ status: 200, transferBytes: 5 });
    expect(result.metrics?.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(result.artifacts?.[0].kind).toBe('debug');
  });
});
