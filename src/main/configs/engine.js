export const engineBinMap = {
  darwin: 'fluxcore',
  win32: 'fluxcore.exe',
  linux: 'fluxcore'
}

export const engineArchMap = {
  darwin: {
    x64: 'x64',
    arm64: 'arm64'
  },
  win32: {
    ia32: 'ia32',
    x64: 'x64',
    arm64: 'x64'
  },
  linux: {
    x64: 'x64',
    arm: 'armv7l',
    arm64: 'arm64'
  }
}
