import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopPlatform } from './desktop-platform.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const platform = desktopPlatform();
const dist = resolve(root, '.desktop-fork/packages/desktop/dist');
await access(resolve(dist, platform.application));
const folder = platform.key === 'darwin-arm64' ? 'mac-arm64' : platform.key === 'win32-x64' ? 'win-unpacked' : platform.key === 'linux-arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked';
const name = `nebula-${platform.key}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
const child = spawn('tar', [process.platform === 'win32' ? '-acf' : '-czf', resolve(dist, name), '-C', dist, folder], { stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; if (code === 0) console.log(`Pacote: ${resolve(dist, name)}`); });
