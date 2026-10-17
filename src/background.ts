import { runBrowser } from './background/browser-engine';
import { runFetch } from './background/fetch-engine';
import { runSmokeCase } from './background/smoke-engine';
import type { SmokeCase, SmokeSuite, TestProfile, TestRun } from './shared/types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'open-detached-window') {
    chrome.windows.create({ url: chrome.runtime.getURL('src/sidepanel/index.html'), type: 'popup', width: 460, height: 820 }).then(window => sendResponse({ ok: true, windowId: window.id })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
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
