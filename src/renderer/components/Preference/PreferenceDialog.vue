<template>
  <el-dialog
    v-model="dialogVisible"
    class="preference-dialog"
    modal-class="preference-dialog-overlay"
    append-to-body
    :modal="true"
    :close-on-click-modal="true"
    :show-close="true"
    destroy-on-close
    @open="onDialogOpen"
    @closed="onDialogClosed"
  >
    <template #header>
      <span class="preference-dialog-title">{{ t('app.preferences').replace(/\.\.\.$/, '') }}</span>
      <div
        class="pref-search"
        :class="{ 'is-focused': isSearchFocused }"
      >
        <el-icon class="pref-search__icon">
          <Search />
        </el-icon>
        <input
          ref="searchInput"
          v-model="searchKeyword"
          type="text"
          class="pref-search__input"
          :placeholder="t('preferences.search-settings')"
          @focus="isSearchFocused = true"
          @blur="onSearchBlur"
          @input="onSearchInput"
          @keydown.esc.prevent="clearSearch"
        >
        <span
          v-if="searchKeyword"
          class="pref-search__clear"
          @mousedown.prevent
          @click="clearSearch"
        >
          <el-icon><Close /></el-icon>
        </span>
      </div>
    </template>

    <div class="preference-dialog-body">
      <!-- 侧边栏导航 -->
      <nav class="preference-sidebar">
        <ul class="preference-nav-list">
          <li
            v-for="item in preferenceNavOptions"
            :key="item.value"
            class="preference-nav-item"
            :class="{ 'is-active': currentCategory === item.value }"
            @click="navPreference(item.value)"
          >
            <i class="preference-nav-icon">
              <mo-icon
                :name="item.icon"
                width="17"
                height="17"
              />
            </i>
            <span class="preference-nav-label">{{ item.label }}</span>
          </li>
        </ul>
      </nav>

      <!-- 右侧设置内容 -->
      <div
        ref="contentRef"
        class="preference-content"
      >
        <component
          :is="preferenceFormComponent"
          :category="currentCategory"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import i18n from '@/plugins/i18n'
import { useAppStore, usePreferenceStore } from '@/store'
import { storeToRefs } from 'pinia'
import { Search, Close } from '@element-plus/icons-vue'
import PreferenceBasic from '@/components/Preference/Basic.vue'
import PreferenceAdvanced from '@/components/Preference/Advanced.vue'

// 导入侧边栏导航图标
import '@/components/Icons/preference-basic'
import '@/components/Icons/preference-appearance'
import '@/components/Icons/preference-transfer'
import '@/components/Icons/preference-bt'
import '@/components/Icons/preference-extension'
import '@/components/Icons/preference-task'
import '@/components/Icons/preference-file'
import '@/components/Icons/preference-advanced'

const { t } = i18n.global
const appStore = useAppStore()
const preferenceStore = usePreferenceStore()

const { preferenceVisible, preferenceCategory } = storeToRefs(appStore)

const dialogVisible = computed({
  get: () => preferenceVisible.value,
  set: (val) => appStore.updatePreferenceVisible(val)
})

const currentCategory = computed(() => preferenceCategory.value || 'basic')

const contentRef = ref(null)
const searchInput = ref(null)
const isSearchFocused = ref(false)

// 侧边栏分类：按「应用本身 → 下载与传输 → 任务与文件 → 扩展与进阶」排列
const preferenceNavOptions = computed(() => [
  { value: 'basic', label: t('preferences.basic'), icon: 'preference-basic' },
  { value: 'appearance', label: t('preferences.appearance'), icon: 'preference-appearance' },
  { value: 'transfer', label: t('preferences.transfer-settings'), icon: 'preference-transfer' },
  { value: 'bt', label: t('preferences.bt-settings'), icon: 'preference-bt' },
  { value: 'task', label: t('preferences.task-manage'), icon: 'preference-task' },
  { value: 'file', label: t('preferences.file-manage'), icon: 'preference-file' },
  { value: 'extension', label: t('preferences.browser-extensions'), icon: 'preference-extension' },
  { value: 'advanced', label: t('preferences.advanced'), icon: 'preference-advanced' }
])

const preferenceFormComponent = computed(() => {
  switch (currentCategory.value) {
    case 'advanced':
      return PreferenceAdvanced
    default:
      return PreferenceBasic
  }
})

