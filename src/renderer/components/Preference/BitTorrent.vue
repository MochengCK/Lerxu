<template>
  <el-main class="panel-content">
    <el-form
      class="form-preference"
      label-position="top"
      label-width="200px"
      size="mini"
    >
      <!-- 等级卡片 + XP 详情 -->
      <el-form-item>
        <div class="level-card-wrapper">
          <!-- 等级卡片主体 -->
          <div class="level-card">
            <div class="level-header">
              <div class="level-badge">
                <span class="level-number">Lv.{{ userLevel.level }}</span>
                <div class="level-title-group">
                  <span class="level-name">{{ $t('preferences.' + userLevel.titleKey) }}</span>
                  <span class="level-divider">·</span>
                  <span class="level-subtitle">{{ $t('preferences.' + userLevel.titleKey + '-subtitle') }}</span>
                </div>
              </div>
              <div class="level-xp">
                <span class="xp-current">{{ Math.floor(userStats.xp) }}</span>
                <span class="xp-total">/ {{ userLevel.nextLevelXP }} {{ $t('preferences.bt-xp-unit') }}</span>
              </div>
            </div>
            <div class="level-progress">
              <el-progress
                :percentage="levelProgress"
                :show-text="false"
                :stroke-width="8"
                color="#67c23a"
              />
            </div>
          </div>

          <!-- XP 详情 - 延伸部分，底部三角箭头可点击收起/展开 -->
          <div class="xp-breakdown" :class="{ 'is-collapsed': xpBreakdownCollapsed }">
            <transition name="xp-breakdown-expand">
              <div class="xp-breakdown-content" v-show="!xpBreakdownCollapsed">
            <div class="xp-item">
              <div class="xp-content">
                <div class="xp-label">{{ $t('preferences.bt-xp-download') }}</div>
                <div class="xp-stats">
                  <span class="xp-value">+{{ Math.floor(userStats.dlXP) }} {{ $t('preferences.bt-xp-unit') }}</span>
                  <span class="xp-separator">·</span>
                  <span class="xp-detail">{{ formatBytes(userStats.totalDownloaded) }}</span>
                </div>
              </div>
            </div>
            <div class="xp-item">
              <div class="xp-content">
                <div class="xp-label">{{ $t('preferences.bt-xp-upload') }}</div>
                <div class="xp-stats">
                  <span class="xp-value">+{{ Math.floor(userStats.ulXP) }} {{ $t('preferences.bt-xp-unit') }}</span>
                  <span class="xp-separator">·</span>
                  <span class="xp-detail">{{ formatBytes(userStats.totalUploaded) }}</span>
                </div>
              </div>
            </div>
            <div class="xp-item" v-if="userStats.shareRatioBonus > 0">
              <div class="xp-content">
                <div class="xp-label">{{ $t('preferences.bt-xp-share-ratio') }}</div>
                <div class="xp-stats">
                  <span class="xp-value bonus">+{{ Math.floor(userStats.shareRatioBonus) }} {{ $t('preferences.bt-xp-unit') }}</span>
                  <span class="xp-separator">·</span>
                  <span class="xp-detail">{{ shareRatioText }}</span>
                </div>
              </div>
            </div>
            <div class="xp-item">
              <div class="xp-content">
                <div class="xp-label">{{ $t('preferences.bt-xp-peers') }}</div>
                <div class="xp-stats">
                  <span class="xp-value">+{{ Math.floor(userStats.peerXP) }} {{ $t('preferences.bt-xp-unit') }}</span>
                  <span class="xp-separator">·</span>
                  <span class="xp-detail">{{ userStats.totalPeers }} {{ $t('preferences.bt-peers-unit') }}</span>
                </div>
              </div>
            </div>
            <div class="xp-item">
              <div class="xp-content">
                <div class="xp-label">{{ $t('preferences.bt-xp-seed-time') }}</div>
                <div class="xp-stats">
                  <span class="xp-value">+{{ Math.floor(userStats.timeXP) }} {{ $t('preferences.bt-xp-unit') }}</span>
                  <span class="xp-separator">·</span>
                  <span class="xp-detail">{{ formatSeedTime(userStats.totalSeedHours) }}</span>
                </div>
              </div>
            </div>
            </div>
            </transition>
            <div
              class="xp-breakdown-arrow-trigger"
              :class="{ 'is-collapsed': xpBreakdownCollapsed }"
              @click="toggleXpBreakdown"
            />
          </div>
        </div>
      </el-form-item>
    </el-form>
  </el-main>
