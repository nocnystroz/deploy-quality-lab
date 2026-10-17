import type { Artifact, Series } from './types';

export function seriesCsv(series: Series): string {
  const rows = [['run', 'url', 'totalMs', 'ttfbMs', 'fcpMs', 'lcpMs', 'cls', 'status', 'error']];
  for (const run of series.runs) rows.push([String(run.index), run.url, String(run.metrics?.totalMs ?? ''), String(run.metrics?.ttfbMs ?? ''), String(run.metrics?.fcpMs ?? ''), String(run.metrics?.lcpMs ?? ''), String(run.metrics?.cls ?? ''), String(run.metrics?.status ?? ''), run.error ?? '']);
  return rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
}

export function reportHtml(series: Series, reference?: Series): string {
  const m = series.summary;
  const rows = Object.entries(m ?? {}).map(([key, value]) => `<tr><th>${key}</th><td>${value}</td><td>${reference?.summary?.[key as keyof typeof reference.summary] ?? '—'}</td></tr>`).join('');
  const groups = new Map<string, typeof series.runs>();
  for (const run of series.runs.filter(run => run.metrics)) groups.set(run.url, [...(groups.get(run.url) ?? []), run]);
  const byUrl = [...groups].map(([url, runs]) => `<tr><th>${url}</th><td>${runs.length}</td><td>${runs.map(run => Math.round(run.metrics!.totalMs)).join(', ')}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Deploy Speed Tester – ${series.label}</title><style>body{font:15px system-ui;margin:32px;color:#18212f}table{border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;border:1px solid #d8dee9;text-align:left}.bad{color:#b42318}</style><h1>${series.profileName}: ${series.label}</h1><p>${series.createdAt}</p><p class="${series.thresholdFailures.length ? 'bad' : ''}">${series.thresholdFailures.length ? series.thresholdFailures.join('; ') : 'Wszystkie progi spełnione.'}</p><table><thead><tr><th>Metryka</th><th>Seria</th><th>Referencja</th></tr></thead><tbody>${rows}</tbody></table><h2>Runy według URL</h2><table><thead><tr><th>URL</th><th>Udane runy</th><th>Total time (ms)</th></tr></thead><tbody>${byUrl}</tbody></table>`;
}

export function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  chrome.downloads.download({ url, filename, saveAs: true }, () => setTimeout(() => URL.revokeObjectURL(url), 60_000));
}

export function artifactByKind(series: Series, kind: Artifact['kind']): Artifact | undefined {
  return series.runs.flatMap(run => run.artifacts ?? []).find(artifact => artifact.kind === kind);
}
