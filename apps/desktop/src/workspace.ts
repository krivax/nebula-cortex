/** Paths here identify in-memory files. They never authorize filesystem access. */
export function normalizeWorkspacePath(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/');
  if (!path || path.startsWith('/') || parts.some(p => !p || p === '.' || p === '..' || /[\x00-\x1f]/.test(p))) throw new Error('Caminho de arquivo inválido.');
  return parts.join('/');
}
export type TreeNode = { kind: 'file'; path: string; name: string } | { kind: 'folder'; path: string; name: string; children: TreeNode[] };
export function buildFileTree(paths: string[], emptyFolders: string[] = []): TreeNode[] {
  const roots: TreeNode[] = [];
  const entries = new Map<string, TreeNode>();
  const add = (raw: string, kind: 'file' | 'folder') => {
    const path = normalizeWorkspacePath(raw); const parts = path.split('/');
    let siblings = roots;
    parts.forEach((name, index) => {
      const partial = parts.slice(0, index + 1).join('/');
      const expected = index < parts.length - 1 ? 'folder' : kind;
      let entry = entries.get(partial);
      if (entry && entry.kind !== expected) throw new Error(`Arquivo e pasta têm o mesmo caminho: ${partial}`);
      if (!entry) { entry = expected === 'folder' ? { kind: 'folder', path: partial, name, children: [] } : { kind: 'file', path: partial, name }; entries.set(partial, entry); siblings.push(entry); }
      if (entry.kind === 'folder') siblings = entry.children;
    });
  };
  emptyFolders.forEach(path => add(path, 'folder')); paths.forEach(path => add(path, 'file'));
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    nodes.forEach(n => { if (n.kind === 'folder') sort(n.children); });
  };
  sort(roots); return roots;
}
export function visibleTreeNodes(nodes: TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  return nodes.flatMap(node => [node, ...(node.kind === 'folder' && expanded.has(node.path) ? visibleTreeNodes(node.children, expanded) : [])]);
}
export function parentPaths(path: string): string[] {
  const parts = path.split('/'); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
export interface EditorTab { path: string; preview: boolean }
export function openTab(tabs: EditorTab[], path: string, pinned: boolean): EditorTab[] {
  if (tabs.some(t => t.path === path)) return tabs.map(t => t.path === path && pinned ? { ...t, preview: false } : t);
  const next = pinned ? tabs : tabs.filter(t => !t.preview);
  return [...next, { path, preview: !pinned }];
}
export function pinTab(tabs: EditorTab[], path: string): EditorTab[] {
  return tabs.map(t => t.path === path ? { ...t, preview: false } : t);
}
export function shouldImportPath(path: string): boolean {
  return !path.split('/').some(part => ['node_modules', '.git', 'dist', 'target', '.next'].includes(part)) && !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp[34]|mov|sqlite|dmg|exe)$/i.test(path);
}