</template>

<script>
  import { mapState } from 'vuex'
  import router from '@/router'
  import api from '@/api'
  import BtLevelMigration from '@/utils/BtLevelMigration'
  import { bytesToSize } from '@shared/utils'

  // 等级定义（使用国际化 key）
  const LEVELS = [
    { level: 1, titleKey: 'bt-level-1', minXP: 0 },
    { level: 2, titleKey: 'bt-level-2', minXP: 300 },
    { level: 3, titleKey: 'bt-level-3', minXP: 800 },
    { level: 4, titleKey: 'bt-level-4', minXP: 1600 },
    { level: 5, titleKey: 'bt-level-5', minXP: 3000 },
    { level: 6, titleKey: 'bt-level-6', minXP: 5200 },
    { level: 7, titleKey: 'bt-level-7', minXP: 8500 },
    { level: 8, titleKey: 'bt-level-8', minXP: 13000 },
    { level: 9, titleKey: 'bt-level-9', minXP: 20000 }
  ]

  function getLevelTitleKey (level) {
    const found = LEVELS.find(item => item.level === level)
    return (found && found.titleKey) || LEVELS[LEVELS.length - 1].titleKey
  }

  export default {
    name: 'mo-preference-bittorrent',
    data () {
      return {
        updateTimer: null,
        lastLevel: null, // 记录上次的等级，用于检测升级
        xpBreakdownCollapsed: (() => {
          try {
            const saved = localStorage.getItem('bt-xp-breakdown-collapsed')
            return saved === 'true'
          } catch {
            return false
          }
        })(), // 首次渲染前从 localStorage 加载，避免切换回来时误触发收起动画
        userStats: {
          xp: 0,
          dlXP: 0,
          ulXP: 0,
          shareRatioBonus: 0,
          peerXP: 0,
          timeXP: 0,
          totalDownloaded: 0,
          totalUploaded: 0,
          totalPeers: 0,
          totalSeedHours: 0
        },
        userLevel: {
          level: 1,
          titleKey: 'bt-level-1',
          nextLevelXP: 300,
          isMaxLevel: false
        }
      }
    },
    computed: {
      ...mapState('preference', {
        config: state => state.config
      }),
      form () {
        return this.config
      },
      levelProgress () {
        if (this.userLevel.isMaxLevel) return 100

        const currentLevelBase = this.userLevel.currentLevelXP || 0
        const nextLevelBase = this.userLevel.nextLevelXP || 300
        const progress = ((this.userStats.xp - currentLevelBase) / (nextLevelBase - currentLevelBase)) * 100
        return Math.min(100, Math.max(0, progress))
      },
      shareRatioText () {
        const ratio = this.userStats.totalDownloaded > 0
          ? (this.userStats.totalUploaded / this.userStats.totalDownloaded).toFixed(2)
          : '0.00'
        return `${this.$t('preferences.bt-share-ratio')}: ${ratio}`
      }
    },
    async mounted () {
      // 从本地存储加载上次的等级
      try {
        const savedLevel = localStorage.getItem('bt-user-level')
        if (savedLevel) {
          this.lastLevel = parseInt(savedLevel)
        }
      } catch (e) {
        console.warn('[BT Stats] Failed to load last level:', e)
      }

      await this.migrateBtStats()
      await this.fetchBtLevel()

      // 每5秒更新一次统计数据
      this.updateTimer = setInterval(() => {
        this.fetchBtLevel()
      }, 5000)
    },
    beforeDestroy () {
      // 清理定时器
      if (this.updateTimer) {
        clearInterval(this.updateTimer)
        this.updateTimer = null
      }
    },
    methods: {
      async migrateBtStats () {
        try {
          const migration = new BtLevelMigration(api)
          await migration.migrate()
        } catch (error) {
          console.warn('[BT Stats] Migration failed:', error)
        }
      },
      async fetchBtLevel () {
        try {
          const data = await api.getBtLevel()
          const level = Number(data.level || 1)
          const currentLevelXP = Number(data.currentLevelThreshold || 0)
          const nextLevelXP = Number(data.nextLevelThreshold || 0)
          const downloadBytes = Number(data.downloadBytes || 0)
          const uploadBytes = Number(data.uploadBytes || 0)
          const seedTimeSeconds = Number(data.seedTimeSeconds || 0)
          const maxPeers = Number(data.maxPeers || 0)
          const levelInfo = {
            level,
            titleKey: getLevelTitleKey(level),
            currentLevelXP,
            nextLevelXP,
            isMaxLevel: level >= LEVELS.length || (nextLevelXP > 0 && nextLevelXP <= currentLevelXP)
          }

          this.userStats = {
            xp: Number(data.totalXP || 0),
            dlXP: Number(data.downloadXP || 0),
            ulXP: Number(data.uploadXP || 0),
            shareRatioBonus: Number(data.ratioXP || 0),
            peerXP: Number(data.peerXP || 0),
            timeXP: Number(data.timeXP || 0),
            totalDownloaded: Number.isFinite(downloadBytes) ? downloadBytes : 0,
            totalUploaded: Number.isFinite(uploadBytes) ? uploadBytes : 0,
            totalPeers: Number.isFinite(maxPeers) ? maxPeers : 0,
            totalSeedHours: Number.isFinite(seedTimeSeconds) ? (seedTimeSeconds / 3600) : 0
          }

          if (this.lastLevel !== null && levelInfo.level > this.lastLevel) {
            this.showLevelUpNotification(levelInfo)
          }

          this.userLevel = levelInfo
          this.lastLevel = levelInfo.level

          try {
            localStorage.setItem('bt-user-level', levelInfo.level.toString())
          } catch (e) {}
        } catch (error) {
          console.warn('[BT Stats] Failed to fetch BT level:', error)
        }
      },
      toggleXpBreakdown () {
        this.xpBreakdownCollapsed = !this.xpBreakdownCollapsed
        try {
          localStorage.setItem('bt-xp-breakdown-collapsed', String(this.xpBreakdownCollapsed))
        } catch (e) {}
      },
      formatBytes (bytes) {
        return bytesToSize(bytes)
      },
      formatSeedTime (hours) {
        if (hours < 1) return '< 1h'
        if (hours < 24) return `${Math.floor(hours)}h`
        const days = Math.floor(hours / 24)
        const remainingHours = Math.floor(hours % 24)
        if (remainingHours === 0) return `${days}d`
        return `${days}d ${remainingHours}h`
      },
      showLevelUpNotification (levelInfo) {
        // 检查是否启用了升级提示（config 使用 camelCase）
        const notificationEnabled = this.config.btLevelUpNotification
        if (notificationEnabled === false) {
          return
        }

        const levelName = this.$t(`preferences.${levelInfo.titleKey}`)
        const message = this.$t('preferences.bt-level-up-message', {
          level: levelInfo.level,
          name: levelName
        })

        // 显示消息提示
        const msgInstance = this.$message({
          message,
          type: 'success',
          duration: 5000,
          showClose: true,
          customClass: 'bt-level-up-message'
        })

        // 点击消息时打开BT统计页面（等待 DOM 渲染完成）
        const bindClick = () => {
          if (!msgInstance || !msgInstance.$el) return
          const el = msgInstance.$el
          if (el && !el.dataset.btLevelUpBound) {
            el.dataset.btLevelUpBound = '1'
            el.style.cursor = 'pointer'
            el.addEventListener('click', (e) => {
              if (e.target.closest('.el-message__closeBtn')) return // 点击关闭按钮时不跳转
              this.openBtStatsPage()
              msgInstance.close()
            })
          }
        }
        this.$nextTick(bindClick)
        setTimeout(bindClick, 100) // 兜底：Element UI 消息可能异步挂载

        // 如果支持系统通知，也显示系统通知
        if (window.Notification && Notification.permission === 'granted') {
          const notification = new Notification(this.$t('preferences.bt-level-up-title'), {
            body: message,
            icon: 'static/512x512.png',
            tag: 'bt-level-up'
          })

          // 点击通知时打开BT统计页面
          notification.onclick = () => {
            // 先唤起主窗口（应用可能在后台或最小化）
            this.$electron.ipcRenderer.send('command', 'application:bring-to-front', { page: 'index' })
            this.openBtStatsPage()
            notification.close()
          }
        }
      },
      openBtStatsPage () {
        // 跳转到设置页面的 BT 统计标签（点击升级通知时调用）
        const path = `${this.$route.path || ''}`
        const base = path.startsWith('/preference-window') ? '/preference-window' : '/preference'
        router.push({ path: `${base}/bittorrent` }).catch(() => {})
      }
    }
  }
