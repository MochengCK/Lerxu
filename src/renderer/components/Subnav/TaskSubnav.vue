<template>
  <nav class="subnav-inner task-subnav">
    <div class="subnav-scroll-area">
    <!-- 下载区 -->
    <div class="subnav-section">
      <div class="subnav-section-label">{{ $t('subnav.download-section') }}</div>
      <ul class="task-nav-list">
        <li
          @click="() => nav('all')"
          :class="[ current === 'all' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-all" width="20" height="20" />
          </i>
          <span>{{ $t('task.all') }}</span>
          <span class="subnav-count">{{ taskCounts.all }}</span>
        </li>
        <li
          @click="() => nav('active')"
          :class="[ current === 'active' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-active" width="20" height="20" />
          </i>
          <span>{{ $t('task.active') }}</span>
          <span class="subnav-count">{{ taskCounts.active }}</span>
        </li>
        <li
          @click="() => nav('waiting')"
          :class="[ current === 'waiting' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-waiting" width="20" height="20" />
          </i>
          <span>{{ $t('task.waiting') }}</span>
          <span class="subnav-count">{{ taskCounts.waiting }}</span>
        </li>
        <li
          @click="() => nav('stopped')"
          :class="[ current === 'stopped' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-stopped" width="20" height="20" />
          </i>
          <span>{{ $t('task.stopped') }}</span>
          <span class="subnav-count">{{ taskCounts.stopped }}</span>
        </li>
      </ul>
    </div>

    <!-- 类型区（可折叠） -->
    <div class="subnav-section">
      <div
        class="subnav-section-label subnav-section-toggle"
        @click="typeCollapsed = !typeCollapsed"
      >
        <span>{{ $t('subnav.type-section') }}</span>
        <i class="subnav-chevron" :class="{ 'is-collapsed': typeCollapsed }"></i>
      </div>
      <ul class="task-nav-list category-nav-list" :class="{ 'is-collapsed': typeCollapsed }">
        <li
          v-for="cat in categories"
          :key="cat.value || 'all'"
          @click="() => selectCategory(cat.value)"
          :class="[ categoryFilter === cat.value ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon :name="cat.icon" width="20" height="20" />
          </i>
          <span>{{ cat.label }}</span>
          <span class="subnav-count">{{ categoryCounts[cat.value] || 0 }}</span>
        </li>
      </ul>
    </div>
    </div>

    <div class="subnav-bottom">
    <!-- 速度显示 -->
    <div class="subnav-speed-box">
      <span class="subnav-speed-item">
        <span class="subnav-speed-label">↑</span>
        <span class="subnav-speed-value">{{ stat.uploadSpeed | bytesToSize }}/s</span>
      </span>
      <span class="subnav-speed-divider"></span>
      <span class="subnav-speed-item">
        <span class="subnav-speed-label">↓</span>
        <span class="subnav-speed-value">{{ stat.downloadSpeed | bytesToSize }}/s</span>
      </span>
    </div>

    <!-- 设置 -->
    <ul class="preference-nav-list">
      <li
        class="preference-item"
        @click="openPreference"
      >
        <i class="subnav-icon">
          <mo-icon name="menu-preference" width="20" height="20" />
        </i>
        <span>{{ $t('subnav.preferences') }}</span>
      </li>
    </ul>
    </div>
  </nav>
</template>

<script>
  import { mapGetters, mapState } from 'vuex'
  import { bytesToSize } from '@shared/utils'
  import '@/components/Icons/subnav-all'
  import '@/components/Icons/subnav-active'
  import '@/components/Icons/subnav-waiting'
  import '@/components/Icons/subnav-stopped'
  import '@/components/Icons/subnav-type-all'
  import '@/components/Icons/menu-preference'
  import '@/components/Icons/subnav-archives'
  import '@/components/Icons/subnav-programs'
  import '@/components/Icons/subnav-videos'
  import '@/components/Icons/subnav-music'
  import '@/components/Icons/subnav-images'
  import '@/components/Icons/subnav-documents'

  export default {
    name: 'mo-task-subnav',
    props: {
      current: {
        type: String,
        default: 'all'
      }
    },
    data () {
      return {
        typeCollapsed: false
      }
    },
    computed: {
      title () {
        return this.$t('subnav.task-list')
      },
      ...mapGetters('task', {
        taskCounts: 'filteredTaskCounts',
        categoryCounts: 'categoryCounts'
      }),
      ...mapState('task', {
        categoryFilter: state => state.categoryFilter
      }),
      ...mapState('app', ['stat']),
      categories () {
        return [
          { value: '', label: this.$t('task.category-all'), icon: 'subnav-type-all' },
          { value: 'archives', label: this.$t('task.category-archives'), icon: 'subnav-archives' },
          { value: 'programs', label: this.$t('task.category-programs'), icon: 'subnav-programs' },
          { value: 'videos', label: this.$t('task.category-videos'), icon: 'subnav-videos' },
          { value: 'music', label: this.$t('task.category-music'), icon: 'subnav-music' },
          { value: 'images', label: this.$t('task.category-images'), icon: 'subnav-images' },
          { value: 'documents', label: this.$t('task.category-documents'), icon: 'subnav-documents' }
        ]
      }
    },
    methods: {
      nav (status = 'active') {
        this.$router.push({
          path: `/task/${status}`
        }).catch(err => {
          console.log(err)
        })
      },
      selectCategory (value) {
        this.$store.dispatch('task/updateCategoryFilter', value)
        this.$store.dispatch('task/fetchList')
      },
      openPreference () {
        this.$electron.ipcRenderer.send('open-preference-window')
      }
    },
    filters: {
      bytesToSize
    }
  }
