import { useRef } from 'react';
import { newSmokeSuite } from '../shared/smoke';
import type { SmokeSuite } from '../shared/types';

export function SmokeTransfer({ suite, onImport }: { suite: SmokeSuite; onImport: (suite: SmokeSuite) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const exportSuite = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(suite, null, 2)], { type: 'application/json' })); chrome.downloads.download({ url, filename: `${suite.name || 'smoke-suite'}.json`, saveAs: true }); };
  const importSuite = async (input?: File) => { if (!input) return; try { const parsed = JSON.parse(await input.text()) as SmokeSuite; const base = newSmokeSuite(); onImport({ ...base, ...parsed, id: crypto.randomUUID(), name: `${parsed.name} (import)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); } catch { alert('Invalid smoke suite JSON.'); } };
  return <div className="button-row"><button title="Pobierz konfigurację suite’a jako JSON." onClick={exportSuite}>JSON ↓</button><button title="Wczytaj suite z pliku JSON jako nową konfigurację." onClick={() => file.current?.click()}>JSON ↑</button><input ref={file} hidden type="file" accept="application/json" onChange={e => void importSuite(e.target.files?.[0])} /></div>;
}
