import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, realpath, readFile, access, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { modelFixture } from './mimo.fixture';
import { parseEvent, type AgentEvent } from '../../protocol/src/index';

const binary = resolve('.mimo-runtime/darwin-arm64/bin/mimo');
test('motor oficial: streaming, escrita com permissão, recusa, cancelamento e retomada de sessão', { skip: process.platform !== 'darwin' || process.arch !== 'arm64' || !existsSync(binary), timeout: 120000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'nebula-mimo-e2e-')));
  await writeFile(join(root, 'README.md'), '# Projeto de teste\n');
  const fixture = await modelFixture(root);
  const profile = join(root, '.test-profile');
  let child = spawn(process.execPath, [resolve('dist/mimo-sidecar.cjs')], { cwd: root, env: { PATH: process.env.PATH, NEBULA_MIMO_BIN: binary, NEBULA_MIMO_ROOT: root, NEBULA_MIMO_DATA: profile, NEBULA_MIMO_MODEL: 'test-model', NEBULA_MIMO_BASE_URL: fixture.url, NEBULA_MIMO_API_KEY: 'nebula-local-test-key' }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  const events: AgentEvent[] = []; let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let lines = createInterface({ input: child.stdout });
  lines.on('line', line => { events.push(parseEvent(JSON.parse(line))); });
  const send = (message: object) => child.stdin.write(JSON.stringify({ version: 1, ...message }) + '\n');
  async function wait(requestId: string, type: AgentEvent['type']) {
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      const event = events.find(e => e.requestId === requestId && e.type === type);
      if (event) return event;
      const failure = events.find(e => e.requestId === requestId && e.type === 'finished');
      assert.ok(!failure, 'Tarefa terminou antes de ' + type + ': ' + JSON.stringify(events) + JSON.stringify(fixture.requests.map(r => r.messages.filter(m => m.role === 'tool').map(m => String(m.content).slice(0, 800)))) + stderr);
      assert.equal(child.exitCode, null, 'Ponte encerrou: ' + stderr);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.fail('Timeout em ' + type + ': ' + JSON.stringify(events) + JSON.stringify(fixture.requests.map(r => r.messages.filter(m => m.role === 'tool').map(m => String(m.content).slice(0, 800)))) + stderr);
  }
  const run = (requestId: string, sessionId: string, prompt: string) => send({ type: 'run', engine: 'mimo', requestId, sessionId, prompt });
  const reply = (event: AgentEvent, allow: boolean) => { assert.equal(event.type, 'permission'); if (event.type === 'permission') send({ type: 'permission_reply', requestId: event.requestId, sessionId: event.sessionId, permissionId: event.permissionId, allow }); };
  async function stop() {
    lines.close(); const ended = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.stdin.end();
    await Promise.race([ended, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
    try { process.kill(-child.pid!, 'SIGKILL'); } catch {}
  }
  try {
    run('write', 'persistent', '[write] Crie approved.txt usando a ferramenta write.');
    const permission = await wait('write', 'permission');
    assert.ok(permission.type === 'permission' && permission.detail?.includes('+Criado pelo motor oficial MiMo.'));
    await assert.rejects(access(join(root, 'approved.txt')));
    await new Promise(resolve => setTimeout(resolve, 200));
    await assert.rejects(access(join(root, 'approved.txt')));
    reply(permission, true);
    assert.equal((await wait('write', 'finished') as Extract<AgentEvent, { type: 'finished' }>).status, 'completed');
    assert.equal(await readFile(join(root, 'approved.txt'), 'utf8'), 'Criado pelo motor oficial MiMo.\n');
    assert.ok(events.some(e => e.requestId === 'write' && e.type === 'tool' && e.status === 'completed'));
    assert.ok(events.some(e => e.requestId === 'write' && e.type === 'delta'));
    run('deny', 'denied-session', '[deny] Crie denied.txt usando write.');
    reply(await wait('deny', 'permission'), false);
    await wait('deny', 'finished'); await assert.rejects(access(join(root, 'denied.txt')));
    run('cancel', 'cancelled-session', '[cancel] Crie cancelled.txt usando write.');
    await wait('cancel', 'permission'); send({ type: 'cancel', requestId: 'cancel', sessionId: 'cancelled-session' });
    assert.equal((await wait('cancel', 'finished') as Extract<AgentEvent, { type: 'finished' }>).status, 'cancelled');
    await assert.rejects(access(join(root, 'cancelled.txt')));
    run('outside', 'outside-session', '[outside] Tente criar um arquivo fora da pasta.');
    await wait('outside', 'finished');
    await assert.rejects(access(join(root, '..', 'nebula-outside-' + basename(root) + '.txt')));
    assert.ok(!events.some(e => e.requestId === 'outside' && e.type === 'permission'));
    run('failure', 'failed-session', '[fail] Teste erro de autenticação.');
    assert.equal((await wait('failure', 'finished') as Extract<AgentEvent, { type: 'finished' }>).status, 'failed');
    assert.ok(!JSON.stringify(events).includes('fixture-provider-secret'));
    run('bash', 'bash-session', '[bash] Execute o comando de teste.');
    reply(await wait('bash', 'permission'), true);
    const startedDeadline = Date.now() + 6000;
    while (!existsSync(join(root, 'running.txt')) && Date.now() < startedDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(existsSync(join(root, 'running.txt')), 'Comando não iniciou');
    send({ type: 'cancel', requestId: 'bash', sessionId: 'bash-session' });
    assert.equal((await wait('bash', 'finished') as Extract<AgentEvent, { type: 'finished' }>).status, 'cancelled');
    await new Promise(resolve => setTimeout(resolve, 5500));
    await assert.rejects(access(join(root, 'after-cancel.txt')));
    const saved = JSON.parse(await readFile(join(profile, 'sessions.json'), 'utf8'));
    const sessionBefore = saved.persistent;
    await stop();
    child = spawn(process.execPath, [resolve('dist/mimo-sidecar.cjs')], { cwd: root, env: { PATH: process.env.PATH, NEBULA_MIMO_BIN: binary, NEBULA_MIMO_ROOT: root, NEBULA_MIMO_DATA: profile, NEBULA_MIMO_MODEL: 'test-model', NEBULA_MIMO_BASE_URL: fixture.url, NEBULA_MIMO_API_KEY: 'nebula-local-test-key' }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    lines = createInterface({ input: child.stdout }); lines.on('line', line => events.push(parseEvent(JSON.parse(line))));
    child.stderr.on('data', chunk => { stderr += chunk; });
    run('followup', 'persistent', '[followup] Continue nossa conversa.');
    assert.equal((await wait('followup', 'finished') as Extract<AgentEvent, { type: 'finished' }>).status, 'completed');
    assert.equal(JSON.parse(await readFile(join(profile, 'sessions.json'), 'utf8')).persistent, sessionBefore);
    const followup = fixture.requests.find(r => JSON.stringify(r.messages.at(-1)).includes('[followup]') && r.tools?.length);
    assert.ok(followup?.messages.some(m => m.role === 'assistant'));
    assert.ok(!JSON.stringify(events).includes('nebula-local-test-key'));
  } finally { await stop(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});
