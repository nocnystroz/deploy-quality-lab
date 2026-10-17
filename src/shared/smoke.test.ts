import { describe, expect, it } from 'vitest';
import { newSmokeSuite, smokeUrl, validateSmokeSuite } from './smoke';

describe('smoke suite configuration', () => {
  it('creates a valid starter suite and resolves its path', () => {
    const suite = newSmokeSuite();
    expect(validateSmokeSuite(suite)).toEqual([]);
    expect(smokeUrl(suite, '/health')).toBe('https://example.com/health');
  });

  it('rejects invalid base URLs and expected status codes', () => {
    const suite = newSmokeSuite(); suite.baseUrl = 'nope'; suite.cases[0].expectedStatus = 700;
    expect(validateSmokeSuite(suite)).toHaveLength(2);
  });
});
