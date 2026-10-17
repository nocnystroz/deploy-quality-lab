import { describe, expect, it } from 'vitest';
import { blockedUrlPatterns } from './network';

describe('blockedUrlPatterns', () => {
  it('expands a bare domain to host and subdomain patterns', () => {
    expect(blockedUrlPatterns(['analytics.example.com'])).toEqual(['*://analytics.example.com/*', '*://*.analytics.example.com/*']);
  });
  it('preserves explicit DevTools URL patterns', () => {
    expect(blockedUrlPatterns(['*://cdn.example/*'])).toEqual(['*://cdn.example/*']);
  });
});