// --- 搜索 ---
const searchKeyword = computed({
  get: () => preferenceStore.searchKeyword,
  set: (val) => preferenceStore.updateSearchKeyword(val)
})

function onSearchBlur () {
  isSearchFocused.value = false
}

function clearSearch () {
  searchKeyword.value = ''
  preferenceStore.updateSearchKeyword('')
  clearRowFilter()
  nextTick(() => {
    if (searchInput.value) searchInput.value.focus()
  })
}

// 各分类下参与搜索的 i18n key，用于「当前分类没有命中时跳转到最近的命中分类」
const preferenceSearchIndex = computed(() => {
  return {
    basic: [
      'preferences.language', 'preferences.run-mode', 'preferences.shortcuts',
      'preferences.startup', 'preferences.open-at-login', 'preferences.auto-resume-all',
      'preferences.keep-window-state'
    ],
    appearance: [
      'preferences.theme', 'preferences.ui', 'preferences.background-image-select',
      'preferences.background-image-opacity',
      'preferences.background-image-frosted-strength',
      'preferences.background-ui-opacity', 'preferences.background-ui-opacity-scope',
      'preferences.background-ui-frosted-strength', 'preferences.background-ui-frosted-scope',
      'preferences.task-detail-frosted-strength',
      'preferences.hide-app-menu', 'preferences.auto-hide-window',
      'preferences.mac-native-transparent', 'preferences.show-progress-bar',
      'preferences.show-task-type-badge', 'preferences.task-detail-default-transparent',
      'preferences.tray-speedometer'
    ],
    transfer: [
      'preferences.default-dir', 'preferences.speed-limit',
      'preferences.transfer-speed-download'
    ],
    bt: [
      'preferences.bt-options', 'preferences.bt-seeding-settings',
      'preferences.bt-tracker', 'preferences.bt-transport-protocol',
      'preferences.bt-network-discovery', 'preferences.bt-port-settings',
      'preferences.bt-connections',
      'preferences.seed-ratio', 'preferences.seed-time', 'preferences.keep-seeding',
      'preferences.enable-dht', 'preferences.enable-dht6', 'preferences.enable-lpd',
      'preferences.enable-peer-exchange', 'preferences.enable-upnp',
      'preferences.enable-nat-pmp', 'preferences.bt-connect-protocol',
      'preferences.bt-save-metadata', 'preferences.bt-auto-download-content',
      'preferences.auto-sync-tracker', 'preferences.bt-auto-ban-bad-data',
      'preferences.bt-auto-ban-peer', 'preferences.bt-auto-ban-snubbing',
      'preferences.bt-auto-ban-zero-progress'
    ],
    extension: [
      'preferences.browser-extensions', 'preferences.extension-channel',
      'preferences.extension-takeover', 'preferences.extension-filters',
      'preferences.extension-video-sniff',
      'preferences.extension-intercept-all-downloads',
      'preferences.extension-silent-download',
      'preferences.extension-shift-toggle-enabled',
      'preferences.extension-skip-file-extensions',
      'preferences.extension-exclude-domains',
      'preferences.extension-min-file-size',
      'preferences.video-detection-settings'
    ],
    task: [
      'preferences.task-behavior', 'preferences.clipboard-settings',
      'preferences.max-concurrent-downloads', 'preferences.max-connection-per-server',
      'preferences.continue', 'preferences.new-task-show-downloading',
      'preferences.no-confirm-before-delete-task',
      'preferences.auto-purge-record', 'preferences.show-task-completed-window',
      'preferences.task-completed-notify', 'preferences.clipboard-auto-paste',
      'preferences.clipboard-auto-open-add-task',
      'preferences.auto-open-task-progress-window'
    ],
    file: [
      'preferences.file-handling', 'preferences.security',
      'preferences.auto-categorize-files', 'preferences.set-file-mtime-on-complete',
      'preferences.enable-security-scan', 'preferences.security-scan-tool',
      'preferences.custom-security-scan-path', 'preferences.downloading-file-suffix'
    ],
    advanced: [
      'preferences.auto-update', 'preferences.proxy', 'preferences.github-mirror',
      'preferences.rpc', 'preferences.download-protocol', 'preferences.engine',
      'preferences.video-merge', 'preferences.user-agent', 'preferences.developer'
    ]
  }
})

