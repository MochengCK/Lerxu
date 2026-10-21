<template>
  <div
    ref="root"
    class="mo-history-directory"
    :class="{ 'is-open': visible }"
  >
    <button
      type="button"
      class="mo-history-trigger"
      aria-label="History directories"
      @click.stop="toggle"
      @mouseenter="openOnHover"
      @mouseleave="scheduleClose"
    >
      <svg
        class="lc-history-clock"
        viewBox="0 0 24 24"
        width="13"
        height="13"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-.7 3H13v5.6l3.9 2.3-.9 1.5L12 14.4V7z"
        ></path>
      </svg>
    </button>

    <!-- 浮层 Teleport 到 body + fixed 定位：新建任务弹窗的 .el-dialog__body
         是 overflow-y: auto 的滚动容器，内联的绝对定位浮层向上展开时
         上半截会被它裁掉（表现为被弹窗框住、显示不全）。挂到 body 后
         不再受任何滚动容器裁剪，位置按触发器矩形实时计算。 -->
    <Teleport to="body">
      <transition name="mo-history-fade">
        <div
          ref="dropdown"
          v-show="visible"
          class="mo-history-dropdown"
          :class="{ 'mo-history-dropdown--up': isUp }"
          :style="dropdownStyle"
          role="listbox"
          @mouseenter="cancelClose"
          @mouseleave="scheduleClose"
        >
          <el-empty class="mo-directory-empty" :image-size="48" v-if="empty" />
          <ul class="mo-directory-list" v-if="favoriteDirectories.length > 0">
            <li
              v-for="directory in favoriteDirectories"
              :key="directory"
              :class="{ 'is-current': isCurrentDirectory(directory) }"
              @click.stop="() => handleSelectItem(directory)"
            >
              <span class="mo-directory-path" :title="directory">{{directory}}</span>
              <span class="mo-directory-actions">
                <el-icon
                  class="icon-history-favorited"
                  @click.stop="() => handleCancelFavoriteItem(directory)"
                ><Star /></el-icon>
                <el-icon
                  class="icon-history-remove"
                  @click.stop="() => handleRemoveItem(directory)"
                ><Delete /></el-icon>
              </span>
            </li>
          </ul>
          <div class="mo-directory-divider" v-if="showDivider" />
          <ul class="mo-directory-list" v-if="historyDirectories.length > 0">
            <li
              v-for="directory in historyDirectories"
              :key="directory"
              :class="{ 'is-current': isCurrentDirectory(directory) }"
              @click.stop="() => handleSelectItem(directory)"
            >
              <span class="mo-directory-path" :title="directory">{{directory}}</span>
              <span class="mo-directory-actions">
                <el-icon
                  v-if="showFavoriteAction"
                  class="icon-history-favorite"
                  @click.stop="() => handleFavoriteItem(directory)"
                ><Star /></el-icon>
                <el-icon
                  class="icon-history-remove"
                  @click.stop="() => handleRemoveItem(directory)"
                ><Delete /></el-icon>
              </span>
            </li>
          </ul>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { MAX_NUM_OF_DIRECTORIES } from '@shared/constants'
import { cloneArray } from '@shared/utils'
import { usePreferenceStore } from '@/store'
import { storeToRefs } from 'pinia'
import { Star, Delete } from '@element-plus/icons-vue'

