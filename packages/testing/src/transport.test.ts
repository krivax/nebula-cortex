import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithBridge, type AgentBridge } from '../../../apps/desktop/src/agentTransport';
import { parseEvent, type AgentEvent, type RunRequest } from '../../protocol/src/index';
const request: RunRequest = { version: 1, type: 'run', requestId: 'r', sessionId: 's', prompt: 'teste' };
const event = (payload: Record<string, unknown>) => ({ version: 1, requestId: 'r', sessionId: 's', ...payload });

test('transporte recebe streaming antes do acknowledgement e finaliza uma vez', async () => {
  const events: AgentEvent[] = [];
  const bridge: AgentBridge = { async start(_, receive) {
    receive(event({ type: 'started' })); receive(event({ type: 'delta', text: 'Resposta' }));
    receive(event({ type: 'finished', status: 'completed' })); receive(event({ type: 'delta', text: 'indevido' }));
  }, async cancel() { assert.fail('Não deveria cancelar'); } };
  await runWithBridge(request, new AbortController().signal, e => events.push(e), bridge);
  assert.deepEqual(events.map(e => e.type), ['started', 'delta', 'finished']);
});
test('cancelamento durante startup é entregue após aceitar a tarefa', async () => {
  const abort = new AbortController(); const events: AgentEvent[] = []; let cancelled = 0;
  let receive: (value: unknown) => void = () => {};
  const bridge: AgentBridge = { async start(_, callback) { receive = callback; callback(event({ type: 'started' })); abort.abort(); }, async cancel() {
    cancelled++; receive(event({ type: 'delta', text: 'após cancelamento' })); receive(event({ type: 'finished', status: 'cancelled' }));
  } };
  await runWithBridge(request, abort.signal, e => events.push(e), bridge);
  assert.equal(cancelled, 1); assert.deepEqual(events.map(e => e.type), ['started', 'finished']);
  assert.deepEqual(events.at(-1), event({ type: 'finished', status: 'cancelled' }));
});
test('tarefa já abortada não inicia processo', async () => {
  const abort = new AbortController(); abort.abort(); const events: AgentEvent[] = [];
  await runWithBridge(request, abort.signal, e => events.push(e), { async start() { assert.fail(); }, async cancel() { assert.fail(); } });
  assert.deepEqual(events, [event({ type: 'finished', status: 'cancelled' })]);
});
test('falha IPC não deixa resposta rodando nem expõe erro original', async () => {
  const events: AgentEvent[] = []; let starts = 0;
  await runWithBridge(request, new AbortController().signal, e => events.push(e), { async start() { starts++; throw new Error('secret-api-key'); }, async cancel() {} });
  assert.equal(starts, 1); assert.equal(events.at(-1)?.type, 'finished');
  assert.deepEqual(events.at(-1), event({ type: 'finished', status: 'failed' }));
  assert.ok(!JSON.stringify(events).includes('secret-api-key'));
});
test('transporte rejeita outra sessão, evento fora de ordem e versão inválida', async () => {
  for (const invalid of [event({ type: 'delta', text: 'fora de ordem' }), event({ type: 'started', sessionId: 'outra' }), event({ type: 'started', version: 2 })]) {
    const events: AgentEvent[] = []; let cancelled = false;
    await runWithBridge(request, new AbortController().signal, e => events.push(e), { async start(_, receive) { receive(invalid); }, async cancel() { cancelled = true; } });
    assert.ok(cancelled); assert.deepEqual(events.map(e => e.type), ['error', 'finished']);
    assert.deepEqual(events.at(-1), event({ type: 'finished', status: 'failed' }));
  }
});
test('eventos validados rejeitam conteúdo excessivo e estados desconhecidos', () => {
  for (const invalid of [null, event({ type: 'finished', status: 'running' }), event({ type: 'delta', text: 'a'.repeat(32001) }), event({ type: 'error', code: 'x', message: 'a'.repeat(1001) })]) assert.throws(() => parseEvent(invalid));
  assert.deepEqual(parseEvent(event({ type: 'delta', text: 'Olá' })), event({ type: 'delta', text: 'Olá' }));
});

test('confirmação do backend não cancela uma tarefa ativa sem pedido do usuário', async () => {
  let receive: (value: unknown) => void = () => {}; let cancelled = 0; const events: AgentEvent[] = [];
  const running = runWithBridge(request, new AbortController().signal, e => events.push(e), {
    async start(_, callback) { receive = callback; }, async cancel() { cancelled++; },
  });
  await Promise.resolve();
  assert.equal(cancelled, 0);
  receive(event({ type: 'started' })); receive(event({ type: 'delta', text: 'Resposta após confirmação' })); receive(event({ type: 'finished', status: 'completed' }));
  await running;
  assert.equal(cancelled, 0); assert.deepEqual(events.map(e => e.type), ['started', 'delta', 'finished']);
});

test('cancelamento ignora snapshots e pedidos de permissão tardios do MiMo', async () => {
  const abort = new AbortController(); const events: AgentEvent[] = [];
  await runWithBridge(request, abort.signal, e => events.push(e), {
    async start(_, receive) {
      receive(event({ type: 'started' })); abort.abort();
      receive(event({ type: 'snapshot', text: 'tardio' }));
      receive(event({ type: 'permission', permissionId: 'p', permission: 'edit', patterns: ['file'] }));
      receive(event({ type: 'finished', status: 'completed' }));
    }, async cancel() {},
  });
  assert.deepEqual(events.map(e => e.type), ['started', 'finished']);
  assert.deepEqual(events.at(-1), event({ type: 'finished', status: 'cancelled' }));
});

test('pedido de permissão preserva a diferença e recusa conteúdo fora do limite', () => {
  const permission = event({ type: 'permission', permissionId: 'p', permission: 'edit', patterns: ['a.ts'], detail: '-old\n+new' });
  assert.deepEqual(parseEvent(permission), permission);
  assert.throws(() => parseEvent({ ...permission, patterns: Array(7).fill('a'.repeat(4000)) }));
  assert.throws(() => parseEvent({ ...permission, detail: 'x'.repeat(16001) }));
});
