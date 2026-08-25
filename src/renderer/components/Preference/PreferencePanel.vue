<template>
  <el-container
    class="main panel preference-panel"
    direction="horizontal"
    :class="{ 'preference-standalone': isStandalone }"
    style="height: 100vh"
  >
    <el-aside v-if="isStandalone" width="220px" class="subnav preference-subnav-left">
      <div class="preference-subnav-wrapper">
        <router-view name="subnav" />
        <div class="preference-subnav-search">
          <button
            :class="['floating-bar-search preference-search', { 'is-hovered': isPreferenceSearchHovering, 'is-pressed': isPreferenceSearchPressed }]"
            @click="focusPreferenceSearch"
            @mouseenter="handlePreferenceSearchMouseEnter"
            @mouseleave="handlePreferenceSearchMouseLeave"
            @mousedown="handlePreferenceSearchMouseDown"
            @mouseup="handlePreferenceSearchMouseUp"
          >
            <el-icon class="preference-search-icon"><Search /></el-icon>
            <input
              ref="preferenceSearchInput"
              class="floating-bar-search-input"
              type="text"
              :placeholder="t('preferences.search-settings')"
              v-model="preferenceSearchValue"
              @click.stop
              @focus="handlePreferenceSearchFocus"
              @blur="handlePreferenceSearchBlur"
            >
          </button>
        </div>
      </div>
    </el-aside>
    <template v-if="isThreeColumn">
      <el-aside v-if="showThreeColumnSubnav" width="220px" class="subnav three-column-subnav">
        <router-view name="subnav" />
      </el-aside>
    </template>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
        v-if="!isStandalone"
        class="panel-header"
        height="84"
      >
        <h4 class="hidden-xs-only">
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
        <h4 class="hidden-sm-and-up">
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
      </el-header>
      <router-view name="form" ref="preferenceForm" />
    </el-container>

    <template v-if="showSmallScreenNav">
      <div
        class="subnav-small-screen subnav-right"
      >
        <ul class="menu small-menu">
          <li
            v-for="item in subnavItems"
            :key="item.key"
            @click="navPreference(item.key)"
            :class="{ active: isActive(item.route) }"
          >
            <span class="subnav-small-screen__text">{{ item.title }}</span>
          </li>
        </ul>
      </div>
    </template>
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import i18n from '@/plugins/i18n'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import Aside from '@/components/Aside/SettingsAside'
import PreferenceAdvanced from '@/components/Preference/Advanced'

const { t } = i18n.global
const route = useRoute()
const router = useRouter()
const instance = getCurrentInstance()

const preferenceStore = usePreferenceStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)

// --- Data ---
const windowWidth = ref(0)
const isPreferenceSearchHovering = ref(false)
const isPreferenceSearchFocused = ref(false)
const isPreferenceSearchPressed = ref(false)
let preferenceSearchTimer = null
const isPreferenceSearchAutoNavigating = ref(false)
let preferenceSearchToken = 0
const pendingPreferenceSearchKeyword = ref('')
const preferenceSearchIndex = ref({})
const preferenceSearchStaticIndexReady = ref(false)
const preferenceSearchLastIndexedPath = ref('')
const preferenceSearchInput = ref(null)
const preferenceForm = ref(null)
let _handleWindowResize = null
let _preferenceSearchMouseUpHandler = null

// --- Computed ---
const autoHideAside = computed(() => preferenceConfig.value.autoHideAside)
const preferenceSearchKeyword = computed(() => preferenceStore.searchKeyword)

const preferenceSearchValue = computed({
  get () { return preferenceSearchKeyword.value },
  set (val) { preferenceStore.updateSearchKeyword(val) }
})

const preferenceBasePath = computed(() => {
  const path = `${route.path || ''}`
  return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
})

const isStandalone = computed(() => preferenceBasePath.value === '/preference-window')

const isSmallWindow = computed(() => {
  const width = windowWidth.value || (typeof window !== 'undefined' ? window.innerWidth : 0)
  if (!width) return false
  return width < 700
})

const isThreeColumn = computed(() => !isSmallWindow.value)
const showThreeColumnSubnav = computed(() => !isStandalone.value && isThreeColumn.value)
const showSmallScreenNav = computed(() => !isStandalone.value && !isThreeColumn.value)

