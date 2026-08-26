<template>
  <el-main class="panel-content">
      <el-form
        class="form-preference"
        ref="advancedForm"
        label-position="right"
        size="small"
        :model="form"
        :rules="rules"
      >
        <!-- 自动更新设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.auto-update') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.auto-check-update') }}</span>
                  <div class="toggle-desc">{{ t('preferences.auto-check-update-desc') }}</div>
                </div>
                <el-switch v-model="form.autoCheckUpdate" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.update-channel') }}</span>
                  <div class="toggle-desc">{{ t('preferences.update-channel-desc') }}</div>
                </div>
                <mo-segmented-slider
                  :value="form.updateChannel"
                  :options="updateChannelOptions"
                  size="mini"
                  @change="onUpdateChannelChange"
                />
              </div>
            </el-col>
          </el-form-item>
          <div
            class="version-item"
            :class="{
              'update-available': updateAvailable && !updateDownloaded && !isDownloadingUpdate,
              'is-checking': isCheckingUpdate,
              'downloading': isDownloadingUpdate,
              'downloaded': updateDownloaded,
              'is-disabled': isDownloadingUpdate
            }"
            :style="{ pointerEvents: isDownloadingUpdate ? 'none' : 'auto' }"
            @click="handleVersionItemClick"
          >
            <span>{{ versionText }}</span>
          </div>
          <div
            class="auto-update-footer"
            v-if="lastCheckUpdateTime !== 0 || (updateAvailable || isDownloadingUpdate || updateDownloaded)"
          >
            <span class="auto-update-time" v-if="lastCheckUpdateTime !== 0">
              {{ t('preferences.last-check-update-time') + ': ' +
                (lastCheckUpdateTime !== 0 ?
                  new Date(lastCheckUpdateTime).toLocaleString() :
                  new Date().toLocaleString())
              }}
            </span>
            <span
              class="action-link"
              :class="{
                'action-link--disabled': isCheckingUpdate,
                'update-available': (updateAvailable || isDownloadingUpdate || updateDownloaded) && !isCheckingUpdate
              }"
              v-if="updateAvailable || isDownloadingUpdate || updateDownloaded"
              @click.prevent="isCheckingUpdate ? null : onPreviewUpdateClick()"
            >
              {{ t('app.preview-update') }}
            </span>
          </div>
        </div>

        <!-- 代理设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.proxy') }}</h3>
          <el-form-item size="small">
            <el-radio-group
              v-model="form.proxy.mode"
              @change="(val) => { onProxyModeChange(val); autoSaveForm(); }"
            >
