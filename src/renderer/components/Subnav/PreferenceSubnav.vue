<template>
  <nav class="subnav-inner">
    <h3 v-if="!isStandalone">{{ title }}</h3>
    <ul class="preference-subnav-ul">
      <div class="nav-slider" :style="sliderStyle"></div>
      <li
        v-for="item in subnavItems"
        :key="item.key"
        @click="() => nav(item.key)"
        :class="['subnav-item', `subnav-item--${item.key}`, current === item.key ? 'active' : '' ]"
      >
        <i v-if="item.icon" class="subnav-icon">
          <mo-icon :name="item.icon" width="18" height="18" />
        </i>
        <i v-else class="subnav-icon subnav-icon--empty"></i>
        <span>{{ item.title }}</span>
      </li>
    </ul>
  </nav>
</template>

<script>
  import { mapState, mapActions } from 'vuex'
  import '@/components/Icons/preference-basic'
  import '@/components/Icons/preference-advanced'
  import '@/components/Icons/preference-appearance'
  import '@/components/Icons/preference-transfer'
  import '@/components/Icons/preference-task'
  import '@/components/Icons/preference-file'
  import '@/components/Icons/preference-security'

  export default {
    name: 'mo-preference-subnav',
    props: {
      current: {
        type: String,
        default: 'basic'
      }
    },
    data () {
      return {
        appVersion: '',
        sliderTop: 0,
        sliderHeight: 36
      }
    },
    computed: {
      ...mapState('app', ['isCheckingUpdate']),
      ...mapState('preference', ['updateAvailable', 'newVersion', 'isDownloadingUpdate', 'downloadProgress', 'releaseNotes']),
      preferenceBasePath () {
        const path = `${this.$route.path || ''}`
        return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
      },
      isStandalone () {
        return this.preferenceBasePath === '/preference-window'
      },
      title () {
        return this.$t('subnav.preferences')
      },
      subnavItems () {
        return [
          { key: 'basic', title: this.$t('preferences.basic'), icon: 'preference-basic' },
          { key: 'appearance', title: this.$t('preferences.appearance'), icon: 'preference-appearance' },
          { key: 'transfer', title: this.$t('preferences.transfer-settings'), icon: 'preference-transfer' },
          { key: 'task', title: this.$t('preferences.task-manage'), icon: 'preference-task' },
          { key: 'file', title: this.$t('preferences.file-manage'), icon: 'preference-file' },
          { key: 'security', title: this.$t('preferences.security'), icon: 'preference-security' },
          { key: 'advanced', title: this.$t('preferences.advanced'), icon: 'preference-advanced' }
        ]
      },
      isChecking () {
        return this.isCheckingUpdate
      },
      currentIndex () {
        return this.subnavItems.findIndex(item => item.key === this.current)
      },
      sliderStyle () {
        const index = this.currentIndex
        if (index === -1) return { display: 'none' }
        const top = Number.isFinite(this.sliderTop) ? this.sliderTop : 0
        const height = Number.isFinite(this.sliderHeight) ? this.sliderHeight : 36
        return {
          transform: `translateY(${top}px)`,
          height: `${height}px`
        }
      }
    },
    async mounted () {
      // 获取应用版本信息
      try {
        const appConfig = await this.$electron.ipcRenderer.invoke('get-app-config')
        this.appVersion = appConfig.version
      } catch (error) {
        console.error('[Motrix] Failed to get app version:', error)
      }

      this.updateSliderFromDom()

      // 监听更新事件
      this.$electron.ipcRenderer.on('checking-for-update', () => {
        this.updateCheckingUpdate(true)
      })

      this.$electron.ipcRenderer.on('update-available', (event, version, releaseNotes) => {
        const cfg = (this.$store.state.preference && this.$store.state.preference.config) || {}
        const autoCheckEnabled = !!cfg.autoCheckUpdate
        if (autoCheckEnabled) {
          this.updateUpdateAvailable(true)
          this.updateNewVersion(version)
          this.updateLastCheckUpdateTime(Date.now())
          this.updateReleaseNotes(releaseNotes || '')
        }
        this.updateCheckingUpdate(false)
      })

      this.$electron.ipcRenderer.on('update-not-available', () => {
        const cfg = (this.$store.state.preference && this.$store.state.preference.config) || {}
        const autoCheckEnabled = !!cfg.autoCheckUpdate
        if (autoCheckEnabled) {
          this.updateUpdateAvailable(false)
          this.updateNewVersion('')
          this.updateLastCheckUpdateTime(Date.now())
        }
        this.updateCheckingUpdate(false)
      })

      this.$electron.ipcRenderer.on('update-error', () => {
        this.updateCheckingUpdate(false)
      })

      // 监听下载进度事件
      this.$electron.ipcRenderer.on('download-progress', (event, progress) => {
        const percent = Math.round(progress.percent)
        this.updateDownloadProgress(percent)
      })
    },
    beforeDestroy () {
      // 移除事件监听
      this.$electron.ipcRenderer.removeAllListeners('checking-for-update')
      this.$electron.ipcRenderer.removeAllListeners('update-available')
      this.$electron.ipcRenderer.removeAllListeners('update-not-available')
      this.$electron.ipcRenderer.removeAllListeners('update-error')
      this.$electron.ipcRenderer.removeAllListeners('download-progress')
    },
    watch: {
      current () {
        this.$nextTick(() => {
          this.updateSliderFromDom()
        })
      },
      subnavItems () {
        this.$nextTick(() => {
          this.updateSliderFromDom()
        })
      }
    },
    methods: {
      ...mapActions('app', ['updateCheckingUpdate']),
      ...mapActions('preference', ['updateUpdateAvailable', 'updateNewVersion', 'updateLastCheckUpdateTime', 'updateIsDownloadingUpdate', 'updateDownloadProgress', 'updateReleaseNotes']),
      nav (category = 'basic') {
        const base = this.preferenceBasePath
        this.$router.push({
          path: `${base}/${category}`
        }).catch(err => {
          console.log(err)
        })
      },
      updateSliderFromDom () {
        if (!this.$el) {
          return
        }
        const activeItem = this.$el.querySelector('.preference-subnav-ul li.active')
        if (!activeItem) {
          return
        }
        this.sliderTop = activeItem.offsetTop || 0
        this.sliderHeight = activeItem.offsetHeight || 36
      },

      // 获取版本显示文本
      getVersionText () {
        if (this.isDownloadingUpdate) {
          return `下载中 ${this.downloadProgress}%`
        } else if (this.updateAvailable) {
          return `下载新版本 ${this.newVersion}`
        } else {
          return this.appVersion
        }
      },

      // 检查是否支持消息提示
      hasMsgSupport () {
        return typeof this.$msg !== 'undefined' && this.$msg !== null
      },

      // 显示消息
      showMessage (type, message) {
        if (this.hasMsgSupport()) {
          this.$msg[type](message)
        } else {
          console.log(`[Motrix] Update message: ${type} - ${message}`)
          // 如果没有消息组件，使用浏览器的alert
          if (type === 'error') {
            alert(message)
          }
        }
      },

      // 检查更新
      checkForUpdates () {
        // 如果正在检查，直接返回
        if (this.isCheckingUpdate) return

        // 设置检查状态
        this.updateCheckingUpdate(true)

        // 显示检查中消息
        this.showMessage('info', this.$t('app.checking-for-updates'))

        // 创建临时事件监听器，使用once确保只触发一次
        const onUpdateError = () => {
          this.showMessage('error', this.$t('app.update-error-message'))
          this.updateCheckingUpdate(false)
        }

        const onUpdateNotAvailable = () => {
          this.showMessage('success', this.$t('app.update-not-available-message'))
          this.updateCheckingUpdate(false)
          this.updateUpdateAvailable(false)
          this.updateNewVersion('')
          this.updateLastCheckUpdateTime(Date.now())
        }

        const onUpdateAvailable = (event, version, releaseNotes) => {
          this.showMessage('info', this.$t('app.update-available-message'))
          this.updateCheckingUpdate(false)
          this.updateUpdateAvailable(true)
          this.updateNewVersion(version)
          this.updateLastCheckUpdateTime(Date.now())
          this.updateReleaseNotes(releaseNotes || '')
        }

        // 使用once监听事件，确保事件只处理一次
        this.$electron.ipcRenderer.once('update-error', onUpdateError)
        this.$electron.ipcRenderer.once('update-not-available', onUpdateNotAvailable)
        this.$electron.ipcRenderer.once('update-available', onUpdateAvailable)

        // 设置超时处理，防止无限期等待
        const timeout = setTimeout(() => {
          console.log('[Motrix] Update check timed out')
          // 移除所有临时事件监听器
          this.$electron.ipcRenderer.removeListener('update-error', onUpdateError)
          this.$electron.ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable)
          this.$electron.ipcRenderer.removeListener('update-available', onUpdateAvailable)

          // 显示超时消息
          this.showMessage('error', this.$t('app.update-timeout-message') || '更新检查超时，请稍后重试')
          this.updateCheckingUpdate(false)
        }, 10000) // 10秒超时

        // 监听任何更新事件，清除超时
        const clearTimeoutListener = () => {
          clearTimeout(timeout)
          console.log('[Motrix] Update check completed, clearing timeout')
          // 移除清除超时的监听器
          this.$electron.ipcRenderer.removeListener('update-error', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-not-available', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-available', clearTimeoutListener)
        }
        this.$electron.ipcRenderer.once('update-error', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-not-available', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-available', clearTimeoutListener)

        // 发送检查更新命令
        console.log('[Motrix] Sending check for updates command')
        this.$electron.ipcRenderer.send('command', 'application:check-for-updates')
      },

      // 下载更新
      downloadUpdate () {
        if (this.isDownloadingUpdate) return
        this.updateIsDownloadingUpdate(true)
        this.updateDownloadProgress(0)

        // 显示下载开始消息
        this.showMessage('info', '开始下载新版本...')

        // 监听下载进度事件
        const onDownloadProgress = (event, progress) => {
          this.updateDownloadProgress(Math.round(progress.percent))
        }

        // 监听下载完成事件
        const onDownloaded = () => {
          this.updateIsDownloadingUpdate(false)
          this.updateUpdateAvailable(false)
          this.showMessage('success', '更新下载完成，应用程序将自动重启并安装更新')

          // 移除事件监听器
          this.$electron.ipcRenderer.removeListener('download-progress', onDownloadProgress)
          this.$electron.ipcRenderer.removeListener('update-downloaded', onDownloaded)
          this.$electron.ipcRenderer.removeListener('update-error', onDownloadError)
        }

        // 监听下载错误事件
        const onDownloadError = () => {
          this.updateIsDownloadingUpdate(false)
          this.showMessage('error', '下载更新失败，请检查网络连接后重试')

          // 移除事件监听器
          this.$electron.ipcRenderer.removeListener('download-progress', onDownloadProgress)
          this.$electron.ipcRenderer.removeListener('update-downloaded', onDownloaded)
          this.$electron.ipcRenderer.removeListener('update-error', onDownloadError)
        }

        // 注册事件监听器
        this.$electron.ipcRenderer.on('download-progress', onDownloadProgress)
        this.$electron.ipcRenderer.on('update-downloaded', onDownloaded)
        this.$electron.ipcRenderer.on('update-error', onDownloadError)

        // 发送下载更新命令
        console.log('[Motrix] Sending download update command')
        this.$electron.ipcRenderer.send('command', 'application:download-update')
      }
    }
  }
