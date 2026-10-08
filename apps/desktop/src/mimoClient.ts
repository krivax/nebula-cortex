import { invoke } from '@tauri-apps/api/core';
export interface MimoSettings { baseUrl: string; model: string; hasKey: boolean }
export interface MimoInfo { settings: MimoSettings; runtimeReady: boolean; project: string | null; projectId: string | null; version: string }
export const mimoNative = {
  status: () => invoke<MimoInfo>('mimo_status'),
  configure: (settings: MimoSettings, apiKey: string) => invoke<void>('configure_mimo', { settings, apiKey }),
  reset: () => invoke<void>('reset_mimo'),
  reply: (requestId: string, sessionId: string, permissionId: string, allow: boolean) => invoke<void>('reply_mimo_permission', { requestId, sessionId, permissionId, allow }),
};
