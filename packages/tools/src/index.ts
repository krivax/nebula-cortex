export type ToolEffect = 'read' | 'write' | 'execute';
export interface ToolDescriptor { id: string; description: string; effect: ToolEffect }
export interface PermissionRequest { tool: ToolDescriptor; projectId: string; canonicalPath: string }
export type PermissionDecision = { allowed: false; reason: string } | { allowed: true; grantId: string };
// No executor is enabled until native canonicalization and authorization exist.
export class PermissionBroker {
  authorize(_request: PermissionRequest): PermissionDecision {
    return { allowed: false, reason: 'Ferramentas locais ainda não habilitadas neste protótipo.' };
  }
}
