import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const destination = resolve(root, 'release', `deploy-speed-tester-${pkg.version}`);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(resolve(root, 'dist'), resolve(destination, 'extension'), { recursive: true });
await cp(resolve(root, 'README.md'), resolve(destination, 'README.md'));
await writeFile(resolve(destination, 'INSTALL.txt'), `Deploy Speed Tester ${pkg.version}\n\n1. Open chrome://extensions.\n2. Enable Developer mode.\n3. Select Load unpacked and choose extension/.\n\nNo companion application is required.\n`);
console.log(`Portable release created: ${destination}`);
