import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('sidecar rejeita mensagem inválida e cancela tarefa via JSONL', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'packages/agent-core/src/sidecar.ts'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const events: Record<string, unknown>[] = [];
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => { if (code !== 0) reject(new Error(`Sidecar saiu: ${code}: ${stderr}`)); });
      lines.on('line', line => {
        const event = JSON.parse(line); events.push(event);
        if (event.type === 'delta') child.stdin.write(JSON.stringify({ version: 1, type: 'cancel', requestId: 'r', sessionId: 's' }) + '\n');
        if (event.type === 'finished') resolve();
      });
      child.stdin.write('invalid\n');
      child.stdin.write(JSON.stringify({ version: 1, type: 'run', requestId: 'r', sessionId: 's', prompt: 'teste' }) + '\n');
    });
    assert.equal(events[0].type, 'protocol_error');
    assert.equal(events.at(-1)?.status, 'cancelled');
    assert.ok(events.some(e => e.type === 'delta'));
  } finally {
    child.stdin.end();
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    if (child.exitCode === null) await exited;
    lines.close();
  }
});

test('sidecar limita linhas e aceita tarefa máxima com escapes JSON', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'packages/agent-core/src/sidecar.ts'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout }); const events: Record<string, unknown>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Sidecar terminou antes da resposta')));
      lines.on('line', line => {
        const event = JSON.parse(line); events.push(event);
        if (event.type === 'delta') child.stdin.write(JSON.stringify({ version: 1, type: 'cancel', requestId: 'max', sessionId: 's' }) + '\n');
        if (event.type === 'finished') resolve();
      });
      child.stdin.write('x'.repeat(300000) + '\n');
      child.stdin.write(JSON.stringify({ version: 1, type: 'run', requestId: 'max', sessionId: 's', prompt: '"'.repeat(32000) }) + '\n');
    });
    assert.equal(events.filter(e => e.type === 'protocol_error').length, 1);
    assert.ok(events.some(e => e.type === 'started' && e.requestId === 'max'));
    assert.equal(events.at(-1)?.status, 'cancelled');
  } finally {
    child.stdin.end();
    if (child.exitCode === null) await new Promise<void>(resolve => child.once('exit', () => resolve()));
    lines.close();
  }
});
