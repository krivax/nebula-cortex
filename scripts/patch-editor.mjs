import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function patchEditor(serverDir, runtime) {
  const patches = JSON.parse(await readFile(new URL('../editor/dependency-patches.json', import.meta.url), 'utf8'));
  const lockPath = resolve(serverDir, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  for (const patch of patches) {
    const target = resolve(serverDir, patch.path);
    const metadata = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'));
    if (metadata.name !== patch.name) throw new Error('A estrutura do runtime mudou. Revise os patches antes de continuar.');
    const tarball = `https://registry.npmjs.org/${patch.name}/-/${patch.name}-${patch.version}.tgz`;
    if (metadata.version !== patch.version) {
      const response = await fetch(tarball);
      if (!response.ok) throw new Error(`Patch indisponível: ${patch.name}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== patch.integrity) throw new Error('Checksum do patch não confere.');
      const archive = resolve(runtime, `${patch.name}-${patch.version}.tgz`);
      await writeFile(archive, bytes);
      await rm(target, { recursive: true });
      await mkdir(target, { recursive: true });
      await new Promise((accept, reject) => {
        const child = spawn('tar', ['-xzf', archive, '-C', target, '--strip-components=1'], { stdio: 'inherit' });
        child.on('error', reject); child.on('exit', code => code === 0 ? accept() : reject(new Error('Falha ao aplicar patch.')));
      });
      await rm(archive);
      process.stdout.write(`Dependência corrigida: ${patch.name} ${patch.version}.\n`);
    }
    // The upstream npm tarball vendors its dependencies, including non-optional cross-platform
    // bindings. npm audit fix hits EBADPLATFORM. Track these exact, checksum-verified replacements.
    const installed = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'));
    lock.packages[patch.path] = { ...lock.packages[patch.path], version: patch.version, resolved: tarball, integrity: patch.integrity, dependencies: installed.dependencies };
  }
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