<el-radio value="none">{{ t('preferences.proxy-mode-none') }}</el-radio>
<el-radio value="system">{{ t('preferences.proxy-mode-system') }}</el-radio>
<el-radio value="custom">{{ t('preferences.proxy-mode-custom') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item size="small" v-if="form.proxy.mode === 'system'" style="margin-top: -8px;">
            <el-col class="form-item-sub" :span="24">
              <div class="el-form-item__info proxy-system-info">
                <el-icon><InfoFilled /></el-icon>
                {{ t('preferences.proxy-system-tips') }}
              </div>
            </el-col>
          </el-form-item>
          <el-form-item size="small" v-if="form.proxy.mode === 'custom'" style="margin-top: -8px;">
            <el-col
              class="form-item-sub"
              :xs="24"
              :sm="20"
              :md="16"
              :lg="16"
            >
              <el-input
                placeholder="[http://][USER:PASSWORD@]HOST[:PORT]"
                @change="(val) => { onProxyServerChange(val); autoSaveForm(); }"
                v-model="form.proxy.server">
              </el-input>
            </el-col>
            <el-col
              class="form-item-sub"
              :xs="24"
              :sm="24"
              :md="20"
              :lg="20"
            >
              <el-input
                type="textarea"
                :rows="2"
                auto-complete="off"
                @change="handleProxyBypassChange"
                :placeholder="`${t('preferences.proxy-bypass-input-tips')}`"
                v-model="form.proxy.bypass">
              </el-input>
            </el-col>
            <el-col
              class="form-item-sub"
              :xs="24"
              :sm="24"
              :md="20"
              :lg="20"
            >
              <el-select
                class="proxy-scope"
                v-model="form.proxy.scope"
                multiple
              >
                <el-option
                  v-for="item in proxyScopeOptions"
                  :key="item"
                  :label="t(`preferences.proxy-scope-${item}`)"
                  :value="item"
                />
              </el-select>
              <div class="el-form-item__info" style="margin-top: 8px;">
                <a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Proxy" rel="noopener noreferrer">
                  {{ t('preferences.proxy-tips') }}
                  <mo-icon name="link" width="12" height="12" />
                </a>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- GitHub 镜像设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.github-mirror') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              <div class="github-mirror-row" style="display: flex; align-items: center; margin-bottom: 8px;">
                <div style="flex: 1;">
                  <el-select
                    v-model="form.githubMirrorUrls"
                    multiple
                    filterable
                    :placeholder="t('preferences.github-mirror-select-placeholder')"
                    @change="onGithubMirrorChange"
                    style="width: 100%;"
                  >
                    <el-option-group :label="t('preferences.github-mirror-builtin')">
                      <el-option
                        v-for="mirror in builtinGithubMirrors"
                        :key="mirror.value"
                        :label="mirror.label"
                        :value="mirror.value"
                      >
                        <span style="float: left">{{ mirror.label }}</span>
                        <span style="float: right; font-size: 13px; margin-right: 8px;">
                          <span v-if="mirror.checking" style="color: #909399;">
                            <el-icon class="is-loading"><Loading /></el-icon> {{ t('preferences.checking') }}
                          </span>
                          <span v-else-if="mirror.latency !== null" :style="{ color: getLatencyColor(mirror.latency), fontWeight: '500' }">
                            {{ formatLatency(mirror.latency) }}
                          </span>
                        </span>
                      </el-option>
                    </el-option-group>
                  </el-select>
                </div>
                <div class="github-mirror-actions" style="display:flex; align-items:center;">
                  <mo-hover-tip
                    effect="dark"
                    :content="t('preferences.check-github-mirror-latency')"
                    placement="bottom"
                  >
                    <el-button
                      @click="checkSelectedGithubMirrors"
                      class="sync-tracker-btn"
                      :disabled="githubMirrorCheckingAll"
                    >
                      <mo-icon
                        name="refresh"
                        width="12"
                        height="12"
                        :spin="githubMirrorCheckingAll"
                      />
                    </el-button>
                  </mo-hover-tip>
                  <div class="github-mirror-popup-wrapper">
                    <mo-hover-tip
                      effect="dark"
                      :content="t('preferences.add-mirror')"
                      placement="bottom"
                      :disabled="githubMirrorConfigVisible"
                    >
                      <el-button
                        @click="openGithubMirrorConfigDialog"
                        class="sync-tracker-btn"
                      >
                        <mo-icon name="link" width="12" height="12" />
                      </el-button>
                    </mo-hover-tip>
                    <transition name="popup-scale">
                      <div
                        class="github-mirror-popup"
                        v-if="githubMirrorConfigVisible"
                        @click.stop
                      >
                        <div class="github-mirror-popup__header">
                          <span>{{ t('preferences.add-mirror') }}</span>
                        </div>
                        <div class="github-mirror-popup__body">
                          <el-input
                            v-model="githubMirrorInput"
                            :placeholder="t('preferences.github-mirror-input-placeholder')"
                            clearable
                            size="small"
                            @keydown.enter="addGithubMirrorFromInput"
                          >
                          </el-input>
                        </div>
                        <div class="github-mirror-popup__footer">
                          <el-button size="small" type="primary" @click="addGithubMirrorFromInput">{{ t('app.submit') }}</el-button>
                        </div>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ t('preferences.github-mirror-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- RPC设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.rpc') }}</h3>
          <el-form-item size="small">
            <el-row style="margin-bottom: 8px;">
              <el-col class="form-item-sub" :span="24">
                {{ t('preferences.rpc-listen-port') }}
                <el-input
                  :placeholder="`${rpcDefaultPort}`"
                  :maxlength="8"
                  v-model="form.rpcListenPort"
                  @change="onRpcListenPortChange"
                >
                  <template #append>
                    <i class="rpc-dice-btn" @click.prevent="onRpcPortDiceClick">
                      <mo-icon name="dice" width="12" height="12" />
                    </i>
                  </template>
                </el-input>
              </el-col>
            </el-row>
            <el-row style="margin-bottom: 8px;">
              <el-col class="form-item-sub" :span="24">
                {{ t('preferences.rpc-secret') }}
                <el-input
                  :show-password="hideRpcSecret"
                  placeholder="RPC Secret"
                  :maxlength="64"
                  v-model="form.rpcSecret"
                >
                  <template #append>
                    <i class="rpc-dice-btn" @click.prevent="onRpcSecretDiceClick">
                      <mo-icon name="dice" width="12" height="12" />
                    </i>
                  </template>
                </el-input>
                <div class="el-form-item__info" style="margin-top: 8px;">
                  <a target="_blank" href="https://github.com/agalwood/Motrix/wiki/RPC" rel="noopener noreferrer">
                    {{ t('preferences.rpc-secret-tips') }}
                    <mo-icon name="link" width="12" height="12" />
                  </a>
                </div>
              </el-col>
            </el-row>
          </el-form-item>
        </div>

        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.download-protocol') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.protocols-magnet') }}</span>
                  <div class="toggle-desc">{{ t('preferences.protocols-magnet-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.protocols.magnet"
                  @change="(val) => onProtocolsChange('magnet', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.protocols-thunder') }}</span>
                  <div class="toggle-desc">{{ t('preferences.protocols-thunder-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.protocols.thunder"
                  @change="(val) => onProtocolsChange('thunder', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.protocols-ed2k') }}</span>
                  <div class="toggle-desc">{{ t('preferences.protocols-ed2k-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.protocols.ed2k"
                  @change="(val) => onProtocolsChange('ed2k', val)"
                />
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 引擎信息卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.engine') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="24">
                  <strong>{{ t('preferences.engine-select') }}:</strong>
                  <mo-extend-select
                    v-model="activeEngineBinary"
                    disabled
                    :options="[{ label: activeEngineBinary || '--', value: activeEngineBinary || '' }]"
                    style="width: 100%; margin-top: 8px;"
                  />
                </el-col>
              </el-row>
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="8">
                  <strong>{{ t('preferences.engine-version') }}:</strong>
                  <div>{{ storeEngineInfo.version || '--' }}</div>
                </el-col>
                <el-col :span="8">
                  <strong>{{ t('preferences.engine-architecture') }}:</strong>
                  <div>{{ storeEngineInfo.architecture || '--' }}</div>
                </el-col>
                <el-col :span="8">
                  <strong>{{ t('preferences.engine-features') }}:</strong>
                  <div>{{ storeEngineInfo.features ? storeEngineInfo.features.join(', ') : '--' }}</div>
                </el-col>
              </el-row>
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="12">
                  <strong>{{ t('preferences.engine-dependencies') }}:</strong>
                  <div>{{ storeEngineInfo.dependencies ? storeEngineInfo.dependencies.join(', ') : '--' }}</div>
                </el-col>
                <el-col :span="12">
                  <strong>{{ t('preferences.engine-compile-info') }}:</strong>
                  <div>{{ storeEngineInfo.compileInfo || '--' }}</div>
                </el-col>
              </el-row>
            </el-col>
          </el-form-item>
        </div>

        <!-- 视频合并设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.video-merge') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              <div style="margin-bottom: 12px;">
                <strong>{{ t('preferences.ffmpeg-status') }}：</strong>
                <span :style="{ color: ffmpegStatus.installed ? '#67c23a' : '#f56c6c' }">
                  {{ ffmpegStatus.installed ? t('preferences.ffmpeg-installed') : t('preferences.ffmpeg-not-installed') }}
                </span>
              </div>
              <div v-if="ffmpegStatus.installed && ffmpegStatus.path" style="margin-bottom: 12px;">
                <strong>{{ t('preferences.ffmpeg-path') }}：</strong>
                <span style="word-break: break-all;">{{ ffmpegStatus.path }}</span>
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="ffmpegStatus.installed && ffmpegStatus.path">
              <el-button size="small" @click="openFfmpegFolder">
                <el-icon><FolderOpened /></el-icon>
                {{ t('preferences.ffmpeg-open-folder') }}
              </el-button>
            </el-col>
          </el-form-item>
        </div>

        <!-- 用户代理设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.user-agent') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              {{ t('preferences.mock-user-agent') }}
              <el-input
                type="textarea"
                :rows="2"
                auto-complete="off"
                placeholder="User-Agent"
                v-model="form.userAgent">
              </el-input>
              <mo-segmented-slider
                ref="uaSegmented"
                class="ua-segmented"
                :value="activeUAValue"
                :options="uaOptions"
                size="mini"
                @change="changeUA"
              />
            </el-col>
          </el-form-item>
        </div>

        <!-- 开发者选项卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ t('preferences.developer') }}</h3>
          <el-form-item size="small">
            <el-col class="form-item-sub" :span="24">
              {{ t('preferences.download-session-path') }}
              <el-input placeholder="" disabled v-model="sessionPath">
                <template #append>
                  <mo-show-in-folder
                    v-if="isRenderer"
                    :path="sessionPath"
                  />
                </template>
              </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ t('preferences.app-log-path') }}
              <el-row :gutter="16">
                <el-col :span="18">
                  <el-input placeholder="" disabled v-model="logPath">
                    <template #append>
                      <mo-show-in-folder
                        v-if="isRenderer"
                        :path="logPath"
                      />
                    </template>
                  </el-input>
                </el-col>
                <el-col :span="6">
                  <mo-extend-select
                    v-model="form.logLevel"
                    :options="logLevels.map(item => ({ label: item, value: item }))"
                  />
                </el-col>
              </el-row>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ t('preferences.aria2-log-path') }}
              <el-input placeholder="" disabled v-model="aria2LogPath">
                <template #append>
                  <mo-hover-tip
                    effect="dark"
                    :content="t('task.reveal-in-folder')"
                    placement="top"
                    :open-delay="500"
                  >
                    <i v-if="isRenderer" @click="openAria2LogFolder" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; cursor: pointer;">
                      <mo-icon name="folder" width="12" height="12" />
                    </i>
                  </mo-hover-tip>
                </template>
              </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-button plain type="warning" @click="() => onSessionResetClick()">
                {{ t('preferences.session-reset') }}
              </el-button>
              <el-button plain type="danger" @click="() => onFactoryResetClick()">
                {{ t('preferences.factory-reset') }}
              </el-button>
              </el-col>
          </el-form-item>
        </div>
      </el-form>

      <div v-if="hasNoResults" class="no-results">
        <div class="no-results-inner">
          {{ t('preferences.no-settings-found') }}
        </div>
      </div>

    <div
      v-if="updatePreviewVisible"
      class="update-preview-mask"
      @click.self="closeUpdatePreview"
    >
      <div class="update-preview-body" @click="handleUpdatePreviewClick">
        <div class="update-preview-html" v-html="updatePreviewContent" />
      </div>
    </div>
    <div v-if="updatePreviewVisible" class="update-preview-confirm">
      <el-button type="primary" @click="closeUpdatePreview">
        {{ t('app.yes') || 'OK' }}
      </el-button>
    </div>

  </el-main>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import is from 'electron-is'
import { app, dialog, shell } from '@electron/remote'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { ipcRenderer } from 'electron'
import { ElMessage } from 'element-plus'
import { cloneDeep, isEmpty } from 'lodash'
import randomize from 'randomatic'
// mo-show-in-folder, mo-segmented-slider are globally registered in main.js
import userAgentMap from '@shared/ua'
import {
  EMPTY_STRING,
  ENGINE_RPC_PORT,
  ENGINE_MAX_CONNECTION_PER_SERVER,
  LOG_LEVELS,
  PROXY_SCOPE_OPTIONS
} from '@shared/constants'
import {
  buildRpcUrl,
  calcFormLabelWidth,
  changedConfig,
  checkIsNeedRestart,
  convertLineToComma,
  diffConfig,
  generateRandomInt,
  getEngineConnectionPolicy
} from '@shared/utils'
import { reduceTrackerString } from '@shared/utils/tracker'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'
import '@/components/Icons/dice'
import '@/components/Icons/refresh'
import '@/components/Icons/folder'
import { getLanguage } from '@shared/locales'
import { getLocaleManager } from '@/components/Locale'

defineOptions({ name: 'mo-preference-advanced' })

let textMeasureCanvas = null
let _filterTimer = null

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const route = useRoute()
const router = useRouter()

const props = defineProps({
  category: {
    type: String,
    default: 'advanced'
  }
})

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { isCheckingUpdate } = storeToRefs(appStore)
const { updateAvailable, newVersion, updateIsPrerelease, isDownloadingUpdate, updateDownloaded, downloadProgress, downloadTotal, downloadTransferred, releaseNotes, lastCheckUpdateTime, searchKeyword } = storeToRefs(preferenceStore)
const { engineInfo: storeEngineInfo } = storeToRefs(appStore)



const initForm = (config) => {
    const {
      autoCheckUpdate,
      hideAppMenu,
      lastCheckUpdateTime,
      logLevel,
      protocols,
      proxy,
      rpcListenPort,
      rpcSecret,
      scheduler,
      useProxy,
      userAgent,
      engineBinary,
      githubMirrorUrls
    } = config
    // 兼容 kebab-case 配置键；历史默认值 'latest' 归一为 'stable'
    // 注意：loadConfig 已将配置全部 camelCase 化，优先读 config.updateChannel
    const rawChannel = config.updateChannel !== undefined
      ? config.updateChannel
      : config['update-channel']
    const updateChannel = rawChannel === 'latest' ? 'stable' : (rawChannel || 'stable')
    // 兼容旧的单个镜像配置
    const githubMirrorUrl = config.githubMirrorUrl || config['github-mirror-url']
    // 兼容 kebab-case 配置键
    const parsedGithubMirrorUrls = githubMirrorUrls || config['github-mirror-urls']
    // 默认镜像列表（默认选择所有内置镜像）
    const defaultMirrors = ['ghproxy.net']
    // 兼容旧的kebab-case配置键
    const parsedEngineBinary = engineBinary || config['engine-binary'] || ''
    // 兼容旧版代理配置（旧版使用 enable 字段，新版使用 mode 字段）
    const clonedProxy = cloneDeep(proxy) || {}
    if (!clonedProxy.mode) {
      // 如果没有 mode 字段，根据旧的 enable 字段设置默认值
      clonedProxy.mode = clonedProxy.enable ? 'custom' : 'none'
    }
    // 调度引擎配置默认值 - 实时模式
    const defaultScheduler = {
      enabled: false,
      minFileSize: 10,
      minFileSizeUnit: 'M',
      maxRebalanceCount: 50,
      activeOptimizationInterval: 5
    }
    const clonedScheduler = { ...defaultScheduler, ...(scheduler || {}) }
    const result = {
      autoCheckUpdate,
      updateChannel,
      hideAppMenu,
      lastCheckUpdateTime,
      logLevel,
      protocols: { ...protocols },
      proxy: clonedProxy,
      rpcListenPort,
      rpcSecret,
      scheduler: clonedScheduler,
      useProxy,
      userAgent,
      engineBinary: parsedEngineBinary,
      githubMirrorUrls: Array.isArray(parsedGithubMirrorUrls) && parsedGithubMirrorUrls.length > 0
        ? parsedGithubMirrorUrls
        : (githubMirrorUrl ? [githubMirrorUrl] : defaultMirrors)
    }
    return result
  }

// --- Data ---
// Initialize from store
const form = ref(initForm(preferenceConfig.value))
const formLabelWidth = ref(calcFormLabelWidth(preferenceConfig.value.locale))
const formOriginal = ref(initForm(preferenceConfig.value))
const advancedForm = ref(null)
const hideRpcSecret = ref(true)
const proxyScopeOptions = ref(PROXY_SCOPE_OPTIONS)
const rules = ref({})
const builtinGithubMirrors = ref([
  { value: 'ghproxy.net', label: 'ghproxy.net', latency: null, checking: false }
])
const githubMirrorCheckingAll = ref(false)
let mirrorCheckTimeout = null
const previousGithubMirrorUrls = ref([])
const githubMirrorConfigVisible = ref(false)
const githubMirrorInput = ref('')
let saveTimeout = null
const appVersion = ref('')
const updatePreviewVisible = ref(false)
const updatePreviewContent = ref('')
const hasNoResults = ref(false)
const ffmpegStatus = ref({ installed: false, path: '' })
const uaOptions = ref([
  { value: 'aria2', label: 'Aria2' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'du', label: 'du' }
])

// --- Computed ---
const updateChannelOptions = computed(() => [
  { value: 'stable', label: t('preferences.update-channel-stable') },
  { value: 'beta', label: t('preferences.update-channel-beta') },
  { value: 'all', label: t('preferences.update-channel-all') }
])
const versionText = computed(() => {
  const bytesToSizeFn = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  }
  if (updateDownloaded.value) return t('app.restart-to-install')
  if (isDownloadingUpdate.value) {
    const transferred = bytesToSizeFn(downloadTransferred.value, 2)
    const total = bytesToSizeFn(downloadTotal.value, 2)
    if (downloadTotal.value > 0) return `下载中 ${downloadProgress.value}% (${transferred} / ${total})`
    return `下载中 ${downloadProgress.value}%`
  }
  if (updateAvailable.value) {
    const betaTag = updateIsPrerelease.value ? ' (Beta)' : ''
    return `下载新版本 ${newVersion.value}${betaTag}`
  }
  return appVersion.value
})
const configEngineBinary = computed(() => {
  const config = preferenceConfig.value || {}
  return config.engineBinary || config['engine-binary']
})
const activeEngineBinary = computed(() => storeEngineInfo.value.binPath || configEngineBinary.value || '')
const engineInfo = computed(() => storeEngineInfo.value)
const isRenderer = is.renderer()
const activeCategory = computed(() => props.category || 'advanced')
const title = computed(() => {
  const subnav = subnavs.value.find(item => item.key === activeCategory.value)
  return subnav ? subnav.title : t('preferences.advanced')
})
const preferenceBasePath = computed(() => {
  const p = `${route.path || ''}`
  return p.startsWith('/preference-window') ? '/preference-window' : '/preference'
})
const subnavs = computed(() => {
  const base = preferenceBasePath.value
  return [
    { key: 'basic', title: t('preferences.basic'), route: `${base}/basic` },
    { key: 'appearance', title: t('preferences.appearance'), route: `${base}/appearance` },
    { key: 'transfer', title: t('preferences.transfer-settings'), route: `${base}/transfer` },
    { key: 'bt', title: t('preferences.bt-settings'), route: `${base}/bt` },
    { key: 'task', title: t('preferences.task-manage'), route: `${base}/task` },
    { key: 'file', title: t('preferences.file-manage'), route: `${base}/file` },
    { key: 'advanced', title: t('preferences.advanced'), route: `${base}/advanced` },
    { key: 'lab', title: t('preferences.lab'), route: `${base}/lab` }
  ]
})
const rpcDefaultPort = computed(() => ENGINE_RPC_PORT)
const logLevels = computed(() => LOG_LEVELS)
const logPath = computed(() => preferenceConfig.value.logPath)
const sessionPath = computed(() => preferenceConfig.value.sessionPath)
const aria2LogPath = computed(() => preferenceConfig.value.aria2LogPath)
const aria2LogDir = computed(() => preferenceConfig.value.aria2LogDir)
const schedulerSpeedUnits = computed(() => [
  { label: 'KB/s', value: 'K' },
  { label: 'MB/s', value: 'M' }
])
const schedulerSizeUnits = computed(() => [
  { label: 'MB', value: 'M' },
  { label: 'GB', value: 'G' }
])
const activeUAValue = computed(() => {
  const map = userAgentMap
  const current = form.value && form.value.userAgent
  const hit = uaOptions.value.find(opt => map[opt.value] === current)
  return hit ? hit.value : ''
})

// --- Watchers ---
watch(() => form.value.autoCheckUpdate, (newValue) => {
  if (!newValue) {
    preferenceStore.updateUpdateAvailable(false)
    preferenceStore.updateNewVersion('')
  }
})
watch(githubMirrorConfigVisible, (visible) => {
  if (!visible) {
    document.removeEventListener('mousedown', handleGithubMirrorOutsideClick)
  }
})
watch(searchKeyword, (val) => {
  applyFilters(val)
}, { immediate: true })
watch(() => props.category, () => {
  applyFilters(searchKeyword.value)
}, { immediate: true })
watch(form, () => {
  autoSaveForm()
}, { deep: true })
watch(() => form.value.rpcListenPort, (val) => {
  const url = buildRpcUrl({ port: form.value.rpcListenPort, secret: val })
  try { ipcRenderer.invoke('clipboard:write-text', url) } catch (e) {}
})
watch(() => form.value.rpcSecret, (val) => {
  const url = buildRpcUrl({ port: form.value.rpcListenPort, secret: val })
  try { ipcRenderer.invoke('clipboard:write-text', url) } catch (e) {}
})

// --- Lifecycle ---
onMounted(async () => {
  await fetchEngineList()
  await fetchEngineInfo()
  checkFfmpegStatus()
  previousGithubMirrorUrls.value = [...(form.value.githubMirrorUrls || [])]
  if (form.value.githubMirrorUrls && form.value.githubMirrorUrls.length > 0) {
    setTimeout(() => {
      checkSelectedGithubMirrors().catch(() => {})
    }, 1000)
  }
  try {
    const appConfig = await ipcRenderer.invoke('get-app-config')
    appVersion.value = appConfig.version
    const updateStatus = await ipcRenderer.invoke('get-update-status')
    if (updateStatus.isChecking) {
      appStore.updateCheckingUpdate(true)
    } else {
      appStore.updateCheckingUpdate(false)
    }
    preferenceStore.updateIsDownloadingUpdate(updateStatus.isDownloading)
    preferenceStore.updateUpdateDownloaded(updateStatus.updateDownloaded)
    if (updateStatus.isDownloading) {
      preferenceStore.updateDownloadProgress(updateStatus.downloadProgress || 0)
      preferenceStore.updateDownloadSize({
        total: updateStatus.downloadTotal || 0,
        transferred: updateStatus.downloadTransferred || 0
      })
      if (updateStatus.newVersion) preferenceStore.updateNewVersion(updateStatus.newVersion)
      if (updateStatus.releaseNotes) preferenceStore.updateReleaseNotes(updateStatus.releaseNotes)
      preferenceStore.updateUpdateAvailable(false)
    } else if (updateStatus.updateDownloaded) {
      preferenceStore.updateUpdateAvailable(false)
      if (updateStatus.newVersion) preferenceStore.updateNewVersion(updateStatus.newVersion)
      if (updateStatus.releaseNotes) preferenceStore.updateReleaseNotes(updateStatus.releaseNotes)
    } else {
      const configFromStore = preferenceConfig.value
      if (configFromStore) {
        const ua = configFromStore['update-available'] || configFromStore.updateAvailable || false
        const nv = configFromStore['new-version'] || configFromStore.newVersion || ''
        const lct = configFromStore['last-check-update-time'] || configFromStore.lastCheckUpdateTime || 0
        const rn = configFromStore['release-notes'] || configFromStore.releaseNotes || ''
        if (ua && nv && isVersionNewer(nv, appVersion.value)) {
          preferenceStore.updateUpdateAvailable(ua)
          preferenceStore.updateNewVersion(nv)
          preferenceStore.updateLastCheckUpdateTime(lct)
          if (rn) preferenceStore.updateReleaseNotes(rn)
        }
      }
    }
  } catch (e) {
    console.warn('[Lerxu] Failed to get update status:', e)
  }
})

// --- Methods ---

      // 完整版本比较（与主进程 UpdateManager 的 semver 语义一致）：
      // 保留 pre-release 标签（3.0.2-Beta1 < 3.0.2-Beta2 < 3.0.2），
      // 用于校验持久化配置中残留的"有新版本"状态是否仍然有效，
      // 避免 Beta 用户已检测到正式版更新却因版本号折叠被误判过期。
      function isVersionNewer(a, b) {
        if (!a || !b) return false
        const parse = (v) => {
          const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
          if (!m) return null
          return {
            major: parseInt(m[1], 10),
            minor: parseInt(m[2], 10),
            patch: parseInt(m[3], 10),
            pre: m[4] ? m[4].toLowerCase().split('.') : null
          }
        }
        const pa = parse(a)
        const pb = parse(b)
        if (!pa || !pb) return false
        if (pa.major !== pb.major) return pa.major > pb.major
        if (pa.minor !== pb.minor) return pa.minor > pb.minor
        if (pa.patch !== pb.patch) return pa.patch > pb.patch
        // 正式版大于 pre-release；同为 pre-release 时逐标识符比较（与 semver 规则一致）
        if (!pa.pre) return !!pb.pre
        if (!pb.pre) return false
        const len = Math.max(pa.pre.length, pb.pre.length)
        for (let i = 0; i < len; i++) {
          const x = pa.pre[i]
          const y = pb.pre[i]
          if (x === undefined) return false
          if (y === undefined) return true
          if (x === y) continue
          const xn = /^\d+$/.test(x)
          const yn = /^\d+$/.test(y)
          if (xn && yn) return parseInt(x, 10) > parseInt(y, 10)
          if (xn) return false // 数字标识符 < 字母标识符
          if (yn) return true
          return x > y
        }
        return false
      }
      function measureTextWidth(text, font) {
        try {
          const canvas = textMeasureCanvas || (textMeasureCanvas = document.createElement('canvas'))
          const ctx = canvas.getContext('2d')
          if (!ctx) return `${text || ''}`.length * 10
          ctx.font = font || '12px sans-serif'
          return ctx.measureText(`${text || ''}`).width
        } catch (_) {
          return `${text || ''}`.length * 10
        }
      }

      // GitHub 镜像延迟检测
      async function checkGithubMirrorLatency(mirror) {
        // 使用一个小的测试文件来检测延迟
        // 使用 GitHub 的 favicon 或其他小文件
        const testUrl = `https://${mirror.value}/https://raw.githubusercontent.com/github/explore/main/README.md`
        const startTime = Date.now()

        try {
          // 在 Electron 中使用 fetch，但添加更宽松的选项
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 8000) // 增加到8秒超时

          const response = await fetch(testUrl, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-cache',
            mode: 'cors',
            credentials: 'omit'
          })

          clearTimeout(timeoutId)

          // 检查响应状态
          if (response.ok) {
            const latency = Date.now() - startTime
            console.log(`[GitHub Mirror] ${mirror.value} latency: ${latency}ms`)
            return latency
          } else {
            console.warn(`[GitHub Mirror] ${mirror.value} returned status: ${response.status}`)
            return -1
          }
        } catch (error) {
          const latency = Date.now() - startTime
          console.warn(`[GitHub Mirror] Check ${mirror.value} failed after ${latency}ms:`, error.message)
          return -1
        }
      }
      async function checkAllGithubMirrors() {
        githubMirrorCheckingAll.value = true
        try {
          // 并发检测所有镜像
          const checkPromises = builtinGithubMirrors.value.map(async (mirror) => {
            mirror.checking = true
            try {
              const latency = await checkGithubMirrorLatency(mirror)
              mirror.latency = latency
            } catch (e) {
              mirror.latency = -1
            } finally {
              mirror.checking = false
            }
          })

          await Promise.all(checkPromises)
        } catch (e) {
          console.warn('[GitHub Mirror] checkAll failed:', e && e.message ? e.message : e)
        } finally {
          githubMirrorCheckingAll.value = false
        }
      }
      async function checkSelectedGithubMirrors() {
        // 只检测已选择的镜像
        const selectedMirrors = builtinGithubMirrors.value.filter(mirror =>
          form.value.githubMirrorUrls && form.value.githubMirrorUrls.includes(mirror.value)
        )

        if (selectedMirrors.length === 0) {
          return
        }

        console.log('[GitHub Mirror] Checking selected mirrors:', selectedMirrors.map(m => m.value))

        githubMirrorCheckingAll.value = true
        try {
          // 并发检测选中的镜像
          const checkPromises = selectedMirrors.map(async (mirror) => {
            mirror.checking = true
            try {
              const latency = await checkGithubMirrorLatency(mirror)
              mirror.latency = latency
            } catch (e) {
              mirror.latency = -1
            } finally {
              mirror.checking = false
            }
          })

          await Promise.all(checkPromises)
        } catch (e) {
          console.warn('[GitHub Mirror] checkSelected failed:', e && e.message ? e.message : e)
        } finally {
          githubMirrorCheckingAll.value = false
        }
      }
      function openGithubMirrorConfigDialog() {
        if (githubMirrorConfigVisible.value) {
          closeGithubMirrorPopup()
          return
        }
        githubMirrorInput.value = ''
        githubMirrorConfigVisible.value = true
        nextTick(() => {
          adjustGithubMirrorPopupPosition()
          document.addEventListener('mousedown', handleGithubMirrorOutsideClick)
        })
      }
      function adjustGithubMirrorPopupPosition() {
        const popup = document.querySelector('.github-mirror-popup')
        const wrapper = document.querySelector('.github-mirror-popup-wrapper')
        if (!popup || !wrapper) return
        const popupRect = popup.getBoundingClientRect()
        const viewportW = window.innerWidth
        const viewportH = window.innerHeight
        popup.style.left = ''
        popup.style.right = ''
        popup.style.top = ''
        popup.style.bottom = ''
        popup.style.marginTop = ''
        popup.style.marginBottom = ''
        popup.style.transformOrigin = 'top right'
        if (popupRect.right > viewportW - 8) {
          popup.style.right = '0'
        }
        if (popupRect.left < 8) {
          popup.style.left = '0'
          popup.style.right = ''
          popup.style.transformOrigin = 'top left'
        }
        if (popupRect.bottom > viewportH - 8) {
          popup.style.top = 'auto'
          popup.style.bottom = '100%'
          popup.style.marginBottom = '6px'
          popup.style.marginTop = '0'
          if (popup.style.right === '0') {
            popup.style.transformOrigin = 'bottom right'
          } else if (popup.style.left === '0') {
            popup.style.transformOrigin = 'bottom left'
          } else {
            popup.style.transformOrigin = 'bottom right'
          }
        }
      }
      function handleGithubMirrorOutsideClick(e) {
        const wrapper = document.querySelector('.github-mirror-popup-wrapper')
        if (wrapper && !wrapper.contains(e.target)) {
          closeGithubMirrorPopup()
        }
      }
      function closeGithubMirrorPopup() {
        const popup = document.querySelector('.github-mirror-popup')
        if (popup) {
          popup.style.left = ''
          popup.style.right = ''
          popup.style.top = ''
          popup.style.bottom = ''
          popup.style.marginTop = ''
          popup.style.marginBottom = ''
          popup.style.transformOrigin = ''
        }
        githubMirrorConfigVisible.value = false
        document.removeEventListener('mousedown', handleGithubMirrorOutsideClick)
      }
      function addGithubMirrorFromInput() {
        const input = (githubMirrorInput.value || '').trim()
        if (!input) {
          msg.error(t('preferences.github-mirror-input-empty'))
          return
        }

        // 移除协议前缀（如果有）
        const mirrorUrl = input.replace(/^https?:\/\//, '')

        // 检查是否已存在
        if (form.value.githubMirrorUrls && form.value.githubMirrorUrls.includes(mirrorUrl)) {
          msg.warning(t('preferences.github-mirror-already-exists'))
          closeGithubMirrorPopup()
          return
        }

        // 添加到列表
        const currentUrls = form.value.githubMirrorUrls || []
        form.value.githubMirrorUrls = [...currentUrls, mirrorUrl]

        // 保存配置
        autoSaveForm()

        // 关闭弹窗
        closeGithubMirrorPopup()

        // 提示添加成功
        msg.success(t('preferences.github-mirror-add-success'))
      }
      function onGithubMirrorChange(newValue) {
        // 保存配置
        autoSaveForm()

        // 找出新添加的镜像（在新列表中但不在旧列表中的）
        const previousUrls = previousGithubMirrorUrls.value || []
        const currentUrls = newValue || []
        const newlyAddedUrls = currentUrls.filter(url => !previousUrls.includes(url))

        // 更新保存的列表
        previousGithubMirrorUrls.value = [...currentUrls]

        // 如果有新添加的镜像，自动检测它们
        if (newlyAddedUrls.length > 0) {
          console.log('[GitHub Mirror] Newly added mirrors:', newlyAddedUrls)

          // 延迟一小段时间，避免频繁切换时重复检测
          if (mirrorCheckTimeout) {
            clearTimeout(mirrorCheckTimeout)
          }

          mirrorCheckTimeout = setTimeout(() => {
            checkSpecificMirrors(newlyAddedUrls)
          }, 500)
        }
      }
      async function checkSpecificMirrors(mirrorUrls) {
        // 检测指定的镜像
        const mirrorsToCheck = builtinGithubMirrors.value.filter(mirror =>
          mirrorUrls.includes(mirror.value)
        )

        if (mirrorsToCheck.length === 0) {
          return
        }

        console.log('[GitHub Mirror] Checking specific mirrors:', mirrorsToCheck.map(m => m.value))

        // 并发检测指定的镜像
        const checkPromises = mirrorsToCheck.map(async (mirror) => {
          mirror.checking = true
          const latency = await checkGithubMirrorLatency(mirror)
          mirror.latency = latency
          mirror.checking = false
        })

        await Promise.all(checkPromises)
      }
      function formatLatency(latency) {
        if (latency === null) {
          return ''
        }
        if (latency < 0) {
          return t('preferences.github-mirror-timeout')
        }
        if (latency < 1000) {
          return `${latency}ms`
        }
        return `${(latency / 1000).toFixed(2)}s`
      }
      function getLatencyColor(latency) {
        if (latency < 0) {
          return '#F56C6C' // 红色 - 失败
        }
        if (latency < 500) {
          return '#67C23A' // 绿色 - 快速
        }
        if (latency < 1500) {
          return '#E6A23C' // 橙色 - 中等
        }
        return '#F56C6C' // 红色 - 慢
      }
      function checkFfmpegStatus() {
        // 异步检测，避免阻塞 UI
        setTimeout(() => {
          doCheckFfmpegStatus()
        }, 0)
      }
function doCheckFfmpegStatus() {
const ffmpegExeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

// 检查用户数据目录
try {
const userDataPath = app.getPath('userData')
          const userFfmpegPath = resolve(userDataPath, 'ffmpeg', ffmpegExeName)
          if (existsSync(userFfmpegPath)) {
            ffmpegStatus.value = { installed: true, path: userFfmpegPath }
            return
          }
        } catch (e) {
          console.warn('[FFmpeg] Check userData failed:', e)
        }

// 检查应用安装目录（通过 exe 路径获取）
try {
const exePath = app.getPath('exe')
          const appDir = dirname(exePath)
          const appFfmpegPath = resolve(appDir, ffmpegExeName)
          console.log('[FFmpeg] Checking app dir:', appFfmpegPath)
          if (existsSync(appFfmpegPath)) {
            ffmpegStatus.value = { installed: true, path: appFfmpegPath }
            return
          }
        } catch (e) {
          console.warn('[FFmpeg] Check appDir failed:', e)
        }

        // 检查应用资源目录
        try {
          const rp = process.resourcesPath || ''
          if (rp) {
            const candidates = [
              resolve(rp, ffmpegExeName),
              resolve(rp, 'ffmpeg-8.0.1-essentials_build', 'bin', ffmpegExeName),
              resolve(rp, 'ffmpeg-8.0.1-essentials_build', ffmpegExeName)
            ]
            for (const p of candidates) {
              if (existsSync(p)) {
                ffmpegStatus.value = { installed: true, path: p }
                return
              }
            }
          }
        } catch (e) {
          console.warn('[FFmpeg] Check resourcesPath failed:', e)
        }

// 检查系统 PATH（使用异步 spawn 避免阻塞）
try {
const child = spawn('ffmpeg', ['-version'], { windowsHide: true })
          child.on('error', () => {
            ffmpegStatus.value = { installed: false, path: '' }
          })
          child.on('close', (code) => {
            if (code === 0) {
              ffmpegStatus.value = { installed: true, path: '' }
            } else {
              ffmpegStatus.value = { installed: false, path: '' }
            }
          })
          // 设置超时
          setTimeout(() => {
            try {
              child.kill()
            } catch (_) {}
          }, 3000)
        } catch (_) {
          ffmpegStatus.value = { installed: false, path: '' }
        }
      }
function openFfmpegFolder() {
if (!ffmpegStatus.value.path) return
const path = ffmpegStatus.value.path
        // 打开文件所在目录
        try {
          const folderPath = dirname(path)
          shell.openPath(folderPath)
        } catch (e) {
          console.warn('[FFmpeg] Open folder failed:', e)
        }
      }
function openAria2LogFolder() {

// 优先尝试打开日志文件
if (aria2LogPath.value && existsSync(aria2LogPath.value)) {
          try {
            shell.showItemInFolder(aria2LogPath.value)
            return
          } catch (e) {
            console.warn('[Aria2] Show log file failed:', e)
          }
        }

        // 如果文件不存在，打开日志目录
        if (aria2LogDir.value) {
          try {
            shell.openPath(aria2LogDir.value)
          } catch (e) {
            console.warn('[Aria2] Open log directory failed:', e)
          }
        } else if (aria2LogPath.value) {
          // 降级：从日志路径提取目录
          try {
            const folderPath = dirname(aria2LogPath.value)
            shell.openPath(folderPath)
          } catch (e) {
            console.warn('[Aria2] Open log folder failed:', e)
          }
        }
      }
      function applyFilters(keyword) {
        if (_filterTimer) {
          clearTimeout(_filterTimer)
        }
        _filterTimer = setTimeout(() => {
          filterCards(keyword, activeCategory.value)
        }, 120)
      }
      function filterCards(keyword, category) {
        nextTick(() => {
          if (!document.querySelector('.preference-panel')) return
          const cards = document.querySelectorAll('.preference-card')
          const k = (keyword || '').toLowerCase()
          let visibleCount = 0
          cards.forEach(card => {
            if (!k) {
              card.style.display = ''
              visibleCount++
              return
            }
            const text = card.textContent.toLowerCase()
            if (text.includes(k)) {
              card.style.display = ''
              visibleCount++
            } else {
              card.style.display = 'none'
            }
          })
          hasNoResults.value = visibleCount === 0 && k !== ''
        })
      }

      function hasMsgSupport() {
        return typeof msg !== 'undefined' && msg !== null
      }
      function showMessage(type, message) {
        if (hasMsgSupport()) {
          msg[type](message)
        } else {
          console.log(`[Lerxu] Update message: ${type} - ${message}`)
          if (type === 'error') {
            alert(message)
          }
        }
      }
      // 版本项点击处理：每个分支都给出可见反馈，
      // 避免任何状态下"点击无反应"。
      function handleVersionItemClick() {
        if (updateDownloaded.value) {
          installUpdate()
        } else if (isDownloadingUpdate.value) {
          showMessage('info', t('app.downloading-new-version'))
        } else if (updateAvailable.value) {
          downloadUpdate()
        } else if (isCheckingUpdate.value) {
          showMessage('info', t('app.checking-for-updates'))
        } else {
          onCheckUpdateClick()
        }
      }
      // 安装更新
      function installUpdate() {
        showMessage('info', t('app.preparing-update-restart'))
        ipcRenderer.send('command', 'application:quit-and-install-update')
      }
      function downloadUpdate() {
        if (isDownloadingUpdate.value) return
        preferenceStore.updateIsDownloadingUpdate(true)
        preferenceStore.updateUpdateDownloaded(false)
        preferenceStore.updateDownloadProgress(0)
        preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })
        showMessage('info', t('app.downloading-new-version'))
        const cleanupListeners = () => {
          ipcRenderer.removeListener('download-progress', onDownloadProgress)
          ipcRenderer.removeListener('update-downloaded', onDownloaded)
          ipcRenderer.removeListener('update-error', onDownloadError)
          ipcRenderer.removeListener('update-cancelled', onDownloadCancelled)
        }
        const onDownloadProgress = (event, progress) => {
          preferenceStore.updateDownloadProgress(Math.round(progress.percent))
          preferenceStore.updateDownloadSize({
            total: progress.total || 0,
            transferred: progress.transferred || 0
          })
        }
        const onDownloaded = () => {
          preferenceStore.updateIsDownloadingUpdate(false)
          preferenceStore.updateUpdateAvailable(false)
          showMessage('success', t('app.update-download-complete-restart'))
          cleanupListeners()
        }
        const onDownloadError = (_event, errMsg) => {
          preferenceStore.updateIsDownloadingUpdate(false)
          const msg = errMsg ? t('app.update-download-failed', { message: errMsg }) : t('app.update-download-failed-network')
          showMessage('error', msg)
          cleanupListeners()
        }
        const onDownloadCancelled = () => {
          preferenceStore.updateIsDownloadingUpdate(false)
          showMessage('info', t('app.update-download-cancelled'))
          cleanupListeners()
        }
        ipcRenderer.on('download-progress', onDownloadProgress)
        ipcRenderer.on('update-downloaded', onDownloaded)
        ipcRenderer.on('update-error', onDownloadError)
        ipcRenderer.on('update-cancelled', onDownloadCancelled)
        ipcRenderer.send('command', 'application:download-update')
      }

      // 获取引擎列表方法
      async function fetchEngineList() {
        try {
          await appStore.fetchEngineList()
        } catch (error) {
          console.error('Failed to get engine list:', error)
          msg.error(t('preferences.engine-list-fetch-error') || 'Failed to fetch engine list')
        }
      }
      async function fetchEngineInfo() {
        try {
          await appStore.fetchEngineInfo()
        } catch (error) {
          console.error('Failed to get engine info:', error)
        }
      }
      function onProtocolsChange(protocol, enabled) {
        const { protocols } = form.value
        form.value.protocols = {
          ...protocols,
          [protocol]: enabled
        }
      }
      function autoSaveForm() {
        // Debounce auto-save to avoid too many requests
        if (saveTimeout) {
          clearTimeout(saveTimeout)
        }
        saveTimeout = setTimeout(() => {
          // Double-check there are actual changes before submitting
          if (!isEmpty(diffConfig(formOriginal.value, form.value))) {
            submitForm('advancedForm')
          }
        }, 800)
      }
      function onProxyModeChange(mode) {
        form.value.proxy = {
          ...form.value.proxy,
          mode
        }
      }
      function onProxyServerChange(server) {
        form.value.proxy = {
          ...form.value.proxy,
          server
        }
      }
      function handleProxyBypassChange(bypass) {
        form.value.proxy = {
          ...form.value.proxy,
          bypass: convertLineToComma(bypass)
        }
      }
      function onUpdateChannelChange(channel) {
        form.value.updateChannel = channel
        // 立即保存（不走 800ms 防抖：防抖期间关闭窗口会导致保存请求
        // 未发出，重开窗口回退为初始渠道）。
        const original = formOriginal.value.updateChannel
        try {
          preferenceStore.save({ 'update-channel': channel })
          formOriginal.value.updateChannel = channel
          // 清除之前的更新状态，以便下次检查使用新渠道
          preferenceStore.updateUpdateAvailable(false)
          preferenceStore.updateNewVersion('')
          // 渠道已提交到主进程（IPC 消息有序，check 必然在其后处理），
          // 立即用新渠道触发一次新版本检测
          try {
            onCheckUpdateClick()
          } catch (checkErr) {
            // 检查流程异常不影响渠道切换本身
            console.error('[Lerxu] Trigger update check after channel switch failed:', checkErr)
          }
        } catch (e) {
          console.error('[Lerxu] Save update channel failed:', e)
          form.value.updateChannel = original
          msg.error(t('preferences.save-fail-message'))
        }
      }
      function changeUA(type) {
        const ua = userAgentMap[type]
        if (!ua) {
          return
        }
        form.value.userAgent = ua
      }
      function onRpcListenPortChange(value) {
        if (EMPTY_STRING === value) {
          form.value.rpcListenPort = rpcDefaultPort.value
        }
      }
      function onRpcPortDiceClick() {
        const port = generateRandomInt(ENGINE_RPC_PORT, 20000)
        form.value.rpcListenPort = port
      }
      function onRpcSecretDiceClick() {
        hideRpcSecret.value = false
        const rpcSecret = randomize('Aa0', 16)
        form.value.rpcSecret = rpcSecret

        setTimeout(() => {
          hideRpcSecret.value = true
        }, 2000)
      }
      function onSessionResetClick() {
        dialog.showMessageBox({
          type: 'warning',
          title: t('preferences.session-reset'),
          message: t('preferences.session-reset-confirm'),
          buttons: [t('app.yes'), t('app.no')],
          cancelId: 1
        }).then(({ response }) => {
          if (response === 0) {
            taskStore.purgeTaskRecord()
            taskStore.pauseAllTask()
              .then(() => {
                ipcRenderer.send('command', 'application:reset-session')
              })
          }
        })
      }
      function onFactoryResetClick() {
        dialog.showMessageBox({
          type: 'warning',
          title: t('preferences.factory-reset'),
          message: t('preferences.factory-reset-confirm'),
          buttons: [t('app.yes'), t('app.no')],
          cancelId: 1
        }).then(({ response }) => {
          if (response === 0) {
            ipcRenderer.send('command', 'application:factory-reset')
          }
        })
      }
      function closeUpdatePreview() {
        updatePreviewVisible.value = false
      }
      function handleUpdatePreviewClick(event) {
        const root = event.currentTarget
        let el = event.target
        while (el && el !== root) {
          if (el.tagName && el.tagName.toLowerCase() === 'a') {
            break
          }
          el = el.parentNode
        }
        if (!el || el === root) {
          return
        }
        const href = el.getAttribute('href') || ''
        if (!href || href.charAt(0) === '#') {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (!/^https?:\/\//i.test(href)) {
          return
        }
        try {
          ipcRenderer.send('command', 'application:open-external', href)
        } catch (e) {
          console.error('[Lerxu] open external url failed:', href, e)
        }
      }
      function getEngineMaxConnection(engineBinary) {
        const policy = getEngineConnectionPolicy(engineBinary)
        return Number(policy && policy.max) || ENGINE_MAX_CONNECTION_PER_SERVER
      }
      function getEngineDefaultConnection(engineBinary) {
        const policy = getEngineConnectionPolicy(engineBinary)
        return Number(policy && policy.defaultMax) || ENGINE_MAX_CONNECTION_PER_SERVER
      }
      function submitForm(formName) {
        const formRef = advancedForm.value
        if (!formRef) {
          console.error('[Lerxu] form ref not found:', formName)
          return false
        }
        formRef.validate((valid) => {
          if (!valid) {
            console.error('[Lerxu] preference form valid:', valid)
            return false
          }

          const data = {
            ...diffConfig(formOriginal.value, form.value),
            ...changedConfig.advanced
          }

          if ('engineBinary' in data) {
            const engineBinary = data.engineBinary
            const engineMaxConnectionPerServer = getEngineMaxConnection(engineBinary)
            const engineDefaultConnectionPerServer = getEngineDefaultConnection(engineBinary)
            data['engine-binary'] = engineBinary
            data['engine-max-connection-per-server'] = engineMaxConnectionPerServer
            data['max-connection-per-server'] = engineDefaultConnectionPerServer
            delete data.engineBinary
          }

          // 显式处理 GitHub 镜像字段，转换为 kebab-case
          if ('useGithubMirror' in data) {
            data['use-github-mirror'] = data.useGithubMirror
            delete data.useGithubMirror
          }
          if ('githubMirrorUrls' in data) {
            data['github-mirror-urls'] = data.githubMirrorUrls
            delete data.githubMirrorUrls
          }

          // 显式处理 updateChannel 字段，转换为 kebab-case
          if ('updateChannel' in data) {
            data['update-channel'] = data.updateChannel
            delete data.updateChannel
          }

          const { autoHideWindow, rpcListenPort } = data

          if (rpcListenPort === EMPTY_STRING) {
            data.rpcListenPort = rpcDefaultPort.value
          }

          console.log('[Lerxu] preference changed data:', data)

          // 检查是否需要重启
          const needRelaunch = isRenderer && (
            ('engine-binary' in data && data['engine-binary'] !== formOriginal.value.engineBinary) ||
            checkIsNeedRestart(data)
          )

          preferenceStore.save(data)
            .then(() => {
              appStore.fetchEngineOptions()

              // NAT/uTP 开关属于"下次引擎启动生效"的设置：不触发自动重启，
              // 仅轻提示用户，避免点开关就 relaunch 整个应用。
              const restartOnNextBootKeys = ['enable-upnp', 'enable-utp', 'enable-nat-pmp']
              if (restartOnNextBootKeys.some(k => k in data)) {
                msg.info(t('preferences.restart-to-apply'))
              }

              changedConfig.advanced = {}
              changedConfig.basic = {}

              if (isRenderer) {
                if ('autoHideWindow' in data) {
                  ipcRenderer.send('command', 'application:auto-hide-window', autoHideWindow)
                }

                // 只有在配置保存成功后才发送重启命令
                if (needRelaunch) {
                  ipcRenderer.send('command', 'application:relaunch')
                  // 发送重启命令后立即返回，不再执行后续的同步表单配置
                  return
                }

                // 不需要重启时，才同步表单配置
                formOriginal.value = cloneDeep(form.value)
              }
            })
            .catch((e) => {
              console.error('[Lerxu] Save preference failed:', e)
              msg.error(t('preferences.save-fail-message'))
              changedConfig.advanced = {}
              changedConfig.basic = {}
            })
        })
      }
      function handleLocaleChange(locale) {
        const lng = getLanguage(locale)
        getLocaleManager().changeLanguage(lng)
        // 同步更新 vue-i18n 的 locale，使 t() 实时切换语言（composition 模式用 .value）
        i18n.global.locale.value = lng
        autoSaveForm()
      }
      function onCheckUpdateClick() {
        // 如果正在检查，给出可见提示而不是静默返回
        // （否则自动检查进行中时手动点击表现为"没反应"）
        if (isCheckingUpdate.value) {
          msg.info(t('app.checking-for-updates'))
          return
        }

        // 设置检查状态
        appStore.updateCheckingUpdate(true)

        // 显示检查中消息
        msg.info(t('app.checking-for-updates'))

        // 创建临时事件监听器，使用once确保只触发一次
        const onUpdateError = (_event, errMsg) => {
          const msg = errMsg || t('app.update-error-message')
          msg.error(msg)
          appStore.updateCheckingUpdate(false)
        }

        const onUpdateNotAvailable = () => {
          msg.success(t('app.update-not-available-message'))
          appStore.updateCheckingUpdate(false)
          preferenceStore.updateUpdateAvailable(false)
          preferenceStore.updateNewVersion('')
          preferenceStore.updateLastCheckUpdateTime(Date.now())
        }

        const onUpdateAvailable = (event, version, releaseNotes) => {
          msg.info(t('app.update-available-message'))
          appStore.updateCheckingUpdate(false)
          preferenceStore.updateUpdateAvailable(true)
          preferenceStore.updateNewVersion(version)
          preferenceStore.updateLastCheckUpdateTime(Date.now())
          preferenceStore.updateReleaseNotes(releaseNotes || '')
        }

        // 使用once监听事件，确保事件只处理一次
        ipcRenderer.once('update-error', onUpdateError)
        ipcRenderer.once('update-not-available', onUpdateNotAvailable)
        ipcRenderer.once('update-available', onUpdateAvailable)

        // 设置超时处理，防止无限期等待
        const timeout = setTimeout(() => {
          console.log('[Lerxu] Update check timed out')
          // 移除所有临时事件监听器
          ipcRenderer.removeListener('update-error', onUpdateError)
          ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable)
          ipcRenderer.removeListener('update-available', onUpdateAvailable)

          // 显示超时消息
          msg.error(t('app.update-timeout-message') || '更新检查超时，请稍后重试')
          appStore.updateCheckingUpdate(false)
        }, 30000) // 30秒超时（含镜像回退时间）

        // 监听任何更新事件，清除超时
        const clearTimeoutListener = () => {
          clearTimeout(timeout)
          console.log('[Lerxu] Update check completed, clearing timeout')
          // 移除清除超时的监听器
          ipcRenderer.removeListener('update-error', clearTimeoutListener)
          ipcRenderer.removeListener('update-not-available', clearTimeoutListener)
          ipcRenderer.removeListener('update-available', clearTimeoutListener)
        }
        ipcRenderer.once('update-error', clearTimeoutListener)
        ipcRenderer.once('update-not-available', clearTimeoutListener)
        ipcRenderer.once('update-available', clearTimeoutListener)

        // 发送检查更新命令
        console.log('[Lerxu] Sending check for updates command')
        ipcRenderer.send('command', 'application:check-for-updates')

        // 更新最后检查时间
        preferenceStore.fetchPreference()
          .then((config) => {
            const { lastCheckUpdateTime } = config
            form.value.lastCheckUpdateTime = lastCheckUpdateTime
          })
      }
      async function onPreviewUpdateClick() {
        try {
          const buildReleaseNotesHtml = (raw) => {
            if (!raw || typeof raw !== 'string') {
              return ''
            }
            let s = `${raw}`.trim()
            if (!s) {
              return ''
            }
            const sanitizeHtml = (dirtyHtml) => {
              try {
                const parser = new DOMParser()
                const doc = parser.parseFromString(`<div>${dirtyHtml}</div>`, 'text/html')
                const root = doc.body && doc.body.firstElementChild
                if (!root) {
                  return ''
                }

                const allowedTags = new Set([
                  'p', 'br',
                  'ul', 'ol', 'li',
                  'pre', 'code',
                  'strong', 'em', 'b', 'i',
                  'a',
                  'img',
                  'table', 'thead', 'tbody', 'tr', 'th', 'td',
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  'blockquote', 'hr'
                ])

                const isBlockedTag = (tag) => {
                  const t = `${tag || ''}`.toLowerCase()
                  return ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'].includes(t)
                }

                const normalizeUrlAttr = (value) => {
                  const v = `${value || ''}`.trim()
                  if (!v) return ''
                  if (/^https?:\/\//i.test(v)) return v
                  return ''
                }

                const sanitizeNode = (node, outDoc) => {
                  if (!node) return null
                  if (node.nodeType === Node.TEXT_NODE) {
                    return outDoc.createTextNode(node.textContent || '')
                  }
                  if (node.nodeType !== Node.ELEMENT_NODE) {
                    return null
                  }

                  const tag = (node.tagName || '').toLowerCase()
                  if (isBlockedTag(tag)) {
                    return null
                  }
                  if (!allowedTags.has(tag)) {
                    const frag = outDoc.createDocumentFragment()
                    while (node.firstChild) {
                      frag.appendChild(node.firstChild)
                    }
                    node.parentNode.replaceChild(frag, node)
                    return null
                  }
                  return node
                }

                // Walk the tree and sanitize all nodes
                const walkAndSanitize = (rootNode, outDoc) => {
                  const stack = []
                  let child = rootNode.firstChild
                  while (child) {
                    const next = child.nextSibling
                    const result = sanitizeNode(child, outDoc)
                    if (result && result.nodeType === Node.ELEMENT_NODE) {
                      stack.push(result)
                    }
                    child = next
                  }
                  while (stack.length) {
                    const el = stack.pop()
                    let c = el.firstChild
                    while (c) {
                      const n = c.nextSibling
                      const r = sanitizeNode(c, outDoc)
                      if (r && r.nodeType === Node.ELEMENT_NODE) {
                        stack.push(r)
                      }
                      c = n
                    }
                  }
                }

                const sanitizedDoc = new DOMParser().parseFromString('<div></div>', 'text/html')
                const sanitizedRoot = sanitizedDoc.body.firstElementChild || sanitizedDoc.body
                walkAndSanitize(root, sanitizedDoc)
                return sanitizedRoot.innerHTML
              } catch (e) {
                console.warn('[Lerxu] Failed to sanitize clipboard HTML:', e)
                return dirtyHtml
              }
            }

            const sanitized = sanitizeHtml(s)
            return sanitized
          }

          // Show preview dialog with release notes
          dialog.showMessageBox({
            type: 'info',
            title: 'Update Preview',
            message: buildReleaseNotesHtml(rawReleaseNotes) || 'No release notes available.'
          })
        } catch (e) {
          console.error('[Lerxu] Failed to preview update:', e)
          msg.error(t('preferences.update-preview-fail'))
        }
      }

</script>

<style lang="scss">
/* RPC 端口/密钥输入框右侧随机按钮：flex 居中 */
.rpc-dice-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;

  svg {
    display: block;
  }
}

