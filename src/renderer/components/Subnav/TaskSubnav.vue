<template>
  <nav class="subnav-inner task-subnav">
    <div class="subnav-scroll-area">
    <!-- 下载区 -->
    <div class="subnav-section">
      <div class="subnav-section-label">{{ t('subnav.download-section') }}</div>
      <ul class="task-nav-list">
        <li
          @click="() => nav('all')"
          :class="[ current === 'all' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-all" width="20" height="20" />
          </i>
          <span>{{ t('task.all') }}</span>
          <span class="subnav-count">{{ taskCounts.all }}</span>
        </li>
        <li
          @click="() => nav('active')"
          :class="[ current === 'active' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-active" width="20" height="20" />
          </i>
          <span>{{ t('task.active') }}</span>
          <span class="subnav-count">{{ taskCounts.active }}</span>
        </li>
        <li
          @click="() => nav('waiting')"
          :class="[ current === 'waiting' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-waiting" width="20" height="20" />
          </i>
          <span>{{ t('task.waiting') }}</span>
          <span class="subnav-count">{{ taskCounts.waiting }}</span>
        </li>
        <li
          @click="() => nav('stopped')"
          :class="[ current === 'stopped' ? 'active' : '' ]"
        >
          <i class="subnav-icon">
            <mo-icon name="subnav-stopped" width="20" height="20" />
          </i>
          <span>{{ t('task.stopped') }}</span>
          <span class="subnav-count">{{ taskCounts.stopped }}</span>
        </li>
      </ul>
    </div>

    <!-- 类型区（可折叠） -->
    <div class="subnav-section">
      <div
        class="subnav-section-label subnav-section-toggle"
        @click="toggleTypeCollapsed"
      >
        <span>{{ t('subnav.type-section') }}</span>
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
    <!-- 引擎状态 + 限速快切：与下方的速度显示同一个单元。状态在左、限速滑块在右，
         速度框带着边框盖在这块信息面板的下沿上（面板从速度框内部向上延伸） -->
    <div class="subnav-status-unit">
      <div class="subnav-engine-panel">
        <!-- 左侧：最近 24 次采样的上下行速度柱状图（上行=下载在基线以上，下行=上传在基线以下） -->
        <div
          class="subnav-speed-chart"
          :title="chartTitle"
        >
          <svg viewBox="0 0 96 22" preserveAspectRatio="none">
            <line
              class="subnav-speed-chart__base"
              :class="{ 'is-solid': !chartIdle }"
              x1="0"
              x2="96"
              y1="11"
              y2="11"
            />
            <rect
              v-for="bar in chartBars"
              :key="`d${bar.x}`"
              class="subnav-speed-chart__download"
              :x="bar.x"
              :y="bar.yDownload"
              :width="bar.w"
              :height="bar.hDownload"
            />
            <rect
              v-for="bar in chartBars"
              :key="`u${bar.x}`"
              class="subnav-speed-chart__upload"
              :x="bar.x"
              :y="bar.yUpload"
              :width="bar.w"
              :height="bar.hUpload"
            />
            <!-- 空状态标签：底下一小块和面板同色的"遮罩"把点线断开，
                 有流量时它和文字一起淡出，同时点线被拉成长划（见 __base 的 dasharray 过渡） -->
            <g
              class="subnav-speed-chart__idle-label"
              :class="{ 'is-faded': !chartIdle }"
            >
              <rect
                x="30"
                y="5.5"
                width="36"
                height="11"
                rx="2"
              />
              <text
                x="48"
                y="11"
                text-anchor="middle"
                dominant-baseline="central"
              >{{ t('subnav.chart-idle') }}</text>
            </g>
          </svg>
        </div>
        <mo-segmented-slider
          v-model="limitMode"
          class="subnav-limit-switch"
          size="mini"
          :options="limitOptions"
        />
      </div>

      <!-- 速度显示：背景与侧边栏完全一致，并压在上方面板之上 -->
      <div class="subnav-speed-box">
        <span class="subnav-speed-item">
          <span class="subnav-speed-label">↑</span>
          <span class="subnav-speed-value">{{ bytesToSize(stat.uploadSpeed) }}/s</span>
        </span>
        <span class="subnav-speed-divider"></span>
        <span class="subnav-speed-item">
          <span class="subnav-speed-label">↓</span>
          <span class="subnav-speed-value">{{ bytesToSize(stat.downloadSpeed) }}/s</span>
        </span>
      </div>
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
        <span>{{ t('subnav.preferences') }}</span>
      </li>
    </ul>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { bytesToSize } from '@shared/utils'
