import { describe, expect, it } from 'vitest';
import { aggregateValue, summarize, thresholdFailures } from './statistics';
import type { TestRun } from './types';

describe('statistics', () => {
  it('calculates median and percentile without mutating input', () => {
    expect(aggregateValue([100, 300, 200, 400], 'median')).toBe(250);
    expect(aggregateValue([100, 300, 200, 400], 'p50')).toBe(250);
    expect(aggregateValue([100, 200, 300, 400], 'p75')).toBe(325);
  });
  it('summarizes only successful runs', () => {
    const runs = [{ metrics: { totalMs: 100, ttfbMs: 20 } }, { metrics: { totalMs: 300, ttfbMs: 50 } }, { error: 'network' }] as TestRun[];
    expect(summarize(runs, 'median')).toMatchObject({ totalMs: 200, ttfbMs: 35 });
  });
  it('flags absolute and relative threshold failures', () => {
    const result = thresholdFailures({ totalMs: 300 }, { totalMs: 200, regressionPercent: 10 }, { summary: { totalMs: 200 } } as any);
    expect(result).toHaveLength(2);
  });
});
