<template>
  <el-upload
    class="upload-torrent"
    drag
    action="/"
    v-if="isTorrentsEmpty"
    :limit="1"
    :multiple="false"
    accept=".torrent"
    :on-change="handleChange"
    :on-exceed="handleExceed"
    :auto-upload="false"
    :show-file-list="false">
    <i class="upload-inbox-icon"><mo-icon name="inbox" width="24" height="24" /></i>
    <div class="el-upload__text">
      {{ t('task.select-torrent') }}
      <div class="torrent-name" v-if="name">{{ name }}</div>
    </div>
  </el-upload>
  <div
    class="selective-torrent"
    v-else
  >
    <el-row class="torrent-info" :gutter="12">
      <el-col class="torrent-name" :span="20">
        <mo-hover-tip effect="dark" :content="name" placement="top">
          <span>{{ name }}</span>
        </mo-hover-tip>
      </el-col>
      <el-col class="torrent-actions" :span="4">
        <span @click="handleTrashClick">
          <mo-icon name="trash" width="14" height="14" />
        </span>
      </el-col>
    </el-row>
    <mo-task-files
      ref="torrentFileList"
      mode="ADD"
      :files="files"
      :height="200"
      @selection-change="handleSelectionChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { remote } from 'parse-torrent'
import api from '@/api'
// mo-task-files is globally registered in main.js
import '@/components/Icons/inbox'
import {
  EMPTY_STRING,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES
} from '@shared/constants'
import {
  buildFileList,
  listTorrentFiles,
  getAsBase64,
} from '@shared/utils'
import { useAppStore } from '@/store'
import { storeToRefs } from 'pinia'

defineOptions({
  name: 'mo-select-torrent'
})

const props = defineProps({
  // 下载目录：添加阶段预览"已验证大小"要按这个目录找已有数据
  dir: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['change'])
const { t } = i18n.global

const appStore = useAppStore()
const { addTaskTorrents: torrents } = storeToRefs(appStore)

const name = ref(EMPTY_STRING)
const currentTorrent = ref(EMPTY_STRING)
const files = ref([])
const torrentFileList = ref(null)

const isTorrentsEmpty = computed(() => torrents.value.length === 0)

watch(torrents, (fileList) => {
  if (fileList.length === 0) {
    reset()
    return
  }

  const file = fileList[0]
  if (!file.raw) return

  remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
    if (err) throw err
    console.log('[Lerxu] parsed torrent: ', parsedTorrent)
    files.value = listTorrentFiles(parsedTorrent.files)
    torrentFileList.value?.toggleAllSelection()

    getAsBase64(file.raw).then((torrent) => {
      name.value = file.name
      currentTorrent.value = torrent
      emit('change', torrent, SELECTED_ALL_FILES, files.value)
      loadExistingPreview(torrent)
    })
  })
})

// 目录变了，已有数据的判定对象也变了：重新预览（防抖，输入路径时别每键都读盘）
let dirPreviewTimer = null
watch(() => props.dir, () => {
  if (!currentTorrent.value) return
  if (dirPreviewTimer) clearTimeout(dirPreviewTimer)
  dirPreviewTimer = setTimeout(() => {
    dirPreviewTimer = null
    loadExistingPreview()
  }, 500)
})

// 预览代际：切换种子/目录/卸载后，旧请求的回包一律丢弃
let previewToken = 0

/**
 * 预览磁盘上已有数据（引擎后台逐片 SHA-1）。
 *
 * 引擎首包对"没有已有数据"的种子立即返回 done；只有真有数据才进入
 * verifying 并需要轮询。所以这里先不把列切成"校验中"——新种子不会
 * 闪一下已验证列。
 */
async function loadExistingPreview (torrent = currentTorrent.value) {
  if (!torrent) return
  const token = ++previewToken
  try {
    for (let i = 0; i < 600; i++) {
      const res = await api.previewBt({ torrent, dir: props.dir })
      if (token !== previewToken) return
      if (res && res.state === 'verifying') {
        const percent = Math.min(100, Math.max(0, Math.round((Number(res.progress) || 0) * 100)))
        files.value.forEach((row) => {
          row.previewState = 'verifying'
          row.verifyPercent = percent
        })
        await new Promise(resolve => setTimeout(resolve, 500))
        if (token !== previewToken) return
        continue
      }
      applyPreviewResult(res)
      return
    }
  } catch (e) {
    if (token === previewToken) {
      files.value.forEach((row) => { row.previewState = 'done' })
    }
  }
}

function applyPreviewResult (res) {
  const done = res && res.state === 'done'
  const hasExisting = done && res.hasExistingData === true
  const byIndex = new Map()
  if (done && Array.isArray(res.files)) {
    res.files.forEach((f) => {
      byIndex.set(Number(f.index), Number(f.verifiedLength) || 0)
    })
  }
  files.value.forEach((row, i) => {
    row.hasExistingData = hasExisting
    row.verifiedLength = done ? (byIndex.get(Number(row.idx)) ?? byIndex.get(i + 1) ?? 0) : 0
    row.previewState = 'done'
    row.verifyPercent = 100
  })
}

onBeforeUnmount(() => {
  previewToken++
  if (dirPreviewTimer) clearTimeout(dirPreviewTimer)
})

function reset () {
  previewToken++
  if (dirPreviewTimer) {
    clearTimeout(dirPreviewTimer)
    dirPreviewTimer = null
  }
  name.value = EMPTY_STRING
  currentTorrent.value = EMPTY_STRING
  files.value = []
  if (torrentFileList.value) {
    torrentFileList.value.clearSelection()
  }
  emit('change', EMPTY_STRING, NONE_SELECTED_FILES)
}

function handleChange (file, fileList) {
  appStore.addTaskAddTorrents({ fileList })
}

function handleExceed (files) {
  const fileList = buildFileList(files[0])
  appStore.addTaskAddTorrents({ fileList })
}

function handleTrashClick () {
  appStore.addTaskAddTorrents({ fileList: [] })
}

function handleSelectionChange (val) {
  emit('change', currentTorrent.value, val, files.value)
}
</script>

<style lang="scss">
.upload-torrent {
  width: 100%;
  margin: 0;
  display: block;
  .el-upload, .el-upload-dragger {
    width: 100%;
    margin: 0;
  }
  .el-upload {
    display: block;
  }
  .el-upload-dragger {
    padding: 16px 24px;
    height: auto;
    border-radius: 8px;
    min-height: 0;
  }
  .upload-inbox-icon {
    display: inline-block;
    margin-bottom: 12px;
  }
  .torrent-name {
    margin-top: 4px;
    font-size: var(--el-font-size-small);
    color: var(--el-text-color-secondary);
    line-height: 16px;
  }
}
.selective-torrent {
  .torrent-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .torrent-info {
    margin-bottom: 15px;
    font-size: 12px;
    line-height: 16px;
  }
  .torrent-actions {
    text-align: right;
    line-height: 16px;
    &> span {
      cursor: pointer;
      display: inline-block;
      vertical-align: middle;
      height: 14px;
      padding: 1px;
    }
  }
}
</style>