</script>

<style lang="scss">
.preference-subnav-ul .subnav-icon {
  height: 18px;
}

.preference-subnav-ul .subnav-icon svg {
  width: 18px;
  height: 18px;
}

.preference-subnav-ul li:not(.subnav-item--basic):not(.subnav-item--advanced) .subnav-icon svg {
  transform: scale(1.12);
  transform-origin: center;
}

.version-item {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #000;
  border-radius: 12px;
  padding: 8px 12px;
  margin-top: 10px;
  background-color: transparent;
  opacity: 0.5;

  &:hover {
    background-color: transparent;
    border-color: #c6e2ff;
    opacity: 1;
  }

  &.update-available {
    color: #67c23a;
    font-weight: bold;
    border-color: #c2e7b0;
    background-color: transparent;
    opacity: 1;
    animation: pulse-green 1s infinite;

    &:hover {
      background-color: transparent;
      border-color: #a5d6a7;
      opacity: 1;
    }
  }

  &.is-checking {
    cursor: not-allowed;
    opacity: 1;
    animation: pulse 1s infinite;
    border-color: #409eff;
  }

  &.is-checking:hover {
    opacity: 1;
    border-color: #409eff;
    background-color: transparent;
  }

  &.downloading {
    cursor: not-allowed;
    color: #e6a23c;
    font-weight: bold;
    border-color: #f0c78a;
    background-color: transparent;
    opacity: 1;
    animation: pulse-orange 1s infinite;

    &:hover {
      background-color: transparent;
      border-color: #f0c78a;
      opacity: 1;
    }
  }

  &[disabled] {
    cursor: not-allowed;
  }

  span {
    font-family: monospace;
    display: block;
    text-align: center;
  }

  /* 黑夜模式适配 */
  .theme-dark & {
    border-color: #fff;
    color: #fff;
  }

  .theme-dark &:hover {
    border-color: #c6e2ff;
  }

  .theme-dark &.update-available {
    border-color: #a5d6a7;
  }

  .theme-dark &.update-available:hover {
    border-color: #a5d6a7;
  }

  .theme-dark &.is-checking {
    border-color: #409eff;
  }

  .theme-dark &.is-checking:hover {
    border-color: #409eff;
  }

  .theme-dark &.downloading {
    border-color: #f0c78a;
  }

  .theme-dark &.downloading:hover {
    border-color: #f0c78a;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(64, 158, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
}

@keyframes pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}

@keyframes pulse-orange {
  0% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(230, 162, 60, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0);
  }
}
</style>