import { useAppStore, useTaskStore, usePreferenceStore } from '@/store'
import { storeToRefs } from 'pinia'

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

defineProps({
  current: {
    type: String,
    default: 'all'
  }
})

defineOptions({ name: 'mo-task-subnav' })

const router = useRouter()
const { t } = i18n.global

const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { stat, preferenceVisible } = storeToRefs(appStore)
const { categoryFilter } = storeToRefs(taskStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

/**
 * 两档限速预设来自「设置 → 传输设置 → 下载与限速」里的四项
 * （`speed-limit-normal-*` / `speed-limit-low-*`，应用层键），
 * 切换滑块只是把这组值写进引擎的 `max-overall-*-limit`。
 */
function speedLimitBps (raw) {
  if (raw === undefined || raw === null || raw === '') {
    return 0
  }
  const m = `${raw}`.trim().match(/^(\d+(?:\.\d+)?)\s*([KMG])?/i)
  if (!m) {
    return 0
  }
  const unit = (m[2] || '').toUpperCase()
  const mul = unit === 'G' ? 1024 ** 3 : unit === 'M' ? 1024 ** 2 : unit === 'K' ? 1024 : 1
  return Math.round(parseFloat(m[1]) * mul)
}

const limitPresets = computed(() => {
  const c = preferenceConfig.value || {}
  const pick = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : v)
  return {
    normal: {
      download: pick(c.speedLimitNormalDownload, 0),
      upload: pick(c.speedLimitNormalUpload, 0)
    },
    low: {
      download: pick(c.speedLimitLowDownload, '512K'),
      upload: pick(c.speedLimitLowUpload, '64K')
    }
  }
})

// 当前实际限速 == 低速预设 ⇒ 低速档；两档预设相同时永远算正常（否则会误判）
const isLowSpeed = computed(() => {
  const { maxOverallDownloadLimit, maxOverallUploadLimit } = preferenceConfig.value || {}
  const { normal, low } = limitPresets.value
  const samePreset = speedLimitBps(normal.download) === speedLimitBps(low.download) &&
    speedLimitBps(normal.upload) === speedLimitBps(low.upload)
  if (samePreset) {
    return false
  }
  return speedLimitBps(maxOverallDownloadLimit) === speedLimitBps(low.download) &&
    speedLimitBps(maxOverallUploadLimit) === speedLimitBps(low.upload)
})

/**
 * 左侧的速度迷你图：把每秒的上下行速度记成一根柱子（下载在基线上方、上传在下方），
 * 只保留最近 24 个采样（正好像素级 4px 一根）。
 *
 * 采样是**事件驱动**的：`stat` 每秒被全局轮询替换一次（空闲时会退避到 30 s，
 * 那时速度本来就是 0，曲线停住不画也无所谓），所以这里不再自己起定时器。
 */
const CHART_COLUMNS = 24
const CHART_VIEW_W = 96
const CHART_HALF_H = 10
// 上传柱画在基线下方，留 1px 空隙（否则柱子会压在横杠上）
const CHART_UPLOAD_TOP = 12
const CHART_UPLOAD_H = 9
const CHART_PITCH = CHART_VIEW_W / CHART_COLUMNS
const CHART_TICK_MS = 1000

const emptySample = () => ({ download: 0, upload: 0 })

// 一开始就摆满一列 0：曲线从"空闲"开始，不会出现一块空白
const chartSamples = ref(Array.from({ length: CHART_COLUMNS }, emptySample))

/**
 * 每 1 秒推进一格 —— **必须按时间走**，不能只在 `stat` 变化时采样：
 * 空闲时全局轮询会退避到 30 秒一次，图表就会冻在那里不动。
 * 这里只读当前 `stat`（没有额外 RPC），速度数字和曲线永远是同一份数据。
 */
function pushChartSample () {
  const current = stat.value || {}
  chartSamples.value = chartSamples.value.slice(1).concat({
    download: Number(current.downloadSpeed) || 0,
    upload: Number(current.uploadSpeed) || 0
  })
}

