// Optional UI verification: npm exec -- tsx packages/testing/src/mimo-ui-fixture.ts
// Only local HTTP, a known dummy key, and the ignored disposable project below.
import { mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { modelFixture } from './mimo.fixture';
const target = resolve('.mimo-runtime/gui-project');
await mkdir(target, { recursive: true });
const root = await realpath(target);
await writeFile(join(root, 'README.md'), '# Teste da integração MiMo + Code-OSS\nPasta descartável de verificação.\n');
const fixture = await modelFixture(root);
console.log(JSON.stringify({ baseUrl: fixture.url, model: 'test-model', project: root, dummyKey: 'nebula-local-test-key' }));
process.on('SIGTERM', () => { void fixture.close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void fixture.close().then(() => process.exit(0)); });
