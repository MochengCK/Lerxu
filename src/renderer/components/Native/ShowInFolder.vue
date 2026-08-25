<template>
  <mo-hover-tip
    effect="dark"
    :content="t('task.reveal-in-folder')"
    placement="top"
    :open-delay="500"
  >
    <i @click.stop="onFolderClick">
      <mo-icon name="folder" width="12" height="12" />
    </i>
  </mo-hover-tip>
</template>

<script setup>
// Options API 父组件通过 [ShowInFolder.name]: ShowInFolder 注册，必须有 name
defineOptions({ name: 'mo-show-in-folder' })

import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { showItemInFolder } from '@/utils/native'

const props = defineProps({
  path: {
    type: String
  }
})

const { t } = i18n.global

const onFolderClick = () => {
  if (!props.path) {
    return
  }
  showItemInFolder(props.path, {
    errorMsg: t('task.file-not-exist')
  })
}
</script>
