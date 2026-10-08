import type { AgentEvent, Engine, RunStatus } from '../../../packages/protocol/src/index';
type ToolEvent = Extract<AgentEvent, { type: 'tool' }>;
export type ToolRecord = Omit<ToolEvent, 'status'> & { status: ToolEvent['status'] | 'cancelled' };
export interface Message { id: string; role: 'user' | 'assistant'; content: string; status?: RunStatus; engine?: Engine; model?: string; tools?: ToolRecord[]; activity?: string }
export interface Conversation { id: string; title: string; createdAt: string; messages: Message[]; engine?: Engine; projectId?: string }
export const STORAGE_KEY = 'nebula.preview.sessions.v1';
export function newConversation(engine: Engine = 'mock'): Conversation {
  return { id: crypto.randomUUID(), title: 'Nova conversa', createdAt: new Date().toISOString(), messages: [], engine };
}
export function updateMessage(message: Message, event: AgentEvent): Message {
  if (event.type === 'delta') return { ...message, content: (message.content + event.text).slice(0, 32000) };
  if (event.type === 'snapshot') return { ...message, content: event.text };
  if (event.type === 'error') return { ...message, content: message.content + '\n' + event.message };
  if (event.type === 'finished') return { ...message, status: event.status, activity: undefined, tools: message.tools?.map(tool => event.status !== 'completed' && (tool.status === 'pending' || tool.status === 'running') ? { ...tool, status: event.status === 'cancelled' ? 'cancelled' : 'error' } : tool) };
  if (event.type === 'activity') return { ...message, activity: event.message };
  if (event.type === 'tool') return { ...message, tools: [...(message.tools ?? []).filter(t => t.toolId !== event.toolId), event].slice(-100) };
  return message;
}
export function decodeSessions(raw: string | null): Conversation[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 100) throw new Error('Histórico inválido');
  const ids = new Set<string>();
  return value.map(v => {
    if (!v || typeof v.id !== 'string' || ids.has(v.id) || typeof v.title !== 'string' || typeof v.createdAt !== 'string' || !Array.isArray(v.messages)) throw new Error('Conversa inválida');
    if (v.engine !== undefined && !['mock', 'mimo'].includes(v.engine)) throw new Error('Motor inválido');
    if (v.projectId !== undefined && (typeof v.projectId !== 'string' || v.projectId.length > 128)) throw new Error('Projeto inválido');
    ids.add(v.id);
    const messageIds = new Set<string>();
    const messages: Message[] = v.messages.map((m: Message) => {
      if (!m || typeof m.id !== 'string' || messageIds.has(m.id) || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || (m.status && !['running', 'completed', 'cancelled', 'failed'].includes(m.status))) throw new Error('Mensagem inválida');
      if (m.engine !== undefined && !['mock', 'mimo'].includes(m.engine)) throw new Error('Motor inválido');
      messageIds.add(m.id);
      return { id: m.id, role: m.role, content: m.content, engine: m.engine ?? 'mock', ...(typeof m.model === 'string' ? { model: m.model.slice(0, 128) } : {}), ...(m.status ? { status: m.status === 'running' ? 'cancelled' as const : m.status } : {}) };
    });
    return { id: v.id, title: v.title, createdAt: v.createdAt, messages, engine: v.engine ?? 'mock', ...(v.projectId ? { projectId: v.projectId } : {}) };
  });
}