/* RPC 端口/密钥输入框 append 区域：分割线右移、内边距加大，
   让按钮与输入框之间有更好的视觉间距 */
.el-input-group__append:has(.rpc-dice-btn) {
  padding: 0 12px 0 16px;

  &::before {
    left: 6px !important;
  }
}

.proxy-scope {
  width: 100%;
}
.bt-tracker {
  position: relative;
  .tracker-row {
    margin-bottom: 12px;
  }
  .track-source {
    .select-track-source {
      width: 100%;
    }
  }
  .el-textarea__inner {
    resize: vertical;
    overflow-y: auto;
  }
}
/* UA 快速选择滑块容器间距 */
.ua-segmented {
  margin-top: 8px;
}

.magnet-check-status {
  &.ok { color: #67C23A; }
  &.warn { color: #E6A23C; }
}

.no-results {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  user-select: none;
}

.no-results-inner {
  width: 100%;
  padding-top: 280px;
  background: transparent url('@/assets/no-settings.svg') top center no-repeat;
  background-size: 400px auto;
  text-align: center;
  font-size: 14px;
  color: #666;
}

.action-link {
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
    text-decoration: none;
  }
}

/* Local popup for adding github mirror (appears below the button) */
.github-mirror-popup-wrapper {
  position: relative;
  display: inline-flex;
}

.github-mirror-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 14px;
  width: 280px;
  background: var(--lc-bg-dropdown, #fff);
  border: none;
  border-radius: var(--lc-radius-dropdown);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 999;
  overflow: hidden;
  transform-origin: top right;
}

.github-mirror-popup__header {
  padding: 10px 14px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lc-text-primary, #333);
}

.github-mirror-popup__body {
  padding: 10px 14px;
}

.github-mirror-popup__body .el-input__inner {
  padding-left: 8px;
  padding-right: 8px;
  background-color: transparent !important;
}

.github-mirror-popup__footer {
  display: flex;
  justify-content: center;
  padding: 4px 8px 12px;
}

.github-mirror-popup__footer .el-button.el-button--primary,
.theme-dark .github-mirror-popup__footer .el-button.el-button--primary {
  border-radius: 8px;
  padding: 6px 20px;
  background-color: var(--lc-color-primary) !important;
  border-color: var(--lc-color-primary) !important;
  color: #fff !important;

  &:hover,
  &:focus {
    background-color: var(--lc-color-primary) !important;
    border-color: var(--lc-color-primary) !important;
    color: #fff !important;
    opacity: 0.85;
  }
}

/* popup-scale transition: 与全局弹窗一致的缩放动画 */
.popup-scale-enter-active {
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.popup-scale-leave-active {
  transition: transform 0.14s cubic-bezier(0.4, 0, 1, 1), opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}
.popup-scale-enter-from,
.popup-scale-leave-to {
  transform: scale(0.92);
  opacity: 0;
}

.update-preview-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3099;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.update-preview-body {
  max-width: 720px;
  width: 100%;
  max-height: 70vh;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 8px;
  padding: 16px 20px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.update-preview-confirm {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 3100;
}

.update-preview-html {
  white-space: normal;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.6;
}

.update-preview-html h1 {
  font-size: 20px;
  margin: 0 0 12px;
  font-weight: 600;
}

.update-preview-html h2 {
  font-size: 18px;
  margin: 16px 0 8px;
  font-weight: 600;
}

.update-preview-html h3 {
  font-size: 16px;
  margin: 14px 0 6px;
  font-weight: 600;
}

.update-preview-html p {
  margin: 0 0 10px;
}

.update-preview-html ul,
.update-preview-html ol {
  margin: 0 0 10px 0;
  padding-left: 1.5em;
}

.update-preview-html li {
  margin: 2px 0;
}

.update-preview-html a {
  color: #0366d6;
  text-decoration: none;
}

.update-preview-html a:hover {
  text-decoration: underline;
}

.update-preview-html code {
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 3px;
  background: rgba(27, 31, 35, 0.05);
}

.update-preview-html pre {
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  padding: 8px 10px;
  margin: 0 0 12px;
  border-radius: 4px;
  background: rgba(27, 31, 35, 0.06);
  overflow: auto;
}

.update-preview-html pre code {
  padding: 0;
  background: transparent;
}

.update-preview-html blockquote {
  margin: 0 0 10px;
  padding-left: 12px;
  border-left: 4px solid rgba(0, 0, 0, 0.1);
  color: #6a737d;
}

.update-preview-html img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 8px 0;
  border-radius: 4px;
}

.update-preview-html hr {
  height: 0;
  margin: 16px 0;
  border: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.update-preview-html del {
  text-decoration: line-through;
  opacity: 0.7;
}

.update-preview-html strong,
.update-preview-html b {
  font-weight: 600;
}

.update-preview-html em,
.update-preview-html i {
  font-style: italic;
}

.theme-dark .update-preview-body {
  background: var(--lc-bg-panel);
  color: #f2f2f2;
}

.theme-dark .update-preview-html a {
  color: #58a6ff;
}

.theme-dark .update-preview-html code {
  background: rgba(255, 255, 255, 0.12);
}

.theme-dark .update-preview-html pre {
  background: rgba(255, 255, 255, 0.06);
}

.github-mirror-row {
  align-items: stretch !important;
}

/* Element Plus: .el-select__wrapper 使用 box-shadow 作为边框，
   去掉右侧圆角和右侧边线（仅画上/下/左边），
   右侧分割线由 .github-mirror-actions::before 提供（带上下间距） */
.github-mirror-row .el-select .el-select__wrapper {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  /* 只画上、下、左三边的 inset shadow，不画右边 */
  box-shadow: inset 0 1px 0 0 var(--lc-border-base),
              inset 0 -1px 0 0 var(--lc-border-base),
              inset 1px 0 0 0 var(--lc-border-base) !important;
  transition: box-shadow 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}

// 悬停整个选择框（含标签区域）即触发边框高亮，而非仅悬停边框线
.github-mirror-row .el-select:hover:not(:focus-within) .el-select__wrapper {
  box-shadow: inset 0 1px 0 0 var(--lc-border-hover),
              inset 0 -1px 0 0 var(--lc-border-hover),
              inset 1px 0 0 0 var(--lc-border-hover) !important;
}

.github-mirror-row .el-select .el-select__wrapper.is-focused,
.github-mirror-row .el-select:focus-within .el-select__wrapper {
  box-shadow: inset 0 1px 0 0 var(--lc-color-primary),
              inset 0 -1px 0 0 var(--lc-color-primary),
              inset 1px 0 0 0 var(--lc-color-primary) !important;
}

/* 缩小 GitHub 镜像多选标签的大小，圆角适当减小，并增大标签间距 */
.github-mirror-row .el-select .el-tag {
  height: 20px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 18px;
  border-radius: 6px;
  margin-right: 8px;

  &:last-of-type {
    margin-right: 0;
  }

  .el-tag__close {
    transform: scale(0.85);
  }
}

/* 增大标签与选择框左边缘的间距 */
.github-mirror-row .el-select .el-select__wrapper {
  padding-left: 8px;
}

.github-mirror-actions {
  position: relative;
  margin-left: 0;
  display: flex;
  align-items: center;
  border: 1px solid var(--lc-border-base);
  border-left: none;
  border-radius: 0 6px 6px 0;
  background-color: var(--lc-bg-input);
  box-sizing: border-box;
  transition: border-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);

  /* 选择框与按钮之间的分割线：上方留 6px，下方留 6px */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background-color: var(--lc-border-base);
    z-index: 1;
    transition: background-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  .el-button {
    height: 100%;
    padding: 0 7px;
    position: relative;
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0;
    margin: 0 !important;

    &:not(:last-child)::after {
      content: '';
      position: absolute;
      right: 0;
      top: 6px;
      bottom: 6px;
      width: 1px;
      background-color: var(--lc-border-base);
      transition: background-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    &:hover,
    &:focus,
    &:active {
      background-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
  }
}

// 选择框悬停时，相邻按钮容器边框与分割线高亮
.github-mirror-row:has(.el-select:hover) .github-mirror-actions {
  border-color: var(--lc-border-hover);

  &::before {
    background-color: var(--lc-border-hover);
  }
}

// 选择框聚焦时，相邻按钮容器边框与分割线高亮（主题色）
.github-mirror-row:has(.el-select .el-select__wrapper.is-focused) .github-mirror-actions,
.github-mirror-row:has(.el-select:focus-within) .github-mirror-actions {
  border-color: var(--lc-color-primary);

  &::before {
    background-color: var(--lc-color-primary);
  }
}

.bt-tracker .tracker-row:has(.el-select:hover) {
  .tracker-left,
  .tracker-right {
    border-color: var(--lc-border-hover);
  }
  .tracker-left::after,
  .tracker-right::before {
    background-color: var(--lc-border-hover);
  }
}

.bt-tracker .tracker-row:has(.el-select .el-select__wrapper.is-focused),
.bt-tracker .tracker-row:has(.el-select:focus-within) {
  .tracker-left,
  .tracker-right {
    border-color: var(--lc-color-primary);
  }
  .tracker-left::after,
  .tracker-right::before {
    background-color: var(--lc-color-primary);
  }
}

.bt-tracker .tracker-row {
  .el-select {
    /* Element Plus: .el-select__wrapper 使用 box-shadow 作为边框,
       仅画上/下两边, 左右分割线由 .tracker-left::after 和 .tracker-right::before 提供 */
    .el-select__wrapper {
      border-radius: 0;
      font-size: 12px;
      box-shadow: inset 0 1px 0 0 var(--lc-border-base),
                  inset 0 -1px 0 0 var(--lc-border-base) !important;
      transition: box-shadow 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    // 悬停整个选择框（含标签区域）即触发边框高亮，而非仅悬停边框线
    &:hover:not(:focus-within) .el-select__wrapper {
      box-shadow: inset 0 1px 0 0 var(--lc-border-hover),
                  inset 0 -1px 0 0 var(--lc-border-hover) !important;
    }

    .el-select__wrapper.is-focused,
    &:focus-within .el-select__wrapper {
      box-shadow: inset 0 1px 0 0 var(--lc-color-primary),
                  inset 0 -1px 0 0 var(--lc-color-primary) !important;
    }
  }
}

// 已添加来源标题及链接适配深色模式
.tracker-origins-info {
  color: var(--lc-text-secondary);

  a {
    color: var(--lc-form-link);

    &:hover {
      color: var(--lc-form-link-hover);
    }

    &:active {
      color: var(--lc-form-link-hover);
    }
  }
}

.tracker-left {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 1px solid var(--lc-border-base);
  border-right: none;
  border-radius: 6px 0 0 6px;
  background-color: var(--lc-bg-input);
  box-sizing: border-box;
  transition: border-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);

  /* 与选择框之间的分割线：上方留 6px，下方留 6px */
  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background-color: var(--lc-border-base);
    transition: background-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  .el-button {
    height: 100%;
    padding: 2px 5px 0 5px !important;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0;
    margin: 0 !important;

    &:hover,
    &:focus,
    &:active {
      background-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
  }
}

.tracker-right {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 1px solid var(--lc-border-base);
  border-left: none;
  border-radius: 0 6px 6px 0;
  background-color: var(--lc-bg-input);
  box-sizing: border-box;
  transition: border-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);

  /* 与选择框之间的分割线：上方留 6px，下方留 6px */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background-color: var(--lc-border-base);
    transition: background-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  .el-button {
    height: 100%;
    padding: 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0;
    margin: 0 !important;

    &:not(:last-child)::after {
      content: '';
      position: absolute;
      right: 0;
      top: 6px;
      bottom: 6px;
      width: 1px;
      background-color: var(--lc-border-base);
      transition: background-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    &:hover,
    &:focus,
    &:active {
      background-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
  }
}

.auto-update-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-top: 12px;
  gap: 8px;

  /* "预览更新"与"上次检测更新时间"并排，大小一致 */
  .action-link {
    font-size: 12px;
  }

  .auto-update-time {
    font-size: 12px;
    color: var(--lc-text-secondary, #999);
  }
}

/* 版本条：独立样式（不依赖侧边栏全局 .version-item），
   点击区域明确、悬停有视觉反馈 */
.preference-card .version-item {
  cursor: pointer;
  border: 1px solid var(--lc-border-color, #dcdfe6);
  border-radius: 12px;
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--lc-text-primary, #303133);
  transition: border-color 0.2s ease, opacity 0.2s ease;

  &:hover {
    border-color: #c6e2ff;
  }

  &.is-checking {
    color: var(--lc-text-secondary, #909399);
  }

  &.update-available {
    color: #67c23a;
    font-weight: bold;
    border-color: #c2e7b0;
  }

  &.downloading {
    /* 下载进度文字：浅色模式黑色、深色模式白色（跟随主题文字色），
       不固定为 Element 主题蓝，保证两种模式下可读 */
    color: var(--lc-text-primary, #303133);
  }

  &.downloaded {
    color: #67c23a;
  }

  &.is-disabled {
    cursor: default;
    opacity: 0.6;
  }
}

/* 监听端口卡片三个开关的防御性样式：
   确保任何主题/状态下都能正常交互（不被遮挡、不被吞掉指针事件），
   标签文字可选中。 */
.preference-card .toggle-row {
  position: relative;
  pointer-events: auto;
  z-index: 1;

  .toggle-label,
  .toggle-desc {
    user-select: text;
  }
}

/* 开发者卡片三个输入框 append 区域：分割线右移、内边距加大，
   图标垂直居中、缩小到 12px，观感更协调 */
.preference-card[data-category="advanced"] .el-input-group__append:has(.lc-hover-tip__trigger) {
  padding: 0 12px 0 16px !important;

  &::before {
    left: 6px !important;
  }

  .lc-hover-tip__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;

    i {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
  }
}

/* 开发者卡片 folder 图标缩小到 12px */
.preference-card[data-category="advanced"] .el-input-group__append .lc-hover-tip__trigger i svg {
  width: 12px;
  height: 12px;
}
</style>
