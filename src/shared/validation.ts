import type { TestProfile } from './types';

export function validateProfile(profile: TestProfile): string[] {
  const errors: string[] = [];
  if (!profile.name.trim()) errors.push('Profile name is required.');
  if (!profile.urls.length) errors.push('At least one URL is required.');
  for (const url of profile.urls) try { new URL(url); } catch { errors.push(`Invalid URL: ${url}`); }
  if (!Number.isInteger(profile.runs) || profile.runs < 1 || profile.runs > 50) errors.push('Runs must be an integer from 1 to 50.');
  if (!Number.isInteger(profile.runIntervalMs) || profile.runIntervalMs < 0 || profile.runIntervalMs > 300_000) errors.push('Run interval must be an integer from 0 to 300000 ms.');
  if (!Number.isInteger(profile.requestTimeoutMs) || profile.requestTimeoutMs < 1_000 || profile.requestTimeoutMs > 600_000) errors.push('Request timeout must be an integer from 1000 to 600000 ms.');
  for (const action of profile.actions) {
    if (action.type === 'click' && !action.selector.trim()) errors.push('Click action requires a CSS selector.');
    if (action.type === 'wait' && action.durationMs < 0) errors.push('Wait duration cannot be negative.');
  }
  return errors;
}
