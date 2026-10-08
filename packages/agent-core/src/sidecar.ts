import { parseRequest } from '../../protocol/src/index';
import { MockProvider } from '../../providers/src/index';
import { runAgent } from './index';
const active = new Map<string, { sessionId: string; controller: AbortController }>();
const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
const reject = () => write({ version: 1, type: 'protocol_error', code: 'INVALID_REQUEST', message: 'Mensagem rejeitada.' });
function receive(line: Buffer) {
  try {
    if (line.length > 262144) throw new Error('Mensagem excede o limite');
    const request = parseRequest(JSON.parse(line.toString('utf8')));
    if (request.type === 'cancel') {
      const run = active.get(request.requestId);
      if (run?.sessionId === request.sessionId) run.controller.abort();
      return;
    }
    if (active.has(request.requestId) || active.size >= 4) throw new Error('Tarefa duplicada ou limite de concorrência');
    const controller = new AbortController();
    active.set(request.requestId, { sessionId: request.sessionId, controller });
    void runAgent(request, new MockProvider(), controller.signal, write).finally(() => active.delete(request.requestId));
  } catch {
    reject();
  }
}
let pending = Buffer.alloc(0);
let dropping = false;
process.stdin.on('data', (chunk: Buffer) => {
  let offset = 0;
  while (offset < chunk.length) {
    const newline = chunk.indexOf(10, offset);
    const end = newline < 0 ? chunk.length : newline;
    const part = chunk.subarray(offset, end);
    if (!dropping) {
      if (pending.length + part.length > 262144) { reject(); pending = Buffer.alloc(0); dropping = true; }
      else pending = Buffer.concat([pending, part]);
    }
    if (newline >= 0) {
      if (!dropping) receive(pending);
      pending = Buffer.alloc(0); dropping = false;
    }
    offset = end + 1;
  }
});
const abortAll = () => { for (const run of active.values()) run.controller.abort(); };
process.stdin.on('end', () => { if (pending.length && !dropping) receive(pending); abortAll(); });
process.on('SIGTERM', () => { abortAll(); process.stdin.destroy(); });
