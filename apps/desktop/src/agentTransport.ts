import { Channel, invoke } from '@tauri-apps/api/core';
import { runAgent } from '../../../packages/agent-core/src/index';
import { MockProvider } from '../../../packages/providers/src/index';
import { parseEvent, type AgentEvent, type RunRequest } from '../../../packages/protocol/src/index';
import { isNativeDesktop } from './nativeProject';

export interface AgentBridge {
  start(request: RunRequest, receive: (value: unknown) => void): Promise<void>;
  cancel(request: RunRequest): Promise<void>;
}
const nativeBridge: AgentBridge = {
  start(request, receive) {
    const events = new Channel<unknown>();
    events.onmessage = receive;
    return invoke('start_agent_run', { request, events });
  },
  cancel: request => invoke('cancel_agent_run', { requestId: request.requestId, sessionId: request.sessionId }),
};

// Register the channel before starting and cancel again after acknowledgement:
// an abort can arrive while the native process is still being started.
export function runWithBridge(request: RunRequest, signal: AbortSignal, emit: (event: AgentEvent) => void, bridge: AgentBridge): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    let accepted = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout>;
    const envelope = { version: 1 as const, requestId: request.requestId, sessionId: request.sessionId };
    const finish = (status: 'completed' | 'cancelled' | 'failed') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      emit({ ...envelope, type: 'finished', status });
      resolve();
    };
    const fail = () => {
      if (done) return;
      emit({ ...envelope, type: 'error', code: 'AGENT_TRANSPORT', message: 'O motor de agentes foi interrompido. Envie uma nova tarefa para tentar novamente.' });
      finish(signal.aborted ? 'cancelled' : 'failed');
    };
    const cancel = () => {
      if (signal.aborted && accepted && !done) void bridge.cancel(request).catch(fail);
    };
    const armTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (accepted) void bridge.cancel(request).catch(() => {});
        fail();
      }, 70000);
    };
    if (signal.aborted) { finish('cancelled'); return; }
    signal.addEventListener('abort', cancel, { once: true });
    armTimeout();
    void bridge.start(request, value => {
      if (done) return;
      try {
        const event = parseEvent(value);
        if (event.requestId !== request.requestId || event.sessionId !== request.sessionId) throw new Error('Identidade inválida');
        if (event.type === 'started') {
          if (started) throw new Error('Início duplicado');
          started = true;
        } else if (!started && event.type !== 'error' && event.type !== 'finished') throw new Error('Evento fora de ordem');
        armTimeout();
        if (event.type === 'finished') finish(signal.aborted ? 'cancelled' : event.status);
        else if (!signal.aborted || !['delta', 'snapshot', 'permission'].includes(event.type)) emit(event);
      } catch {
        void bridge.cancel(request).catch(() => {});
        fail();
      }
    }).then(() => { accepted = true; cancel(); }).catch(fail);
  });
}
export function runConversation(request: RunRequest, signal: AbortSignal, emit: (event: AgentEvent) => void): Promise<void> {
  return isNativeDesktop()
    ? runWithBridge(request, signal, emit, nativeBridge)
    : runAgent(request, new MockProvider(), signal, emit);
}
