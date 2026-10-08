import { createOpencodeClient, type Event, type PermissionRuleset } from '@mimo-ai/sdk/v2/client';
import type { AgentEvent, RunRequest } from '../../protocol/src/index';

export const MIMO_PERMISSIONS: PermissionRuleset = [
  { permission: '*', pattern: '*', action: 'ask' },
  ...['external_directory', 'question', 'task', 'bash_interactive', 'doom_loop'].map(permission => ({ permission, pattern: '*', action: 'deny' as const })),
];
export interface MimoConnection { url: string; password: string; directory: string; model: string }
type Body<T> = T extends unknown ? Omit<T, 'version' | 'requestId' | 'sessionId'> : never;
type Client = ReturnType<typeof createOpencodeClient>;
export function mimoClient(connection: MimoConnection) {
  const url = new URL(connection.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Servidor local inválido');
  return createOpencodeClient({ baseUrl: url.origin, directory: connection.directory, headers: { Authorization: `Basic ${Buffer.from('mimocode:' + connection.password).toString('base64')}` } });
}
export class MimoRun {
  private permissions = new Set<string>();
  private roles = new Map<string, string>();
  private parts = new Map<string, string>();
  private rendered = '';
  private closed = false;
  private eventsAbort = new AbortController();
  private envelope;
  constructor(private client: Client, private request: RunRequest, private remoteSession: string, private model: string, private signal: AbortSignal, private emit: (event: AgentEvent) => void, private fatal: () => never) {
    this.envelope = { version: 1 as const, requestId: request.requestId, sessionId: request.sessionId };
  }
  private output(payload: Body<AgentEvent>) {
    if (!this.closed) this.emit({ ...this.envelope, ...payload } as AgentEvent);
  }
  private text() {
    const next = [...this.parts.values()].join('\n\n').slice(0, 32000);
    if (next === this.rendered || this.signal.aborted) return;
    if (next.startsWith(this.rendered)) {
      for (let offset = this.rendered.length; offset < next.length;) {
        let end = Math.min(offset + 8192, next.length);
        if (end < next.length && /[\uD800-\uDBFF]/.test(next[end - 1])) end--;
        this.output({ type: 'delta', text: next.slice(offset, end) }); offset = end;
      }
    } else this.output({ type: 'snapshot', text: next });
    this.rendered = next;
  }
  private receive(event: Event) {
    if (this.closed) return;
    if (event.type === 'message.updated') {
      if (event.properties.info.sessionID === this.remoteSession) this.roles.set(event.properties.info.id, event.properties.info.role);
      return;
    }
    const properties = event.properties;
    if (!('sessionID' in properties) || properties.sessionID !== this.remoteSession) return;
    if (event.type === 'message.part.delta' && event.properties.field === 'text' && this.roles.get(event.properties.messageID) === 'assistant') {
      const p = event.properties; this.parts.set(p.partID, (this.parts.get(p.partID) ?? '') + p.delta); this.text();
    } else if (event.type === 'message.part.updated') {
      const part = event.properties.part;
      if (this.roles.get(part.messageID) !== 'assistant') return;
      if (part.type === 'text') { this.parts.set(part.id, part.text); this.text(); }
      else if (part.type === 'tool') this.output({ type: 'tool', toolId: part.callID, name: part.tool.slice(0, 128), status: part.state.status, description: (part.state.status === 'pending' ? part.tool : 'title' in part.state ? part.state.title ?? part.tool : part.tool).slice(0, 1000) });
    } else if (event.type === 'permission.asked') {
      const p = event.properties;
      if (p.patterns.length > 32 || p.patterns.some(p => p.length > 4000) || p.patterns.join('').length > 24000) throw new Error('Pedido de acesso excede o limite');
      const detail = typeof p.metadata.diff === 'string' ? p.metadata.diff : '';
      if (detail.length > 16000) throw new Error('Diferença excede o limite de revisão');
      this.permissions.add(p.id);
      this.output({ type: 'permission', permissionId: p.id, permission: p.permission.slice(0, 128), patterns: p.patterns, detail });
    } else if (event.type === 'permission.replied') {
      this.permissions.delete(event.properties.requestID);
      this.output({ type: 'permission_resolved', permissionId: event.properties.requestID });
    }
  }
  async reply(permissionId: string, allow: boolean) {
    if (this.closed || !this.permissions.has(permissionId) || this.signal.aborted) throw new Error('Pedido não pertence à tarefa');
    this.permissions.delete(permissionId);
    await this.client.permission.reply({ requestID: permissionId, reply: allow ? 'once' : 'reject' }, { throwOnError: true, signal: AbortSignal.timeout(10000) });
    this.output({ type: 'permission_resolved', permissionId });
  }
  async cancel() {
    await this.client.session.abort({ sessionID: this.remoteSession }, { throwOnError: true, signal: AbortSignal.timeout(6000) });
  }
  async run() {
    this.output({ type: 'started' });
    let cancellation: Promise<void> | undefined;
    const cancel = () => { this.eventsAbort.abort(); cancellation ??= this.cancel(); void cancellation.catch(() => {}); };
    this.signal.addEventListener('abort', cancel, { once: true });
    const heartbeat = setInterval(() => this.output({ type: 'activity', message: this.permissions.size ? 'Aguardando sua autorização' : 'MiMo trabalhando no projeto' }), 10000);
    try {
      if (this.signal.aborted) return;
      let connected!: () => void; let disconnected!: (error: Error) => void;
      const ready = new Promise<void>((resolve, reject) => { connected = resolve; disconnected = reject; });
      const subscription = await this.client.event.subscribe({}, { signal: this.eventsAbort.signal, sseMaxRetryAttempts: 1 });
      const watching = (async () => {
        for await (const event of subscription.stream) {
          if (event.type === 'server.connected') connected();
          this.receive(event);
        }
        if (!this.closed) throw new Error('Canal de eventos interrompido');
      })();
      void watching.catch(error => { disconnected(error); });
      await Promise.race([ready, new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('Canal não iniciou')), 15000);
        void ready.finally(() => clearTimeout(timeout)).catch(() => {});
      })]);
      if (this.signal.aborted) return;
      const response = await Promise.race([
        this.client.session.prompt({ sessionID: this.remoteSession, agent: 'build', model: { providerID: 'nebula', modelID: this.model }, parts: [{ type: 'text', text: this.request.prompt }] }, { throwOnError: true, signal: AbortSignal.any([this.signal, AbortSignal.timeout(15 * 60 * 1000)]) }),
        watching.then(() => { throw new Error('Canal interrompido'); }),
      ]);
      if (!response.data || response.data.info.error) throw new Error('Provedor não concluiu');
      for (const part of response.data.parts) if (part.type === 'text') this.parts.set(part.id, part.text);
      this.text();
    } catch {
      if (!this.signal.aborted) {
        await this.cancel().catch(() => this.fatal());
        this.output({ type: 'error', code: 'MIMO_RUN', message: 'O MiMo não concluiu a tarefa. Verifique o modelo, a chave de API e a conexão nas configurações.' });
        this.output({ type: 'finished', status: 'failed' }); this.closed = true;
      }
    } finally {
      clearInterval(heartbeat); this.signal.removeEventListener('abort', cancel);
      if (this.signal.aborted) await (cancellation ?? this.cancel()).catch(() => this.fatal());
      if (!this.closed) this.output({ type: 'finished', status: this.signal.aborted ? 'cancelled' : 'completed' });
      this.closed = true; this.eventsAbort.abort(); this.permissions.clear();
    }
  }
}
