<template>
  <div v-if="false"></div>
</template>

<script setup>
// Options API 父组件通过 [Dragger.name]: Dragger 注册，必须有 name
defineOptions({ name: 'mo-dragger' })

import { onMounted, onBeforeUnmount } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { useAppStore } from '@/store'
import { createMsg } from '@/components/Msg'
import { ElMessage } from 'element-plus'
import { ADD_TASK_TYPE } from '@shared/constants'

const { t } = i18n.global
const appStore = useAppStore()
const msg = createMsg(ElMessage, { showClose: true })

let preventDefault = null
let onDragEnter = null
let onDragLeave = null
let onDrop = null

onMounted(() => {
  preventDefault = ev => ev.preventDefault()
  let count = 0
  // 弹窗是不是这次拖拽自己打开的：只有自己打开的才在拖离时关掉
  let openedByDrag = false

  onDragEnter = () => {
    if (count === 0) {
      appStore.showAddTaskDialog(ADD_TASK_TYPE.TORRENT)
      openedByDrag = true
    }
    count++
  }

  onDragLeave = () => {
    count--
    if (count <= 0) {
      count = 0
      if (openedByDrag) {
        appStore.hideAddTaskDialog()
        openedByDrag = false
      }
    }
  }

  onDrop = (ev) => {
    count = 0

    const fileList = [...ev.dataTransfer.files]
      .map(item => ({ raw: item, name: item.name }))
      .filter(item => /\.torrent$/.test(item.name))
    if (!fileList.length) {
      msg.error(t('task.select-torrent'))
    }
    openedByDrag = false
  }

  document.addEventListener('dragover', preventDefault)
  document.body.addEventListener('dragenter', onDragEnter)
  document.body.addEventListener('dragleave', onDragLeave)
  document.body.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
  document.removeEventListener('dragover', preventDefault)
  document.body.removeEventListener('dragenter', onDragEnter)
  document.body.removeEventListener('dragleave', onDragLeave)
  document.body.removeEventListener('drop', onDrop)
})
</script>