</script>

<style lang="scss">
.subnav-inner.task-subnav {
  margin-top: 44px;
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: calc(100% - 44px);

  .subnav-scroll-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .subnav-bottom {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .subnav-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .subnav-section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--lc-text-placeholder, #999);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 10px 4px;
    user-select: none;
  }

  .subnav-section-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 12px;
    cursor: pointer;
    transition: color 0.2s ease;

    &:hover {
      color: var(--lc-text-regular, #666);
    }

    .subnav-chevron {
      display: inline-block;
      width: 5px;
      height: 5px;
      border-right: 1px solid currentColor;
      border-bottom: 1px solid currentColor;
      transform: rotate(45deg);
      transition: transform 0.3s ease;
      flex-shrink: 0;

      &.is-collapsed {
        transform: rotate(-45deg);
      }
    }
  }

  .task-nav-list {
    display: flex;
    flex-direction: column;
    gap: 2px;

    &.category-nav-list {
      overflow: hidden;
      max-height: 300px;
      transition: max-height 0.3s ease, opacity 0.2s ease;
      opacity: 1;

      &.is-collapsed {
        max-height: 0;
        opacity: 0;
      }
    }

    li {
      height: 32px;
      line-height: 32px;
      display: flex;
      align-items: center;
      border-radius: 8px;
      padding: 0 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;

      &:hover:not(.active) {
        background-color: var(--lc-subnav-hover-bg, rgba(0, 0, 0, 0.06));
      }

      &.active {
        background-color: var(--lc-subnav-active-item-bg, rgba(0, 0, 0, 0.12));
      }

      &:hover,
      &.active {
        .subnav-icon svg,
        span:not(.subnav-count) {
          color: var(--lc-subnav-active-text, inherit);
        }
      }

      .subnav-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        flex-shrink: 0;
        svg {
          width: 16px !important;
          height: 16px !important;
        }
      }

      span:not(.subnav-count) {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .subnav-speed-box {
    margin: 8px 0;
    padding: 8px 10px;
    border: 1px solid var(--lc-border-base, #e0e0e0);
    border-radius: 10px;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 0;
    font-size: 12px;
    color: var(--lc-text-secondary, #999);
  }

  .subnav-speed-item {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .subnav-speed-divider {
    width: 1px;
    align-self: stretch;
    background: var(--lc-border-base, #e0e0e0);
    margin: 2px 0;
  }

  .subnav-speed-label {
    font-style: normal;
    font-size: 11px;
  }

  .subnav-speed-value {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .preference-nav-list {
    padding-top: 0;
    flex-shrink: 0;

    li {
      height: 32px;
      line-height: 32px;
      display: flex;
      align-items: center;
      border-radius: 8px;
      padding: 0 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;

      &:hover:not(.active) {
        background-color: var(--lc-subnav-hover-bg, rgba(0, 0, 0, 0.06));
      }

      &.active {
        background-color: var(--lc-subnav-active-item-bg, rgba(0, 0, 0, 0.12));
      }

      &:hover,
      &.active {
        .subnav-icon svg,
        span {
          color: var(--lc-subnav-active-text, inherit);
        }
      }

      .subnav-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        flex-shrink: 0;
        svg {
          width: 16px !important;
          height: 16px !important;
        }
      }
    }
  }
}

.subnav.three-column-subnav.is-auto-hide-aside .subnav-inner.task-subnav {
  height: calc(100% - 44px);
}

#app:not(.has-custom-titlebar) .subnav-inner.task-subnav {
  margin-top: 44px;
}

.subnav-inner {
  li.subnav-divider {
    display: block;
    width: auto;
    height: 1px;
    margin: 8px 10px;
    padding: 0;
    line-height: 0;
    background-color: rgba(0, 0, 0, 0.25);
    cursor: default;
    pointer-events: none;

    &:hover {
      background-color: rgba(0, 0, 0, 0.25) !important;
    }
  }
}
.theme-dark .subnav-inner li.subnav-divider {
  background-color: rgba(255, 255, 255, 0.25);
  &:hover {
    background-color: rgba(255, 255, 255, 0.25) !important;
  }
}

.subnav-inner .subnav-count {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 18px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.25s;
  pointer-events: none;
}

.subnav-inner ul li.active .subnav-count,
.subnav-inner ul li:hover .subnav-count {
  opacity: 1;
}

.theme-dark .subnav-inner.task-subnav {
  .subnav-section-label {
    color: var(--lc-text-placeholder, #666);
  }

  // 深色模式下 .theme-dark ... .subnav-section-label (0,4,0) 会压过
  // 基础 hover 规则 (0,3,0)，导致"类型"标签悬停没有高亮。
  // 这里以更高优先级补上 hover 状态，与浅色模式行为一致。
  .subnav-section-toggle {
    &:hover {
      color: var(--lc-text-regular, #666);
    }
  }
}
</style>
