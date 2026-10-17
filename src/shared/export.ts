import type { Artifact, Series } from './types';

export const historyMetrics = ['totalMs', 'ttfbMs', 'domContentLoadedMs', 'loadMs', 'fcpMs', 'lcpMs', 'cls', 'inpMs', 'transferBytes', 'status'] as const;
export type HistoryMetric = typeof historyMetrics[number];
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const csv = (rows: string[][]) => rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');

/** Exports aggregate values from persistent history, respecting the metric selection. */
export function historyCsv(series: Series[], metrics: HistoryMetric[]): string {
  const rows = [['createdAt', 'label', 'kind', 'profile', ...metrics]];
  for (const item of series) rows.push([item.createdAt, item.label, item.kind, item.profileName, ...metrics.map(metric => String(item.summary?.[metric] ?? ''))]);
  return csv(rows);
}

/** A portable HTML report containing one SVG line chart per selected metric. */
export function historyChartsHtml(series: Series[], metrics: HistoryMetric[], title = 'Deploy Speed Tester'): string {
  const charts = metrics.map(metric => {
    const values = series.map(item => item.summary?.[metric]).filter((value): value is number => typeof value === 'number');
    if (!values.length) return `<section><h2>${esc(metric)}</h2><p>No data.</p></section>`;
    const max = Math.max(...values, 1); const width = 720; const height = 200;
    const points = series.map((item, index) => {
      const value = item.summary?.[metric]; if (typeof value !== 'number') return '';
      const x = series.length === 1 ? width / 2 : index * width / (series.length - 1); const y = height - value / max * (height - 24) - 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(' ');
    const labels = series.map((item, index) => `<text x="${series.length === 1 ? width / 2 : index * width / (series.length - 1)}" y="196" text-anchor="middle">${esc(item.label).slice(0, 14)}</text>`).join('');
    return `<section><h2>${esc(metric)}</h2><p>Max: ${max}</p><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric)} chart"><line x1="0" y1="188" x2="${width}" y2="188" stroke="#cbd5e1"/><polyline points="${points}" fill="none" stroke="#28646d" stroke-width="3"/>${labels}</svg></section>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px system-ui;margin:32px;color:#18212f}section{margin:28px 0;padding:16px;border:1px solid #d8dee9;border-radius:8px}svg{width:100%;height:auto}text{font-size:10px;fill:#475569}</style><h1>${esc(title)}</h1><p>Series: ${series.length}. Generated locally.</p>${charts}`;
}

export function seriesCsv(series: Series): string {
  const rows = [['run', 'url', 'totalMs', 'ttfbMs', 'fcpMs', 'lcpMs', 'cls', 'status', 'error']];
  for (const run of series.runs) rows.push([String(run.index), run.url, String(run.metrics?.totalMs ?? ''), String(run.metrics?.ttfbMs ?? ''), String(run.metrics?.fcpMs ?? ''), String(run.metrics?.lcpMs ?? ''), String(run.metrics?.cls ?? ''), String(run.metrics?.status ?? ''), run.error ?? '']);
  return csv(rows);
}

export function reportHtml(series: Series, reference?: Series): string {
  const m = series.summary;
  const rows = Object.entries(m ?? {}).map(([key, value]) => `<tr><th>${key}</th><td>${value}</td><td>${reference?.summary?.[key as keyof typeof reference.summary] ?? '—'}</td></tr>`).join('');
  const groups = new Map<string, typeof series.runs>();
  for (const run of series.runs.filter(run => run.metrics)) groups.set(run.url, [...(groups.get(run.url) ?? []), run]);
  const byUrl = [...groups].map(([url, runs]) => `<tr><th>${url}</th><td>${runs.length}</td><td>${runs.map(run => Math.round(run.metrics!.totalMs)).join(', ')}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Deploy Speed Tester – ${series.label}</title><style>body{font:15px system-ui;margin:32px;color:#18212f}table{border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;border:1px solid #d8dee9;text-align:left}.bad{color:#b42318}pre{background:#f4f6f8;padding:12px;overflow:auto}</style><h1>${series.profileName}: ${series.label}</h1><p>${series.createdAt}</p><p class="${series.thresholdFailures.length ? 'bad' : ''}">${series.thresholdFailures.length ? series.thresholdFailures.join('; ') : 'Wszystkie progi spełnione.'}</p><table><thead><tr><th>Metryka</th><th>Seria</th><th>Referencja</th></tr></thead><tbody>${rows}</tbody></table><h2>Runy według URL</h2><table><thead><tr><th>URL</th><th>Udane runy</th><th>Total time (ms)</th></tr></thead><tbody>${byUrl}</tbody></table><h2>Konfiguracja serii</h2><pre>${JSON.stringify(series.profileSnapshot, null, 2).replaceAll('<', '&lt;')}</pre>`;
}

export function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  chrome.downloads.download({ url, filename, saveAs: true }, () => setTimeout(() => URL.revokeObjectURL(url), 60_000));
}

export function artifactByKind(series: Series, kind: Artifact['kind']): Artifact | undefined {
  return series.runs.flatMap(run => run.artifacts ?? []).find(artifact => artifact.kind === kind);
}
