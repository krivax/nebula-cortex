import { parseRequest, type AgentEvent, type RunRequest } from '../../protocol/src/index';
import type { ProviderAdapter } from '../../providers/src/index';
export async function runAgent(request: RunRequest, provider: ProviderAdapter, signal: AbortSignal, emit: (event: AgentEvent) => void): Promise<void> {
  const validated = parseRequest(request);
  if (validated.type !== 'run') throw new Error('Esperada uma tarefa');
  const envelope = { version: 1 as const, requestId: validated.requestId, sessionId: validated.sessionId };
  emit({ ...envelope, type: 'started' });
  try {
    for await (const text of provider.stream(validated.prompt, signal)) {
      if (signal.aborted) break;
      // Keep transport messages bounded, including a prompt echoed as one token.
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(offset + 8192, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        emit({ ...envelope, type: 'delta', text: text.slice(offset, end) });
        offset = end;
        if (signal.aborted) break;
      }
    }
    emit({ ...envelope, type: 'finished', status: signal.aborted ? 'cancelled' : 'completed' });
  } catch {
    if (signal.aborted) emit({ ...envelope, type: 'finished', status: 'cancelled' });
    else {
      emit({ ...envelope, type: 'error', code: 'PROVIDER_ERROR', message: 'Não foi possível concluir a resposta.' });
      emit({ ...envelope, type: 'finished', status: 'failed' });
    }
  }
}
