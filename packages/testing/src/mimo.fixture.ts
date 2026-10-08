import { createServer } from 'node:http';
import { join, basename } from 'node:path';
export async function modelFixture(root: string) {
  const requests: { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] }[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    if (req.headers.authorization !== 'Bearer nebula-local-test-key') { res.writeHead(401); res.end(); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const messages = body.messages as { role: string; content: unknown }[];
    let lastUser = -1; messages.forEach((m, index) => { if (m.role === 'user') lastUser = index; });
    const text = JSON.stringify(messages[lastUser]?.content ?? '');
    if (text.includes('[fail]')) { res.writeHead(401); res.end(JSON.stringify({ error: { message: 'fixture-provider-secret', type: 'invalid_api_key' } })); return; }
    const after = messages.slice(lastUser + 1);
    const tools = body.tools?.map((t: { function: { name: string } }) => t.function.name) ?? [];
    const wantsWrite = text.includes('[write]') || text.includes('[deny]') || text.includes('[cancel]') || text.includes('[outside]');
    const toolUsed = after.some(m => m.role === 'tool');
    const suffix = text.includes('[outside]') ? 'outside' : text.includes('[deny]') ? 'denied' : text.includes('[cancel]') ? 'cancelled' : 'approved';
    const bash = text.includes('[bash]') && !toolUsed && tools.includes('bash');
    const tool = wantsWrite && !toolUsed && tools.includes('write');
    const result = bash ? { tool_calls: [{ index: 0, id: 'call_fixture_bash', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: "printf 'started' > running.txt; sleep 5; printf 'should not exist' > after-cancel.txt", description: 'Comando descartável para validar cancelamento', timeout: 20000 }) } }] } : tool ? { tool_calls: [{ index: 0, id: 'call_fixture_' + suffix, type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: suffix === 'outside' ? join(root, '..', 'nebula-outside-' + basename(root) + '.txt') : join(root, suffix + '.txt'), content: 'Criado pelo motor oficial MiMo.\n' }) } }] } : { content: text.includes('[followup]') ? 'Sessão retomada com o histórico anterior.' : toolUsed && suffix !== 'approved' ? 'Operação recusada ou interrompida.' : 'Integração MiMo concluída.' };
    const chunk = (delta: unknown, finish: string | null) => ({ id: 'chatcmpl-nebula-fixture', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'test-model', choices: [{ index: 0, delta, finish_reason: finish }] });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('data: ' + JSON.stringify(chunk({ role: 'assistant' }, null)) + '\n\n');
    res.write('data: ' + JSON.stringify(chunk(result, null)) + '\n\n');
    res.write('data: ' + JSON.stringify(chunk({}, tool || bash ? 'tool_calls' : 'stop')) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/v1`, requests, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
