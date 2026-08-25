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
import { ref, computed, watch, getCurrentInstance } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { remote } from 'parse-torrent'
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
  bytesToSize,
  getAsBase64,
  removeExtensionDot
} from '@shared/utils'
import { useAppStore, usePreferenceStore } from '@/store'
import { storeToRefs } from 'pinia'

defineOptions({
  name: 'mo-select-torrent'
})

const emit = defineEmits(['change'])
const { t } = i18n.global
const instance = getCurrentInstance()

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const { addTaskTorrents: torrents } = storeToRefs(appStore)
const { config } = storeToRefs(preferenceStore)

const name = ref(EMPTY_STRING)
const currentTorrent = ref(EMPTY_STRING)
const files = ref([])
const selectedFiles = ref([])
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
    console.log('[LinkCore] parsed torrent: ', parsedTorrent)
    files.value = listTorrentFiles(parsedTorrent.files)
    torrentFileList.value?.toggleAllSelection()

    getAsBase64(file.raw).then((torrent) => {
      name.value = file.name
      currentTorrent.value = torrent
      emit('change', torrent, SELECTED_ALL_FILES, files.value)
    })
  })
})

function reset () {
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
