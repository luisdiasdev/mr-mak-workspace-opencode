import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseEnv } from 'dotenv';

const execFileAsync = promisify(execFile);

export const AGENTS = [
  { id: 'codex', label: 'Codex', color: '#88d8bf', command: 'codex', subscription: true },
  { id: 'claude', label: 'Claude Code', color: '#dba68c', command: 'claude', subscription: true },
  { id: 'kimi', label: 'Kimi', color: '#b3a3f7', command: 'kimi', subscription: true },
  { id: 'opencode', label: 'OpenCode', color: '#f59e0b', command: 'opencode2', subscription: true },
  { id: 'shell', label: 'PowerShell', color: '#89b7ed', command: 'powershell.exe', subscription: false },
];

export function commandPath(name, env = process.env) {
  if (path.isAbsolute(name) && existsSync(name)) return name;
  const extra = [path.join(env.APPDATA || '', 'npm'), path.join(os.homedir(), '.kimi-code', 'bin'), path.join(os.homedir(), '.local', 'bin')];
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];
  for (const folder of [...String(env.PATH || env.Path || '').split(path.delimiter), ...extra]) {
    for (const ext of extensions) {
      const candidate = path.join(folder, name.toLowerCase().endsWith(ext) && ext ? name : name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function nvmVersionRoots(dir) {
  const roots = [];
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('v')) continue;
      const candidate = path.join(dir, name);
      if (statSync(candidate).isDirectory()) roots.push(candidate);
    }
  } catch { /* ignore unreadable directory */ }
  return roots;
}