let chartTimer = null
onMounted(() => {
  chartTimer = setInterval(pushChartSample, CHART_TICK_MS)
})
onBeforeUnmount(() => {
  if (chartTimer) {
    clearInterval(chartTimer)
    chartTimer = null
  }
})

const chartPeak = computed(() => chartSamples.value.reduce(
  (max, sample) => Math.max(max, sample.download, sample.upload),
  0
))

// 一条流量都没有 ⇒ 空状态（虚线 + 「空闲」，同时淡出柱子）
const chartIdle = computed(() => chartPeak.value === 0)

// 量程 = 峰值留 12% 余量（不取整到 1/2/5，否则柱子会被压成半高）。
// 柱子高度本身有过渡，量程变化看起来也是平滑的重排，而不是跳。
const chartScale = computed(() => Math.max(1024, chartPeak.value * 1.12))

const chartBars = computed(() => {
  const scale = chartScale.value
  // 非零给 0.6 的最小可见高度，否则小流量整条看不见
  const toHeight = (value, max) => {
    if (value <= 0) {
      return 0
    }
    return +Math.max(0.6, Math.min(max, (value / scale) * max)).toFixed(2)
  }
  return chartSamples.value.map((sample, index) => {
    const hDownload = toHeight(sample.download, CHART_HALF_H)
    const hUpload = toHeight(sample.upload, CHART_UPLOAD_H)
    return {
      // 列位置固定（第 i 列永远在同一个 x），跑的是**数据**不是柱子 ——
      // 这样每格只改 height/y，CSS 过渡才能把变化补成连续的波形
      x: +(index * CHART_PITCH + 0.7).toFixed(2),
      w: +(CHART_PITCH - 1.4).toFixed(2),
      hDownload,
      yDownload: +(CHART_HALF_H - hDownload).toFixed(2),
      hUpload,
      yUpload: CHART_UPLOAD_TOP
    }
  })
})

// 悬停给具体数值（图表本身没刻度）
const chartTitle = computed(() => {
  const last = chartSamples.value[chartSamples.value.length - 1]
  const peak = chartPeak.value
  const fmt = (v) => (v > 0 ? `${bytesToSize(v)}/s` : '0')
  const lines = [`↓ ${fmt(last.download)}`, `↑ ${fmt(last.upload)}`]
  if (peak > 0) {
    lines.push(`${t('subnav.chart-peak')} ${bytesToSize(peak)}/s`)
  }
  return lines.join('\n')
})

// 滑块读的是"当前实际档位"，选它等于改配置（见 applySpeedLimit）
const limitMode = computed({
  get: () => (isLowSpeed.value ? 'low' : 'normal'),
  set: (mode) => applySpeedLimit(mode)
})

// 提示文案必须与「设置」里填的完全一致：直接读 "512K" 里的数字和单位，
// 不要经字节数再格式化（bytesToSize 走 1000 进制，512K 会显示成 528.4 KB）
const formatLimit = (raw) => {
  if (!speedLimitBps(raw)) {
    return t('subnav.speed-limit-unlimited')
  }
  const m = `${raw}`.trim().match(/^(\d+(?:\.\d+)?)\s*([KMG])?/i)
  if (!m) {
    return t('subnav.speed-limit-unlimited')
  }
  return `${m[1]} ${(m[2] || 'K').toUpperCase()}B/s`
}

// 侧边栏地方小，不给标签，靠悬停提示说明两档到底限到多少（跟随设置里的预设）
const limitOptions = computed(() => {
  const { normal, low } = limitPresets.value
  const tip = (preset) => `↓ ${formatLimit(preset.download)} · ↑ ${formatLimit(preset.upload)}`
  return [
    { value: 'normal', label: t('subnav.speed-limit-normal'), tooltip: tip(normal) },
    { value: 'low', label: t('subnav.speed-limit-low'), tooltip: tip(low) }
  ]
})

/**
 * 快速切换限速档位。
 *
 * 写的是与「设置 → 下载与限速」同一组系统配置键，主进程 savePreference
 * 会顺带 changeGlobalOption 热更新到运行中的引擎 —— 不用重启、不用开设置页。
 * 当前档位再点一次直接忽略，避免多余落盘。
 */
function applySpeedLimit (mode) {
  const low = mode === 'low'
  if (low === isLowSpeed.value) {
    return
  }
  const preset = low ? limitPresets.value.low : limitPresets.value.normal
  preferenceStore.save({
    maxOverallDownloadLimit: preset.download,
    maxOverallUploadLimit: preset.upload
  })
}

