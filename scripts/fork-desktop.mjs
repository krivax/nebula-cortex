import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageEditor } from './stage-editor.mjs';
import { desktopPlatform } from './desktop-platform.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const upstream = JSON.parse(await readFile(resolve(root, 'integrations/mimo-desktop/upstream.json'), 'utf8'));
const fork = resolve(root, '.desktop-fork');
const desktop = join(fork, 'packages/desktop');
const data = resolve(root, '.desktop-runtime');
const platform = desktopPlatform();
const editor = resolve(root, '.editor-runtime', platform.key);
const bun = join(data, platform.bun);
const node = resolve(editor, platform.node);
const bunDistribution = upstream.bun.platforms?.[platform.key] ?? (platform.key === 'darwin-arm64' ? upstream.bun : undefined);
if (!bunDistribution) throw new Error('Distribuição Bun não cadastrada para esta plataforma.');
const exists = path => access(path).then(() => true, () => false);
const env = { ...process.env, PATH: [join(data, 'tools', platform.key, 'bin'), resolve(editor, platform.nodeDirectory), process.env.PATH].join(delimiter), BUN_INSTALL_CACHE_DIR: join(data, 'cache/bun'), ELECTRON_CACHE: join(data, 'cache/electron'), NEBULA_RUNTIME_ROOT: root };
const run = (command, args, cwd = root, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} encerrou com código ${code}`)));
});
const mode = process.argv[2] || 'build';
if (mode === 'prepare') {
  const patch = await readFile(resolve(root, 'integrations/mimo-desktop', upstream.patch));
  if (createHash('sha256').update(patch).digest('hex') !== upstream.patchSha256) throw new Error('O patch do fork não corresponde ao manifesto.');
  if (!(await exists(resolve(editor, 'bundle/ready.json')))) await run(process.execPath, ['scripts/prepare-editor.mjs']);
  await stageEditor(editor);
  if (!(await exists(resolve(root, '.mimo-runtime', platform.key, 'ready.json')))) await run(process.execPath, ['scripts/prepare-mimo.mjs']);
  if (!(await exists(bun))) {
    await mkdir(join(data, 'tools', platform.key, 'bin'), { recursive: true });
    const response = await fetch(bunDistribution.tarball);
    if (!response.ok) throw new Error('Download do Bun falhou');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 100 * 1024 * 1024 || 'sha512-' + createHash('sha512').update(bytes).digest('base64') !== bunDistribution.integrity) throw new Error('Integridade do Bun inválida');
    const archive = join(data, 'tools', platform.key, 'bun.tgz');
    await writeFile(archive, bytes);
    await run('tar', ['-xzf', archive, '-C', join(data, 'tools', platform.key), '--strip-components=1', platform.bunEntry]);
    await chmod(bun, 0o755);
  }
  if (!(await exists(join(fork, '.git')))) {
    await run('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', upstream.repository + '.git', fork]);
    await run('git', ['fetch', '--depth', '1', 'origin', upstream.revision], fork);
    await run('git', ['switch', '-c', upstream.branch, upstream.revision], fork);
    await run('git', ['apply', resolve(root, 'integrations/mimo-desktop', upstream.patch)], fork);
    await run('git', ['remote', 'rename', 'origin', 'upstream'], fork);
  }
  await run(bun, ['ci', '--ignore-scripts'], fork);
  await run(node, [join(desktop, 'node_modules/electron/install.js')]);
  console.log(`Fork desktop preparado: ${platform.key}, com dependências congeladas.`);
} else {
  if (!(await exists(bun)) || !(await exists(desktop))) throw new Error('Execute npm run desktop:fork:prepare primeiro.');
  await stageEditor(editor);
  if (mode === 'reflex-eval') {
    await run(bun, ['run', 'src/nebula/reflex-evaluate.ts', resolve(root, 'docs/NEBULA-REFLEX-AVALIACAO.md')], desktop);
  } else if (mode === 'test') {
    await run(bun, ['typecheck'], desktop);
    await run(bun, ['test', 'src/nebula/platform.test.ts', 'src/nebula/config.test.ts', 'src/nebula/agents.test.ts', 'src/nebula/reflex.test.ts'], desktop);
    await run(bun, ['test', '--preload', './happydom.ts', './src/components/prompt-input/submit.test.ts'], join(fork, 'packages/app'));
    await run(bun, ['test', './src/nebula/history.test.ts', './src/nebula/mission-changes.test.ts', './src/nebula/tasks.test.ts'], join(fork, 'packages/app'));
  } else if (mode === 'integration') {
    const { build } = await import('esbuild');
    await build({ entryPoints: [resolve(root, 'integrations/mimo-desktop/runtime.test.ts')], bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' }, external: ['electron'], outfile: join(desktop, 'out/main/nebula-test.cjs') });
    await run(join(desktop, 'node_modules/electron/dist', platform.electron), [...(process.platform === 'linux' && process.env.NEBULA_INTEGRATION_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), join(desktop, 'out/main/nebula-test.cjs')], root, { NEBULA_DESKTOP_DATA: join(data, 'integration-profile') });
  } else {
    await run(bun, ['run', 'build'], desktop);
    if (mode === 'app') await run(bun, ['run', 'electron-builder', '--dir', platform.packageFlag, '--config', 'electron-builder.config.ts', '--config.electronDist=' + join(desktop, 'node_modules/electron/dist')], desktop, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
    if (mode === 'app') console.log(`Aplicativo: ${join(desktop, 'dist', platform.application)}`);
    else if (mode === 'dev' || mode === 'run') await run(join(desktop, 'node_modules/electron/dist', platform.electron), [desktop]);
    else if (mode !== 'build') throw new Error('Modo inválido');
  }
}
