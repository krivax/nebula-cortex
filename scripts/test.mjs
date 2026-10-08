import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
for (const folder of ['packages/testing/src', 'scripts']) {
  for (const name of await readdir(join(root, folder))) {
    if (/\.test\.(ts|mjs)$/.test(name)) files.push(join(root, folder, name));
  }
}
// Enumerate tests directly: Windows cmd does not expand shell globs.
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files.sort()], { cwd: root, stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