// 类型区的折叠状态持久化（localStorage），重启应用后保持上次状态
let savedCollapsed = false
try {
  savedCollapsed = typeof window !== 'undefined' && window.localStorage.getItem('taskSubnavTypeCollapsed') === '1'
} catch (_) {}

const typeCollapsed = ref(savedCollapsed)

const taskCounts = computed(() => taskStore.filteredTaskCounts)
const categoryCounts = computed(() => taskStore.categoryCounts)

const categories = computed(() => [
  { value: '', label: t('task.category-all'), icon: 'subnav-type-all' },
  { value: 'archives', label: t('task.category-archives'), icon: 'subnav-archives' },
  { value: 'programs', label: t('task.category-programs'), icon: 'subnav-programs' },
  { value: 'videos', label: t('task.category-videos'), icon: 'subnav-videos' },
  { value: 'music', label: t('task.category-music'), icon: 'subnav-music' },
  { value: 'images', label: t('task.category-images'), icon: 'subnav-images' },
  { value: 'documents', label: t('task.category-documents'), icon: 'subnav-documents' }
])

function toggleTypeCollapsed () {
  typeCollapsed.value = !typeCollapsed.value
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('taskSubnavTypeCollapsed', typeCollapsed.value ? '1' : '0')
    }
  } catch (_) {}
}

function nav (status = 'active') {
  router.push({ path: `/task/${status}` }).catch(err => {
    console.log(err)
  })
}

function selectCategory (value) {
  taskStore.updateCategoryFilter(value)
  taskStore.fetchList()
}

function openPreference () {
  // 偏好设置已改为内嵌弹窗：点击打开弹窗，已打开时关闭
  if (preferenceVisible.value) {
    appStore.hidePreferenceDialog()
    return
  }
  appStore.showPreferenceDialog()
}
</script>

