import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRequest } from '../../protocol/src/index';
import { MimoRun, MIMO_PERMISSIONS, mimoClient } from './mimo';

const bin = process.env.NEBULA_MIMO_BIN;
const root = process.env.NEBULA_MIMO_ROOT;
const data = process.env.NEBULA_MIMO_DATA;
const model = process.env.NEBULA_MIMO_MODEL;
const baseURL = process.env.NEBULA_MIMO_BASE_URL;
const apiKey = process.env.NEBULA_MIMO_API_KEY;
if (!bin || !root || !data || !model || !baseURL || !apiKey) process.exit(1);
const active = new Map<string, { sessionId: string; controller: AbortController; run?: MimoRun }>();
const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
let server: ChildProcess | undefined;
let closing = false;
let sessions: Record<string, string> = Object.create(null);
let saveQueue = Promise.resolve();
const profile = data!;
const sessionFile = join(profile, 'sessions.json');
async function boot() {
  await mkdir(join(profile, 'home'), { recursive: true });
  try { const value = JSON.parse(await readFile(sessionFile, 'utf8')); if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [id, remote] of Object.entries(value)) if (id.length <= 128 && typeof remote === 'string' && /^ses_[A-Za-z0-9]+$/.test(remote)) sessions[id] = remote;
  } } catch { /* Empty profile on first launch. */ }
  const password = randomBytes(32).toString('hex');
  const config = {
    autoupdate: false, share: 'disabled', enabled_providers: ['nebula'], model: 'nebula/' + model,
    small_model: 'nebula/' + model, plugin: [], mcp: {}, permission: Object.fromEntries(MIMO_PERMISSIONS.map(p => [p.permission, p.action])),
    provider: { nebula: { npm: '@ai-sdk/openai-compatible', name: 'Nebula', options: { baseURL, apiKey: '{env:NEBULA_MIMO_API_KEY}' }, models: { [model!]: { name: model, limit: { context: 131072, output: 8192 } } } } },
  };
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
    XDG_CACHE_HOME: join(profile, 'cache'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_DATA_HOME: join(profile, 'data'), XDG_STATE_HOME: join(profile, 'state'),
    MIMOCODE_HOME: join(profile, 'home'), USERPROFILE: join(profile, 'home'), MIMOCODE_DISABLE_CLAUDE_CODE_COMMANDS: 'true', MIMOCODE_DISABLE_PROVIDER_ENV: 'true',
    MIMOCODE_SERVER_PASSWORD: password, NEBULA_MIMO_API_KEY: apiKey!,
    MIMOCODE_CONFIG_CONTENT: JSON.stringify(config), MIMOCODE_DISABLE_PROJECT_CONFIG: 'true', MIMOCODE_DISABLE_AGENTS_SKILLS: 'true',
    MIMOCODE_DISABLE_CLAUDE_CODE: 'true', MIMOCODE_DISABLE_DEFAULT_PLUGINS: 'true', MIMOCODE_DISABLE_AUTOUPDATE: 'true',
    MIMOCODE_DISABLE_MODELS_FETCH: 'true', MIMOCODE_DISABLE_OFFICIAL_SKILLS: 'true', MIMOCODE_DISABLE_LSP_DOWNLOAD: 'true',
    MIMOCODE_DISABLE_BUILTIN_SKILLS: 'true', MIMOCODE_DISABLE_COMPOSE_SKILLS: 'true', MIMOCODE_DISABLE_SLASH_SKILLS: 'true',
    MIMOCODE_DISABLE_EMBEDDED_WEB_UI: 'true', MIMOCODE_EVENT_QUEUE_CAPACITY: '512',
  };
  server = spawn(bin!, ['serve', '--hostname', '127.0.0.1', '--port', '0', '--log-level', 'ERROR'], { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] });
  server.on('exit', () => { if (!closing) process.exit(1); });
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { server?.kill(); reject(new Error('MiMo não iniciou')); }, 30000);
    let pending = '';
    server!.once('error', () => { clearTimeout(timeout); reject(new Error('MiMo não iniciou')); });
    server!.once('exit', () => { clearTimeout(timeout); reject(new Error('MiMo encerrou')); });
    server!.stdout!.on('data', chunk => {
      pending = (pending + chunk.toString()).slice(-8192);
      const match = pending.match(/mimocode server listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return mimoClient({ url, password, directory: root!, model: model! });
}
let connection: ReturnType<typeof boot> | undefined;
function getClient() { return connection ??= boot(); }
async function receive(line: Buffer) {
  let identity: { requestId: string; sessionId: string } | undefined;
  try {
    const value = JSON.parse(line.toString('utf8'));
    if (value.type === 'permission_reply') {
      const task = active.get(value.requestId);
      if (value.version !== 1 || !task || task.sessionId !== value.sessionId || typeof value.allow !== 'boolean' || typeof value.permissionId !== 'string') throw new Error('Resposta inválida');
      await task.run?.reply(value.permissionId, value.allow); return;
    }
    const request = parseRequest(value);
    if (request.type === 'cancel') {
      const task = active.get(request.requestId);
      if (task?.sessionId === request.sessionId) task.controller.abort(); return;
    }
    identity = { requestId: request.requestId, sessionId: request.sessionId };
    if (active.has(request.requestId) || [...active.values()].some(task => task.sessionId === request.sessionId) || active.size >= 4) throw new Error('Tarefa duplicada');
    const task = { sessionId: request.sessionId, controller: new AbortController(), run: undefined as MimoRun | undefined };
    active.set(request.requestId, task);
    try {
      const client = await getClient();
      if (task.controller.signal.aborted) { write({ version: 1, ...identity, type: 'started' }); write({ version: 1, ...identity, type: 'finished', status: 'cancelled' }); return; }
      let remoteSession = sessions[request.sessionId];
      if (remoteSession) { await client.session.get({ sessionID: remoteSession }, { throwOnError: true }); await client.session.abort({ sessionID: remoteSession }, { throwOnError: true }); }
      else {
        const created = await client.session.create({ title: request.prompt.slice(0, 80), permission: MIMO_PERMISSIONS }, { throwOnError: true });
        remoteSession = created.data.id; sessions[request.sessionId] = remoteSession;
        saveQueue = saveQueue.then(async () => { await writeFile(sessionFile + '.tmp', JSON.stringify(sessions), { mode: 0o600 }); await rename(sessionFile + '.tmp', sessionFile); });
        await saveQueue;
      }
      task.run = new MimoRun(client, request, remoteSession, model!, task.controller.signal, write, () => process.exit(1));
      await task.run.run();
    } finally { active.delete(request.requestId); }
  } catch {
    if (identity) {
      write({ version: 1, requestId: identity.requestId, sessionId: identity.sessionId, type: 'started' });
      write({ version: 1, requestId: identity.requestId, sessionId: identity.sessionId, type: 'error', code: 'MIMO_START', message: 'Não foi possível iniciar a sessão MiMo. Verifique as configurações do motor.' });
      write({ version: 1, requestId: identity.requestId, sessionId: identity.sessionId, type: 'finished', status: 'failed' });
    } else { shutdown(); }
  }
}
let pending = Buffer.alloc(0);
process.stdin.on('data', (chunk: Buffer) => {
  let offset = 0;
  while (offset < chunk.length) {
    const newline = chunk.indexOf(10, offset); const end = newline < 0 ? chunk.length : newline;
    const part = chunk.subarray(offset, end);
    if (pending.length + part.length > 262144) { shutdown(); return; }
    pending = Buffer.concat([pending, part]);
    if (newline >= 0) { void receive(pending); pending = Buffer.alloc(0); }
    offset = end + 1;
  }
});
function shutdown() {
  if (closing) return; closing = true;
  for (const task of active.values()) task.controller.abort();
  server?.kill('SIGTERM'); process.stdin.destroy();
  const timer = setTimeout(() => { server?.kill('SIGKILL'); process.exit(0); }, 1000);
  timer.unref();
}
process.stdin.on('end', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('exit', () => { server?.kill('SIGKILL'); });
