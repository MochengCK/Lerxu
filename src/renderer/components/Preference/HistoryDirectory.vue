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

    <transition name="mo-history-fade">
      <div
        v-show="visible"
        class="mo-history-dropdown"
        :class="{ 'mo-history-dropdown--up': isUp }"
        :style="{ width: `${width}px` }"
        role="listbox"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
      >
        <el-empty class="mo-directory-empty" :image-size="48" v-if="empty" />
        <ul class="mo-directory-list" v-if="favoriteDirectories.length > 0">
          <li
            v-for="directory in favoriteDirectories"
            :key="directory"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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
  }
})

const emit = defineEmits(['selected'])
defineOptions({ name: 'mo-history-directory' })

const preferenceStore = usePreferenceStore()
const { config } = storeToRefs(preferenceStore)

const root = ref(null)
const visible = ref(false)
let closeTimer = null

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

const isUp = computed(() => `${props.placement}`.startsWith('top'))

function toggle () {
  visible.value = !visible.value
}

function openOnHover () {
  cancelClose()
  visible.value = true
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
  if (root.value && !root.value.contains(e.target) && visible.value) {
    visible.value = false
  }
}

function handleKeydown (e) {
  if (e.key === 'Escape' && visible.value) {
    visible.value = false
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
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick)
  document.removeEventListener('keydown', handleKeydown)
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

  .mo-history-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 3000;
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

  .mo-history-dropdown--up {
    top: auto;
    bottom: calc(100% + 6px);
  }
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
    }
  }
}
</style>
