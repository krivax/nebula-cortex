import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileTree, normalizeWorkspacePath, visibleTreeNodes, parentPaths, openTab, pinTab, shouldImportPath } from '../../../apps/desktop/src/workspace';

test('explorador cria hierarquia, ordena pastas primeiro e distingue arquivos homônimos', () => {
  const tree = buildFileTree(['project/README.md', 'project/src/utils/index.ts', 'project/src/components/index.ts', 'project/src/App.tsx'], ['project/empty']);
  assert.equal(tree.length, 1);
  const root = tree[0]; assert.equal(root.kind, 'folder');
  if (root.kind !== 'folder') return;
  assert.deepEqual(root.children.map(n => n.name), ['empty', 'src', 'README.md']);
  const src = root.children.find(n => n.name === 'src'); assert.ok(src?.kind === 'folder');
  if (src?.kind !== 'folder') return;
  assert.deepEqual(src.children.map(n => n.name), ['components', 'utils', 'App.tsx']);
  const all = visibleTreeNodes(tree, new Set(['project', 'project/src', 'project/src/components', 'project/src/utils']));
  assert.equal(all.filter(n => n.name === 'index.ts').length, 2);
  assert.equal(new Set(all.map(n => n.path)).size, all.length);
});
test('pastas recolhidas ocultam descendentes e preservam suas identidades ao expandir', () => {
  const tree = buildFileTree(['p/a/a.ts', 'p/b/b.ts']);
  assert.deepEqual(visibleTreeNodes(tree, new Set()).map(n => n.path), ['p']);
  assert.deepEqual(visibleTreeNodes(tree, new Set(['p', 'p/a'])).map(n => n.path), ['p', 'p/a', 'p/a/a.ts', 'p/b']);
  assert.deepEqual(parentPaths('p/a/a.ts'), ['p', 'p/a']);
});
test('caminhos inválidos e conflitos arquivo/pasta são rejeitados', () => {
  for (const path of ['', '/private.txt', 'p/../a.ts', 'p/./a.ts', 'p//a.ts', 'p/\0a.ts']) assert.throws(() => normalizeWorkspacePath(path));
  assert.equal(normalizeWorkspacePath('p\\src\\a.ts'), 'p/src/a.ts');
  assert.throws(() => buildFileTree(['p/src', 'p/src/index.ts']));
  assert.throws(() => buildFileTree(['p/src'], ['p/src']));
  assert.equal(buildFileTree(['p/a.ts', 'p/a.ts']).length, 1);
});
test('pré-visualização substitui só a aba temporária; edição fixa a aba', () => {
  let tabs = openTab([], 'p/a.ts', false);
  tabs = openTab(tabs, 'p/b.ts', false);
  assert.deepEqual(tabs, [{ path: 'p/b.ts', preview: true }]);
  tabs = pinTab(tabs, 'p/b.ts');
  tabs = openTab(tabs, 'p/c.ts', false);
  tabs = openTab(tabs, 'p/d.ts', true);
  assert.deepEqual(tabs, [{ path: 'p/b.ts', preview: false }, { path: 'p/c.ts', preview: true }, { path: 'p/d.ts', preview: false }]);
  tabs = openTab(tabs, 'p/c.ts', true);
  assert.equal(tabs.find(t => t.path === 'p/c.ts')?.preview, false);
  assert.equal(openTab(tabs, 'p/c.ts', true).length, 3);
});
test('importação ignora dependências, metadados git, builds e binários comuns', () => {
  for (const path of ['p/node_modules/a.js', 'p/.git/HEAD', 'p/dist/index.js', 'p/photo.png', 'p/font.woff2']) assert.equal(shouldImportPath(path), false);
  assert.equal(shouldImportPath('p/src/index.ts'), true);
  assert.equal(shouldImportPath('p/.gitignore'), true);
});
