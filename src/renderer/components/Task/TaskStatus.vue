<template>
  <el-tag :effect="theme" class="tag-task-status" :type="type">
    {{ statusText }}
  </el-tag>
</template>

<script setup>
defineOptions({ name: 'mo-task-status' }) // 供父组件 [X.name]: X 注册
import { computed } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { APP_THEME, TASK_STATUS } from '@shared/constants'
import colors from '@shared/colors'

const props = defineProps({
  theme: {
    type: String,
    default: APP_THEME.DARK,
    validator: (value) => [APP_THEME.LIGHT, APP_THEME.DARK].includes(value)
  },
  status: {
    type: String,
    default: TASK_STATUS.ACTIVE
  }
})

const { t } = i18n.global

const statusTypeMap = {
  [TASK_STATUS.ACTIVE]: 'success',
  [TASK_STATUS.WAITING]: 'info',
  [TASK_STATUS.PAUSED]: 'info',
  [TASK_STATUS.ERROR]: 'danger',
  [TASK_STATUS.COMPLETE]: 'success',
  [TASK_STATUS.REMOVED]: 'info',
  [TASK_STATUS.SEEDING]: 'success'
}

const type = computed(() => statusTypeMap[props.status])

const color = computed(() => colors[props.status])

const statusText = computed(() => {
  const raw = `${props.status || ''}`.trim()
  if (!raw) return ''
  const key = `task.status-${raw.toLowerCase()}`
  const translated = t(key)
  if (translated && translated !== key) {
    return translated
  }
  return raw.toUpperCase()
})
</script>
