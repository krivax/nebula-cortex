import { invoke } from '@tauri-apps/api/core';
export interface NativeFile { path: string; content: string; revision: string }
export interface NativeProject { id: string; name: string; files: NativeFile[]; folders: string[]; skipped: number; truncated: boolean }
export interface NativeBinding { projectId: string; path: string; revision: string }
export function isNativeDesktop() { return '__TAURI_INTERNALS__' in window; }
export const nativeProject = {
  open: () => invoke<NativeProject | null>('open_project'),
  read: (binding: NativeBinding) => invoke<NativeFile>('read_project_file', { projectId: binding.projectId, path: binding.path }),
  save: (binding: NativeBinding, content: string) => invoke<{ revision: string }>('save_project_file', { projectId: binding.projectId, path: binding.path, expectedRevision: binding.revision, content }),
  close: (projectId: string) => invoke<void>('close_project', { projectId }),
};
export function describeNativeError(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error && typeof error.code === 'string' && typeof error.message === 'string') return { code: error.code, message: error.message };
  return { code: 'UNKNOWN', message: 'Não foi possível concluir a operação. Suas edições foram preservadas.' };
}
