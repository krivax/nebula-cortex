import { spawn } from 'node:child_process';
import { access, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, resolve } from 'node:path';

export async function prepareCodeOSS(runtime, upstream, node, npm) {
  const source = resolve(runtime, 'source');
  const server = resolve(runtime, 'server');
  const run = (command, args) => new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: source, stdio: 'inherit', env: { ...process.env, PATH: dirname(node) + delimiter + (process.env.PATH || ''), NODE_OPTIONS: '--max-old-space-size=8192' } });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`Build Code-OSS falhou: ${command} (${code})`)));
  });
  if (!(await access(resolve(source, '.git')).then(() => true, () => false))) {
    await new Promise((accept, reject) => {
      const child = spawn('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', upstream.repository + '.git', source], { stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? accept() : reject(new Error('Não foi possível recuperar o Code-OSS')));
    });
  }
  await run('git', ['fetch', '--depth', '1', 'origin', upstream.revision]);
  await run('git', ['checkout', '--detach', upstream.revision]);
  const productPath = resolve(source, 'product.json');
  const product = JSON.parse(await readFile(productPath, 'utf8'));
  product.nameShort = 'Editor Nebula'; product.nameLong = 'Editor Nebula';
  product.applicationName = 'nebula-editor'; product.serverApplicationName = 'nebula-editor-server';
  product.dataFolderName = '.nebula-editor'; product.serverDataFolderName = '.nebula-editor-server';
  product.extensionsGallery = { serviceUrl: 'https://open-vsx.org/vscode/gallery', itemUrl: 'https://open-vsx.org/vscode/item' };
  await writeFile(productPath, JSON.stringify(product, null, 2) + '\n');
  await run(node, [npm, 'ci', '--no-fund', '--no-audit']);
  await run(node, [npm, 'run', 'gulp', '--', upstream.target]);
  const built = resolve(runtime, upstream.target);
  await access(resolve(built, 'out/server-main.js'));
  await rm(server, { recursive: true, force: true });
  await cp(built, server, { recursive: true });
  await cp(resolve(source, 'LICENSE.txt'), resolve(server, 'LICENSE.txt'));
  await cp(resolve(source, 'ThirdPartyNotices.txt'), resolve(server, 'ThirdPartyNotices.txt'));
}
