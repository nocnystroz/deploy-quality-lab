import type { SmokeSuite } from './types';

export function newSmokeSuite(): SmokeSuite {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: 'Nowy smoke suite', baseUrl: 'https://example.com', blockedPatterns: [], requestTimeoutMs: 30_000, cases: [{ id: crypto.randomUUID(), name: 'Strona główna', path: '/', expectedStatus: 200, actions: [] }], createdAt: now, updatedAt: now };
}

export function smokeUrl(suite: SmokeSuite, path: string): string { return new URL(path, suite.baseUrl).toString(); }
export function validateSmokeSuite(suite: SmokeSuite): string[] {
  const errors: string[] = []; try { new URL(suite.baseUrl); } catch { errors.push('Base URL is invalid.'); }
  if (!suite.name.trim()) errors.push('Suite name is required.');
  if (!suite.cases.length) errors.push('At least one smoke case is required.');
  for (const item of suite.cases) { if (!item.name.trim()) errors.push('Case name is required.'); if (item.expectedStatus < 100 || item.expectedStatus > 599) errors.push(`Invalid expected status for ${item.name}.`); }
  return errors;
}
