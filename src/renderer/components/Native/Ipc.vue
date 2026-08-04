<template>
  <div v-if="false"></div>
</template>

<script>
  import { commands } from '@/components/CommandManager/instance'

  export default {
    name: 'mo-ipc',
    methods: {
      bindIpcEvents () {
        this._commandHandler = (event, command, ...args) => {
          commands.execute(command, ...args)
        }
        this.$electron.ipcRenderer.on('command', this._commandHandler)
      },
      unbindIpcEvents () {
        if (this._commandHandler) {
          this.$electron.ipcRenderer.removeListener('command', this._commandHandler)
          this._commandHandler = null
        }
      }
    },
    created () {
      this.bindIpcEvents()
    },
    destroyed () {
      this.unbindIpcEvents()
    }
  }
</script>