const subnavItems = computed(() => {
  const base = preferenceBasePath.value
  return [
    { key: 'basic', title: t('preferences.basic'), route: `${base}/basic` },
    { key: 'appearance', title: t('preferences.appearance'), route: `${base}/appearance` },
    { key: 'transfer', title: t('preferences.transfer-settings'), route: `${base}/transfer` },
    { key: 'bt', title: t('preferences.bt-settings'), route: `${base}/bt` },
    { key: 'task', title: t('preferences.task-manage'), route: `${base}/task` },
    { key: 'file', title: t('preferences.file-manage'), route: `${base}/file` },
    { key: 'advanced', title: t('preferences.advanced'), route: `${base}/advanced` }
  ]
})

const subnavs = computed(() => subnavItems.value.map(item => ({
  key: item.key,
  title: item.title,
  route: item.route
})))

const title = computed(() => {
  const rawPath = `${route.path || ''}`
  const parts = rawPath.replace(/^\/preference(?:-window)?\//, '').split('/')
  const key = parts && parts[0] ? parts[0] : 'basic'
  const subnav = subnavs.value.find(item => item.key === key)
  return subnav ? subnav.title : t('preferences.basic')
})

const currentPreferenceCategory = computed(() => {
  const rawPath = `${route.path || ''}`
  const parts = rawPath.replace(/^\/preference(?:-window)?\//, '').split('/')
  return parts && parts[0] ? parts[0] : 'basic'
})

// --- Watchers ---
watch(preferenceSearchKeyword, (val) => {
  schedulePreferenceSearch(val)
})
watch(() => route.path, () => {
  preferenceSearchLastIndexedPath.value = ''
})

// --- Methods ---
function navPreference (category) {
  const base = preferenceBasePath.value
  router.push({ path: `${base}/${category}` }).catch(err => {
    console.log(err)
  })
}

function isActive (path) {
  const current = route.path
  if (current === path) return true
  const base = preferenceBasePath.value
  return current === base && path === `${base}/basic`
}

function handleWindowResize () {
  if (typeof window === 'undefined') return
  windowWidth.value = window.innerWidth || 0
}

function focusPreferenceSearch () {
  nextTick(() => {
    const input = preferenceSearchInput.value
    if (input && input.focus) {
      input.focus()
    }
  })
}

function handlePreferenceSearchMouseEnter () {
  isPreferenceSearchHovering.value = true
}
function handlePreferenceSearchMouseLeave () {
  isPreferenceSearchHovering.value = false
  isPreferenceSearchPressed.value = false
  removePreferenceSearchMouseUpListener()
}
function handlePreferenceSearchMouseDown () {
  isPreferenceSearchPressed.value = true
  addPreferenceSearchMouseUpListener()
}
function handlePreferenceSearchMouseUp () {
  isPreferenceSearchPressed.value = false
  removePreferenceSearchMouseUpListener()
}
function handlePreferenceSearchFocus () {
  isPreferenceSearchFocused.value = true
}
function handlePreferenceSearchBlur () {
  isPreferenceSearchFocused.value = false
}

function addPreferenceSearchMouseUpListener () {
  if (typeof window === 'undefined') return
  if (!_preferenceSearchMouseUpHandler) {
    _preferenceSearchMouseUpHandler = () => handlePreferenceSearchMouseUp()
  }
  window.addEventListener('mouseup', _preferenceSearchMouseUpHandler)
}
function removePreferenceSearchMouseUpListener () {
  if (typeof window === 'undefined' || !_preferenceSearchMouseUpHandler) return
  window.removeEventListener('mouseup', _preferenceSearchMouseUpHandler)
}

function schedulePreferenceSearch (keyword) {
  if (preferenceSearchTimer) {
    clearTimeout(preferenceSearchTimer)
    preferenceSearchTimer = null
  }
  const normalized = `${keyword || ''}`.trim()
  if (!normalized) {
    pendingPreferenceSearchKeyword.value = ''
    return
  }
  if (isPreferenceSearchAutoNavigating.value) {
    pendingPreferenceSearchKeyword.value = normalized
    return
  }
  preferenceSearchTimer = setTimeout(() => {
    runPreferenceSearch(normalized)
  }, 200)
}

async function runPreferenceSearch (keyword) {
  const normalized = `${keyword || ''}`.trim().toLowerCase()
  if (!normalized) return
  const token = ++preferenceSearchToken
  if (isPreferenceSearchAutoNavigating.value) {
    pendingPreferenceSearchKeyword.value = keyword
    return
  }
  ensurePreferenceSearchStaticIndex()
  const currentCategory = currentPreferenceCategory.value
  if (preferenceSearchLastIndexedPath.value !== route.path) {
    await updatePreferenceSearchIndexFromCurrentForm()
    preferenceSearchLastIndexedPath.value = route.path
  }
  if (token !== preferenceSearchToken) return
  const matchedCategory = findPreferenceSearchMatch(normalized, currentCategory)
  if (!matchedCategory || matchedCategory === currentCategory) return
  isPreferenceSearchAutoNavigating.value = true
  await navigateToPreferenceCategory(matchedCategory)
  isPreferenceSearchAutoNavigating.value = false
  if (pendingPreferenceSearchKeyword.value) {
    const nextKeyword = pendingPreferenceSearchKeyword.value
    pendingPreferenceSearchKeyword.value = ''
    runPreferenceSearch(nextKeyword)
  }
}

async function navigateToPreferenceCategory (category) {
  const base = preferenceBasePath.value
  const targetPath = `${base}/${category}`
  if (route.path !== targetPath) {
    await router.push({ path: targetPath }).catch(() => {})
  }
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
}

function ensurePreferenceSearchStaticIndex () {
  if (preferenceSearchStaticIndexReady.value) return
  const index = { ...preferenceSearchIndex.value }
  const entries = [
    { key: 'advanced', component: PreferenceAdvanced }
  ]
  entries.forEach(entry => {
    const keys = extractPreferenceKeysFromComponent(entry.component)
    if (!keys.length) return
    const text = keys.map(key => `${t(key) || ''}`).join(' ').toLowerCase()
    if (text) {
      index[entry.key] = text
    }
  })
  preferenceSearchIndex.value = index
  preferenceSearchStaticIndexReady.value = true
}

function extractPreferenceKeysFromComponent (component) {
  const render = component && (component.render || (component.options && component.options.render))
  if (typeof render !== 'function') return []
  const source = `${render.toString() || ''}`
  const matches = source.match(/preferences\.[a-z0-9-]+/gi) || []
  return Array.from(new Set(matches))
}

async function updatePreferenceSearchIndexFromCurrentForm () {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  const formComponent = preferenceForm.value
  if (!formComponent || !formComponent.$el) return
  const el = formComponent.$el
  const cards = el.querySelectorAll('.preference-card, .preference-bottom-actions')
  const currentCategory = currentPreferenceCategory.value
  const nextIndex = { ...preferenceSearchIndex.value }
  if (!cards.length) {
    const text = `${el.textContent || ''}`.toLowerCase()
    nextIndex[currentCategory] = text
    preferenceSearchIndex.value = nextIndex
    return
  }
  const basicCategories = new Set(['basic', 'appearance', 'transfer', 'bt', 'task', 'file'])
  if (basicCategories.has(currentCategory)) {
    const categoryTextMap = {}
    Array.from(cards).forEach(card => {
      const text = `${card.textContent || ''}`.toLowerCase()
      const rawCategory = `${card.dataset.category || ''}`.trim()
      const categories = rawCategory ? rawCategory.split(/\s+/) : [currentCategory]
      categories.forEach(category => {
        if (!categoryTextMap[category]) {
          categoryTextMap[category] = text
        } else {
          categoryTextMap[category] = `${categoryTextMap[category]} ${text}`
        }
      })
    })
    Object.keys(categoryTextMap).forEach(category => {
      nextIndex[category] = categoryTextMap[category]
    })
    preferenceSearchIndex.value = nextIndex
    return
  }
  const text = Array.from(cards).map(card => card.textContent || '').join(' ').toLowerCase()
  nextIndex[currentCategory] = text
  preferenceSearchIndex.value = nextIndex
}

function findPreferenceSearchMatch (keyword, currentCategory) {
  const index = preferenceSearchIndex.value || {}
  const categories = [currentCategory, ...subnavItems.value.map(item => item.key).filter(key => key !== currentCategory)]
  for (const key of categories) {
    const text = index[key]
    if (text && text.includes(keyword)) {
      return key
    }
  }
  return ''
}

// --- Lifecycle ---
onMounted(() => {
  if (typeof window !== 'undefined') {
    handleWindowResize()
    _handleWindowResize = () => handleWindowResize()
    window.addEventListener('resize', _handleWindowResize)
  }
})

onBeforeUnmount(() => {
  if (preferenceSearchTimer) {
    clearTimeout(preferenceSearchTimer)
    preferenceSearchTimer = null
  }
  if (typeof window !== 'undefined' && _handleWindowResize) {
    window.removeEventListener('resize', _handleWindowResize)
    _handleWindowResize = null
  }
  removePreferenceSearchMouseUpListener()
})
</script>

<style lang="scss">
.subnav-small-screen.subnav-right {
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  background-color: transparent;
  border-radius: 100px;
  opacity: 0.5;
  transition: opacity 0.3s ease;
  padding: 8px;
}

.subnav-small-screen.subnav-right.is-auto-hide-subnav {
  transform: translateY(-50%) translateX(calc(100% - 12px));
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.subnav-small-screen.subnav-right.is-auto-hide-subnav:hover {
  transform: translateY(-50%) translateX(0);
}

.subnav-small-screen.subnav-right:hover {
  opacity: 1;
}

.subnav-small-screen .menu {
  list-style: none;
  padding: 0;
  margin: 0 auto;
  user-select: none;
  cursor: default;
}

.subnav-small-screen .menu > li {
  width: auto;
  height: auto;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.25s, border-radius 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  border: none;
  box-shadow: none;
  &:focus,
  &:active {
    outline: none;
    border: none;
    box-shadow: none;
  }
}

.subnav-small-screen .menu > li:hover {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.subnav-small-screen .menu > li.active {
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
}

.subnav-small-screen .menu svg {
  padding: 6px;
  color: #666;
  outline: none;
  border: none;
  box-shadow: none;
}

.subnav-small-screen__text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1;
  white-space: nowrap;
}

.subnav-small-screen .small-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 4px 0;
}

.subnav-small-screen .small-menu > li {
  margin-top: 8px;
  margin-bottom: 8px;
}

.subnav-small-screen .small-menu > li:first-child {
  margin-top: 0;
}

.subnav-small-screen .small-menu > li:last-child {
  margin-bottom: 0;
}

.preference-panel .panel-header {
  position: sticky;
  top: 0;
  z-index: 6;
  background-color: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(var(--app-ui-frosted-blur, 10px));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur, 10px));
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-dark .preference-panel .panel-header {
  background-color: rgba(45, 45, 45, 0.35);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

/* macOS 原生透明背景开启时：偏好设置面板 header 增加不透明度与模糊，
   确保标题区域文字在毛玻璃背景上清晰可读 */
html.mac-native-transparent .preference-panel .panel-header {
  background-color: var(--lc-bg-preference-header, rgba(255, 255, 255, 0.55));
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

html.mac-native-transparent.theme-dark .preference-panel .panel-header {
  background-color: var(--lc-bg-preference-header, rgba(38, 42, 49, 0.55));
}

/* macOS 原生透明背景：偏好设置内容面板不设单独背景，
   直接透出系统毛玻璃材质 */
html.mac-native-transparent .preference-panel .content.panel {
  background-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* macOS 原生透明背景：偏好设置卡片百分百不透明，保持纯色背景 */
html.mac-native-transparent .form-preference .preference-card {
  background-color: var(--lc-bg-panel, #ffffff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

html.mac-native-transparent.theme-dark .form-preference .preference-card {
  background-color: var(--lc-bg-panel, #262a31);
  border-color: rgba(255, 255, 255, 0.08);
}

.preference-panel:not(.preference-standalone) .form-preference {
  margin-top: -84px;
  padding-top: 96px;
}

.preference-standalone .preference-subnav-left {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.preference-subnav-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.preference-subnav-search {
  margin-top: auto;
  padding: 12px 16px 18px;
  flex-shrink: 0;
}

.preference-subnav-search .floating-bar-search {
  width: 100%;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: transparent;
  padding: 0 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  cursor: text;
  outline: none;
  transition: border-color 0.2s ease;

  &:hover,
  &.is-hovered,
  &:focus-within {
    border-color: var(--el-color-primary);
  }
}

.preference-subnav-search .floating-bar-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  padding: 0;
  height: 100%;
  min-width: 0;

  &::placeholder {
    color: var(--el-text-color-secondary);
    opacity: 0.6;
  }
}

.preference-subnav-search .floating-bar-search i {
  font-size: 14px;
  color: var(--lc-task-action);
  margin-right: 6px;
  flex-shrink: 0;
}

.theme-dark .preference-subnav-search .floating-bar-search {
  border-color: var(--lc-task-item-border);

  &:hover,
  &.is-hovered,
  &:focus-within {
    border-color: var(--el-color-primary);
  }
}

.theme-dark .preference-subnav-search .floating-bar-search-input {
  color: var(--lc-text-regular, #ddd);

  &::placeholder {
    color: var(--lc-text-secondary, #999);
    opacity: 0.6;
  }
}

.theme-dark .preference-subnav-search .floating-bar-search i {
  color: var(--lc-text-secondary, #999);
}

.preference-standalone .subnav {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.preference-standalone .subnav-inner {
  margin-top: 46px;
}

.preference-standalone .panel-header {
  border-bottom: none;
}

.preference-standalone .form-preference {
  padding-top: 16px;
  padding-bottom: 24px;
}

.preference-standalone .panel-content::-webkit-scrollbar-track {
  margin-top: 20px;
}

.form-preference {
  padding: 12px 16px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  .preference-card {
    background: transparent;
    border-radius: 12px;
    padding: 20px 24px;
    border: 1px solid var(--el-border-color-light);
    transition: all 0.3s ease;
  }

  .card-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-light);
    letter-spacing: 0.3px;
  }

  .card-content {
    padding-top: 0;
  }

  .el-switch__label {
    font-weight: normal;
    color: var(--el-text-color-regular);
    &.is-active {
      color: var(--el-text-color-regular);
    }
  }

  .el-checkbox__input.is-checked + .el-checkbox__label {
    color: var(--el-text-color-regular);
  }

  .el-form-item {
    a {
      color: var(--el-text-color-regular);
      text-decoration: none;
      &:hover {
        color: var(--el-text-color-primary);
        text-decoration: underline;
      }
      &:active {
        color: var(--el-text-color-primary);
      }
    }
  }

  .el-form-item.el-form-item--mini {
    margin-bottom: 16px;
  }

  .el-form-item__content {
    color: var(--el-text-color-regular);
    line-height: 1.6;
    /* Element Plus 的 .el-form-item__content 默认 display:flex; align-items:center; flex-wrap:wrap,
       但直接子元素（el-row、el-col、div 等）不会自动占满宽度，
       会被 inline-flex 压缩为内容宽度。这里确保每个直接子元素占满宽度，
       使多行内容正确垂直堆叠，同时不破坏 EP 默认的 flex-wrap 行为。 */
    & > * {
      flex-basis: 100%;
    }
  }

  .form-item-sub {
    margin-bottom: 12px;
    line-height: 1.6;
    &:last-of-type {
      margin-bottom: 0;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;

      .toggle-label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
        flex: 1;
        min-width: 0;
      }

      &.toggle-row--with-desc {
        align-items: center;

        .toggle-row__text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .toggle-desc {
          font-size: 12px;
          color: var(--el-text-color-secondary);
          line-height: 1.4;
          opacity: 0.7;
        }
      }
    }

    .sub-row-reverse {
      display: flex;
      align-items: center;
      flex-direction: row-reverse;
      justify-content: flex-end;
      gap: 10px;

      .sub-row-label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .form-item-sub-sub {
    margin-left: 24px;
    margin-bottom: 10px;
    padding-left: 12px;
    border-left: 2px solid var(--el-border-color-lighter);
    line-height: 1.6;

    .el-radio-group {
      .el-radio__label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .el-form-item__info {
    line-height: 1.6;
    margin-top: 6px;
  }

  .el-button {
    border-radius: 8px;
  }

  .el-button--small {
    border-radius: 6px;
  }
}

.theme-light.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Dark theme styles */
.theme-dark .form-preference {
  .preference-card {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .card-title {
    color: var(--lc-text-primary);
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
}

.theme-dark.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Ensure card width matches panel-header width */
@media only screen and (min-width: 568px) {
  .form-preference {
    padding-right: 29px !important;
  }
}

.form-actions {
  position: sticky;
  bottom: 0;
  left: auto;
  z-index: 10;
  width: -webkit-fill-available;
  box-sizing: border-box;
  padding: 24px 16px;
}

.action-link {
  cursor: pointer;
  color: var(--el-color-primary-light-2);
  &.update-available {
    font-weight: bold;
  }
  &:hover {
    color: var(--el-color-primary);
    text-decoration: underline;
  }
}

/* Language container styles for connected look */
.language-container {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.language-select {
  width: 100%;
  border-radius: 4px 4px 0 0 !important;
  border-bottom: none !important;
  margin-bottom: -1px !important;
  position: relative;
  z-index: 2;

  /* Light theme styles */
  .el-input__inner {
    background: var(--el-fill-color-blank) !important;
    border-color: var(--el-border-color) !important;
    color: var(--el-text-color-primary) !important;
  }

  .el-input__inner:focus {
    border-color: var(--el-color-primary) !important;
  }
}

/* Dark theme styles for better integration */
.theme-dark .language-select {
  .el-input__inner {
    background: var(--lc-bg-panel) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: var(--lc-text-primary) !important;
  }

  .el-input__inner:focus {
    border-color: var(--el-color-primary) !important;
  }
}

.undo-change-btn {
  width: 100%;
  border-radius: 0 0 4px 4px !important;
  margin-top: -2px !important;
  height: 32px;
  line-height: 30px;
  padding: 0 12px;
  background-color: var(--el-color-danger) !important;
  border-color: var(--el-color-danger) !important;
  color: var(--el-color-white) !important;
}
</style>