</script>

<style lang="scss">
// 等级卡片
.level-card {
  background: $--panel-background;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid $--border-color-light;
  transition: all 0.3s ease;
  margin-bottom: 12px;

  &:hover {
    border-color: var(--primary-color);
  }
}

.level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.level-badge {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.level-number {
  font-size: 32px;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1;
}

.level-title-group {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.level-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary-color);
}

.level-divider {
  font-size: 16px;
  color: var(--text-secondary-color);
}

.level-subtitle {
  font-size: 16px;
  color: var(--text-secondary-color);
}

.level-xp {
  text-align: right;
}

.xp-current {
  font-size: 24px;
  font-weight: 600;
  color: var(--primary-color);
}

.xp-total {
  font-size: 14px;
  color: var(--text-secondary-color);
}

.level-progress {
  margin-bottom: 0;
}

// XP 详情
.xp-breakdown {
  display: flex;
  flex-direction: column;
  margin-left: 16px;
  margin-right: 16px;
  padding: 0;
  padding-bottom: 14px; // 为底部三角箭头留出空间
  background: $--panel-background;
  border: 1px solid $--border-color-light;
  border-top: none;
  border-radius: 0 0 12px 12px;
  position: relative;
  overflow: visible;

  &.is-collapsed {
    min-height: 28px; // 收起时保留底部箭头可点区域
  }

  // 底部三角箭头：展开=实心，收起=空心，无横杠
  .xp-breakdown-arrow-trigger {
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    cursor: pointer;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid $--border-color-light;
    z-index: 2;
    transition: border-color 0.2s;

    // 展开=实心，收起=空心（clip-path 镂空，无横杠）
    &.is-collapsed {
      &::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 14px;
        height: 8px;
        background: $--panel-background;
        clip-path: polygon(50% 0, 0 100%, 100% 100%);
      }
    }

    &:hover {
      border-top-color: var(--primary-color);
    }

    &.is-collapsed:hover {
      border-top-color: var(--primary-color);
    }
  }

  .xp-breakdown-content {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding: 0 16px 20px 16px; // 底部留空给三角箭头
  }
}

