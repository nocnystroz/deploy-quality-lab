import type { Aggregate, Metrics, Series, TestRun, Thresholds } from './types';

export function percentile(values: number[], p: number): number | undefined {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function aggregateValue(values: number[], aggregate: Aggregate): number | undefined {
  return percentile(values, aggregate === 'p50' || aggregate === 'median' ? .5 : aggregate === 'p75' ? .75 : .9);
}

export function summarize(runs: TestRun[], aggregate: Aggregate): Metrics | undefined {
  if (new Set(runs.map(run => run.url)).size > 1) return undefined;
  const metrics = runs.flatMap(run => run.metrics && !run.error ? [run.metrics] : []);
  if (!metrics.length) return undefined;
  const fields: (keyof Metrics)[] = ['totalMs', 'ttfbMs', 'domContentLoadedMs', 'loadMs', 'fcpMs', 'lcpMs', 'cls', 'inpMs', 'transferBytes', 'status'];
  const result: Partial<Metrics> = {};
  for (const field of fields) {
    const value = aggregateValue(metrics.map(m => m[field]).filter((v): v is number => typeof v === 'number'), aggregate);
    if (value !== undefined) result[field] = Math.round(value * 100) / 100;
  }
  return result as Metrics;
}

/** Recompute legacy series too: a mixed-URL summary is never a page metric. */
export function pageResults(series: Series) {
  const urls = [...new Set([...(series.profileSnapshot.urls ?? []), ...series.runs.map(run => run.url)])];
  return urls.map(url => {
    const runs = series.runs.filter(run => run.url === url);
    const successful = runs.filter(run => run.metrics && !run.error).length;
    return { url, runs, successful, expected: series.profileSnapshot.runs ?? runs.length, summary: summarize(runs, series.aggregate) };
  });
}

export function isPartialSeries(series: Series): boolean {
  const pages = pageResults(series);
  return !pages.length || pages.some(page => page.successful < page.expected || !page.successful);
}

/** Identity and edit timestamps do not describe measurement conditions. */
export function measurementContextKey(series: Series): string {
  const p = series.profileSnapshot;
  return JSON.stringify([
    p.engine, series.aggregate === 'p50' ? 'median' : series.aggregate,
    p.runs, p.disableCache, p.userAgent ?? '', p.blockedPatterns ?? [], p.actions ?? [],
    [p.network?.downloadKbps ?? 0, p.network?.uploadKbps ?? 0, p.network?.latencyMs ?? 0],
    p.cpuSlowdown ?? 1,
    [p.viewport?.width ?? 1366, p.viewport?.height ?? 768, p.viewport?.deviceScaleFactor ?? 1, p.viewport?.mobile ?? false],
    p.warmupRuns ?? 0, p.runIntervalMs ?? 1500, p.requestTimeoutMs ?? 30000,
  ]);
}

export function medianRun(runs: TestRun[]): TestRun | undefined {
  const valid = runs.filter(r => r.metrics).sort((a, b) => a.metrics!.totalMs - b.metrics!.totalMs);
  return valid[Math.floor(valid.length / 2)];
}

export function thresholdFailures(summary: Metrics | undefined, thresholds: Thresholds, reference?: Series): string[] {
  if (!summary) return ['Brak udanych pomiarów.'];
  const failures: string[] = [];
  const checks: [keyof Thresholds, keyof Metrics, string][] = [['totalMs', 'totalMs', 'Całkowity czas'], ['ttfbMs', 'ttfbMs', 'TTFB'], ['lcpMs', 'lcpMs', 'LCP']];
  for (const [limitKey, metricKey, label] of checks) {
    const limit = thresholds[limitKey]; const value = summary[metricKey];
    if (typeof limit === 'number' && typeof value === 'number' && value > limit) failures.push(`${label}: ${value} ms > próg ${limit} ms`);
  }
  if (thresholds.regressionPercent !== undefined && reference?.summary?.totalMs) {
    const regression = ((summary.totalMs - reference.summary.totalMs) / reference.summary.totalMs) * 100;
    if (regression > thresholds.regressionPercent) failures.push(`Regresja: +${regression.toFixed(1)}% > próg +${thresholds.regressionPercent}%`);
  }
  return failures;
}
