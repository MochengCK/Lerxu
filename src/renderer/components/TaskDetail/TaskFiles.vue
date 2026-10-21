<template>
  <div :class="['mo-task-files', { 'is-detail-mode': mode === 'DETAIL' }]" v-if="files">
    <div class="mo-table-wrapper">
      <!-- 详情模式下任务下载中每秒刷新 files，必须用 row-key + reserve-selection：
           否则 el-table 依赖行对象身份维护勾选（cleanSelection 会剔除"不在数据里"的行），
           reactive 行对象每秒触发 setData 时会误清空用户勾选 -->
      <el-table
        ref="torrentTable"
        :height="computedTableHeight"
        :data="visibleRows"
        row-key="id"
        style="width: 100%"
        :row-class-name="rowClassName"
        @row-click="handleRowClick"
        @row-dblclick="handleRowDbClick">
        <!-- 自定义勾选：文件按 idx 记录，文件夹勾选=全选其下所有文件。
             不用 el-table 内置 selection，避免目录收起后隐藏行丢选/全选漏选 -->
        <el-table-column
          width="42"
          class-name="task-file-select">
          <template #header>
            <el-checkbox
              :model-value="allFilesSelected"
              :indeterminate="someFilesSelected && !allFilesSelected"
              :disabled="files.length === 0"
              @change="toggleAllSelection"
            />
          </template>
          <template #default="scope">
            <span class="task-file-check" @click.stop>
              <el-checkbox
                v-if="scope.row.kind === 'file'"
                :model-value="selectedIds.has(Number(scope.row.idx))"
                @change="toggleFileRow(scope.row)"
              />
              <el-checkbox
                v-else
                :model-value="folderState(scope.row).all"
                :indeterminate="folderState(scope.row).some && !folderState(scope.row).all"
                @change="toggleFolderRow(scope.row)"
              />
            </span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.file-name')"
          min-width="200">
          <template #default="scope">
            <div class="mo-file-cell" :style="{ paddingLeft: `${scope.row.depth * 16}px` }">
              <i class="file-type-icon">
                <img
                  v-if="iconSrc(scope.row)"
                  class="file-type-img"
                  :src="iconSrc(scope.row)"
                  alt=""
                />
                <mo-icon
                  v-else-if="iconFailed.has(iconKeyOf(scope.row))"
                  :name="scope.row.kind === 'folder' ? 'folder' : fileIconOf(scope.row)"
                  width="14"
                  height="14"
                />
              </i>
              <mo-hover-tip :content="scope.row.name" placement="top" :disabled="!getOverflow(scope.row, 'name') || !scope.row.name" :open-delay="300">
                <span
                  class="mo-file-name"
                  data-field="name"
                  :data-row-id="scope.row.id"
                  :class="{ 'is-truncated': getOverflow(scope.row, 'name'), 'is-folder-name': scope.row.kind === 'folder' }"
                  @mouseenter="handleNameMouseEnter($event, scope.row)"
                >{{ scope.row.name }}</span>
              </mo-hover-tip>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.file-extension')"
          width="80"
          class-name="task-file-extension">
          <template #default="scope">{{ scope.row.kind === 'folder' ? '' : removeExtensionDot(scope.row.extension) }}</template>
        </el-table-column>
        <!-- 添加任务阶段：磁盘上已有同名数据时，展示本次可继承的已校验字节。
             没有已有数据（普通新任务）时整列不出现，避免每行都是 0 B 的噪声 -->
        <el-table-column
          v-if="mode === 'ADD' && showVerifiedColumn"
          :label="t('task.verified-size')"
          align="right"
          width="100">
          <template #default="scope">
            <span v-if="scope.row.previewState === 'verifying'">{{ scope.row.verifyPercent || 0 }}%</span>
            <span v-else-if="scope.row.exists === false">—</span>
            <span v-else>{{ bytesToSize(scope.row.verifiedLength || 0) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`%`"
          align="right"
          width="60"
          :show-overflow-tooltip="false">
          <template #default="scope">{{ calcProgress(scope.row.length, scope.row.completedLength, 1) }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`✓`"
          align="right"
          width="100">
          <template #default="scope">{{ bytesToSize(scope.row.completedLength) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('task.file-size')"
          align="right"
          width="100">
          <template #default="scope">{{ bytesToSize(scope.row.length) }}</template>
        </el-table-column>
<!-- 操作列（表头「操作」）：**每一行都有播放按钮** —— 不能播的置灰
     （不是干脆不显示：按钮突然消失会让人以为"这个文件没有播放功能"，
     置灰 + 悬停说明原因才说得清）。视频与音频都走同一个独立播放器窗口。
     表头单元格也会带上 class-name，所以 .task-file-actions .cell 的
     padding:0 / 居中 对表头同样生效，52px 宽放得下这两个字。
     ⚠️ **播放功能暂时停用**（`MEDIA_PLAYER_ENABLED = false`，2026-10-06 用户要求
     "暂时先把前端的播放功能给禁用掉"）：这里**整列不渲染** —— 入口在前端看不见，
     而不是"按钮还在但点了没反应"。播放那一整条链路（`canPlay` / `playTip` /
     `playFile` 与主进程的拦截）一行都没动，把开关改回 true 就整体回来。 -->
        <el-table-column
          v-if="mode === 'DETAIL' && MEDIA_PLAYER_ENABLED"
          :label="t('task.file-actions')"
          align="center"
          width="52"
          class-name="task-file-actions">
          <template #default="scope">
            <mo-hover-tip
              v-if="scope.row.kind === 'file'"
              :content="playTip(scope.row)"
              placement="top"
              :open-delay="200">
              <button
                type="button"
                class="file-play-btn"
                :class="{ 'is-disabled': !canPlay(scope.row) }"
                @click.stop="playFile(scope.row)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M8.2 5.4c0-.95 1.05-1.53 1.85-1.02l9.5 6.05c.75.48.75 1.57 0 2.05l-9.5 6.05A1.2 1.2 0 0 1 8.2 18.6V5.4z" fill="currentColor" />
                </svg>
              </button>
            </mo-hover-tip>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="file-filters">
      <div class="quick-filters">
        <div class="file-type-slider" role="group">
          <div
            class="slider-indicator"
            :class="{ 'is-hidden': !activeType }"
            :style="indicatorStyle"
          ></div>
          <button
            v-for="item in fileTypes"
            :key="item.key"
            type="button"
            class="slider-btn"
            :class="{ active: activeType === item.key }"
            @click="toggleTypeSelection(item.key)"
          >
            <mo-icon :name="item.icon" width="14" height="14" />
          </button>
        </div>
        <button
          v-if="showConfirm && mode === 'DETAIL'"
          type="button"
          class="slider-confirm-btn"
          @click="confirmSelection"
        >
          {{ t('app.save') }}
        </button>
      </div>
      <div class="files-summary">
        {{ t('task.selected-files-sum', { selectedFilesCount, selectedFilesTotalSize }) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ipcRenderer } from 'electron'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { mediaKindOf } from '@shared/mediaKinds'
import '@/components/Icons/video'
import '@/components/Icons/audio'
import '@/components/Icons/image'
import '@/components/Icons/document'
import '@/components/Icons/select-all'
import '@/components/Icons/folder'
import '@/components/Icons/subnav-archives'
import '@/components/Icons/subnav-programs'
import {
  MEDIA_PLAYER_ENABLED,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES
} from '@shared/constants'
import {
  bytesToSize,
  calcProgress,
  filterAudioFiles,
  filterDocumentFiles,
  filterImageFiles,
  filterVideoFiles,
  removeExtensionDot
} from '@shared/utils'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global

const props = defineProps({
  mode: {
    type: String,
    default: 'ADD',
    validator: function (value) {
      return ['ADD', 'DETAIL'].includes(value)
    }
  },
  height: {
    type: [Number, String]
  },
  tableHeight: {
    type: [Number, String],
    default: '100%'
  },
  files: {
    type: Array,
    default: function () {
      return []
    }
  },
  // 任务目录：列表里的文件只有**相对名**（Aria2 的 files[].name），
  // 而播放要知道文件的绝对路径，所以由调用方把 dir 递进来
  dir: {
    type: String,
    default: ''
  },
  // 任务 gid：播放"还在下载的文件"时，宿主要靠它查下载速度来判断能否顺畅播下去
  gid: {
    type: String,
    default: ''
  },
  // 是不是 BT 任务：只有 BT 才有"优先下载"通道（宿主会把播放头转达给下载引擎，
  // 让播放位置附近的片先下；HTTP/本地文件没有这条通道）
  bt: {
    type: Boolean,
    default: false
  },
  // 新建任务时默认全选（旧 el-table 由父组件 toggleAllSelection 完成，
  // 自定义勾选改为声明式，避免 props 更新时序导致首次没选上）
  selectAllByDefault: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['selection-change', 'confirm-selection'])

defineOptions({ name: 'mo-task-files' })

const torrentTable = ref(null)
const activeType = ref('all')
const showConfirm = ref(false)
const initialSelectedFileIndex = ref(null)
// 勾选按文件 idx 存（不依赖行对象/可见性）：目录收起后隐藏文件仍保持勾选
const selectedIds = reactive(new Set())
// 展开的文件夹 id（根文件夹默认展开，子文件夹默认收起）
const expandedFolders = reactive(new Set())
const seenFolderIds = new Set()
// 系统真实图标（data URL）：按目录+相对路径缓存；失败时文件回退类型图标
const iconCache = reactive(new Map())
const iconFailed = reactive(new Set())
const iconLoading = new Set()

// 溢出状态：key = `${rowId}:${field}`，value = boolean
const overflowState = reactive({})

function getOverflow (row, field) {
  if (!row || !row.id) return false
  return !!overflowState[`${row.id}:${field}`]
}

// ── 播放（视频 / 音频都走同一个独立播放器窗口）────────────────────

/**
 * 文件在磁盘上的绝对路径：优先用列表里给的绝对路径，
 * 否则由任务目录 + 相对名拼出来。
 */
function absolutePathOf (row) {
  try {
    if (!row) return ''
    const listed = row.path ? `${row.path}` : ''
    if (listed && isAbsolute(listed)) return listed
    // 相对路径要拼**引擎给的 path**，不是文件名：BT 多文件种子的文件在自己的
    // 目录里（`FC2PPV-4981875/xxx.mp4`），只拿 name 拼出来的路径根本不存在
    // —— 播放时会以"文件不存在"收场（2026-09-27 实测踩到）。
    const rel = listed || (row.name ? `${row.name}` : '')
    if (!rel) return ''
    const dir = props.dir ? `${props.dir}` : ''
    if (dir) return resolve(dir, rel)
    return rel
  } catch (_) {
    return ''
  }
}

/**
 * 本文件在**种子总数据**里的起始字节。
 *
 * 选片是按整份种子的片位图做的（前面文件占掉的字节要先减掉），所以播放头
 * 报给下载引擎之前必须换算成这个坐标 —— 单文件种子自然是 0。
 */
function fileOffsetOf (row) {
  try {
    const idx = Number(row && row.idx) || 0
    return props.files.reduce((sum, f) => {
      const i = Number(f && f.idx) || 0
      return i > 0 && i < idx ? sum + (Number(f.length) || 0) : sum
    }, 0)
  } catch (_) {
    return 0
  }
}

/**
 * 这一行能不能播：**要是可播放的媒体**（视频/音频，见 `mediaKindOf`），
 * 且已经下到过数据 —— 一个字节都没有时点了也是白等（服务端等不到数据）。
 *
 * 两类"不能播"是两回事，`playTip` 会分别说清（不是媒体 / 还没下到数据）。
 */
function canPlay (row) {
  if (!mediaKindOf(row && row.name)) {
    return false
  }
  return Number(row && row.completedLength) > 0
}

function playTip (row) {
  const name = `${(row && row.name) || ''}`
  if (!mediaKindOf(name)) {
    // DASH 分片值得单独说一句：它**是**音视频数据，只是单条放不了
    // （索引在初始化段里），用户看到"不是视频或音频"会更糊涂。
    return /\.m4s$/i.test(name) ? t('task.play-dash-part') : t('task.play-not-media')
  }
  return canPlay(row) ? t('task.play') : t('task.play-not-downloaded')
}

async function playFile (row) {
  if (!canPlay(row)) {
    return
  }
  const filePath = absolutePathOf(row)
  if (!filePath) {
    return
  }
  try {
    const length = Number(row.length) || 0
    const completed = Number(row.completedLength) || 0
    const r = await ipcRenderer.invoke('open-media-player', {
      path: filePath,
      name: row.name || basename(filePath),
      size: length,
      gid: props.gid || '',
      // 还没下完 → 宿主知道这是"边下边播"，会开启速度判据与优先下载
      downloading: length > 0 && completed < length,
      // BT 任务的"优先下载"要一个**种子内的字节偏移**（选片的坐标是整份种子，
      // 不是单个文件）：本文件在种子里的起点 = 前面所有文件的长度之和。
      // 多文件种子必须算对，否则会把别的文件那一段当成"播放位置"抢下来。
      bt: props.bt,
      fileOffset: fileOffsetOf(row)
    })
    if (!r || !r.ok) {
      console.warn('[Lerxu] 打开播放器失败:', r && r.error)
    }
  } catch (e) {
    console.warn('[Lerxu] 打开播放器失败:', e && e.message ? e.message : e)
  }
}

/* 通用溢出检测：mouseenter 时检查文本是否被截断 */
function handleTextOverflow (event, row, key) {
  try {
    const el = event && event.currentTarget
    if (!el || !row || !row.id) return
    const overflow = el.scrollWidth > el.clientWidth + 1
    const prop = `${row.id}:${key}`
    if (overflowState[prop] !== overflow) {
      overflowState[prop] = overflow
    }
  } catch (e) {}
}

/* 批量检测表格中所有 .mo-file-name 的溢出状态 */
function checkAllOverflow () {
  try {
    const table = torrentTable.value?.$el
    if (!table) return
    const spans = table.querySelectorAll('.mo-file-name[data-field][data-row-id]')
    spans.forEach(span => {
      const field = span.dataset.field
      const rowId = span.dataset.rowId
      if (!field || !rowId) return
      const overflow = span.scrollWidth > span.clientWidth + 1
      const prop = `${rowId}:${field}`
      if (overflowState[prop] !== overflow) {
        overflowState[prop] = overflow
      }
    })
  } catch (e) {}
}

// 数据变化后自动检测（用 rAF 确保 el-table 内部渲染完成）
watch(() => props.files, () => {
  nextTick(() => requestAnimationFrame(() => checkAllOverflow()))
}, { deep: false })

// 挂载后检测
onMounted(() => {
  nextTick(() => requestAnimationFrame(() => checkAllOverflow()))
  // 监听容器尺寸变化：v-show 从隐藏切换到可见时 clientWidth 从 0 变为正常值，
  // 此时需要重新检测溢出状态
  if (torrentTable.value?.$el) {
    resizeObserver = new ResizeObserver(() => {
      checkAllOverflow()
    })
    resizeObserver.observe(torrentTable.value.$el)
  }
})

let resizeObserver = null

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

const fileTypes = [
  { key: 'all', icon: 'select-all' },
  { key: 'video', icon: 'video', filter: filterVideoFiles },
  { key: 'audio', icon: 'audio', filter: filterAudioFiles },
  { key: 'image', icon: 'image', filter: filterImageFiles },
  { key: 'document', icon: 'document', filter: filterDocumentFiles }
]

const computedTableHeight = computed(() => {
  if (props.height !== undefined && props.height !== null) return props.height
  return props.mode === 'DETAIL' ? props.tableHeight : undefined
})

// 只有"添加任务且磁盘已有数据"才显示已验证列：普通新任务没有这一列。
// 校验中先亮出来（列出现本身就是在告诉用户"检测到已有数据"）。
const showVerifiedColumn = computed(() => props.mode === 'ADD' && props.files.some(row => {
  if (!row) return false
  return row.previewState === 'verifying' || row.hasExistingData === true
}))

// ── 目录树 ──────────────────────────────────────────────────────
// 文件路径（parse-torrent / 引擎 status）本身带根目录：`pack/sub/a.bin`。
// 这里按路径建树；单文件种子（路径无 `/`）直接作为顶层文件行。
function normalizeFilePath (row) {
  const raw = `${(row && (row.path || row.name)) || ''}`.replace(/\\/g, '/')
  if (!raw) return ''
  // BT 路径本来就是相对下载目录的；普通下载的 files[].path 可能是绝对路径。
  // 绝对路径先换算成相对任务目录，避免把 /Users/xxx/Downloads 拆成系统文件夹；
  // 不在任务目录下的绝对路径只保留文件名（文件没有根目录就不显示文件夹）。
  if (isAbsolute(raw)) {
    const dir = `${props.dir || ''}`
    if (dir && isAbsolute(dir)) {
      const rel = relative(dir, raw)
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        return rel.replace(/\\/g, '/').replace(/^\.\//, '')
      }
    }
    return basename(raw)
  }
  return raw.replace(/^\/+|\/+$/g, '')
}

function buildFileTree (files = []) {
  const roots = []
  const folders = new Map()
  files.forEach((file) => {
    const rel = normalizeFilePath(file)
    if (!rel) return
    const parts = rel.split('/').filter(Boolean)
    const node = {
      ...file,
      id: `file:${file.idx}`,
      kind: 'file',
      name: file.name || parts[parts.length - 1] || rel,
      depth: parts.length > 1 ? parts.length - 1 : 0
    }
    if (parts.length <= 1) {
      roots.push(node)
      return
    }
    let siblings = roots
    let acc = ''
    let depth = 0
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      const id = `folder:${acc}`
      let folder = folders.get(id)
      if (!folder) {
        folder = { id, kind: 'folder', name: parts[i], depth, subRows: [], path: acc }
        folders.set(id, folder)
        siblings.push(folder)
      }
      siblings = folder.subRows
      depth++
    }
    node.depth = depth
    siblings.push(node)
  })
  const sum = (list, key) => list.reduce((n, item) => n + (Number(item[key]) || 0), 0)
  const finalize = (node) => {
    if (node.kind === 'file') return
    node.subRows.forEach(finalize)
    const children = node.subRows
    // 文件夹排在文件前，目录结构更清楚（仅显示顺序，不影响文件 idx）
    children.sort((a, b) => (a.kind === 'folder' ? 0 : 1) - (b.kind === 'folder' ? 0 : 1))
    node.length = sum(children, 'length')
    node.completedLength = sum(children, 'completedLength')
    node.verifiedLength = sum(children, 'verifiedLength')
    node.exists = children.some(c => c.exists !== false)
    node.hasExistingData = children.some(c => c.hasExistingData === true)
    const present = children.filter(c => c.exists !== false)
    if (present.some(c => c.previewState === 'verifying')) {
      node.previewState = 'verifying'
      const total = sum(present, 'length')
      node.verifyPercent = total > 0
        ? Math.min(100, Math.round(sum(present, 'verifiedLength') / total * 100))
        : 0
    } else if (children.some(c => c.previewState === 'done' || c.previewState === 'missing')) {
      node.previewState = 'done'
    } else {
      node.previewState = ''
    }
    node.extension = ''
  }
  roots.forEach(finalize)
  return roots
}

const fileTree = computed(() => buildFileTree(props.files))

const visibleRows = computed(() => {
  const rows = []
  const walk = (nodes) => {
    for (const node of nodes) {
      rows.push(node)
      if (node.kind === 'folder' && expandedFolders.has(node.id)) {
        walk(node.subRows)
      }
    }
  }
  walk(fileTree.value)
  return rows
})

let lastPathSignature = ''
watch(fileTree, (roots) => {
  const signature = props.files
    .map(f => `${f.idx}:${normalizeFilePath(f)}`)
    .join('|')
  if (signature !== lastPathSignature) {
    lastPathSignature = signature
    expandedFolders.clear()
    seenFolderIds.clear()
  }
  const markFolders = (nodes) => {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue
      if (!seenFolderIds.has(node.id)) {
        seenFolderIds.add(node.id)
        // 根文件夹默认展开；根里面的子文件夹默认收起
        if (node.depth === 0) expandedFolders.add(node.id)
      }
      markFolders(node.subRows)
    }
  }
  markFolders(roots)
}, { immediate: true })

function iconKeyOf (row) {
  if (!row) return ''
  const dir = props.dir || ''
  return `${row.kind}:${dir}|${row.path || row.id}`
}

function iconSrc (row) {
  return iconCache.get(iconKeyOf(row)) || ''
}

function loadRowIcon (row) {
  const key = iconKeyOf(row)
  if (!key || iconCache.has(key) || iconFailed.has(key) || iconLoading.has(key)) return
  iconLoading.add(key)
  const extMatch = `${(row && (row.name || row.path)) || ''}`.match(/\.([a-z0-9]+)$/i)
  const ext = extMatch ? extMatch[1].toLowerCase() : ''
  Promise.resolve(ipcRenderer.invoke('file-icon', {
    path: absolutePathOf(row),
    kind: row && row.kind === 'folder' ? 'folder' : 'file',
    ext
  })).then((src) => {
    if (src) {
      if (iconCache.size >= 1000) iconCache.clear()
      iconCache.set(key, src)
    } else {
      iconFailed.add(key)
    }
  }).catch(() => {
    iconFailed.add(key)
  }).finally(() => {
    iconLoading.delete(key)
  })
}

watch(visibleRows, (rows) => {
  for (const row of rows) loadRowIcon(row)
}, { immediate: true })

// 目录变化会改变图标查找路径（同一个相对文件在另一个目录可能是另一种真实图标）
watch(() => props.dir, () => {
  for (const row of visibleRows.value) loadRowIcon(row)
})

function toggleFolder (row) {
  if (!row || row.kind !== 'folder') return
  if (expandedFolders.has(row.id)) {
    expandedFolders.delete(row.id)
  } else {
    expandedFolders.add(row.id)
  }
}

function rowClassName ({ row }) {
  if (!row || row.kind !== 'folder') return ''
  // 展开状态只靠整行底色表达（不使用左侧箭头/图标）
  return expandedFolders.has(row.id) ? 'is-folder-expanded' : ''
}

function handleRowClick (row) {
  if (row && row.kind === 'folder') {
    toggleFolder(row)
  }
}

const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso'])
const PROGRAM_EXTENSIONS = new Set(['exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'app'])

/** 普通文件按实际类型显示图标（视频/音频/图片/压缩包/程序/文档）。 */
function fileIconOf (row) {
  const name = `${(row && (row.name || row.path)) || ''}`
  const kind = mediaKindOf(name)
  if (kind === 'video' || kind === 'audio') return kind
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''
  if (ext === 'gif' || ext === 'webp' || ['jpg', 'jpeg', 'png', 'bmp', 'svg', 'ico', 'avif', 'heic', 'tiff'].includes(ext)) {
    return 'image'
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'subnav-archives'
  if (PROGRAM_EXTENSIONS.has(ext)) return 'subnav-programs'
  return 'document'
}

function collectFileIds (node, out = []) {
  if (node.kind === 'file') {
    const id = Number(node.idx)
    if (Number.isFinite(id)) out.push(id)
    return out
  }
  for (const child of node.subRows || []) {
    collectFileIds(child, out)
  }
  return out
}

function folderState (row) {
  const ids = collectFileIds(row)
  let selected = 0
  for (const id of ids) {
    if (selectedIds.has(id)) selected++
  }
  return { all: ids.length > 0 && selected === ids.length, some: selected > 0 }
}

const allFileIds = computed(() => props.files
  .map(f => Number(f.idx))
  .filter(id => Number.isFinite(id) && id > 0))

const selectedFiles = computed(() => props.files.filter(f => selectedIds.has(Number(f.idx))))
const allFilesSelected = computed(() => allFileIds.value.length > 0 && allFileIds.value.every(id => selectedIds.has(id)))
const someFilesSelected = computed(() => allFileIds.value.some(id => selectedIds.has(id)))

const selectedFilesCount = computed(() => selectedFiles.value.length)

const selectedFilesTotalSize = computed(() => {
  const result = selectedFiles.value.reduce((acc, cur) => acc + parseInt(cur.length, 10), 0)
  return bytesToSize(result)
})

const selectedFileIndex = computed(() => {
  if (props.files.length === 0 || selectedFiles.value.length === 0) return NONE_SELECTED_FILES
  if (props.files.length === selectedFiles.value.length) return SELECTED_ALL_FILES
  const indexArr = selectedFiles.value.map((item) => item.idx)
  return indexArr.join(',')
})

const indicatorStyle = computed(() => {
  if (!activeType.value) return { opacity: 0 }
  const idx = fileTypes.findIndex(t => t.key === activeType.value)
  if (idx < 0) return { opacity: 0 }
  return { transform: `translateX(${idx * 100}%)`, opacity: 1 }
})

function handleNameMouseEnter (event, row) {
  handleTextOverflow(event, row, 'name')
}

function toggleFileRow (row) {
  const id = Number(row && row.idx)
  if (!Number.isFinite(id)) return
  if (selectedIds.has(id)) {
    selectedIds.delete(id)
  } else {
    selectedIds.add(id)
  }
}

function toggleFolderRow (row) {
  const ids = collectFileIds(row)
  if (ids.length === 0) return
  if (folderState(row).all) {
    ids.forEach(id => selectedIds.delete(id))
  } else {
    ids.forEach(id => selectedIds.add(id))
  }
}

function toggleAllSelection () {
  if (allFilesSelected.value) {
    selectedIds.clear()
  } else {
    allFileIds.value.forEach(id => selectedIds.add(id))
  }
}

function clearSelection () {
  selectedIds.clear()
  activeType.value = 'all'
  nextTick(() => {
    initialSelectedFileIndex.value = selectedFileIndex.value
    showConfirm.value = false
  })
}

function toggleSelection (rows) {
  selectedIds.clear()
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    if (!row) continue
    if (row.kind === 'folder') {
      collectFileIds(row).forEach(id => selectedIds.add(id))
    } else {
      const id = Number(row.idx)
      if (Number.isFinite(id)) selectedIds.add(id)
    }
  }
}

function hideConfirm () {
  showConfirm.value = false
}

function toggleTypeSelection (type) {
  activeType.value = type
  if (type === 'all') {
    toggleSelection(props.files)
  } else {
    const item = fileTypes.find(t => t.key === type)
    if (!item) return
    const filtered = item.filter(props.files)
    toggleSelection(filtered)
  }
}

function confirmSelection () {
  initialSelectedFileIndex.value = selectedFileIndex.value
  showConfirm.value = false
  emit('confirm-selection')
}


function handleRowDbClick (row) {
  // 文件夹的展开/收起由单击整行负责；双击不再重复切换
  if (row && row.kind === 'file') {
    toggleFileRow(row)
  }
}

watch(selectedFileIndex, (val) => {
  if (initialSelectedFileIndex.value === null) {
    initialSelectedFileIndex.value = val
    showConfirm.value = false
  } else {
    showConfirm.value = val !== initialSelectedFileIndex.value
  }
  emit('selection-change', val)
})

watch(() => props.files, (files) => {
  // 文件列表变化（换种子/任务刷新）时清掉已不存在的勾选，其余保留
  const ids = new Set((files || []).map(f => Number(f.idx)))
  if (props.selectAllByDefault && props.mode === 'ADD') {
    // 新种子默认全选；后续用户勾选变化不会替换 files 数组，不会被这里覆盖
    selectedIds.clear()
    for (const id of ids) selectedIds.add(id)
  } else {
    for (const id of [...selectedIds]) {
      if (!ids.has(id)) selectedIds.delete(id)
    }
  }
  initialSelectedFileIndex.value = null
  showConfirm.value = false
}, { immediate: true })

defineExpose({
  selectedFileIndex,
  activeType,
  toggleSelection,
  toggleAllSelection,
  clearSelection,
  hideConfirm
})
</script>

<style lang="scss">
@import '@/components/Theme/Variables';
@import '@/components/Theme/Light/Variables';

.mo-task-files {
  /* 文件表：自定义勾选 + 目录树 */
  .task-file-select .cell {
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mo-file-cell {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }
  .task-file-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /* 文件类型图标（视频/音频/图片/压缩包/程序/文档），普通文件与文件夹名对齐 */
  .file-type-icon {
    flex: 0 0 20px;
    width: 20px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--lc-text-secondary);
  }
  .file-type-img {
    width: 16px;
    height: 16px;
    display: block;
    object-fit: contain;
  }
  .is-folder-name {
    font-weight: 500;
    cursor: pointer;
  }
  /* 展开的文件夹整行用主题蓝色高亮；收起时不加底色。
     与中性悬停色区分开，展开态一眼可见 */
  .el-table__body tr.is-folder-expanded > td.el-table__cell,
  .el-table--enable-row-hover .el-table__body tr.is-folder-expanded:hover > td.el-table__cell {
    background-color: rgba(var(--lc-color-primary-rgb), 0.1) !important;
  }
  /* 展开的文件夹底部不再画分隔横杠，避免把整块蓝色高亮切开 */
  .el-table__body-wrapper tr.is-folder-expanded::after {
    display: none !important;
  }
  .mo-file-cell .lc-hover-tip__trigger {
    flex: 1;
    min-width: 0;
  }
  .mo-table-wrapper {
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;
  }

  &.is-detail-mode {
    height: 100%;
    display: flex;
    flex-direction: column;

    .mo-table-wrapper {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  }
  .el-table {
    border-radius: 8px;
    border: none !important;
    &::before, &::after {
      display: none !important;
    }
    th.gutter, colgroup col[name="gutter"] {
      display: none !important;
      width: 0 !important;
    }
    .el-table__header-wrapper {
      th.el-table__cell {
        border-bottom: none !important;
        padding: 4px 0;
        .cell {
          padding: 0 10px;
          font-size: 12px;
          line-height: 1.5;
        }
      }
    }
    .el-table__body-wrapper {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      tr {
        position: relative;
        &:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 0;
          height: 1px;
          background: var(--lc-border-light);
        }
      }
      td.el-table__cell {
        border-bottom: none !important;
        padding: 8px 0;
        .cell {
          padding: 0 10px;
          font-size: var(--el-font-size-base);
          line-height: 1.5;
        }
        /* mo-hover-tip trigger 默认 inline-flex 会撑开宽度，
           改为 block 并限制宽度，确保 text-overflow 和溢出检测生效 */
        .lc-hover-tip__trigger {
          display: block;
          overflow: hidden;
        }
        .mo-file-name {
          display: block;
          overflow: hidden;
          text-overflow: clip; /* 不使用 ellipsis，避免双重省略效果 */
          white-space: nowrap;
          &.is-truncated {
            -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 85%, rgba(0, 0, 0, 0));
            mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 85%, rgba(0, 0, 0, 0));
          }
        }
      }
    }

    /* 勾选框样式与新建任务弹窗左下角「高级选项」一致：16px + 4px 圆角 + 居中对勾。
     用 !important 防止详情抽屉异步加载的 EP checkbox 样式（默认 14px）后写覆盖 */
    .el-checkbox__inner {
      width: 16px !important;
      height: 16px !important;
      border-radius: 4px !important;
      background-color: var(--lc-bg-input) !important;
      border-color: var(--lc-border-base) !important;

      &::after {
        width: 4px;
        height: 8px;
        left: 50%;
        top: 44%;
        transform: translate(-50%, -50%) rotate(45deg) scaleY(0);
        transform-origin: center;
      }
    }

    .el-checkbox__input.is-checked .el-checkbox__inner::after {
      transform: translate(-50%, -50%) rotate(45deg) scaleY(1);
    }

    /* 勾选/半选状态背景用主题色，避免被上面的灰色内框压成「灰底白勾」，
       浅色模式下几乎不可见而误以为未勾选（本规则特异性高于灰色内框规则） */
    .el-checkbox__input.is-checked .el-checkbox__inner,
    .el-checkbox__input.is-indeterminate .el-checkbox__inner {
      background-color: var(--el-checkbox-checked-bg-color, var(--lc-color-primary)) !important;
      border-color: var(--el-checkbox-checked-border-color, var(--lc-color-primary)) !important;
    }
  }
}
.file-filters {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  .quick-filters {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;

    .file-type-slider {
      position: relative;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      padding: 2px;
      background: transparent !important;
      border: 1px solid var(--lc-border-base) !important;
      border-radius: 8px;
      overflow: hidden;
      box-sizing: border-box;

      .slider-indicator {
        position: absolute;
        top: 2px;
        left: 2px;
        width: calc(20% - 0.8px);
        height: calc(100% - 4px);
        background: rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.2s ease;
        z-index: 0;
        pointer-events: none;

        &.is-hidden {
          opacity: 0;
        }
      }

      .slider-btn {
        position: relative;
        z-index: 1;
        flex: 1 0 auto;
        min-width: 0;
        height: 26px;
        padding: 0 7px;
        background: transparent !important;
        border: none !important;
        border-radius: 6px;
        cursor: pointer;
        outline: none !important;
        box-shadow: none !important;
        color: var(--el-text-color-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease;

        &:hover {
          color: var(--el-text-color-primary);
        }

        &.active {
          color: var(--el-color-primary);
        }
      }
    }

    .slider-confirm-btn {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      height: 30px;
      padding: 0 12px;
      margin-left: 6px;
      background: transparent !important;
      border: 1px solid var(--lc-border-base) !important;
      border-radius: 8px;
      cursor: pointer;
      outline: none !important;
      box-shadow: none !important;
      color: #000000;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      box-sizing: border-box;
      transition: background 0.2s ease, color 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.05) !important;
        color: #000000;
      }
    }
  }
  .files-summary {
    display: inline-flex;
    align-items: center;
    height: 30px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    padding: 0 12px;
    background: transparent !important;
    border: 1px solid var(--lc-border-base) !important;
    border-radius: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    box-sizing: border-box;
  }
}

.theme-dark {
  .file-filters .quick-filters {
    .file-type-slider {
      background: transparent !important;
      border-color: var(--lc-border-base) !important;

      .slider-indicator {
        background: rgba(255, 255, 255, 0.12);
      }

      .slider-btn {
        color: rgba(255, 255, 255, 0.55);

        &:hover {
          color: rgba(255, 255, 255, 0.85);
        }

        &.active {
          color: var(--el-color-primary);
        }
      }
    }

    .slider-confirm-btn {
      background: transparent !important;
      border-color: var(--lc-border-base) !important;
      color: #ffffff;

      &:hover {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #ffffff;
      }
    }
  }
  .file-filters .files-summary {
    background: transparent !important;
    border-color: var(--lc-border-base) !important;
    color: rgba(255, 255, 255, 0.75);
  }
}

.theme-dark .mo-task-files .el-table__body-wrapper tr:not(:last-child)::after {
  background: var(--lc-border-base);
}

/* ── 操作区：播放按钮 ──────────────────────────────────────────
   只在悬停时给底色，保持列表本身干净（无边框、无渐变）。 */
.mo-task-files .task-file-actions .cell {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mo-task-files .file-play-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lc-text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.14s ease, transform 0.14s ease;
}

/* 只高亮图标，不给底色（与播放器控制栏一致） */
.mo-task-files .file-play-btn:hover {
  color: var(--lc-text-regular);
}

.mo-task-files .file-play-btn:active {
  transform: scale(0.9);
}

.mo-task-files .file-play-btn.is-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.mo-task-files .file-play-btn.is-disabled:hover {
  background: transparent;
  color: var(--lc-text-secondary);
}

.theme-dark .mo-task-files .mo-table-wrapper {
  border-color: var(--lc-border-base) !important;
  background-color: var(--lc-task-item-bg) !important;
}

.theme-dark .mo-task-files .el-table {
  background-color: transparent !important;
  color: var(--lc-text-regular) !important;

  .el-table__inner-wrapper {
    background-color: transparent !important;
  }

  .el-table__header-wrapper,
  .el-table__body-wrapper,
  .el-table__footer-wrapper {
    background-color: transparent !important;
  }

  .el-table__header,
  .el-table__body,
  .el-table__footer {
    background-color: transparent !important;
  }

  .el-table__row {
    background-color: transparent !important;
  }

  thead th,
  thead th.el-table__cell,
  thead th.is-leaf,
  thead th.el-table__cell.is-leaf,
  th.el-table__cell {
    background-color: transparent !important;
    color: var(--lc-text-secondary) !important;
    border-bottom: none !important;
  }

  // 悬停高亮：强制覆盖 Element UI 默认白色背景
  .el-table__body tr:hover > td,
  .el-table__body tr:hover > td.el-table__cell,
  .el-table--enable-row-hover .el-table__body tr:hover > td {
    background-color: var(--lc-table-hover-bg) !important;
  }

  td.el-table__cell {
    background-color: transparent !important;
    color: var(--lc-text-regular) !important;
    border-bottom: none;
  }

  .el-table__empty-block {
    background-color: transparent !important;
  }

  .el-table__empty-text {
    color: var(--lc-text-placeholder) !important;
  }

  .el-checkbox__inner {
    background-color: var(--lc-bg-input) !important;
    border-color: var(--lc-border-base) !important;
  }

  &::before, &::after {
    display: none !important;
  }
}

.mo-task-files .task-file-extension .cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  display: block;
  -webkit-mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%);
  mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%);
}

.theme-dark .mo-task-files .el-table__body tr.is-folder-expanded > td.el-table__cell,
.theme-dark .mo-task-files .el-table--enable-row-hover .el-table__body tr.is-folder-expanded:hover > td.el-table__cell {
  /* 深色主题下提高一点透明度，保证蓝色高亮可见 */
  background-color: rgba(var(--lc-color-primary-rgb), 0.18) !important;
}
</style>
