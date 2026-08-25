<template>
  <el-aside width="78px" :class="['aside', { 'draggable': asideDraggable, 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isAsideProximityHovered }]" :style="vibrancy">
    <div class="aside-inner">
      <ul class="menu top-menu"></ul>
      <ul class="menu bottom-menu">
        <li
          @click="nav('/preference')"
          class="non-draggable"
          :class="{ active: currentPage === '/preference' }"
        >
          <mo-hover-tip
            effect="dark"
            :content="t('subnav.preferences')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-preference" width="20" height="20" />
          </mo-hover-tip>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import is from 'electron-is'
import { ipcRenderer } from 'electron'
import { useAppStore, usePreferenceStore } from '@/store'
import { storeToRefs } from 'pinia'
import '@/components/Icons/menu-preference'

defineOptions({ name: 'mo-aside' })

const route = useRoute()
const router = useRouter()
const { t } = i18n.global
const instance = getCurrentInstance()

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const { currentPage } = storeToRefs(appStore)

const isAsideProximityHovered = ref(false)

let asideMouseRaf = null
let asideMouseEvent = null
let handleWindowMouseMoveForAside = null

const autoHideAside = computed(() => preferenceStore.config?.autoHideAside ?? false)

const asideDraggable = computed(() => is.macOS())

const vibrancy = computed(() => is.macOS() ? { backgroundColor: 'transparent' } : {})

function updateAsideProximityHover (event) {
  if (!autoHideAside.value) {
    if (isAsideProximityHovered.value) {
      isAsideProximityHovered.value = false
    }
    return
  }
  if (!event) return
  const height = typeof window !== 'undefined' ? window.innerHeight : 0
  if (!height) return
  const el = instance.proxy.$el
  const zoneHeight = Math.max(el ? el.offsetHeight : 0, 120) + 100
  const centerY = height / 2
  const top = centerY - zoneHeight / 2
  const bottom = centerY + zoneHeight / 2
  const withinY = event.clientY >= top && event.clientY <= bottom
  const withinX = event.clientX <= 120
  const next = withinX && withinY
  if (next !== isAsideProximityHovered.value) {
    isAsideProximityHovered.value = next
  }
}

function handleMouseMove (event) {
  asideMouseEvent = event
  if (asideMouseRaf) return
  asideMouseRaf = window.requestAnimationFrame(() => {
    asideMouseRaf = null
    const lastEvent = asideMouseEvent
    asideMouseEvent = null
    updateAsideProximityHover(lastEvent)
  })
}

function nav (page) {
  if (page === '/preference') {
    ipcRenderer.send('open-preference-window')
    return
  }
  router.push({ path: page }).catch(err => {
    console.log(err)
  })
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    handleWindowMouseMoveForAside = (event) => handleMouseMove(event)
    window.addEventListener('mousemove', handleWindowMouseMoveForAside)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && handleWindowMouseMoveForAside) {
    window.removeEventListener('mousemove', handleWindowMouseMoveForAside)
    handleWindowMouseMoveForAside = null
  }
  if (asideMouseRaf) {
    window.cancelAnimationFrame(asideMouseRaf)
    asideMouseRaf = null
  }
})
</script>

<style lang="scss">
.aside.draggable {
  -webkit-app-region: drag;
}

.aside-inner {
  display: flex;
  height: 100%;
  flex-flow: column;
}

.menu > li.non-draggable,
.menu > li.non-draggable * {
  -webkit-app-region: no-drag;
}
.menu {
    list-style: none;
    padding: 0;
    margin: 0 auto;
    user-select: none;
    cursor: default;
    > li {
      width: 32px;
      height: 32px;
      margin-top: 24px;
      cursor: pointer;
      border-radius: 16px;
      transition: background-color 0.25s, border-radius 0.25s;
      display: flex;
      align-items: center;
      justify-content: center;
      &:hover {
        background-color: rgba(255, 255, 255, 0.15);
        border-radius: 8px;
      }
      &.active {
        background-color: rgba(255, 255, 255, 0.25);
        border-radius: 8px;
      }
    }
    svg {
      padding: 6px;
      color: #fff;
    }
  }
.top-menu {
  flex-grow: 1;
  min-height: 0;
}
.bottom-menu {
  margin-bottom: 24px;
  transform: translateY(-20px);
}
.aside.draggable {
  border-radius: 100px;
  background-color: var(--speedometer-background);
  opacity: 0.5;
  transition: opacity 0.3s ease;
  &:hover {
    opacity: 1;
  }
}
</style>