const preferenceSearchOrder = ['basic', 'appearance', 'transfer', 'bt', 'task', 'file', 'extension', 'advanced']

let searchTimer = null
let rowFilterTimer = null

function categoryMatches (category, keyword) {
  const keys = preferenceSearchIndex.value[category] || []
  return keys.some(key => t(key).toLowerCase().includes(keyword))
}

function onSearchInput () {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchPreferences()
  }, 180)
}

function searchPreferences () {
  const keyword = (searchKeyword.value || '').trim().toLowerCase()
  preferenceStore.updateSearchKeyword(keyword)
  if (!keyword) {
    clearRowFilter()
    return
  }
  // 当前分类已有命中则不跳转，避免用户正在浏览的分类被抢走
  if (!categoryMatches(currentCategory.value, keyword)) {
    const matchedCategory = preferenceSearchOrder.find(cat => categoryMatches(cat, keyword))
    if (matchedCategory && matchedCategory !== currentCategory.value) {
      appStore.updatePreferenceCategory(matchedCategory)
    }
  }
  scheduleRowFilter()
}

/* 行级搜索：命中的分组内只保留命中的设置行，让结果一眼可见。
   分组标题本身命中（例如搜索「代理」）而没有任何行命中时，保留整组。 */
function scheduleRowFilter () {
  if (rowFilterTimer) clearTimeout(rowFilterTimer)
  rowFilterTimer = setTimeout(() => {
    nextTick(applyRowFilter)
  }, 200)
}

function clearRowFilter () {
  if (rowFilterTimer) {
    clearTimeout(rowFilterTimer)
    rowFilterTimer = null
  }
  const root = contentRef.value
  if (!root) return
  root.querySelectorAll('.is-search-hidden').forEach(el => el.classList.remove('is-search-hidden'))
}

function applyRowFilter () {
  const root = contentRef.value
  if (!root) return
  const keyword = (searchKeyword.value || '').trim().toLowerCase()
  const cards = root.querySelectorAll('.preference-card')

  cards.forEach(card => {
    // 只处理「叶子行」，避免把仅用于布局的包装行一起隐藏
    const rows = Array.from(card.querySelectorAll('.form-item-sub'))
      .filter(row => !row.querySelector('.form-item-sub') && !row.querySelector('.form-item-sub-sub'))

    if (!keyword || rows.length === 0) {
      rows.forEach(row => row.classList.remove('is-search-hidden'))
      return
    }

    const matched = rows.filter(row => row.textContent.toLowerCase().includes(keyword))
    if (matched.length === 0) {
      rows.forEach(row => row.classList.remove('is-search-hidden'))
    } else {
      rows.forEach(row => row.classList.toggle('is-search-hidden', !matched.includes(row)))
    }
  })
}

function navPreference (category = 'basic') {
  appStore.updatePreferenceCategory(category)
}

// 切换分类时重置滚动位置与行过滤状态
watch(currentCategory, () => {
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
    if (searchKeyword.value) {
      scheduleRowFilter()
    } else {
      clearRowFilter()
    }
  })
})

// Cmd/Ctrl + F 聚焦搜索；Esc 有内容时先清空
function onDialogKeydown (event) {
  const isFind = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f'
  if (isFind) {
    event.preventDefault()
    if (searchInput.value) searchInput.value.focus()
  }
}

function onDialogOpen () {
  window.addEventListener('keydown', onDialogKeydown)
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
  })
}

function onDialogClosed () {
  window.removeEventListener('keydown', onDialogKeydown)
  preferenceStore.updateSearchKeyword('')
  isSearchFocused.value = false
  clearRowFilter()
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDialogKeydown)
  if (searchTimer) clearTimeout(searchTimer)
  if (rowFilterTimer) clearTimeout(rowFilterTimer)
})

// 弹窗关闭时重置搜索关键词
watch(dialogVisible, (val) => {
  if (!val) {
    preferenceStore.updateSearchKeyword('')
    clearRowFilter()
  }
})
</script>

<style lang="scss">
@import '@/components/Theme/Variables';
@import '@/components/Theme/Light/Variables';
@import './preference-dialog.scss';
</style>
