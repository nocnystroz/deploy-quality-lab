import { describe, expect, it } from 'vitest';
import { historyChartsHtml, historyCsv } from './export';
import type { Series } from './types';

const series = [{ id: 'one', profileId: 'p', profileName: 'Profile', profileSnapshot: {} as Series['profileSnapshot'], kind: 'before' as const, label: 'Before', createdAt: '2026-01-01T00:00:00.000Z', runs: [], aggregate: 'median' as const, summary: { totalMs: 100, ttfbMs: 20 }, thresholdFailures: [] }];

describe('history exports', () => {
  it('exports only selected aggregate metrics as CSV', () => {
    const output = historyCsv(series, ['totalMs']);
    expect(output).toContain('totalMs');
    expect(output).toContain('"100"');
    expect(output).not.toContain('ttfbMs');
  });

  it('renders an SVG chart for selected metrics', () => {
    const output = historyChartsHtml(series, ['ttfbMs']);
    expect(output).toContain('<svg');
    expect(output).toContain('ttfbMs');
  });
});