const props = defineProps({
  width: {
    type: Number,
    default: 360
  },
  placement: {
    type: String,
    default: 'bottom-start'
  },
  // 当前输入框里的目录：与它相同的那条高亮，便于确认现在用的是哪一个
  current: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['selected'])
defineOptions({ name: 'mo-history-directory' })

const preferenceStore = usePreferenceStore()
const { config } = storeToRefs(preferenceStore)

const root = ref(null)
const dropdown = ref(null)
const visible = ref(false)
// 浮层方向与实际位置（fixed 定位，随触发器位置 / 滚动实时更新）
const isUp = ref(false)
const dropdownStyle = ref({})
let closeTimer = null

// 浮层与触发器之间的间距 / 视口最小留白 / 展开方向的最大高度
const PANEL_GAP = 6
const VIEWPORT_MARGIN = 8
const MAX_PANEL_HEIGHT = 220

const historyDirectories = computed(() => cloneArray(config.value?.historyDirectories, true))
const favoriteDirectories = computed(() => cloneArray(config.value?.favoriteDirectories, true))

const empty = computed(() =>
  favoriteDirectories.value.length + historyDirectories.value.length === 0
)

const showDivider = computed(() =>
  favoriteDirectories.value.length > 0 && historyDirectories.value.length > 0
)

const showFavoriteAction = computed(() =>
  favoriteDirectories.value.length < MAX_NUM_OF_DIRECTORIES
)

/** 目录比较口径：去掉首尾空白与末尾分隔符（根目录 "/"、"C:\" 本身保留） */
function normalizeDirectory (dir) {
  const value = `${dir || ''}`.trim()
  if (!value) {
    return ''
  }
  const trimmed = value.replace(/[\\/]+$/, '')
  return trimmed || value
}

function isCurrentDirectory (directory) {
  const current = normalizeDirectory(props.current)
  return !!current && normalizeDirectory(directory) === current
}

/**
 * 以触发器的矩形为基准算浮层位置：默认贴在上方（placement 以 top 开头）
 * 或下方，并留出间距；那一侧空间不够时自动翻到另一侧，高度也跟着收缩，
 * 保证浮层始终完整落在视口内。
 */
function updatePanelPosition () {
  if (!root.value) return
  const rect = root.value.getBoundingClientRect()
  const viewportW = window.innerWidth || document.documentElement.clientWidth
  const viewportH = window.innerHeight || document.documentElement.clientHeight
  const preferUp = `${props.placement}`.startsWith('top')
  const spaceAbove = rect.top - VIEWPORT_MARGIN
  const spaceBelow = viewportH - rect.bottom - VIEWPORT_MARGIN
  const needed = MAX_PANEL_HEIGHT + PANEL_GAP
  if (preferUp) {
    isUp.value = spaceAbove >= needed || spaceAbove >= spaceBelow
  } else {
    isUp.value = spaceBelow < needed && spaceAbove > spaceBelow
  }

  // 宽度：默认 props.width，窄窗口下收进视口；左边缘再夹一次，避免右侧出界
  const width = Math.max(Math.min(props.width, viewportW - VIEWPORT_MARGIN * 2), 200)
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    viewportW - width - VIEWPORT_MARGIN
  )
  const available = Math.max((isUp.value ? spaceAbove : spaceBelow) - PANEL_GAP, 80)

  const next = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(Math.min(MAX_PANEL_HEIGHT, available))}px`
  }
  if (isUp.value) {
    next.bottom = `${Math.round(viewportH - rect.top + PANEL_GAP)}px`
    next.top = 'auto'
  } else {
    next.top = `${Math.round(rect.bottom + PANEL_GAP)}px`
    next.bottom = 'auto'
  }
  dropdownStyle.value = next
}

function openPanel () {
  if (visible.value) {
    return
  }
  // 先摆好位置再显示，避免首帧出现在左上角
  updatePanelPosition()
  visible.value = true
  nextTick(updatePanelPosition)
}

function toggle () {
  if (visible.value) {
    visible.value = false
  } else {
    openPanel()
  }
}

function openOnHover () {
  cancelClose()
  openPanel()
}

function scheduleClose () {
  cancelClose()
  closeTimer = setTimeout(() => {
    visible.value = false
  }, 200)
}

function cancelClose () {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function handleDocClick (e) {
  if (!visible.value) {
    return
  }
  // 浮层已经 Teleport 到 body，不在 root 的子树里，必须单独判断
  const inTrigger = root.value && root.value.contains(e.target)
  const inPanel = dropdown.value && dropdown.value.contains(e.target)
  if (!inTrigger && !inPanel) {
    visible.value = false
  }
}

function handleKeydown (e) {
  if (e.key === 'Escape' && visible.value) {
    visible.value = false
  }
}

/** 弹窗内容区 / 页面滚动、窗口缩放时，浮层跟着触发器走（捕获阶段监听所有滚动容器） */
function handleViewportChange () {
  if (visible.value) {
    updatePanelPosition()
  }
}

function handleSelectItem (directory) {
  emit('selected', directory.trim())
  visible.value = false
}

function handleFavoriteItem (directory) {
  preferenceStore.favoriteDirectory(directory)
}

function handleCancelFavoriteItem (directory) {
  preferenceStore.cancelFavoriteDirectory(directory)
}

function handleRemoveItem (directory) {
  preferenceStore.removeDirectory(directory)
}

onMounted(() => {
  document.addEventListener('click', handleDocClick)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', handleViewportChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
  cancelClose()
})
</script>

<style lang="scss">
.mo-history-directory {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;

  .mo-history-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 28px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--lc-text-secondary);
    line-height: 1;
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover {
      color: var(--lc-color-primary);
    }

    .lc-history-clock {
      display: block;
    }
  }
}

/* 浮层：Teleport 到 body + fixed 定位（见模板注释）。
   因此它不再是 .mo-history-directory 的子节点，样式不能嵌在那一层里。
   z-index 取 5200：高于 Element Plus 弹窗遮罩（macOS 透明模式下被提到
   5100 / 弹窗本体 5101），确保浮层盖在新建任务弹窗之上。 */
.mo-history-dropdown {
  position: fixed;
  z-index: 5200;
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  padding: 6px 0;
  border: 1px solid var(--lc-border-base);
  border-radius: 8px;
  background-color: var(--lc-bg-dropdown, #fff);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.mo-history-fade-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.mo-history-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.mo-history-fade-enter-from,
.mo-history-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
.mo-history-dropdown--up.mo-history-fade-enter-from,
.mo-history-dropdown--up.mo-history-fade-leave-to {
  transform: translateY(3px);
}

.el-empty.mo-directory-empty {
  padding: 12px 0;
}

.mo-directory-divider {
  padding: 0 12px;
  margin: 6px 0;
  &::after {
    content: ' ';
    display: block;
    height: 1px;
    width: 100%;
    background: var(--el-border-color);
  }
}

.mo-directory-list {
  padding: 0;
  margin: 0;
  list-style: none;
  &> li {
    display: flex;
    align-items: center;
    list-style: none;
    line-height: 24px;
    margin: 2px 6px;
    border-radius: 8px;
    font-size: var(--el-font-size-small);
    color: var(--el-text-color-regular);
    cursor: pointer;
    outline: none;
    padding: 6px 6px 6px calc(12px - 6px);
    &:focus, &:hover {
      background-color: #f5f7fa;
    }
    /* 当前输入框里的目录：底色 + 主色文字，hover 时也保持高亮 */
    &.is-current {
      background-color: var(--lc-color-primary-light);
      color: var(--lc-color-primary);
      font-weight: 500;

      &:focus, &:hover {
        background-color: var(--lc-color-primary-lighter);
      }

      .mo-directory-path {
        color: inherit;
      }
    }
  }
  .mo-directory-path {
    display: inline-block;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .mo-directory-actions {
    min-width: 40px;
    text-align: right;
    &> i {
      padding: 3px;
      margin-right: 3px;
      display: inline-block;
    }
  }
  .icon-history-favorite {
    &:focus, &:hover {
      color: var(--el-color-warning);
    }
  }
  .icon-history-favorited {
    color: var(--el-color-warning);
  }
  .icon-history-remove {
    &:focus, &:hover {
      color: var(--el-color-danger);
    }
  }
}

.theme-dark {
  .mo-directory-divider {
    &::after {
      background: var(--lc-border-base);
    }
  }
  .mo-directory-list {
    &> li {
      color: var(--lc-text-primary);
      &:focus, &:hover {
        background-color: #4a4a4a;
      }
      /* 深色下上面那条 color 会盖掉高亮文字色（同特异性、后来者胜），这里补回 */
      &.is-current {
        background-color: var(--lc-color-primary-light);
        color: var(--lc-color-primary);

        &:focus, &:hover {
          background-color: var(--lc-color-primary-lighter);
        }
      }
    }
  }
}
</style>
