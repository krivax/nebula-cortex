export const PROTOCOL_VERSION = 1 as const;
export type Engine = 'mock' | 'mimo';
export type RunStatus = 'running' | 'completed' | 'cancelled' | 'failed';
export type AgentEvent = { version: 1; requestId: string; sessionId: string } & (
  | { type: 'started' }
  | { type: 'delta'; text: string }
  | { type: 'finished'; status: Exclude<RunStatus, 'running'> }
  | { type: 'error'; code: string; message: string }
  | { type: 'snapshot'; text: string }
  | { type: 'activity'; message: string }
  | { type: 'tool'; toolId: string; name: string; status: 'pending' | 'running' | 'completed' | 'error'; description: string }
  | { type: 'permission'; permissionId: string; permission: string; patterns: string[]; detail?: string }
  | { type: 'permission_resolved'; permissionId: string }
);
export interface RunRequest { version: 1; type: 'run'; requestId: string; sessionId: string; prompt: string; engine?: Engine; projectId?: string }
export interface CancelRequest { version: 1; type: 'cancel'; requestId: string; sessionId: string }
export function parseRequest(value: unknown): RunRequest | CancelRequest {
  if (!value || typeof value !== 'object') throw new Error('Mensagem inválida');
  const v = value as Record<string, unknown>;
  if (v.version !== PROTOCOL_VERSION || typeof v.requestId !== 'string' || !v.requestId.trim() || v.requestId.length > 128 || typeof v.sessionId !== 'string' || !v.sessionId.trim() || v.sessionId.length > 128) throw new Error('Versão ou identificadores inválidos');
  if (v.type === 'cancel') return { version: 1, type: 'cancel', requestId: v.requestId, sessionId: v.sessionId };
  if (v.type !== 'run' || typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > 32000) throw new Error('Tarefa inválida (limite: 32.000 caracteres)');
  if (v.engine !== undefined && v.engine !== 'mock' && v.engine !== 'mimo') throw new Error('Motor inválido');
  if (v.projectId !== undefined && (typeof v.projectId !== 'string' || !v.projectId || v.projectId.length > 128)) throw new Error('Projeto inválido');
  return { version: 1, type: 'run', requestId: v.requestId, sessionId: v.sessionId, prompt: v.prompt.trim(), ...(v.engine ? { engine: v.engine } : {}), ...(typeof v.projectId === 'string' ? { projectId: v.projectId } : {}) };
}

export function parseEvent(value: unknown): AgentEvent {
  if (!value || typeof value !== 'object') throw new Error('Evento inválido');
  const v = value as Record<string, unknown>;
  if (v.version !== PROTOCOL_VERSION || typeof v.requestId !== 'string' || !v.requestId.trim() || v.requestId.length > 128 || typeof v.sessionId !== 'string' || !v.sessionId.trim() || v.sessionId.length > 128) throw new Error('Identidade inválida');
  const envelope = { version: PROTOCOL_VERSION, requestId: v.requestId, sessionId: v.sessionId };
  if (v.type === 'started') return { ...envelope, type: 'started' };
  if ((v.type === 'delta' || v.type === 'snapshot') && typeof v.text === 'string' && v.text.length <= 32000) return { ...envelope, type: v.type, text: v.text };
  if (v.type === 'finished' && (v.status === 'completed' || v.status === 'cancelled' || v.status === 'failed')) return { ...envelope, type: 'finished', status: v.status };
  if (v.type === 'error' && typeof v.code === 'string' && v.code.length <= 128 && typeof v.message === 'string' && v.message.length <= 1000) return { ...envelope, type: 'error', code: v.code, message: v.message };
  if (v.type === 'activity' && typeof v.message === 'string' && v.message.length <= 1000) return { ...envelope, type: 'activity', message: v.message };
  if (v.type === 'tool' && typeof v.toolId === 'string' && v.toolId.length <= 128 && typeof v.name === 'string' && v.name.length <= 128 && ['pending', 'running', 'completed', 'error'].includes(String(v.status)) && typeof v.description === 'string' && v.description.length <= 1000) return { ...envelope, type: 'tool', toolId: v.toolId, name: v.name, status: v.status as 'pending' | 'running' | 'completed' | 'error', description: v.description };
  if (typeof v.permissionId === 'string' && v.permissionId.length > 0 && v.permissionId.length <= 128) {
    if (v.type === 'permission_resolved') return { ...envelope, type: 'permission_resolved', permissionId: v.permissionId };
    if (v.type === 'permission' && typeof v.permission === 'string' && v.permission.length <= 128 && Array.isArray(v.patterns) && v.patterns.length <= 32 && v.patterns.every(p => typeof p === 'string' && p.length <= 4000) && v.patterns.join('').length <= 24000 && (v.detail === undefined || (typeof v.detail === 'string' && v.detail.length <= 16000))) return { ...envelope, type: 'permission', permissionId: v.permissionId, permission: v.permission, patterns: v.patterns, ...(typeof v.detail === 'string' ? { detail: v.detail } : {}) };
  }
  throw new Error('Evento inválido');
}
