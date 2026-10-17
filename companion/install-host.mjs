#!/usr/bin/env node
/* Usage: node install-host.mjs <chrome-extension-id>. Registers the current Node host for the current user. */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const extensionId = process.argv[2];
if (!/^[a-p]{32}$/.test(extensionId || '')) throw new Error('Podaj 32-znakowe ID rozszerzenia z chrome://extensions.');
const root = resolve(fileURLToPath(new URL('.', import.meta.url))); const manifest = { name: 'com.deploy_speed_tester.host', description: 'Deploy Speed Tester local companion', path: process.execPath, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] };
// Node must receive the host script as its first argument; a small wrapper avoids shell interpretation.
const wrapper = resolve(root, process.platform === 'win32' ? 'launch-host.cmd' : 'launch-host.sh');
if (process.platform === 'win32') await writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${resolve(root, 'host.mjs')}"\r\n`);
else { await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${resolve(root, 'host.mjs')}"\n`, { mode: 0o755 }); }
manifest.path = wrapper;
const file = resolve(root, 'com.deploy_speed_tester.host.json'); await writeFile(file, JSON.stringify(manifest, null, 2));
if (platform() === 'linux') { const dir = resolve(homedir(), '.config/google-chrome/NativeMessagingHosts'); await mkdir(dir, { recursive: true }); await writeFile(resolve(dir, 'com.deploy_speed_tester.host.json'), JSON.stringify(manifest, null, 2)); }
else if (platform() === 'darwin') { const dir = resolve(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts'); await mkdir(dir, { recursive: true }); await writeFile(resolve(dir, 'com.deploy_speed_tester.host.json'), JSON.stringify(manifest, null, 2)); }
else execFileSync('reg', ['add', 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.deploy_speed_tester.host', '/ve', '/t', 'REG_SZ', '/d', file, '/f']);
console.log('Companion registered.');
