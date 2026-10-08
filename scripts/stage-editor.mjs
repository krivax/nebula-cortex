import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));

async function brandEditor(stage) {
  await cp(resolve(root, 'editor/third-party'), resolve(stage, 'notices'), { recursive: true });
  await mkdir(resolve(stage, 'extensions'), { recursive: true });
  await cp(resolve(root, 'editor/extensions/nebula-companion'), resolve(stage, 'extensions/nebula-companion'), { recursive: true });
  const metadata = JSON.parse(await readFile(resolve(stage, 'ready.json'), 'utf8'));
  const path = resolve(stage, metadata.backend === 'code-oss' ? 'server/product.json' : 'server/node_modules/code-server/lib/vscode/product.json');
  const product = JSON.parse(await readFile(path, 'utf8'));
  product.nameShort = 'Editor Nebula';
  product.nameLong = 'Editor Nebula';
  if (product.onboardingKeymaps) product.onboardingKeymaps = product.onboardingKeymaps.map(keymap => keymap.id === 'vscode' ? { ...keymap, label: 'Editor Nebula' } : keymap);
  await writeFile(path, JSON.stringify(product, null, 2) + '\n');
}

export async function stageEditor(runtime) {
  const stage = resolve(runtime, 'bundle');
  const ready = await readFile(resolve(runtime, 'ready.json'), 'utf8');
  const windows = JSON.parse(ready).backend === 'code-oss';
  let previous;
  try { previous = await readFile(resolve(stage, 'ready.json'), 'utf8'); } catch { /* First staging. */ }
  let format;
  try { format = await readFile(resolve(stage, 'stage-version'), 'utf8'); } catch { /* First staging. */ }
  if (previous === ready && format === '2') {
    await brandEditor(stage);
    return stage;
  }
  await rm(stage, { recursive: true, force: true });
  await mkdir(resolve(stage, windows ? 'node' : 'node/bin'), { recursive: true });
  await mkdir(resolve(stage, 'server'), { recursive: true });
  await cp(resolve(runtime, windows ? 'node/node.exe' : 'node/bin/node'), resolve(stage, windows ? 'node/node.exe' : 'node/bin/node'));
  await cp(resolve(runtime, 'node/LICENSE'), resolve(stage, 'node/LICENSE'));
  await cp(resolve(root, 'editor/third-party'), resolve(stage, 'notices'), { recursive: true });
  await cp(resolve(runtime, windows ? 'server' : 'server/node_modules'), resolve(stage, windows ? 'server' : 'server/node_modules'), {
    recursive: true,
    // Upstream ships development .bin links, some of which point at absent TypeScript
    // sources. The runtime always invokes fixed entry points directly, never these links.
    filter: source => !source.split(sep).includes('.bin'),
  });
  await writeFile(resolve(stage, 'ready.json'), ready);
  await brandEditor(stage);
  await writeFile(resolve(stage, 'stage-version'), '2');
  process.stdout.write('Runtime do editor separado dos caches e preparado para o .app.\n');
  return stage;
}
