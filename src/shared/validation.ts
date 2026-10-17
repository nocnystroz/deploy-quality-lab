import type { TestProfile } from './types';

export function validateProfile(profile: TestProfile): string[] {
  const errors: string[] = [];
  if (!profile.name.trim()) errors.push('Profile name is required.');
  if (!profile.urls.length) errors.push('At least one URL is required.');
  for (const url of profile.urls) try { new URL(url); } catch { errors.push(`Invalid URL: ${url}`); }
  if (!Number.isInteger(profile.runs) || profile.runs < 1 || profile.runs > 50) errors.push('Runs must be an integer from 1 to 50.');
  for (const action of profile.actions) {
    if (action.type === 'click' && !action.selector.trim()) errors.push('Click action requires a CSS selector.');
    if (action.type === 'wait' && action.durationMs < 0) errors.push('Wait duration cannot be negative.');
  }
  return errors;
}