// 收起/展开动画
.xp-breakdown-expand-enter-active,
.xp-breakdown-expand-leave-active {
  transition: opacity 0.25s ease, max-height 0.3s ease;
  overflow: hidden;
}

.xp-breakdown-expand-enter-active {
  max-height: 500px;
}

.xp-breakdown-expand-leave-active {
  max-height: 500px;
}

.xp-breakdown-expand-enter,
.xp-breakdown-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.xp-item {
  padding: 16px;
  background: $--panel-background;
  border: 1px solid $--border-color-light;
  border-radius: 8px;
  transition: all 0.3s;

  &:hover {
    border-color: var(--primary-color);
  }
}

.xp-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.xp-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary-color);
}

.xp-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.xp-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-color);

  &.bonus {
    color: #e6a23c; // 金色，表示奖励
  }
}

.xp-separator {
  color: var(--text-secondary-color);
  font-size: 14px;
}

.xp-detail {
  font-size: 13px;
  color: var(--text-secondary-color);
}

// 响应式
@media (max-width: 768px) {
  .xp-breakdown .xp-breakdown-content {
    grid-template-columns: 1fr;
  }
}

// 升级提示样式
.bt-level-up-message {
  font-size: 16px;
  font-weight: 600;

  .el-message__content {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

// 黑夜主题
.theme-dark {
  .level-card {
    background: $--dk-panel-background;
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      border-color: var(--primary-color);
    }
  }

  .xp-breakdown {
    background: $--dk-panel-background;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-top: none;

    .xp-breakdown-arrow-trigger {
      border-top-color: rgba(255, 255, 255, 0.1);
      &::after {
        background: $--dk-panel-background;
      }
      &:hover {
        border-top-color: var(--primary-color);
      }
    }
  }

  .xp-item {
    background: $--dk-panel-background;
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      border-color: var(--primary-color);
    }
  }
}
</style>
