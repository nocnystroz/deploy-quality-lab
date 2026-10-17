import { runBrowser } from './background/browser-engine';
import { runFetch } from './background/fetch-engine';
import { runSmokeCase } from './background/smoke-engine';
import type { SmokeCase, SmokeSuite, TestProfile, TestRun } from './shared/types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function pickerTabId(): Promise<number | undefined> {
  const windows = await chrome.windows.getAll({ populate: true });
  const normal = windows.find(window => window.focused && window.type === 'normal') ?? windows.find(window => window.type === 'normal');
  return normal?.tabs?.find(tab => tab.active)?.id;
}

async function startSelectorPicker(): Promise<{ ok: boolean; error?: string }> {
  const tabId = await pickerTabId();
  if (!tabId) return { ok: false, error: 'Nie znaleziono aktywnej karty strony.' };
  await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const marker = '__deployQualitySelectorPicker';
    const previous = (window as Window & { [marker]?: () => void })[marker]; previous?.();
    const overlay = document.createElement('div'); Object.assign(overlay.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', border: '2px solid #9c27b0', background: 'rgba(156,39,176,.12)', display: 'none', boxSizing: 'border-box' }); document.documentElement.append(overlay);
    const css = (value: string) => CSS.escape(value);
    const selectorFor = (element: Element) => {
      if (element.id && document.querySelectorAll(`#${css(element.id)}`).length === 1) return `#${css(element.id)}`;
      for (const attribute of ['data-testid', 'data-test', 'data-cy', 'name', 'aria-label']) { const value = element.getAttribute(attribute); const candidate = value ? `[${attribute}="${css(value)}"]` : ''; if (candidate && document.querySelectorAll(candidate).length === 1) return candidate; }
      const parts: string[] = []; let current: Element | null = element;
      while (current && current !== document.documentElement && parts.length < 7) { const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(item => item.tagName === current!.tagName) : []; const index = siblings.indexOf(current) + 1; parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`); const candidate = parts.join(' > '); if (document.querySelectorAll(candidate).length === 1) return candidate; current = current.parentElement; }
      return parts.join(' > ') || 'html';
    };
    const move = (event: MouseEvent) => { const item = document.elementFromPoint(event.clientX, event.clientY); if (!item || item === overlay) return; const rect = item.getBoundingClientRect(); Object.assign(overlay.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); };
    const stop = () => { document.removeEventListener('mousemove', move, true); document.removeEventListener('click', select, true); document.removeEventListener('keydown', keydown, true); overlay.remove(); delete (window as Window & { [marker]?: () => void })[marker]; };
    const select = (event: MouseEvent) => { const item = document.elementFromPoint(event.clientX, event.clientY); if (!item || item === overlay) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); const selector = selectorFor(item); stop(); chrome.runtime.sendMessage({ type: 'selector-picked', selector }); };
    const keydown = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; event.preventDefault(); stop(); chrome.runtime.sendMessage({ type: 'selector-picker-cancelled' }); };
    (window as Window & { [marker]?: () => void })[marker] = stop; document.addEventListener('mousemove', move, true); document.addEventListener('click', select, true); document.addEventListener('keydown', keydown, true);
  } });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'open-detached-window') {
    chrome.windows.create({ url: chrome.runtime.getURL('src/sidepanel/index.html'), type: 'popup', width: 460, height: 820 }).then(window => sendResponse({ ok: true, windowId: window.id })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === 'start-selector-picker') { startSelectorPicker().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error) })); return true; }
  if (message.type === 'run-browser') {
    runBrowser(message.profile as TestProfile, message.url, message.index).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'run-fetch') {
    runFetch(message.profile as TestProfile, message.url, message.index).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'run-smoke-case') { runSmokeCase(message.suite as SmokeSuite, message.case as SmokeCase).then(sendResponse).catch(error => sendResponse({ error: String(error) })); return true; }
  if (message.type === 'validate-actions') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      const tabId = tabs[0]?.id;
      if (!tabId) return { ok: false, error: 'Nie znaleziono aktywnej karty.' };
      const selectors = (message.selectors as string[]).filter(Boolean);
      const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (items: string[]) => items.map(selector => ({ selector, found: Boolean(document.querySelector(selector)) })), args: [selectors] });
      return { ok: true, checks: result[0]?.result ?? [] };
    }).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

export type RunResponse = TestRun | { error: string };
