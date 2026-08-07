import Store from 'electron-store'

// 待选择文件状态的持久化存储
// 用于在应用重启后恢复 BT 任务"待选择文件"状态
const pendingFileSelectionStore = new Store({
  name: 'pendingFileSelection',
  cwd: process.env.NODE_ENV === 'development' ? './dev-config' : undefined,
  defaults: {
    gids: {},
    confirmedGids: {}
  }
})

class PendingFileSelection {
  getAll () {
    const raw = pendingFileSelectionStore.get('gids', {})
    return raw && typeof raw === 'object' ? raw : {}
  }

  add (gid) {
    if (!gid) return
    const current = this.getAll()
    if (current[gid]) return
    pendingFileSelectionStore.set('gids', { ...current, [`${gid}`]: true })
  }

  remove (gid) {
    if (!gid) return
    const current = this.getAll()
    if (!current[`${gid}`]) return
    const next = { ...current }
    delete next[`${gid}`]
    pendingFileSelectionStore.set('gids', next)
  }

  setAll (mapping) {
    const obj = {}
    Object.keys(mapping || {}).forEach(k => {
      obj[`${k}`] = true
    })
    pendingFileSelectionStore.set('gids', obj)
  }

  getConfirmedAll () {
    const raw = pendingFileSelectionStore.get('confirmedGids', {})
    return raw && typeof raw === 'object' ? raw : {}
  }

  // 记录"已确认文件选择"的任务。value 存 infoHash（若提供），
  // 用于应用重启后磁力任务 follow 生成新 gid 时按哈希匹配；
  // 旧数据 value 为 true，兼容保留。
  confirm (gid, infoHash) {
    if (!gid) return
    const current = this.getConfirmedAll()
    if (current[`${gid}`]) return
    pendingFileSelectionStore.set('confirmedGids', {
      ...current,
      [`${gid}`]: infoHash || true
    })
  }

  removeConfirmed (gid) {
    if (!gid) return
    const current = this.getConfirmedAll()
    if (!current[`${gid}`]) return
    const next = { ...current }
    delete next[`${gid}`]
    pendingFileSelectionStore.set('confirmedGids', next)
  }

  setConfirmedAll (mapping) {
    const obj = {}
    Object.keys(mapping || {}).forEach(k => {
      // 保留 infoHash 值（可能是 true 或 hash 字符串）
      obj[`${k}`] = mapping[k] || true
    })
    pendingFileSelectionStore.set('confirmedGids', obj)
  }

  clear () {
    pendingFileSelectionStore.set('gids', {})
    pendingFileSelectionStore.set('confirmedGids', {})
  }
}

export default new PendingFileSelection()
