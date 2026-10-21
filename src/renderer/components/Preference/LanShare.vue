<template>
  <el-form class="form-preference" label-position="right" size="small" @submit.prevent>
    <div class="preference-card lan-share-card" data-category="share">
      <h3 class="card-title">{{ t('preferences.lan-share-title') }}</h3>

      <el-form-item>
        <el-col class="form-item-sub" :span="24">
          <div class="pref-row-text">
            <span class="pref-row-label">{{ t('preferences.lan-share-enabled') }}</span>
            <div class="pref-row-desc">{{ t('preferences.lan-share-enabled-desc') }}</div>
          </div>
          <el-switch
            v-model="enabled"
            :loading="saving"
            :disabled="loading"
            @change="onEnabledChange"
          />
        </el-col>

        <el-col class="form-item-sub" :span="24">
          <div class="pref-row-text">
            <span class="pref-row-label">{{ t('preferences.lan-share-device-name') }}</span>
            <div class="pref-row-desc">{{ t('preferences.lan-share-device-name-desc') }}</div>
          </div>
          <el-input
            v-model="deviceName"
            maxlength="64"
            :disabled="loading || saving"
            :placeholder="t('preferences.lan-share-device-name-placeholder')"
            @change="onDeviceNameChange"
            @keyup.enter="onDeviceNameChange"
          />
        </el-col>

        <el-col class="form-item-sub" :span="24">
          <div class="pref-row-text">
            <span class="pref-row-label">{{ t('preferences.lan-share-recv-dir') }}</span>
            <div class="pref-row-desc">{{ t('preferences.lan-share-recv-dir-desc') }}</div>
          </div>
          <el-input v-model="recvDir" readonly :disabled="loading || saving">
            <template #append>
              <mo-select-directory
                v-if="isRenderer"
                @selected="onDirectorySelected"
              />
            </template>
          </el-input>
        </el-col>
      </el-form-item>

      <div v-if="statusText" class="lan-share-status" :class="statusClass">
        {{ statusText }}
      </div>
    </div>
  </el-form>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ipcRenderer } from 'electron'
import is from 'electron-is'
import { ElMessage } from 'element-plus'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
// 与「默认下载路径」同一套控件：原生目录选择按钮只在渲染进程里可用
const isRenderer = is.renderer()

const loading = ref(true)
const saving = ref(false)
const enabled = ref(true)
const deviceName = ref('')
const recvDir = ref('')
const config = ref(null)
const errorText = ref('')

const statusText = computed(() => {
  if (loading.value) return ''
  if (errorText.value) return errorText.value
  // 正常/关闭状态不再出文案；只有启用后启动失败才提示原因
  if (config.value && config.value.enabled !== false && !config.value.running) {
    const reason = config.value.error || ''
    return t('preferences.lan-share-start-failed', { error: reason || '-' })
  }
  return ''
})

const statusClass = computed(() => statusText.value ? 'is-error' : '')

function applyConfig (next) {
  if (!next) return
  config.value = next
  enabled.value = next.enabled !== false
  deviceName.value = `${next.deviceName || ''}`
  recvDir.value = `${next.recvDir || ''}`
}

async function loadConfig () {
  loading.value = true
  errorText.value = ''
  try {
    const result = await ipcRenderer.invoke('lan:config')
    if (!result || !result.ok) {
      errorText.value = t('preferences.lan-share-load-failed')
      return
    }
    applyConfig(result.result)
  } catch (_) {
    errorText.value = t('preferences.lan-share-load-failed')
  } finally {
    loading.value = false
  }
}

async function saveConfig (patch, { success = false } = {}) {
  if (saving.value) return false
  saving.value = true
  errorText.value = ''
  try {
    const result = await ipcRenderer.invoke('lan:set-config', patch)
    if (!result || !result.ok) {
      errorText.value = t('preferences.lan-share-save-failed')
      msg.error(t('preferences.lan-share-save-failed'))
      return false
    }
    applyConfig(result.result)
    if (success) {
      msg.success(t('preferences.lan-share-save-success'))
    }
    return true
  } catch (_) {
    errorText.value = t('preferences.lan-share-save-failed')
    msg.error(t('preferences.lan-share-save-failed'))
    return false
  } finally {
    saving.value = false
  }
}

async function onEnabledChange () {
  const next = enabled.value
  const ok = await saveConfig({ enabled: next })
  if (!ok) {
    enabled.value = config.value ? config.value.enabled !== false : !next
  }
}

async function onDeviceNameChange () {
  const name = deviceName.value.trim()
  if (!name) {
    deviceName.value = `${(config.value && config.value.deviceName) || ''}`
    msg.warning(t('preferences.lan-share-device-name-required'))
    return
  }
  if ([...name].length > 64) {
    msg.warning(t('preferences.lan-share-name-too-long'))
    return
  }
  if (config.value && name === config.value.deviceName) return
  const ok = await saveConfig({ deviceName: name }, { success: true })
  if (!ok) {
    deviceName.value = `${(config.value && config.value.deviceName) || ''}`
  }
}

async function onDirectorySelected (dir) {
  if (!dir || loading.value || saving.value) return
  const ok = await saveConfig({ recvDir: dir }, { success: true })
  if (!ok) {
    recvDir.value = `${(config.value && config.value.recvDir) || ''}`
  }
}

onMounted(loadConfig)
</script>

<style lang="scss" scoped>
/* 目录输入框右侧直接用 mo-select-directory（与「默认下载路径」同一个控件），
   槽位样式由主题统一处理，这里不再自定义。 */
.lan-share-status {
  margin: 4px 16px 16px;
  font-size: 12px;
  line-height: 18px;
  color: var(--lc-color-danger, #f56c6c);
}
</style>
