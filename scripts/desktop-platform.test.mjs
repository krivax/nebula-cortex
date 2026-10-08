import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopPlatform } from './desktop-platform.mjs';

test('separa runtimes e artefatos por sistema e arquitetura', () => {
  assert.equal(desktopPlatform('darwin', 'arm64').electron, 'Electron.app/Contents/MacOS/Electron');
  assert.equal(desktopPlatform('linux', 'x64').application, 'linux-unpacked/nebula-cortex');
  assert.equal(desktopPlatform('linux', 'arm64').application, 'linux-arm64-unpacked/nebula-cortex');
  const windows = desktopPlatform('win32', 'x64');
  assert.equal(windows.application, 'win-unpacked/Nebula Cortex.exe');
  assert.equal(windows.bunEntry, 'package/bin/bun.exe');
  assert.equal(windows.nodeDirectory, 'node');
});
test('recusa combinações sem distribuições fixadas', () => {
  assert.throws(() => desktopPlatform('win32', 'arm64'));
  assert.throws(() => desktopPlatform('linux', 'ia32'));
});
