import type { TestProfile } from './types';

export function newProfile(): TestProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name: 'Nowy profil', urls: ['https://example.com'],
    engine: 'browser', runs: 5, aggregate: 'median', disableCache: true,
    blockedPatterns: [], actions: [], thresholds: {}, warmupRuns: 0, runIntervalMs: 1500, requestTimeoutMs: 30_000,
    createdAt: now, updatedAt: now
  };
}
