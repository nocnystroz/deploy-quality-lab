import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const destination = resolve(root, 'release', `deploy-speed-tester-${pkg.version}`);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(resolve(root, 'dist'), resolve(destination, 'extension'), { recursive: true });
await cp(resolve(root, 'companion'), resolve(destination, 'companion'), {
  recursive: true,
  filter: source => !source.includes('node_modules') && !source.endsWith('com.deploy_speed_tester.host.json') && !source.endsWith('launch-host.sh') && !source.endsWith('launch-host.cmd')
});
await cp(resolve(root, 'README.md'), resolve(destination, 'README.md'));
await writeFile(resolve(destination, 'INSTALL.txt'), `Deploy Speed Tester ${pkg.version}\n\n1. Load the extension/ directory as unpacked in chrome://extensions.\n2. Copy the Extension ID displayed by Chrome.\n3. In companion/, run npm install, then:\n   node install-host.mjs YOUR_EXTENSION_ID\n\nThe installer registers the companion for the current user on Linux, macOS, or Windows.\n`);
console.log(`Portable release created: ${destination}`);
