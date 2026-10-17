import { useMemo, useState } from 'react';
import type { Artifact } from '../shared/types';
import type { Language } from './i18n';

type Entry = { url: string; status?: number; started: number; duration: number; bytes: number; type?: string };
const labels = { pl: { title: 'Waterfall sieci', filter: 'Filtruj URL lub domenę', all: 'Wszystkie statusy', errors: 'Tylko błędy HTTP', ok: 'Tylko sukcesy', duration: 'Czas', size: 'Rozmiar', requests: 'żądań', errorsCount: 'błędy HTTP' }, en: { title: 'Network waterfall', filter: 'Filter URL or domain', all: 'All statuses', errors: 'HTTP errors only', ok: 'Successful only', duration: 'Duration', size: 'Size', requests: 'requests', errorsCount: 'HTTP errors' } };
function entries(artifact?: Artifact): Entry[] {
  if (!artifact || artifact.kind !== 'har') return [];
  try {
    const data = JSON.parse(artifact.content); const raw = data.log?.entries ?? data;
    return raw.map((item: any, index: number) => ({ url: item.request?.url ?? item.url ?? '', status: item.response?.status ?? item.status, started: item.started ?? index, duration: item.time ?? Math.max(0, ((item.finished ?? item.started ?? 0) - (item.started ?? 0)) * 1000), bytes: item.response?.content?.size ?? item.bytes ?? 0, type: item.type })).filter((item: Entry) => item.url);
  } catch { return []; }
}
function hostname(url: string): string { try { return new URL(url).hostname; } catch { return url; } }
export function Waterfall({ artifact, lang = 'en' }: { artifact?: Artifact; lang?: Language }) {
  const [filter, setFilter] = useState(''); const [status, setStatus] = useState<'all' | 'errors' | 'ok'>('all'); const [sort, setSort] = useState<'duration' | 'bytes'>('duration');
  const all = useMemo(() => entries(artifact), [artifact]); const t = labels[lang];
  const rows = all.filter(item => item.url.toLowerCase().includes(filter.toLowerCase())).filter(item => status === 'all' || status === 'errors' ? (item.status ?? 0) >= 400 : (item.status ?? 0) > 0 && (item.status ?? 0) < 400).sort((a, b) => sort === 'duration' ? b.duration - a.duration : b.bytes - a.bytes);
  const max = Math.max(...rows.map(item => sort === 'duration' ? item.duration : item.bytes), 1); if (!all.length) return null;
  return <details className="waterfall"><summary>{t.title} · {all.length} {t.requests}</summary><div className="waterfall-controls"><input placeholder={t.filter} value={filter} onChange={event => setFilter(event.target.value)} /><select aria-label={t.all} value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">{t.all}</option><option value="errors">{t.errors}</option><option value="ok">{t.ok}</option></select><select aria-label={t.duration} value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="duration">{t.duration}</option><option value="bytes">{t.size}</option></select></div><p>{Math.round(all.reduce((sum, item) => sum + item.bytes, 0) / 1024)} KB · {all.filter(item => (item.status ?? 0) >= 400).length} {t.errorsCount}</p>{rows.map((item, index) => <div className="waterfall-row" key={item.url + index}><small title={item.url}>{item.status ?? '—'} · {hostname(item.url)}</small><i style={{ width: Math.max(2, (sort === 'duration' ? item.duration : item.bytes) / max * 100) + '%' }} /><b>{sort === 'duration' ? Math.round(item.duration) + ' ms' : Math.round(item.bytes / 1024) + ' KB'}</b></div>)}</details>;
}
