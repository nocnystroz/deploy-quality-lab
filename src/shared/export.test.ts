import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { historyChartsHtml, historyCsv, historyPdf, historyXlsx, reportHtml } from './export';
import { isPartialSeries } from './statistics';
import type { Series } from './types';

const series: Series[] = [{ id: 'one', profileId: 'p', profileName: 'Profile', profileSnapshot: { urls: ['https://example.com'], runs: 1, engine: 'fetch' } as Series['profileSnapshot'], kind: 'before', label: 'Before', createdAt: '2026-01-01T00:00:00.000Z', runs: [{ id: 'run', url: 'https://example.com', index: 1, startedAt: '', durationMs: 100, metrics: { totalMs: 100, ttfbMs: 20 } }], aggregate: 'median', summary: { totalMs: 100, ttfbMs: 20 }, thresholdFailures: [] }];

describe('history exports', () => {
  it('keeps trends across profile identity and timestamp edits, but separates measurement changes', () => {
    const trend = [0, 1, 2].map(index => ({ ...series[0], id: String(index), profileSnapshot: { ...series[0].profileSnapshot, id: String(index), name: `Name ${index}`, updatedAt: String(index), createdAt: String(index), thresholds: { totalMs: index } } }));
    expect(historyChartsHtml(trend, ['totalMs'])).toContain('<polyline');
    trend[2].profileSnapshot.disableCache = true;
    expect(historyChartsHtml(trend, ['totalMs'])).not.toContain('<polyline');
  });

  it('escapes report content and identifies legacy partial series without stored failures', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const partial = { ...series[0], label: payload, profileName: payload, profileSnapshot: { ...series[0].profileSnapshot, runs: 2 }, runs: [{ ...series[0].runs[0], url: `https://example.com/${payload}` }] };
    expect(isPartialSeries(partial)).toBe(true);
    const report = reportHtml(partial);
    expect(report).not.toContain(payload);
    expect(report).toContain('&lt;img');
    expect(report).toContain('Seria częściowa lub nieudana.');
    expect(reportHtml({ ...partial, thresholdFailures: [payload] })).not.toContain(payload);
    expect(isPartialSeries({ ...series[0], runs: [] })).toBe(true);
  });
  it('exports separate URL aggregates and successful attempt counts instead of a mixed legacy summary', async () => {
    const mixed: Series = { ...series[0], profileSnapshot: { ...series[0].profileSnapshot, urls: ['https://example.com', 'https://other.com'], runs: 2 }, summary: { totalMs: 999 }, runs: [...series[0].runs, { ...series[0].runs[0], id: 'second', url: 'https://other.com', metrics: { totalMs: 500 } }, { ...series[0].runs[0], id: 'failed', metrics: undefined, error: 'timeout' }] };
    const output = historyCsv([mixed], ['totalMs']);
    expect(output.split('\n')).toHaveLength(3);
    expect(output).toContain('"100"');
    expect(output).toContain('"500"');
    expect(output).not.toContain('"999"');
    expect(output).toContain('successfulRuns');
    const archive = unzipSync(new Uint8Array(await historyXlsx([mixed], ['totalMs'])));
    const sheet = strFromU8(archive['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('https://other.com');
    expect(sheet).not.toContain('<v>999</v>');
  });
  it('exports only selected aggregate metrics as CSV', () => {
    const output = historyCsv(series, ['totalMs']);
    expect(output).toContain('totalMs');
    expect(output).toContain('"100"');
    expect(output.split('\n')[0]).not.toContain('ttfbMs');
  });

  it('renders an SVG chart for selected metrics', () => {
    const output = historyChartsHtml(series, ['ttfbMs']);
    expect(output).toContain('<svg');
    expect(output).toContain('ttfbMs');
  });

  it('uses bars for a one/two-series comparison and a line for a longer history', () => {
    expect(historyChartsHtml(series, ['ttfbMs'])).toContain('<rect');
    const trend = [...series, { ...series[0], id: 'two', label: 'After', createdAt: '2026-01-02T00:00:00.000Z' }, { ...series[0], id: 'three', label: 'Later', createdAt: '2026-01-03T00:00:00.000Z' }];
    expect(historyChartsHtml(trend, ['ttfbMs'])).toContain('<polyline');
  });

  it('generates a PDF array buffer locally', async () => {
    const output = await historyPdf(series, ['totalMs']);
    expect(output).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(output).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('creates a standard XLSX archive without SheetJS', async () => {
    const archive = unzipSync(new Uint8Array(await historyXlsx(series, ['totalMs'])));
    expect(strFromU8(archive['xl/worksheets/sheet1.xml'])).toContain('totalMs');
    expect(strFromU8(archive['xl/worksheets/sheet1.xml'])).toContain('<v>100</v>');
    expect(strFromU8(archive['xl/workbook.xml'])).toContain('History');
  });
});
