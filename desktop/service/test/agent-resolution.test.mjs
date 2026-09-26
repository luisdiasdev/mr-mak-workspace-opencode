import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inventory, opencodeBinary, codexBinary } from '../agents.mjs';

const OPENCODE_EXE = path.join('node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');

async function touch(file) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '');
  return file;
}

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mrmak-agents-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}

// A trimmed environment like a tray-launched or installer-launched service.
// Clear the npm prefix variables the test runner exports so only the explicit
// root under test can resolve.
function cleanEnv(extra) {
  return {
    ...process.env, PATH: '', Path: '', APPDATA: '', NVM_HOME: '', NVM_SYMLINK: '',
    npm_config_prefix: '', NPM_CONFIG_PREFIX: '', ...extra,
  };
}

test('OpenCode resolves from a version-manager prefix exposed in the environment', async t => {
  const base = await fixture(t);
  const prefix = path.join(base, 'nvm', 'v22.0.0');
  const exe = await touch(path.join(prefix, OPENCODE_EXE));
  const env = cleanEnv({ NVM_SYMLINK: prefix });
  assert.equal(opencodeBinary(env), exe);
  assert.equal(inventory(env).find(agent => agent.id === 'opencode').available, true);
});

test('OpenCode resolves from the per-user npm prefix without PATH', async t => {
  const base = await fixture(t);
  const appData = path.join(base, 'appdata');
  const exe = await touch(path.join(appData, 'npm', OPENCODE_EXE));
  assert.equal(opencodeBinary(cleanEnv({ APPDATA: appData })), exe);
});

test('Codex resolves its vendored binary from the same derived roots', async t => {
  const base = await fixture(t);
  const prefix = path.join(base, 'nvm', 'v22.0.0');
  const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const platformPackage = `codex-win32-${process.arch}`;
  const exe = await touch(path.join(prefix, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', platformPackage, 'vendor', triple, 'bin', 'codex.exe'));
  assert.deepEqual(codexBinary(cleanEnv({ NVM_SYMLINK: prefix })), { file: exe, args: [] });
});