function resolveOpenCode(env = process.env) {
  const launcher = commandPath('opencode2', env);
  if (launcher) {
    const exe = path.join(path.dirname(launcher), 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
    if (existsSync(exe)) return { launcher, exe };
  }
  // The service may be launched from an installer or another terminal with a
  // different profile or environment, so search well-known roots using both
  // env.USERPROFILE and os.homedir().
  const homes = new Set([env.USERPROFILE, env.HOME, os.homedir()].filter(Boolean));
  const roots = [];
  const add = (dir, options = {}) => {
    if (!dir) return;
    roots.push({ dir, isNvm: options.isNvm || /\bnvm\b/i.test(dir) });
  };
  add(path.join(env.APPDATA || '', 'npm'));
  add(path.join(env.LOCALAPPDATA || '', 'nvm'), { isNvm: true });
  for (const home of homes) {
    add(path.join(home, 'AppData', 'Roaming', 'npm'));
    add(path.join(home, 'AppData', 'Local', 'nvm'), { isNvm: true });
    add(path.join(home, 'scoop', 'apps', 'nodejs', 'current'));
    add(path.join(home, 'scoop', 'shims'));
    add(path.join(home, '.local', 'bin'));
  }
  add(path.join('C:', 'nvm4w', 'nodejs'), { isNvm: true });
  add(path.join('C:', 'nvm4w'));
  add(path.join(env.ProgramFiles || '', 'nodejs'));
  add(path.join(env['ProgramFiles(x86)'] || '', 'nodejs'));
  add(path.join('C:', 'Program Files', 'nodejs'));
  add(path.join('C:', 'Program Files (x86)', 'nodejs'));
  add(path.join('C:', 'ProgramData', 'nvm'), { isNvm: true });
  const expanded = [];
  for (const { dir, isNvm } of roots) {
    if (isNvm) expanded.push(...nvmVersionRoots(dir));
    expanded.push(dir);
  }
  for (const root of expanded) {
    const exe = path.join(root, 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
    if (existsSync(exe)) return { launcher: path.join(root, 'opencode2.ps1'), exe };
  }
  return null;
}

export function inventory(env = process.env) {
  return AGENTS.map(agent => {
    if (agent.id === 'opencode') return { ...agent, available: !!resolveOpenCode(env) };
    return { ...agent, available: !!commandPath(agent.command, env) };
  });
}

// Resolve the real Codex binary when available so JSON-RPC does not pass through a shell.
export function codexBinary(env = process.env) {
  const npmRoot = path.join(env.APPDATA || '', 'npm', 'node_modules', '@openai');
  const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const platformPackage = `codex-win32-${process.arch}`;
  for (const root of [path.join(npmRoot, 'codex', 'node_modules', '@openai', platformPackage), path.join(npmRoot, platformPackage), path.join(npmRoot, 'codex')]) {
    for (const directory of ['bin', 'codex']) {
      const candidate = path.join(root, 'vendor', triple, directory, 'codex.exe');
      if (existsSync(candidate)) return { file: candidate, args: [] };
    }
  }
  const js = path.join(npmRoot, 'codex', 'bin', 'codex.js');
  if (existsSync(js)) return { file: process.execPath, args: [js] };
  const executable = commandPath('codex', env);
  if (executable && !/\.(cmd|bat|ps1)$/i.test(executable)) return { file: executable, args: [] };
  throw new Error('Codex CLI is not installed. Install it and sign in once to use Mr. Mak.');
}

export function opencodeBinary(env = process.env) {
  const resolved = resolveOpenCode(env);
  if (resolved) return resolved.exe;
  throw new Error('OpenCode v2 CLI is not installed. Install it and sign in once to use Mr. Mak.');
}

export async function createOpenCodeSession(cwd, title) {
  const binary = opencodeBinary();
  const { stdout } = await execFileAsync(binary, ['api', 'POST', '/api/session', '-d', JSON.stringify({ title: String(title || 'Mr. Mak chat').slice(0, 200) })], { cwd, encoding: 'utf8', timeout: 20000 });
  const result = JSON.parse(stdout);
  if (!result.data?.id) throw new Error('OpenCode did not return a session ID');
  return result.data.id;
}

export function terminalCommand(agent, { bypass = false, resumeId, nativeId, effort } = {}) {
  if (!AGENTS.some(item => item.id === agent)) throw new Error('Unknown agent');
  let command;
  if (agent === 'opencode') command = opencodeBinary();
  else command = commandPath(AGENTS.find(item => item.id === agent).command);
  if (!command) throw new Error(`${agent} is not installed on this computer`);
  const args = [];
  if (agent === 'codex') {
    if (resumeId) args.push('resume', resumeId);
    // Inline mode retains xterm scrollback for new and resumed conversations.
    args.push('--no-alt-screen');
    if (bypass) args.push('--dangerously-bypass-approvals-and-sandbox');
    if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  } else if (agent === 'claude') {
    if (resumeId) args.push('--resume', resumeId);
    else if (nativeId) args.push('--session-id', nativeId);
    if (bypass) args.push('--dangerously-skip-permissions');
    if (effort) args.push('--effort', effort);
  } else if (agent === 'kimi') {
    if (resumeId) args.push('--session', resumeId);
    if (bypass) args.push('--yolo');
  } else if (agent === 'opencode') {
    if (resumeId) args.push('--session', resumeId);
    else if (nativeId) args.push('--session', nativeId);
    // OpenCode mini does not support permission bypass or effort/variant flags.
  } else {
    args.push('-NoLogo');
  }
  if (process.platform !== 'win32' || agent === 'shell') return { file: command, args };
  // An encoded PowerShell script preserves spaces, Unicode and quotes. No -NoExit:
  // after the agent exits, stale coordinator input cannot become shell commands.
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const script = `[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); & ${[command, ...args].map(quote).join(' ')}; exit $LASTEXITCODE`;
  return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
}

export function childEnvironment(repo) {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  // Forward only explicitly named MCP credentials. Voice and unrelated API keys
  // stay private to the service; CLI subscription authentication is unchanged.
  if (repo) {
    const values = parseEnv(readDotEnv(path.join(repo, '.env')));
    for (const [name, value] of Object.entries(values)) if (/^MRMAK_MCP_[A-Z0-9_]+$/.test(name) && !env[name]) env[name] = value;
  }
  // Drop host-agent identity from the parent so every terminal is an independent CLI.
  for (const key of Object.keys(env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|CODEX_THREAD_ID|CODEX_TURN_ID|CODEX_SHELL|MRMAK_TOKEN|MRMAK_PARENT_PID)$/.test(key)) delete env[key];
  }
  return env;
}

export function readDotEnv(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}
