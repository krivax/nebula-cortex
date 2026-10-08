import { readFile, mkdir, writeFile, access, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, delimiter } from 'node:path';
import { patchEditor } from './patch-editor.mjs';
import { desktopPlatform } from './desktop-platform.mjs';
import { prepareCodeOSS } from './prepare-code-oss.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const upstream = JSON.parse(await readFile(resolve(root, 'editor/upstream.json'), 'utf8'));
const targetPlatform = desktopPlatform();
const platform = targetPlatform.key;
if (!upstream.node[platform]) throw new Error('Checksum do Node indisponível para esta plataforma.');
const runtime = resolve(root, '.editor-runtime', platform);
const nodeDir = resolve(runtime, 'node');
const serverDir = resolve(runtime, 'server');
const windows = process.platform === 'win32';
const node = resolve(runtime, targetPlatform.node);
const npm = resolve(nodeDir, windows ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js');
async function run(binary, args, options = {}) {
  await new Promise((accept, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? accept() : reject(new Error(`Preparação do editor falhou (${code}).`)));
  });
}
await mkdir(runtime, { recursive: true });
try { await access(node); } catch {
  const archive = windows ? `node-v${upstream.node.version}-win-${process.arch}.zip` : `node-v${upstream.node.version}-${platform}.tar.gz`;
  process.stdout.write(`Baixando runtime Node ${upstream.node.version} oficial…\n`);
  const response = await fetch(`https://nodejs.org/dist/v${upstream.node.version}/${archive}`);
  if (!response.ok) throw new Error('Download do runtime indisponível.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== upstream.node[platform]) throw new Error('Checksum do runtime não confere.');
  const target = resolve(runtime, archive);
  await writeFile(target, bytes);
  await mkdir(nodeDir, { recursive: true });
  await run('tar', [windows ? '-xf' : '-xzf', target, '-C', nodeDir, '--strip-components=1']);
  await rm(target);
}
await mkdir(serverDir, { recursive: true });
if (windows) {
  const readyPath = resolve(runtime, 'ready.json');
  const previous = JSON.parse(await readFile(readyPath, 'utf8').catch(() => '{}'));
  if (previous.backend !== 'code-oss' || previous.revision !== upstream.windows.revision || !(await access(resolve(serverDir, 'out/server-main.js')).then(() => true, () => false))) {
    await prepareCodeOSS(runtime, upstream.windows, node, npm);
  }
  await writeFile(readyPath, JSON.stringify({ backend: 'code-oss', version: upstream.windows.version, revision: upstream.windows.revision, node: upstream.node.version, platform }));
  process.stdout.write(`Editor Nebula Code-OSS nativo preparado: ${platform}.\n`);
} else {
const packagePath = resolve(serverDir, 'node_modules/code-server/package.json');
let installed;
try {
  installed = JSON.parse(await readFile(packagePath, 'utf8')).version;
  await access(resolve(runtime, 'ready.json'));
} catch { installed = undefined; }
if (installed !== upstream.version) {
  await writeFile(resolve(serverDir, 'package.json'), JSON.stringify({ name: 'nebula-editor-runtime', private: true, version: '0.1.0' }, null, 2));
  await run(node, [npm, 'install', '--prefix', serverDir, '--save-exact', `code-server@${upstream.version}`, '--no-fund', '--cache', resolve(runtime, 'npm-cache')], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_'))), PATH: resolve(nodeDir, 'bin') + delimiter + (process.env.PATH || '') },
  });
}
await patchEditor(serverDir, runtime);
// Record the resolved dependency tree without checking generated artifacts into source.
// Preserve each platform's resolved native dependencies separately.
await copyFile(resolve(serverDir, 'package-lock.json'), resolve(runtime, 'runtime-package-lock.json'));
const inputsHash = createHash('sha256').update(JSON.stringify(upstream)).update(await readFile(resolve(root, 'editor/dependency-patches.json'))).digest('hex');
await writeFile(resolve(runtime, 'ready.json'), JSON.stringify({ version: upstream.version, node: upstream.node.version, platform, inputsHash }));
process.stdout.write(`Editor Code-OSS preparado: ${upstream.version} (${platform}).\n`);
}
