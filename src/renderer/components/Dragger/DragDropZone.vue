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
  // 弹窗是不是这次拖拽自己打开的：只有自己打开的才在拖离时关掉，
  // 否则从「文件传输」面板上拖一圈就会把用户已经打开的弹窗关掉
  let openedByDrag = false

  const isTransferMode = () => (
    appStore.addTaskVisible &&
    appStore.addTaskType === ADD_TASK_TYPE.TRANSFER
  )

  onDragEnter = () => {
    if (count === 0) {
      if (isTransferMode()) {
        // 文件传输面板自己处理拖拽（el-upload 接收文件），不要抢成种子任务
        openedByDrag = false
      } else {
        appStore.showAddTaskDialog(ADD_TASK_TYPE.TORRENT)
        openedByDrag = true
      }
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
    // 传输模式下的落文件由 el-upload 的 drop 处理，这里不碰类型、不塞种子
    if (isTransferMode()) {
      openedByDrag = false
      return
    }

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
