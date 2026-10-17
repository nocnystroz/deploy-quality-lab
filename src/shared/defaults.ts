import type { TestProfile } from './types';

export function newProfile(): TestProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name: 'Nowy profil', urls: [],
    engine: 'browser', runs: 21, aggregate: 'p50', disableCache: true,
    blockedPatterns: [], actions: [], thresholds: {}, cpuSlowdown: 1,
    network: { downloadKbps: 0, uploadKbps: 0, latencyMs: 0 },
    viewport: { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false },
    warmupRuns: 0, runIntervalMs: 1500, requestTimeoutMs: 30_000,
    createdAt: now, updatedAt: now
  };
}
