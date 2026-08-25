<template>
  <div v-if="false"></div>
</template>

<script setup>
// Options API 父组件通过 [Ipc.name]: Ipc 注册，必须有 name
defineOptions({ name: 'mo-ipc' })

import { onMounted, onBeforeUnmount } from 'vue'
import { ipcRenderer } from 'electron'
import { commands } from '@/components/CommandManager/instance'

let _commandHandler = null

const bindIpcEvents = () => {
  _commandHandler = (event, command, ...args) => {
    commands.execute(command, ...args)
  }
  ipcRenderer.on('command', _commandHandler)
}

const unbindIpcEvents = () => {
  if (_commandHandler) {
    ipcRenderer.removeListener('command', _commandHandler)
    _commandHandler = null
  }
}

onMounted(() => {
  bindIpcEvents()
})

onBeforeUnmount(() => {
  unbindIpcEvents()
})
</script>
