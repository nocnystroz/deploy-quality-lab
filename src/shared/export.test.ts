import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { historyChartsHtml, historyCsv, historyPdf, historyXlsx } from './export';
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
