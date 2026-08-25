<template>
  <el-main class="panel-content">
    <mo-browser
      v-if="isRenderer"
      class="lab-webview"
      :src="url"
    />
  </el-main>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import is from 'electron-is'
import { APP_THEME } from '@shared/constants'
import Browser from '@/components/Browser/Browser'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import '@/components/Icons/info-square'

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()

const { systemTheme } = storeToRefs(appStore)
const { config } = storeToRefs(preferenceStore)

const isRenderer = computed(() => is.renderer())

const locale = computed(() => config.value.locale || 'en-US')
const theme = computed(() => config.value.theme)

const currentTheme = computed(() => {
  if (theme.value === APP_THEME.AUTO) {
    return systemTheme.value
  }
  return theme.value
})

const url = computed(() => {
  return `https://motrix.app/lab?lite=true&theme=${currentTheme.value}&lang=${locale.value}`
})
</script>

<style lang="scss">
.lab-webview {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
}
</style>