<style lang="scss">
.subnav-inner.task-subnav {
  /* 28px = 右侧任务面板顶部间隙 8px + 面板头部让位 20px（macOS 基准），
     导航首个分区标签与面板头部搜索框同高 */
  margin-top: 28px;
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: calc(100% - 28px);

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

  /* 引擎状态 + 限速快切 + 速度显示 = 一个单元。
     宽度由 `.subnav-bottom` 决定，两段左右内边距一致（10px），内容天然对齐。 */
  .subnav-status-unit {
    position: relative;
    flex-shrink: 0;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
  }

  /* 上方信息面板：左边一盏引擎状态灯、右边限速滑块（各行其位，中间留白）。
     下沿故意留出 10px 并被速度框压住 —— 视觉上它从速度框内部向上延伸；
     底部两个角是直角，被速度框的圆角切出来的那一点才不会露馅 */
  .subnav-engine-panel {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    /* 左右 8px（比速度框的 10px 略收，内容更贴近两边）；
       下内边距比上边少 2px，内容与速度框之间收一点 */
    padding: 8px 8px 6px;
    background: transparent;

    /* 背景单独画一层：比内容整体**低 2px**，并继续向下伸进速度框（10px），
       被速度框（z-index:1）盖住 —— 这就是"从速度框内部向上延伸"的那块底 */
    &::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 2px;
      bottom: -10px;
      background: var(--lc-bg-panel, #262a31);
      border-radius: 10px 10px 0 0;
      pointer-events: none;
    }

    > * {
      position: relative;
    }
  }

  /* 左侧速度迷你图：下载柱在基线以上、上传柱在基线以下，各占一半高度 */
  .subnav-speed-chart {
    flex: 1;
    min-width: 0;
    height: 22px;
    display: flex;
    overflow: hidden;

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* 基线：空闲时是"一个一个点"（stroke-dasharray 短划 + 大间隔），
       有流量时间隔收到 0 —— 点会被拉长、逐个连成一条实线。
       两种状态的颜色/粗细/透明度完全一致（用户要求"没空闲时跟空闲时一样清楚"）。 */
    &__base {
      stroke: var(--lc-text-secondary, #8b95a3);
      stroke-width: 1;
      stroke-linecap: round;
      opacity: 0.9;
      stroke-dasharray: 1 3.5;
      transition: stroke-dasharray 0.5s ease, opacity 0.5s ease;

      /* 点线只覆盖 1/(1+3.5)≈22% 的长度，连成实线后同样的 1px/0.9 会重三四倍，
         所以实线态压到 0.9px 宽 / 40% 透明 —— 两者看起来才是同一个量级 */
      &.is-solid {
        stroke-dasharray: 1 0;
        stroke-width: 0.9;
        opacity: 0.4;
      }
    }

    /* 柱子常驻，每格只改 y/height —— 过渡把它们补成连续流动的波形
       （0.8s 接近一拍，下一格来之前基本走完，看起来是"滑过去"而不是"跳"） */
    &__download {
      fill: var(--lc-color-primary, #4a9eff);
      transition: y 0.8s cubic-bezier(0.33, 1, 0.68, 1),
                  height 0.8s cubic-bezier(0.33, 1, 0.68, 1);
    }

    /* 上传换一个色相（绿）+ 基线下方：一眼能和蓝色的下载分开 */
    &__upload {
      fill: var(--lc-color-success, #67c23a);
      opacity: 0.8;
      transition: height 0.8s cubic-bezier(0.33, 1, 0.68, 1);
    }

    &__idle-label {
      opacity: 1;
      transition: opacity 0.3s ease;

      &.is-faded {
        opacity: 0;
      }

      /* 和面板底色同色的遮罩：把点线在文字这一小段"挖空" */
      rect {
        fill: var(--lc-bg-panel, #262a31);
      }

      text {
        fill: var(--lc-text-secondary, #999);
        font-size: 9px;
        letter-spacing: 0.5px;
      }
    }
  }

  /* 限速滑块 = 全站自定义的 SegmentedSlider，侧边栏只有 200px 宽，
     这里把它压到 22px 高 / 11px 字（指示器仍是同一个主色高亮块） */
  .subnav-limit-switch {
    flex-shrink: 0;

    &.lc-segmented {
      height: 22px;
      padding: 1px;
      border-radius: 7px;
    }

    .lc-segmented__indicator {
      top: 1px;
      left: 1px;
      height: 18px;
      border-radius: 5px;
    }

    .lc-segmented__item {
      height: 18px;
      padding: 0 8px;
      font-size: 11px;
    }
  }

  /* 速度显示：带边框、底色与侧边栏完全一致，并压在上方面板之上 */
  .subnav-speed-box {
    position: relative;
    z-index: 1;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--lc-border-base, #e0e0e0);
    border-radius: 10px;
    /* 与侧边栏完全同色：默认主题里 --lc-bg-subnav 就是侧边栏那层底色，
       特殊模式（背景图 / macOS 原生透明）由文件末尾的覆盖规则改成 transparent */
    background: var(--lc-bg-subnav, transparent);
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

      span:not(.subnav-count) {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}

.subnav.three-column-subnav.is-auto-hide-aside .subnav-inner.task-subnav {
  height: calc(100% - 28px);
}

/* macOS：28px 让开左上角红绿灯（首个分区标签落在红绿灯下方）；
   面板头部已上移到 14px，导航顶部不再与头部对齐，
   见 Task/TaskView.vue 的 `#app.is-mac .content.panel .panel-header` */
#app.is-mac .subnav-inner.task-subnav {
  margin-top: 28px;
  height: calc(100% - 28px);
}

/* Windows/Linux 关闭自定义标题栏（用系统原生标题栏/菜单栏）时，
   面板顶部只有 8px 间隙，导航跟着上移 */
#app:not(.has-custom-titlebar):not(.is-mac) .subnav-inner.task-subnav {
  margin-top: 14px;
  height: calc(100% - 14px);
}

/* Windows/Linux 保留自定义标题栏（38px 窗口按钮带）时，
   左侧导航与面板头部对齐：头部在面板内让出 38px 按钮带，
   顶部落在 52px（面板 8px + 头部 margin 44px），见 Task/TaskView.vue */
#app.has-custom-titlebar .subnav-inner.task-subnav {
  margin-top: 52px;
  height: calc(100% - 52px);
}

/* 侧边栏在「背景图」与「macOS 原生透明」两种模式下本身是透明的
   （透出背景图 / 毛玻璃材质），速度框跟着透明才叫"与侧边栏完全一致" */
html.has-app-background-image .subnav-inner.task-subnav .subnav-speed-box,
html.mac-native-transparent .subnav-inner.task-subnav .subnav-speed-box {
  background-color: transparent;
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
