export function desktopPlatform(platform = process.platform, arch = process.arch) {
  if (!((platform === 'darwin' && arch === 'arm64') || (platform === 'linux' && ['x64', 'arm64'].includes(arch)) || (platform === 'win32' && arch === 'x64'))) throw new Error(`Plataforma não suportada: ${platform}-${arch}. Use macOS ARM64, Linux x64/ARM64 com glibc ou Windows x64.`);
  const windows = platform === 'win32';
  return {
    key: `${platform}-${arch}`,
    node: windows ? 'node/node.exe' : 'node/bin/node',
    nodeDirectory: windows ? 'node' : 'node/bin',
    bun: `tools/${platform}-${arch}/bin/bun${windows ? '.exe' : ''}`,
    bunEntry: windows ? 'package/bin/bun.exe' : 'package/bin/bun',
    electron: platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : windows ? 'electron.exe' : 'electron',
    packageFlag: platform === 'darwin' ? '--mac' : windows ? '--win' : '--linux',
    application: platform === 'darwin' ? 'mac-arm64/Nebula Cortex.app' : windows ? 'win-unpacked/Nebula Cortex.exe' : `${arch === 'arm64' ? 'linux-arm64' : 'linux'}-unpacked/nebula-cortex`,
  };
}
