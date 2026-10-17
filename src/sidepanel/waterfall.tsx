import { useMemo, useState } from 'react';
import type { Artifact } from '../shared/types';

type Entry = { url: string; status?: number; started: number; duration: number; bytes: number; type?: string };
function entries(artifact?: Artifact): Entry[] {
  if (!artifact || artifact.kind !== 'har') return [];
  try { const data = JSON.parse(artifact.content); const raw = data.log?.entries ?? data; return raw.map((item: any, index: number) => ({ url: item.request?.url ?? item.url ?? '', status: item.response?.status ?? item.status, started: item.started ?? index, duration: item.time ?? Math.max(0, ((item.finished ?? item.started ?? 0) - (item.started ?? 0)) * 1000), bytes: item.response?.content?.size ?? item.bytes ?? 0, type: item.type })).filter((item: Entry) => item.url); } catch { return []; }
}
export function Waterfall({ artifact }: { artifact?: Artifact }) {
  const [filter, setFilter] = useState(''); const all = useMemo(() => entries(artifact), [artifact]); const rows = all.filter(item => item.url.toLowerCase().includes(filter.toLowerCase())); const max = Math.max(...rows.map(item => item.duration), 1); if (!all.length) return null;
  return <details className="waterfall"><summary>Network waterfall · {all.length} requests</summary><input placeholder="Filter URL/domain" value={filter} onChange={event => setFilter(event.target.value)} /><p>{Math.round(all.reduce((sum, item) => sum + item.bytes, 0) / 1024)} KB · {all.filter(item => (item.status ?? 0) >= 400).length} HTTP errors</p>{rows.sort((a, b) => b.duration - a.duration).map((item, index) => <div className="waterfall-row" key={`${item.url}-${index}`}><small title={item.url}>{item.status ?? '—'} · {new URL(item.url).hostname}</small><i style={{ width: `${Math.max(2, item.duration / max * 100)}%` }} /><b>{Math.round(item.duration)} ms</b></div>)}</details>;
}
