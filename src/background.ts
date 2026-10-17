import { runBrowser } from './background/browser-engine';
import { pingCompanion, runCurl, runLighthouse } from './background/native-client';
import type { NativeRequest, TestProfile, TestRun } from './shared/types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'run-browser') {
    runBrowser(message.profile as TestProfile, message.url, message.index).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'run-curl') {
    runCurl(message.profile as TestProfile, message.url, message.index).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'run-lighthouse') {
    runLighthouse(message.profile as TestProfile, message.url).then(sendResponse).catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'companion-ping') {
    pingCompanion().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

export type RunResponse = TestRun | { error: string };
