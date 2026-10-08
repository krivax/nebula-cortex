import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageEditor } from './stage-editor.mjs';
import { build } from 'esbuild';
let local = {};
try { local = JSON.parse(readFileSync(new URL('../.nebula-local.json', import.meta.url), 'utf8')); } catch { /* Use the user's configured Rust installation. */ }
const commands = { test: ['test', '-p', 'nebula-project', '-p', 'nebula-cortex', '--lib'], check: ['check', '-p', 'nebula-cortex'], build: ['build', '-p', 'nebula-cortex'], run: ['run', '-p', 'nebula-cortex'] };
const mode = process.argv[2];
if (!commands[mode] && mode !== 'app' && mode !== 'dev') { process.stderr.write('Use native:test, native:check, native:build, native:run, native:app ou desktop:dev.\n'); process.exit(1); }
const cargoHome = process.env.CARGO_HOME || local.cargoHome;
const rustupHome = process.env.RUSTUP_HOME || local.rustupHome;
const env = { ...process.env, ...(cargoHome ? { CARGO_HOME: cargoHome, PATH: resolve(cargoHome, 'bin') + delimiter + (process.env.PATH || '') } : {}), ...(rustupHome ? { RUSTUP_HOME: rustupHome } : {}) };
const sidecar = fileURLToPath(new URL('../dist/sidecar.cjs', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../packages/agent-core/src/sidecar.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', outfile: sidecar });
const mimoBridge = fileURLToPath(new URL('../dist/mimo-sidecar.cjs', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../packages/agent-core/src/mimo-sidecar.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', outfile: mimoBridge });
const appBundle = { active: true, resources: { [sidecar]: 'agent/sidecar.cjs', [mimoBridge]: 'agent/mimo-sidecar.cjs' } };
const editorRuntime = fileURLToPath(new URL('../.editor-runtime/darwin-arm64/', import.meta.url));
let ready;
try {
  ready = JSON.parse(readFileSync(resolve(editorRuntime, 'ready.json'), 'utf8'));
} catch { /* The native shell can still be built before preparing the optional editor runtime. */ }
if (ready?.version === '4.139.1' && mode === 'app') {
  const stage = await stageEditor(editorRuntime);
  appBundle.resources[stage] = 'editor-runtime/darwin-arm64';
}
if (mode === 'app') {
  const mimoRuntime = fileURLToPath(new URL('../.mimo-runtime/darwin-arm64/', import.meta.url));
  let mimoReady;
  try { mimoReady = JSON.parse(readFileSync(resolve(mimoRuntime, 'ready.json'), 'utf8')); } catch {}
  if (mimoReady?.version !== '0.1.15') throw new Error('Prepare o motor oficial com npm run mimo:prepare antes de gerar o aplicativo.');
  appBundle.resources[mimoRuntime] = 'mimo-runtime/darwin-arm64';
}
const child = mode === 'app' || mode === 'dev'
  ? spawn(process.execPath, [fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)), ...(mode === 'dev' ? ['dev'] : ['build', '--debug', '--bundles', 'app', '--config', JSON.stringify({ bundle: appBundle })])], { cwd: new URL('../apps/desktop/', import.meta.url), stdio: 'inherit', env })
  : spawn(cargoHome ? resolve(cargoHome, 'bin/cargo') : 'cargo', commands[mode], { cwd: new URL('..', import.meta.url), stdio: 'inherit', env });
child.on('error', () => { process.stderr.write('Rust/Cargo não encontrados. Configure o compilador conforme o README.\n'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
