import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'integrations/mimo-desktop/upstream.json'), 'utf8'));
const patch = await readFile(resolve(root, 'integrations/mimo-desktop', manifest.patch));
if (createHash('sha256').update(patch).digest('hex') !== manifest.patchSha256) throw new Error('O patch desktop não corresponde ao manifesto.');
for (const file of ['integrations/mimo/LICENSE', 'integrations/mimo/USE_RESTRICTIONS.md', 'integrations/agent-skills/grill-me/LICENSE', 'editor/third-party/CodeOSS-LICENSE.txt', 'editor/third-party/code-server-LICENSE.txt', 'editor/runtime-package-lock.json']) {
  await readFile(resolve(root, file));
}

// Check tracked files too: ignore rules do not remove files already added to Git.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString().split('\0').filter(Boolean))];
const findings = [];
const localDirectories = new Set(['.desktop-fork', '.desktop-runtime', '.editor-runtime', '.mimo-runtime', 'node_modules', 'target', 'dist']);
const credentials = [/\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{30,}/, /\bgh[pousr]_[A-Za-z0-9_]{30,}/, /\bhf_[A-Za-z0-9]{30,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for (const file of files) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (parts.some(part => localDirectories.has(part)) || name === '.nebula-local.json' || (name === '.env' || name.startsWith('.env.')) && name !== '.env.example') {
    findings.push(`${file}: dados ou artefatos locais incluídos no Git`);
    continue;
  }
  const metadata = await stat(resolve(root, file)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!metadata?.isFile()) continue;
  if (metadata.size >= 100 * 1024 * 1024) findings.push(`${file}: arquivo com 100 MiB ou mais`);
  if (metadata.size > 5 * 1024 * 1024) continue;
  const bytes = await readFile(resolve(root, file));
  if (bytes.includes(0)) continue;
  if (credentials.some(pattern => pattern.test(bytes.toString('utf8')))) findings.push(`${file}: possível credencial; revise o arquivo`);
}
if (findings.length) {
  // Report filenames, never suspected credential values.
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Publicação: ${files.length} arquivos verificados; patch íntegro, avisos presentes e nenhum padrão de credencial detectado. A varredura não substitui revisão de imagens e conteúdo privado.`);
}
