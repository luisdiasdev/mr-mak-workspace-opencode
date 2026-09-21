import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repo, 'desktop', 'service');
const dest = path.join(repo, '.cache', 'desktop-runtime', 'service');

await rm(dest, { recursive: true, force: true });
await mkdir(path.dirname(dest), { recursive: true });
await cp(src, dest, {
  recursive: true,
  filter: source => !source.split(path.sep).some(part => ['node_modules', 'test', '.cache'].includes(part)),
});
console.log('Synced desktop/service to .cache/desktop-runtime/service');
