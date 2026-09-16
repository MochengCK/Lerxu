export const engineBinMap = {
  darwin: 'xferrust',
  win32: 'xferrust.exe',
  linux: 'xferrust'
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
