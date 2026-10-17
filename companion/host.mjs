#!/usr/bin/env node
import { spawn } from 'node:child_process';

function readMessage() {
  return new Promise(resolve => {
    const chunks = []; let expected;
    process.stdin.on('data', chunk => { chunks.push(chunk); const data = Buffer.concat(chunks); if (expected === undefined && data.length >= 4) expected = data.readUInt32LE(0); if (expected !== undefined && data.length >= expected + 4) resolve(JSON.parse(data.subarray(4, expected + 4).toString('utf8'))); });
  });
}
function writeMessage(message) { const data = Buffer.from(JSON.stringify(message)); const header = Buffer.alloc(4); header.writeUInt32LE(data.length); process.stdout.write(Buffer.concat([header, data])); }
function execute(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { shell: false }); let stdout = '', stderr = ''; child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d); child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `${command} failed (${code})`))); }); }
function parseCurl(output) { const [headers, marker] = output.split('\n---DEPLOY_SPEED_JSON---\n'); const raw = JSON.parse(marker); return { headers, metrics: { totalMs: Number(raw.time_total) * 1000, ttfbMs: Number(raw.time_starttransfer) * 1000, transferBytes: Number(raw.size_download), status: Number(raw.http_code) }, durationMs: Number(raw.time_total) * 1000 }; }

async function handle(request) {
  if (request.type === 'ping') return { version: '0.1.0' };
  const { profile, url } = request.payload;
  if (request.type === 'curl') {
    const writeOut = '\n---DEPLOY_SPEED_JSON---\\n{"time_total":%{time_total},"time_starttransfer":%{time_starttransfer},"size_download":%{size_download},"http_code":%{http_code}}';
    const args = ['--silent', '--show-error', '--location', '--dump-header', '-', '--output', process.platform === 'win32' ? 'NUL' : '/dev/null', '--write-out', writeOut];
    if (profile.disableCache) args.push('-H', 'Cache-Control: no-cache');
    if (profile.userAgent) args.push('--user-agent', profile.userAgent);
    args.push(url);
    const output = await execute('curl', args);
    const parsed = parseCurl(output); return { ...parsed, artifacts: [{ kind: 'debug', filename: 'curl-headers.txt', mimeType: 'text/plain', content: parsed.headers }] };
  }
  if (request.type === 'lighthouse') {
    const lighthouse = (await import('lighthouse')).default; const chromeLauncher = await import('chrome-launcher');
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-first-run'] });
    try { const result = await lighthouse(url, { port: chrome.port, output: 'html', onlyCategories: ['performance'] }); return { report: result.report }; }
    finally { await chrome.kill(); }
  }
  throw new Error('Nieznany typ żądania.');
}

try { const request = await readMessage(); writeMessage({ ok: true, data: await handle(request) }); }
catch (error) { writeMessage({ ok: false, error: String(error.message || error) }); }
