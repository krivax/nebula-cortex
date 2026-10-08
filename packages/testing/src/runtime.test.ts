import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../agent-core/src/index';
import { parseRequest, type AgentEvent, type RunRequest } from '../../protocol/src/index';
import { MockProvider, type ProviderAdapter } from '../../providers/src/index';
import { PermissionBroker } from '../../tools/src/index';
import { decodeSessions, updateMessage } from '../../../apps/desktop/src/store';
const request: RunRequest = { version: 1, type: 'run', sessionId: 'session', requestId: 'run', prompt: 'Teste' };

test('streaming preserva ordem, identidade e estado final', async () => {
  const events: AgentEvent[] = [];
  await runAgent(request, new MockProvider(0), new AbortController().signal, e => events.push(e));
  assert.equal(events[0].type, 'started');
  assert.ok(events.filter(e => e.type === 'delta').length > 10);
  assert.deepEqual(events.at(-1), { version: 1, requestId: 'run', sessionId: 'session', type: 'finished', status: 'completed' });
  assert.ok(events.every(e => e.sessionId === 'session' && e.requestId === 'run'));
});
test('cancelamento encerra sem novos deltas', async () => {
  const abort = new AbortController(); const events: AgentEvent[] = [];
  await runAgent(request, new MockProvider(0), abort.signal, e => { events.push(e); if (e.type === 'delta') abort.abort(); });
  assert.equal(events.filter(e => e.type === 'delta').length, 1);
  assert.equal(events.at(-1)?.type, 'finished');
  assert.ok(events.at(-1)?.type === 'finished' && events.at(-1)?.['status' as keyof AgentEvent] === 'cancelled');
});
test('falha do provedor é normalizada sem vazar erro original', async () => {
  const provider: ProviderAdapter = { id: 'failure', models: [], async *stream() { throw new Error('secret-api-key'); yield ''; } };
  const events: AgentEvent[] = [];
  await runAgent(request, provider, new AbortController().signal, e => events.push(e));
  assert.equal(events[1].type, 'error');
  assert.ok(!JSON.stringify(events).includes('secret-api-key'));
  assert.deepEqual(events.at(-1), { version: 1, requestId: 'run', sessionId: 'session', type: 'finished', status: 'failed' });
});
test('protocolo rejeita versões desconhecidas e tarefas inválidas', () => {
  for (const invalid of [null, {}, { ...request, version: 2 }, { ...request, prompt: '' }, { ...request, prompt: 'x'.repeat(32001) }, { ...request, sessionId: '' }]) assert.throws(() => parseRequest(invalid));
  assert.deepEqual(parseRequest(request), request);
});
test('histórico recupera execuções interrompidas sem repetição', () => {
  const raw = JSON.stringify([{ id: 's', title: 't', createdAt: '2026-09-30', messages: [{ id: 'm', role: 'assistant', content: 'parcial', status: 'running' }] }]);
  assert.equal(decodeSessions(raw)[0].messages[0].status, 'cancelled');
  assert.equal(decodeSessions(raw)[0].messages[0].content, 'parcial');
  assert.throws(() => decodeSessions('{bad'));
  assert.throws(() => decodeSessions('[{"id":"s"}]'));
});
test('broker anterior mantém recusa por padrão, separado do executor MiMo', () => {
  assert.equal(new PermissionBroker().authorize({ tool: { id: 'read', effect: 'read', description: 'read' }, projectId: 'demo', canonicalPath: '/tmp' }).allowed, false);
});

test('tokens longos são divididos sem partir caracteres Unicode', async () => {
  const text = 'a'.repeat(8191) + '💡'.repeat(16000);
  const provider: ProviderAdapter = { id: 'large', models: [], async *stream() { yield text; } };
  const events: AgentEvent[] = [];
  await runAgent(request, provider, new AbortController().signal, e => events.push(e));
  const parts = events.flatMap(e => e.type === 'delta' ? [e.text] : []);
  assert.equal(parts.join(''), text); assert.ok(parts.every(t => t.length <= 8192));
  assert.ok(parts.every(t => !/[\uD800-\uDBFF]$/.test(t) && !/^[\uDC00-\uDFFF]/.test(t)));
});

test('histórico mantém motor e projeto, sem restaurar permissões pendentes', () => {
  const raw = JSON.stringify([{ id: 's', title: 'MiMo', createdAt: '2026-10-01', engine: 'mimo', projectId: 'project-token', messages: [{ id: 'm', role: 'assistant', engine: 'mimo', model: 'test-model', content: 'partial', status: 'running', permissions: [{ allow: true }] }] }]);
  const restored = decodeSessions(raw)[0];
  assert.equal(restored.engine, 'mimo'); assert.equal(restored.projectId, 'project-token');
  assert.equal(restored.messages[0].model, 'test-model'); assert.equal(restored.messages[0].status, 'cancelled');
  assert.ok(!JSON.stringify(restored).includes('permissions'));
  const envelope = { version: 1 as const, requestId: 'r', sessionId: 's' };
  const message = updateMessage(restored.messages[0], { ...envelope, type: 'snapshot', text: 'authoritative' });
  assert.equal(message.content, 'authoritative');
});

test('ferramentas em execução ficam interrompidas ao cancelar a resposta', () => {
  const envelope = { version: 1 as const, requestId: 'r', sessionId: 's' };
  const message = updateMessage({ id: 'm', role: 'assistant', content: '', status: 'running' }, { ...envelope, type: 'tool', toolId: 't', name: 'write', status: 'running', description: 'file.txt' });
  const cancelled = updateMessage(message, { ...envelope, type: 'finished', status: 'cancelled' });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.tools?.[0].status, 'cancelled');
});
