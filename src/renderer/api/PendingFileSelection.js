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

  confirm (gid) {
    if (!gid) return
    const current = this.getConfirmedAll()
    if (current[`${gid}`]) return
    pendingFileSelectionStore.set('confirmedGids', { ...current, [`${gid}`]: true })
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
      obj[`${k}`] = true
    })
    pendingFileSelectionStore.set('confirmedGids', obj)
  }

  clear () {
    pendingFileSelectionStore.set('gids', {})
    pendingFileSelectionStore.set('confirmedGids', {})
  }
}

export default new PendingFileSelection()
