import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
async function fixture() {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'workspace-update-test-'));
  await mkdir(path.join(repo, 'workspace'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Mr. Mak UI</html>');
  const entities = [
    { id: 'alpha', title: 'Alpha', folder: 'alpha', category: 'dev', created: '2026-09-10', status: 'active', steps: [] },
    { id: 'beta', title: 'Beta', folder: 'beta', category: 'dev', created: '2026-09-11', status: 'done', pinned: true, steps: [] },
  ];
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities }, null, 2));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  const patch = (id, body, headers = {}) => fetch(`${service.origin}/api/workspace/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { repo, service, patch };
}

test('card menu updates pin and archive through the authenticated PATCH endpoint', async () => {
  const { repo, service, patch } = await fixture();
  try {
    // Authentication is required, as with every /api route.
    assert.equal((await fetch(`${service.origin}/api/workspace/alpha`, { method: 'PATCH', body: '{}' })).status, 401);

    // Pin a card.
    assert.equal((await patch('alpha', { pinned: true })).status, 200);
    let registry = JSON.parse(await readFile(path.join(repo, 'workspace', 'workspace.json'), 'utf8'));
    assert.equal(registry.entities[0].pinned, true);
    assert.equal(registry.entities[1].pinned, true, 'other cards are untouched');

    // Archive a card; the date rule keeps the change explicit and stable.
    assert.equal((await patch('alpha', { status: 'archived' })).status, 200);
    registry = JSON.parse(await readFile(path.join(repo, 'workspace', 'workspace.json'), 'utf8'));
    assert.equal(registry.entities[0].status, 'archived');

    // Restore from archive.
    assert.equal((await patch('alpha', { status: 'active' })).status, 200);
    registry = JSON.parse(await readFile(path.join(repo, 'workspace', 'workspace.json'), 'utf8'));
    assert.equal(registry.entities[0].status, 'active');

    // Invalid values and unknown cards are rejected.
    assert.equal((await patch('alpha', { status: 'hidden' })).status, 400);
    assert.equal((await patch('alpha', {})).status, 400);
    assert.equal((await patch('missing', { pinned: true })).status, 400);
  } finally {
    await service.close();
  }
});
