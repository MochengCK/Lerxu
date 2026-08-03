<template>
  <el-main class="panel-content">
      <el-form
        class="form-preference"
        ref="advancedForm"
        label-position="right"
        size="mini"
        :model="form"
        :rules="rules"
      >
        <!-- 自动更新设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.auto-update') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.autoCheckUpdate" @change="autoSaveForm">
                {{ $t('preferences.auto-check-update') }}
              </el-checkbox>
              <div
                class="el-form-item__info"
                style="margin-top: 8px;"
                v-if="lastCheckUpdateTime !== 0 || updateAvailable || isDownloadingUpdate || updateDownloaded"
              >
                {{ $t('preferences.last-check-update-time') + ': ' +
                  (lastCheckUpdateTime !== 0 ?
                    new Date(lastCheckUpdateTime).toLocaleString() :
                    new Date().toLocaleString())
                }}
                <span
                  class="action-link"
                  :class="{
                    'action-link--disabled': isCheckingUpdate,
                    'update-available': (updateAvailable || isDownloadingUpdate || updateDownloaded) && !isCheckingUpdate
                  }"
                  @click.prevent="isCheckingUpdate ? null : ((updateAvailable || isDownloadingUpdate || updateDownloaded) ? onPreviewUpdateClick() : onCheckUpdateClick())"
                >
                  {{ (updateAvailable || isDownloadingUpdate || updateDownloaded) ? $t('app.preview-update') : $t('app.check-updates-now') }}
                </span>
              </div>
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
            </el-col>
          </el-form-item>
        </div>

        <!-- 代理设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.proxy') }}</h3>
          <el-form-item size="mini">
            <el-radio-group
              v-model="form.proxy.mode"
              @change="(val) => { onProxyModeChange(val); autoSaveForm(); }"
            >
              <el-radio label="none">{{ $t('preferences.proxy-mode-none') }}</el-radio>
              <el-radio label="system">{{ $t('preferences.proxy-mode-system') }}</el-radio>
              <el-radio label="custom">{{ $t('preferences.proxy-mode-custom') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item size="mini" v-if="form.proxy.mode === 'system'" style="margin-top: -8px;">
            <el-col class="form-item-sub" :span="24">
              <div class="el-form-item__info proxy-system-info">
                <i class="el-icon-info"></i>
                {{ $t('preferences.proxy-system-tips') }}
              </div>
            </el-col>
          </el-form-item>
          <el-form-item size="mini" v-if="form.proxy.mode === 'custom'" style="margin-top: -8px;">
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
                rows="2"
                auto-complete="off"
                @change="handleProxyBypassChange"
                :placeholder="`${$t('preferences.proxy-bypass-input-tips')}`"
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
                  :label="$t(`preferences.proxy-scope-${item}`)"
                  :value="item"
                />
              </el-select>
              <div class="el-form-item__info" style="margin-top: 8px;">
                <a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Proxy" rel="noopener noreferrer">
                  {{ $t('preferences.proxy-tips') }}
                  <mo-icon name="link" width="12" height="12" />
                </a>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- GitHub 镜像设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.github-mirror') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="github-mirror-row" style="display: flex; align-items: center; margin-bottom: 8px;">
                <div style="flex: 1;">
                  <el-select
                    v-model="form.githubMirrorUrls"
                    multiple
                    filterable
                    :placeholder="$t('preferences.github-mirror-select-placeholder')"
                    @change="onGithubMirrorChange"
                    style="width: 100%;"
                  >
                    <el-option-group :label="$t('preferences.github-mirror-builtin')">
                      <el-option
                        v-for="mirror in builtinGithubMirrors"
                        :key="mirror.value"
                        :label="mirror.label"
                        :value="mirror.value"
                      >
                        <span style="float: left">{{ mirror.label }}</span>
                        <span style="float: right; font-size: 13px; margin-right: 8px;">
                          <span v-if="mirror.checking" style="color: #909399;">
                            <i class="el-icon-loading"></i> {{ $t('preferences.checking') }}
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
                  <el-tooltip
                    class="item"
                    effect="dark"
                    :content="$t('preferences.check-github-mirror-latency')"
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
                  </el-tooltip>
                  <div class="github-mirror-popup-wrapper">
                    <el-tooltip
                      class="item"
                      effect="dark"
                      :content="$t('preferences.add-mirror')"
                      placement="bottom"
                      :disabled="githubMirrorConfigVisible"
                    >
                      <el-button
                        @click="openGithubMirrorConfigDialog"
                        class="sync-tracker-btn"
                      >
                        <mo-icon name="link" width="12" height="12" />
                      </el-button>
                    </el-tooltip>
                    <transition name="popup-scale">
                      <div
                        class="github-mirror-popup"
                        v-if="githubMirrorConfigVisible"
                        @click.stop
                      >
                        <div class="github-mirror-popup__header">
                          <span>{{ $t('preferences.add-mirror') }}</span>
                        </div>
                        <div class="github-mirror-popup__body">
                          <el-input
                            v-model="githubMirrorInput"
                            :placeholder="$t('preferences.github-mirror-input-placeholder')"
                            clearable
                            size="small"
                            @keydown.enter.native="addGithubMirrorFromInput"
                          >
                          </el-input>
                        </div>
                        <div class="github-mirror-popup__footer">
                          <el-button size="mini" type="primary" @click="addGithubMirrorFromInput">{{ $t('app.submit') }}</el-button>
                        </div>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.github-mirror-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- RPC设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.rpc') }}</h3>
          <el-form-item size="mini">
            <el-row style="margin-bottom: 8px;">
              <el-col
                class="form-item-sub"
                :xs="24"
                :sm="18"
                :md="10"
                :lg="10"
              >
                {{ $t('preferences.rpc-listen-port') }}
                <el-input
                  :placeholder="rpcDefaultPort"
                  :maxlength="8"
                  v-model="form.rpcListenPort"
                  @change="onRpcListenPortChange"
                >
                  <i slot="append" @click.prevent="onRpcPortDiceClick">
                    <mo-icon name="dice" width="12" height="12" />
                  </i>
                </el-input>
              </el-col>
            </el-row>
            <el-row style="margin-bottom: 8px;">
              <el-col
                class="form-item-sub"
                :xs="24"
                :sm="18"
                :md="18"
                :lg="18"
              >
                {{ $t('preferences.rpc-secret') }}
                <el-input
                  :show-password="hideRpcSecret"
                  placeholder="RPC Secret"
                  :maxlength="64"
                  v-model="form.rpcSecret"
                >
                  <i slot="append" @click.prevent="onRpcSecretDiceClick">
                    <mo-icon name="dice" width="12" height="12" />
                  </i>
                </el-input>
                <div class="el-form-item__info" style="margin-top: 8px;">
                  <a target="_blank" href="https://github.com/agalwood/Motrix/wiki/RPC" rel="noopener noreferrer">
                    {{ $t('preferences.rpc-secret-tips') }}
                    <mo-icon name="link" width="12" height="12" />
                  </a>
                </div>
              </el-col>
            </el-row>
          </el-form-item>
        </div>

        <!-- 端口设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.port') }}</h3>
          <el-form-item size="mini">
            <el-row style="margin-bottom: 8px;">
              <el-col
                class="form-item-sub"
                :xs="24"
                :sm="18"
                :md="12"
                :lg="12"
              >
                <el-switch
                  v-model="form.enableUpnp"
                  active-text="UPnP/NAT-PMP"
                  >
                </el-switch>
              </el-col>
            </el-row>
            <el-row style="margin-bottom: 8px;">
              <el-col class="form-item-sub"
                :xs="24"
                :sm="18"
                :md="10"
                :lg="10"
              >
                {{ $t('preferences.bt-port') }}
                <el-input
                  placeholder="BT Port"
                  :maxlength="8"
                  v-model="form.listenPort"
                >
                  <i slot="append" @click.prevent="onBtPortDiceClick">
                    <mo-icon name="dice" width="12" height="12" />
                  </i>
                </el-input>
              </el-col>
            </el-row>
            <el-row>
              <el-col
                class="form-item-sub"
                :xs="24"
                :sm="18"
                :md="10"
                :lg="10"
              >
                {{ $t('preferences.dht-port') }}
                <el-input
                  placeholder="DHT Port"
                  :maxlength="8"
                  v-model="form.dhtListenPort"
                >
                  <i slot="append" @click.prevent="onDhtPortDiceClick">
                    <mo-icon name="dice" width="12" height="12" />
                  </i>
                </el-input>
              </el-col>
            </el-row>
          </el-form-item>
        </div>

        <!-- 下载协议设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.download-protocol') }}</h3>
          <el-form-item size="mini">
            {{ $t('preferences.protocols-default-client') }}
            <el-col class="form-item-sub" :span="24">
              <el-switch
                v-model="form.protocols.magnet"
                :active-text="$t('preferences.protocols-magnet')"
                @change="(val) => onProtocolsChange('magnet', val)"
                >
              </el-switch>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-switch
                v-model="form.protocols.thunder"
                :active-text="$t('preferences.protocols-thunder')"
                @change="(val) => onProtocolsChange('thunder', val)"
                >
              </el-switch>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-switch
                v-model="form.protocols.ed2k"
                :active-text="$t('preferences.protocols-ed2k')"
                @change="(val) => onProtocolsChange('ed2k', val)"
                >
              </el-switch>
            </el-col>
          </el-form-item>
        </div>

        <!-- 引擎信息卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.engine') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="24">
                  <strong>{{ $t('preferences.engine-select') }}:</strong>
                  <el-select
                    v-model="activeEngineBinary"
                    disabled
                    style="width: 100%; margin-top: 8px;"
                  >
                    <el-option
                      :label="activeEngineBinary || '--'"
                      :value="activeEngineBinary || ''"
                    />
                  </el-select>
                </el-col>
              </el-row>
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="8">
                  <strong>{{ $t('preferences.engine-version') }}:</strong>
                  <div>{{ storeEngineInfo.version || '--' }}</div>
                </el-col>
                <el-col :span="8">
                  <strong>{{ $t('preferences.engine-architecture') }}:</strong>
                  <div>{{ storeEngineInfo.architecture || '--' }}</div>
                </el-col>
                <el-col :span="8">
                  <strong>{{ $t('preferences.engine-features') }}:</strong>
                  <div>{{ storeEngineInfo.features ? storeEngineInfo.features.join(', ') : '--' }}</div>
                </el-col>
              </el-row>
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="12">
                  <strong>{{ $t('preferences.engine-dependencies') }}:</strong>
                  <div>{{ storeEngineInfo.dependencies ? storeEngineInfo.dependencies.join(', ') : '--' }}</div>
                </el-col>
                <el-col :span="12">
                  <strong>{{ $t('preferences.engine-compile-info') }}:</strong>
                  <div>{{ storeEngineInfo.compileInfo || '--' }}</div>
                </el-col>
              </el-row>
            </el-col>
          </el-form-item>
        </div>

        <!-- 视频合并设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.video-merge') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div style="margin-bottom: 12px;">
                <strong>{{ $t('preferences.ffmpeg-status') }}：</strong>
                <span :style="{ color: ffmpegStatus.installed ? '#67c23a' : '#f56c6c' }">
                  {{ ffmpegStatus.installed ? $t('preferences.ffmpeg-installed') : $t('preferences.ffmpeg-not-installed') }}
                </span>
              </div>
              <div v-if="ffmpegStatus.installed && ffmpegStatus.path" style="margin-bottom: 12px;">
                <strong>{{ $t('preferences.ffmpeg-path') }}：</strong>
                <span style="word-break: break-all;">{{ ffmpegStatus.path }}</span>
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="ffmpegStatus.installed && ffmpegStatus.path">
              <el-button size="mini" @click="openFfmpegFolder">
                <i class="el-icon-folder-opened"></i>
                {{ $t('preferences.ffmpeg-open-folder') }}
              </el-button>
            </el-col>
          </el-form-item>
        </div>

        <!-- 用户代理设置卡片 -->
        <div v-if="activeCategory === 'advanced'" class="preference-card" data-category="advanced">
          <h3 class="card-title">{{ $t('preferences.user-agent') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.mock-user-agent') }}
              <el-input
                type="textarea"
                rows="2"
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
          <h3 class="card-title">{{ $t('preferences.developer') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.aria2-conf-path') }}
              <el-input placeholder="" disabled v-model="aria2ConfPath">
                <mo-show-in-folder
                  slot="append"
                  v-if="isRenderer"
                  :path="aria2ConfPath"
              />
            </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.download-session-path') }}
              <el-input placeholder="" disabled v-model="sessionPath">
                <mo-show-in-folder
                  slot="append"
                  v-if="isRenderer"
                  :path="sessionPath"
                />
              </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.app-log-path') }}
              <el-row :gutter="16">
                <el-col :span="18">
                  <el-input placeholder="" disabled v-model="logPath">
                    <mo-show-in-folder
                    slot="append"
                    v-if="isRenderer"
                    :path="logPath"
                    />
                  </el-input>
                </el-col>
                <el-col :span="6">
                  <el-select v-model="form.logLevel">
                    <el-option
                      v-for="item in logLevels"
                      :key="item"
                      :label="item"
                      :value="item">
                    </el-option>
                  </el-select>
                </el-col>
              </el-row>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.aria2-log-path') }}
              <el-input placeholder="" disabled v-model="aria2LogPath">
                <el-tooltip
                  slot="append"
                  effect="dark"
                  :content="$t('task.reveal-in-folder')"
                  placement="top"
                  :open-delay="500"
                >
                  <i v-if="isRenderer" @click="openAria2LogFolder" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; cursor: pointer;">
                    <mo-icon name="folder" width="10" height="10" />
                  </i>
                </el-tooltip>
              </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-button plain type="warning" @click="() => onSessionResetClick()">
                {{ $t('preferences.session-reset') }}
              </el-button>
              <el-button plain type="danger" @click="() => onFactoryResetClick()">
                {{ $t('preferences.factory-reset') }}
              </el-button>
              </el-col>
          </el-form-item>
        </div>
      </el-form>

      <div v-if="hasNoResults" class="no-results">
        <div class="no-results-inner">
          {{ $t('preferences.no-settings-found') }}
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
        {{ $t('app.yes') || 'OK' }}
      </el-button>
    </div>

  </el-main>
</template>

<script>
  import is from 'electron-is'
  import { dialog } from '@electron/remote'
  import { mapState } from 'vuex'
  import { cloneDeep, isEmpty } from 'lodash'
  import randomize from 'randomatic'
  import ShowInFolder from '@/components/Native/ShowInFolder'
  import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'
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
  import '@/components/Icons/dice'
  import '@/components/Icons/refresh'
  import '@/components/Icons/folder'
  import { getLanguage } from '@shared/locales'
  import { getLocaleManager } from '@/components/Locale'

  const initForm = (config) => {
    const {
      autoCheckUpdate,
      dhtListenPort,
      enableUpnp,
      hideAppMenu,
      lastCheckUpdateTime,
      listenPort,
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
      dhtListenPort,
      enableUpnp,
      hideAppMenu,
      lastCheckUpdateTime,
      listenPort,
      logLevel,
      proxy: clonedProxy,
      protocols: { ...protocols },
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

  export default {
    name: 'mo-preference-advanced',
    components: {
      [ShowInFolder.name]: ShowInFolder,
      [SegmentedSlider.name]: SegmentedSlider
    },
    props: {
      category: {
        type: String,
        default: 'advanced'
      }
    },
    data () {
      const { locale } = this.$store.state.preference.config
      const formOriginal = initForm(this.$store.state.preference.config)
      let form = {}
      // 直接从store中获取配置，不依赖changedConfig
      form = initForm(this.$store.state.preference.config)

      return {
        form,
        formLabelWidth: calcFormLabelWidth(locale),
        formOriginal,
        hideRpcSecret: true,
        proxyScopeOptions: PROXY_SCOPE_OPTIONS,
        rules: {},
        builtinGithubMirrors: [
          { value: 'ghproxy.net', label: 'ghproxy.net', latency: null, checking: false }
        ],
        githubMirrorCheckingAll: false,
        mirrorCheckTimeout: null,
        previousGithubMirrorUrls: [], // 保存上一次选择的镜像列表
        githubMirrorConfigVisible: false,
        githubMirrorInput: '',
        saveTimeout: null,
        appVersion: '',
        updatePreviewVisible: false,
        updatePreviewContent: '',
        hasNoResults: false,
        ffmpegStatus: {
          installed: false,
          path: ''
        },
        uaOptions: [
          { value: 'aria2', label: 'Aria2' },
          { value: 'transmission', label: 'Transmission' },
          { value: 'chrome', label: 'Chrome' },
          { value: 'du', label: 'du' }
        ]
      }
    },
    computed: {
      ...mapState('app', ['isCheckingUpdate']),
      ...mapState('preference', ['updateAvailable', 'newVersion', 'isDownloadingUpdate', 'updateDownloaded', 'downloadProgress', 'downloadTotal', 'downloadTransferred', 'releaseNotes', 'lastCheckUpdateTime', 'searchKeyword']),
      ...mapState('app', {
        storeEngineInfo: state => state.engineInfo
      }),
      versionText () {
        const bytesToSize = (this.$options && this.$options.filters && this.$options.filters.bytesToSize)
          ? this.$options.filters.bytesToSize
          : (bytes, decimals = 2) => {
              if (!bytes || bytes === 0) return '0 B'
              const k = 1024
              const sizes = ['B', 'KB', 'MB', 'GB']
              const i = Math.floor(Math.log(bytes) / Math.log(k))
              return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
            }
        if (this.updateDownloaded) {
          return '立即重启安装'
        } else if (this.isDownloadingUpdate) {
          const transferred = bytesToSize(this.downloadTransferred, 2)
          const total = bytesToSize(this.downloadTotal, 2)
          if (this.downloadTotal > 0) {
            return `下载中 ${this.downloadProgress}% (${transferred} / ${total})`
          }
          return `下载中 ${this.downloadProgress}%`
        } else if (this.updateAvailable) {
          return `下载新版本 ${this.newVersion}`
        } else {
          return this.appVersion
        }
      },
      configEngineBinary () {
        const { config = {} } = this.$store.state.preference
        return config.engineBinary || config['engine-binary']
      },
      activeEngineBinary () {
        // Show the actually running engine path (from engine info) instead of
        // the configured value, which may differ when the engine was auto-detected
        // or fell back to a different binary.
        return this.storeEngineInfo.binPath || this.configEngineBinary || ''
      },
      engineInfo () {
        return this.storeEngineInfo
      },
      isRenderer: () => is.renderer(),
      activeCategory () {
        return this.category || 'advanced'
      },
      title () {
        const subnav = this.subnavs.find(item => item.key === this.activeCategory)
        return subnav ? subnav.title : this.$t('preferences.advanced')
      },
      preferenceBasePath () {
        const path = `${this.$route.path || ''}`
        return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
      },
      subnavs () {
        const base = this.preferenceBasePath
        return [
          {
            key: 'basic',
            title: this.$t('preferences.basic'),
            route: `${base}/basic`
          },
          {
            key: 'appearance',
            title: this.$t('preferences.appearance'),
            route: `${base}/appearance`
          },
          {
            key: 'transfer',
            title: this.$t('preferences.transfer-settings'),
            route: `${base}/transfer`
          },
          {
            key: 'bt',
            title: this.$t('preferences.bt-settings'),
            route: `${base}/bt`
          },
          {
            key: 'task',
            title: this.$t('preferences.task-manage'),
            route: `${base}/task`
          },
          {
            key: 'file',
            title: this.$t('preferences.file-manage'),
            route: `${base}/file`
          },
          {
            key: 'advanced',
            title: this.$t('preferences.advanced'),
            route: `${base}/advanced`
          },
          {
            key: 'lab',
            title: this.$t('preferences.lab'),
            route: `${base}/lab`
          }
        ]
      },
      rpcDefaultPort () {
        return ENGINE_RPC_PORT
      },
      logLevels () {
        return LOG_LEVELS
      },
      ...mapState('preference', {
        config: state => state.config,
        aria2ConfPath: state => state.config.aria2ConfPath,
        logPath: state => state.config.logPath,
        sessionPath: state => state.config.sessionPath,
        aria2LogPath: state => state.config.aria2LogPath,
        aria2LogDir: state => state.config.aria2LogDir
      }),
      // 速度单位选项
      schedulerSpeedUnits () {
        return [
          { label: 'KB/s', value: 'K' },
          { label: 'MB/s', value: 'M' }
        ]
      },
      // 文件大小单位选项
      schedulerSizeUnits () {
        return [
          { label: 'MB', value: 'M' },
          { label: 'GB', value: 'G' }
        ]
      },
      activeUAValue () {
        const map = userAgentMap
        const current = this.form && this.form.userAgent
        const hit = this.uaOptions.find(opt => map[opt.value] === current)
        return hit ? hit.value : ''
      }
    },
    watch: {
      'form.autoCheckUpdate' (newValue) {
        // 当关闭自动检查更新时，清除更新状态
        if (!newValue) {
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.$store.dispatch('preference/updateNewVersion', '')
        }
      },
      githubMirrorConfigVisible (visible) {
        if (!visible) {
          document.removeEventListener('mousedown', this.handleGithubMirrorOutsideClick)
        }
      },
      searchKeyword: {
        immediate: true,
        handler (val) {
          this.applyFilters(val)
        }
      },
      category: {
        handler () {
          this.applyFilters(this.searchKeyword)
        },
        immediate: true
      },
      form: {
        handler () {
          // autoSaveForm already debounces and checks diffConfig internally,
          // so we avoid a redundant synchronous diffConfig pass here.
          this.autoSaveForm()
        },
        deep: true
      },
      'form.rpcListenPort' (val) {
        const url = buildRpcUrl({
          port: this.form.rpcListenPort,
          secret: val
        })
        try {
          const { clipboard } = require('electron')
          clipboard.writeText(url)
        } catch (e) {
        }
      },
      'form.rpcSecret' (val) {
        const url = buildRpcUrl({
          port: this.form.rpcListenPort,
          secret: val
        })
        try {
          const { clipboard } = require('electron')
          clipboard.writeText(url)
        } catch (e) {
        }
      }
    },
    async created () {
      // 获取引擎列表
      await this.fetchEngineList()
    },
    async mounted () {
      await this.fetchEngineList()
      await this.fetchEngineInfo()
      this.checkFfmpegStatus()

      // 初始化 previousGithubMirrorUrls
      this.previousGithubMirrorUrls = [...(this.form.githubMirrorUrls || [])]

      // 自动检测已选择的 GitHub 镜像延迟
      if (this.form.githubMirrorUrls && this.form.githubMirrorUrls.length > 0) {
        // 延迟1秒后开始检测，避免阻塞页面加载
        setTimeout(() => {
          this.checkSelectedGithubMirrors()
        }, 1000)
      }

      try {
        const appConfig = await this.$electron.ipcRenderer.invoke('get-app-config')
        this.appVersion = appConfig.version

        // 从主进程获取当前实时更新状态
        const updateStatus = await this.$electron.ipcRenderer.invoke('get-update-status')
        const prefState = this.$store.state.preference

        // 同步检查状态
        if (updateStatus.isChecking) {
          this.$store.dispatch('app/updateCheckingUpdate', true)
        } else {
          this.$store.dispatch('app/updateCheckingUpdate', false)
        }

        // 同步下载状态
        this.$store.dispatch('preference/updateIsDownloadingUpdate', updateStatus.isDownloading)
        this.$store.dispatch('preference/updateUpdateDownloaded', updateStatus.updateDownloaded)

        if (updateStatus.isDownloading) {
          this.$store.dispatch('preference/updateDownloadProgress', updateStatus.downloadProgress || 0)
          this.$store.dispatch('preference/updateDownloadSize', {
            total: updateStatus.downloadTotal || 0,
            transferred: updateStatus.downloadTransferred || 0
          })
          if (updateStatus.newVersion) {
            this.$store.dispatch('preference/updateNewVersion', updateStatus.newVersion)
          }
          if (updateStatus.releaseNotes) {
            this.$store.dispatch('preference/updateReleaseNotes', updateStatus.releaseNotes)
          }
          this.$store.dispatch('preference/updateUpdateAvailable', false)
        } else if (updateStatus.updateDownloaded) {
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          if (updateStatus.newVersion) {
            this.$store.dispatch('preference/updateNewVersion', updateStatus.newVersion)
          }
          if (updateStatus.releaseNotes) {
            this.$store.dispatch('preference/updateReleaseNotes', updateStatus.releaseNotes)
          }
        } else {
          // 没有正在进行的下载或已完成，从配置恢复
          const configFromStore = this.$store.state.preference.config
          if (configFromStore) {
            const updateAvailable = configFromStore['update-available'] || configFromStore.updateAvailable || false
            const newVersion = configFromStore['new-version'] || configFromStore.newVersion || ''
            const lastCheckUpdateTime = configFromStore['last-check-update-time'] || configFromStore.lastCheckUpdateTime || 0
            const releaseNotes = configFromStore['release-notes'] || configFromStore.releaseNotes || ''

            if (updateAvailable && newVersion) {
              this.$store.dispatch('preference/updateUpdateAvailable', updateAvailable)
              this.$store.dispatch('preference/updateNewVersion', newVersion)
              this.$store.dispatch('preference/updateLastCheckUpdateTime', lastCheckUpdateTime)
              if (releaseNotes) {
                this.$store.dispatch('preference/updateReleaseNotes', releaseNotes)
              }
            }
          }
        }

        // 同步最后检查时间（总是从配置同步，确保预览按钮显示）
        const configForTime = this.$store.state.preference.config
        let timeToSet = Date.now() // 默认用当前时间，确保下载中时预览按钮能显示
        if (configForTime) {
          const configTime = configForTime['last-check-update-time'] || configForTime.lastCheckUpdateTime || 0
          if (configTime && configTime > 0) {
            timeToSet = configTime
          }
        }
        if (timeToSet && (!prefState.lastCheckUpdateTime || timeToSet > prefState.lastCheckUpdateTime)) {
          this.$store.dispatch('preference/updateLastCheckUpdateTime', timeToSet)
        }
      } catch (error) {
        console.error('[LinkCore] Failed to get app version:', error)
      }

      // 注册更新事件全局监听器
      this._updateEventListeners = {
        onCheckingForUpdate: () => {
          this.$store.dispatch('app/updateCheckingUpdate', true)
        },
        onUpdateAvailable: (event, version, releaseNotes) => {
          this.$store.dispatch('app/updateCheckingUpdate', false)
          this.$store.dispatch('preference/updateUpdateAvailable', true)
          this.$store.dispatch('preference/updateNewVersion', version)
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
          this.$store.dispatch('preference/updateReleaseNotes', releaseNotes || '')
        },
        onUpdateNotAvailable: () => {
          this.$store.dispatch('app/updateCheckingUpdate', false)
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.$store.dispatch('preference/updateNewVersion', '')
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
        },
        onDownloadStart: () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', true)
          this.$store.dispatch('preference/updateUpdateDownloaded', false)
          this.$store.dispatch('preference/updateDownloadProgress', 0)
          this.$store.dispatch('preference/updateDownloadSize', { total: 0, transferred: 0 })
        },
        onDownloadProgress: (event, progress) => {
          this.$store.dispatch('preference/updateDownloadProgress', Math.round(progress.percent))
          this.$store.dispatch('preference/updateDownloadSize', {
            total: progress.total || 0,
            transferred: progress.transferred || 0
          })
        },
        onUpdateDownloaded: () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.$store.dispatch('preference/updateUpdateDownloaded', true)
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.showMessage('success', '更新下载完成，点击"立即重启安装"按钮开始安装更新')
        },
        onUpdateError: () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.$store.dispatch('preference/updateUpdateDownloaded', false)
          this.$store.dispatch('app/updateCheckingUpdate', false)
        },
        onUpdateCancelled: () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.$store.dispatch('preference/updateUpdateDownloaded', false)
          this.$store.dispatch('preference/updateDownloadProgress', 0)
          this.$store.dispatch('preference/updateDownloadSize', { total: 0, transferred: 0 })
        }
      }

      this.$electron.ipcRenderer.on('checking-for-update', this._updateEventListeners.onCheckingForUpdate)
      this.$electron.ipcRenderer.on('update-available', this._updateEventListeners.onUpdateAvailable)
      this.$electron.ipcRenderer.on('update-not-available', this._updateEventListeners.onUpdateNotAvailable)
      this.$electron.ipcRenderer.on('download-start', this._updateEventListeners.onDownloadStart)
      this.$electron.ipcRenderer.on('download-progress', this._updateEventListeners.onDownloadProgress)
      this.$electron.ipcRenderer.on('update-downloaded', this._updateEventListeners.onUpdateDownloaded)
      this.$electron.ipcRenderer.on('update-error', this._updateEventListeners.onUpdateError)
      this.$electron.ipcRenderer.on('update-cancelled', this._updateEventListeners.onUpdateCancelled)
    },
    beforeDestroy () {
      if (this._filterTimer) {
        clearTimeout(this._filterTimer)
      }
      // 清理 GitHub 镜像弹窗外部点击监听
      document.removeEventListener('mousedown', this.handleGithubMirrorOutsideClick)
      // 清理更新事件监听器
      if (this._updateEventListeners) {
        this.$electron.ipcRenderer.removeListener('checking-for-update', this._updateEventListeners.onCheckingForUpdate)
        this.$electron.ipcRenderer.removeListener('update-available', this._updateEventListeners.onUpdateAvailable)
        this.$electron.ipcRenderer.removeListener('update-not-available', this._updateEventListeners.onUpdateNotAvailable)
        this.$electron.ipcRenderer.removeListener('download-start', this._updateEventListeners.onDownloadStart)
        this.$electron.ipcRenderer.removeListener('download-progress', this._updateEventListeners.onDownloadProgress)
        this.$electron.ipcRenderer.removeListener('update-downloaded', this._updateEventListeners.onUpdateDownloaded)
        this.$electron.ipcRenderer.removeListener('update-error', this._updateEventListeners.onUpdateError)
        this.$electron.ipcRenderer.removeListener('update-cancelled', this._updateEventListeners.onUpdateCancelled)
        this._updateEventListeners = null
      }
    },
    methods: {
      measureTextWidth (text, font) {
        try {
          const canvas = this.textMeasureCanvas || (this.textMeasureCanvas = document.createElement('canvas'))
          const ctx = canvas.getContext('2d')
          if (!ctx) return `${text || ''}`.length * 10
          ctx.font = font || '12px sans-serif'
          return ctx.measureText(`${text || ''}`).width
        } catch (_) {
          return `${text || ''}`.length * 10
        }
      },

      // GitHub 镜像延迟检测
      async checkGithubMirrorLatency (mirror) {
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
      },
      async checkAllGithubMirrors () {
        this.githubMirrorCheckingAll = true

        // 并发检测所有镜像
        const checkPromises = this.builtinGithubMirrors.map(async (mirror) => {
          mirror.checking = true
          const latency = await this.checkGithubMirrorLatency(mirror)
          mirror.latency = latency
          mirror.checking = false
        })

        await Promise.all(checkPromises)
        this.githubMirrorCheckingAll = false
      },
      async checkSelectedGithubMirrors () {
        // 只检测已选择的镜像
        const selectedMirrors = this.builtinGithubMirrors.filter(mirror =>
          this.form.githubMirrorUrls && this.form.githubMirrorUrls.includes(mirror.value)
        )

        if (selectedMirrors.length === 0) {
          return
        }

        console.log('[GitHub Mirror] Checking selected mirrors:', selectedMirrors.map(m => m.value))

        this.githubMirrorCheckingAll = true

        // 并发检测选中的镜像
        const checkPromises = selectedMirrors.map(async (mirror) => {
          mirror.checking = true
          const latency = await this.checkGithubMirrorLatency(mirror)
          mirror.latency = latency
          mirror.checking = false
        })

        await Promise.all(checkPromises)
        this.githubMirrorCheckingAll = false
      },
      openGithubMirrorConfigDialog () {
        if (this.githubMirrorConfigVisible) {
          this.closeGithubMirrorPopup()
          return
        }
        this.githubMirrorInput = ''
        this.githubMirrorConfigVisible = true
        this.$nextTick(() => {
          this.adjustGithubMirrorPopupPosition()
          document.addEventListener('mousedown', this.handleGithubMirrorOutsideClick)
        })
      },
      adjustGithubMirrorPopupPosition () {
        const popup = this.$el.querySelector('.github-mirror-popup')
        const wrapper = this.$el.querySelector('.github-mirror-popup-wrapper')
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
      },
      handleGithubMirrorOutsideClick (e) {
        const wrapper = this.$el.querySelector('.github-mirror-popup-wrapper')
        if (wrapper && !wrapper.contains(e.target)) {
          this.closeGithubMirrorPopup()
        }
      },
      closeGithubMirrorPopup () {
        const popup = this.$el.querySelector('.github-mirror-popup')
        if (popup) {
          popup.style.left = ''
          popup.style.right = ''
          popup.style.top = ''
          popup.style.bottom = ''
          popup.style.marginTop = ''
          popup.style.marginBottom = ''
          popup.style.transformOrigin = ''
        }
        this.githubMirrorConfigVisible = false
        document.removeEventListener('mousedown', this.handleGithubMirrorOutsideClick)
      },
      addGithubMirrorFromInput () {
        const input = (this.githubMirrorInput || '').trim()
        if (!input) {
          this.$msg.error(this.$t('preferences.github-mirror-input-empty'))
          return
        }

        // 移除协议前缀（如果有）
        const mirrorUrl = input.replace(/^https?:\/\//, '')

        // 检查是否已存在
        if (this.form.githubMirrorUrls && this.form.githubMirrorUrls.includes(mirrorUrl)) {
          this.$msg.warning(this.$t('preferences.github-mirror-already-exists'))
          this.closeGithubMirrorPopup()
          return
        }

        // 添加到列表
        const currentUrls = this.form.githubMirrorUrls || []
        this.form.githubMirrorUrls = [...currentUrls, mirrorUrl]

        // 保存配置
        this.autoSaveForm()

        // 关闭弹窗
        this.closeGithubMirrorPopup()

        // 提示添加成功
        this.$msg.success(this.$t('preferences.github-mirror-add-success'))
      },
      onGithubMirrorChange (newValue) {
        // 保存配置
        this.autoSaveForm()

        // 找出新添加的镜像（在新列表中但不在旧列表中的）
        const previousUrls = this.previousGithubMirrorUrls || []
        const currentUrls = newValue || []
        const newlyAddedUrls = currentUrls.filter(url => !previousUrls.includes(url))

        // 更新保存的列表
        this.previousGithubMirrorUrls = [...currentUrls]

        // 如果有新添加的镜像，自动检测它们
        if (newlyAddedUrls.length > 0) {
          console.log('[GitHub Mirror] Newly added mirrors:', newlyAddedUrls)

          // 延迟一小段时间，避免频繁切换时重复检测
          if (this.mirrorCheckTimeout) {
            clearTimeout(this.mirrorCheckTimeout)
          }

          this.mirrorCheckTimeout = setTimeout(() => {
            this.checkSpecificMirrors(newlyAddedUrls)
          }, 500)
        }
      },
      async checkSpecificMirrors (mirrorUrls) {
        // 检测指定的镜像
        const mirrorsToCheck = this.builtinGithubMirrors.filter(mirror =>
          mirrorUrls.includes(mirror.value)
        )

        if (mirrorsToCheck.length === 0) {
          return
        }

        console.log('[GitHub Mirror] Checking specific mirrors:', mirrorsToCheck.map(m => m.value))

        // 并发检测指定的镜像
        const checkPromises = mirrorsToCheck.map(async (mirror) => {
          mirror.checking = true
          const latency = await this.checkGithubMirrorLatency(mirror)
          mirror.latency = latency
          mirror.checking = false
        })

        await Promise.all(checkPromises)
      },
      formatLatency (latency) {
        if (latency === null) {
          return ''
        }
        if (latency < 0) {
          return this.$t('preferences.github-mirror-timeout')
        }
        if (latency < 1000) {
          return `${latency}ms`
        }
        return `${(latency / 1000).toFixed(2)}s`
      },
      getLatencyColor (latency) {
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
      },
      checkFfmpegStatus () {
        // 异步检测，避免阻塞 UI
        setTimeout(() => {
          this.doCheckFfmpegStatus()
        }, 0)
      },
      doCheckFfmpegStatus () {
        const { existsSync } = require('node:fs')
        const { resolve, dirname } = require('node:path')
        const ffmpegExeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

        // 检查用户数据目录
        try {
          const { app } = require('@electron/remote')
          const userDataPath = app.getPath('userData')
          const userFfmpegPath = resolve(userDataPath, 'ffmpeg', ffmpegExeName)
          if (existsSync(userFfmpegPath)) {
            this.ffmpegStatus = { installed: true, path: userFfmpegPath }
            return
          }
        } catch (e) {
          console.warn('[FFmpeg] Check userData failed:', e)
        }

        // 检查应用安装目录（通过 exe 路径获取）
        try {
          const { app } = require('@electron/remote')
          const exePath = app.getPath('exe')
          const appDir = dirname(exePath)
          const appFfmpegPath = resolve(appDir, ffmpegExeName)
          console.log('[FFmpeg] Checking app dir:', appFfmpegPath)
          if (existsSync(appFfmpegPath)) {
            this.ffmpegStatus = { installed: true, path: appFfmpegPath }
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
                this.ffmpegStatus = { installed: true, path: p }
                return
              }
            }
          }
        } catch (e) {
          console.warn('[FFmpeg] Check resourcesPath failed:', e)
        }

        // 检查系统 PATH（使用异步 spawn 避免阻塞）
        try {
          const { spawn } = require('node:child_process')
          const child = spawn('ffmpeg', ['-version'], { windowsHide: true })
          child.on('error', () => {
            this.ffmpegStatus = { installed: false, path: '' }
          })
          child.on('close', (code) => {
            if (code === 0) {
              this.ffmpegStatus = { installed: true, path: '' }
            } else {
              this.ffmpegStatus = { installed: false, path: '' }
            }
          })
          // 设置超时
          setTimeout(() => {
            try {
              child.kill()
            } catch (_) {}
          }, 3000)
        } catch (_) {
          this.ffmpegStatus = { installed: false, path: '' }
        }
      },
      openFfmpegFolder () {
        if (!this.ffmpegStatus.path) return
        const { dirname } = require('node:path')
        const path = this.ffmpegStatus.path
        // 打开文件所在目录
        try {
          const folderPath = dirname(path)
          this.$electron.shell.openPath(folderPath)
        } catch (e) {
          console.warn('[FFmpeg] Open folder failed:', e)
        }
      },
      openAria2LogFolder () {
        const { existsSync } = require('node:fs')
        const { dirname } = require('node:path')

        // 优先尝试打开日志文件
        if (this.aria2LogPath && existsSync(this.aria2LogPath)) {
          try {
            this.$electron.shell.showItemInFolder(this.aria2LogPath)
            return
          } catch (e) {
            console.warn('[Aria2] Show log file failed:', e)
          }
        }

        // 如果文件不存在，打开日志目录
        if (this.aria2LogDir) {
          try {
            this.$electron.shell.openPath(this.aria2LogDir)
          } catch (e) {
            console.warn('[Aria2] Open log directory failed:', e)
          }
        } else if (this.aria2LogPath) {
          // 降级：从日志路径提取目录
          try {
            const folderPath = dirname(this.aria2LogPath)
            this.$electron.shell.openPath(folderPath)
          } catch (e) {
            console.warn('[Aria2] Open log folder failed:', e)
          }
        }
      },
      applyFilters (keyword) {
        if (this._filterTimer) {
          clearTimeout(this._filterTimer)
        }
        this._filterTimer = setTimeout(() => {
          this.filterCards(keyword, this.activeCategory)
        }, 120)
      },
      filterCards (keyword, category) {
        this.$nextTick(() => {
          if (!this.$el) return
          const cards = this.$el.querySelectorAll('.preference-card')
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
          this.hasNoResults = visibleCount === 0 && k !== ''
        })
      },

      hasMsgSupport () {
        return typeof this.$msg !== 'undefined' && this.$msg !== null
      },
      showMessage (type, message) {
        if (this.hasMsgSupport()) {
          this.$msg[type](message)
        } else {
          console.log(`[LinkCore] Update message: ${type} - ${message}`)
          if (type === 'error') {
            alert(message)
          }
        }
      },
      // 版本项点击处理
      handleVersionItemClick () {
        if (this.updateDownloaded) {
          this.installUpdate()
        } else if (this.isDownloadingUpdate) {
          // 正在下载，不做任何操作
        } else if (this.updateAvailable) {
          this.downloadUpdate()
        } else if (!this.isCheckingUpdate) {
          this.onCheckUpdateClick()
        }
      },
      // 安装更新
      installUpdate () {
        this.showMessage('info', '正在准备安装更新，应用将自动重启...')
        this.$electron.ipcRenderer.send('command', 'application:quit-and-install-update')
      },
      downloadUpdate () {
        if (this.isDownloadingUpdate) return
        this.$store.dispatch('preference/updateIsDownloadingUpdate', true)
        this.$store.dispatch('preference/updateUpdateDownloaded', false)
        this.$store.dispatch('preference/updateDownloadProgress', 0)
        this.$store.dispatch('preference/updateDownloadSize', { total: 0, transferred: 0 })
        this.showMessage('info', '开始下载新版本...')
        const cleanupListeners = () => {
          this.$electron.ipcRenderer.removeListener('download-progress', onDownloadProgress)
          this.$electron.ipcRenderer.removeListener('update-downloaded', onDownloaded)
          this.$electron.ipcRenderer.removeListener('update-error', onDownloadError)
          this.$electron.ipcRenderer.removeListener('update-cancelled', onDownloadCancelled)
        }
        const onDownloadProgress = (event, progress) => {
          this.$store.dispatch('preference/updateDownloadProgress', Math.round(progress.percent))
          this.$store.dispatch('preference/updateDownloadSize', {
            total: progress.total || 0,
            transferred: progress.transferred || 0
          })
        }
        const onDownloaded = () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.showMessage('success', '更新下载完成，应用程序将自动重启并安装更新')
          cleanupListeners()
        }
        const onDownloadError = (_event, errMsg) => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          const msg = errMsg ? `下载更新失败：${errMsg}` : '下载更新失败，请检查网络连接后重试'
          this.showMessage('error', msg)
          cleanupListeners()
        }
        const onDownloadCancelled = () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.showMessage('info', '更新下载已取消')
          cleanupListeners()
        }
        this.$electron.ipcRenderer.on('download-progress', onDownloadProgress)
        this.$electron.ipcRenderer.on('update-downloaded', onDownloaded)
        this.$electron.ipcRenderer.on('update-error', onDownloadError)
        this.$electron.ipcRenderer.on('update-cancelled', onDownloadCancelled)
        this.$electron.ipcRenderer.send('command', 'application:download-update')
      },

      // 获取引擎列表方法
      async fetchEngineList () {
        try {
          await this.$store.dispatch('app/fetchEngineList')
        } catch (error) {
          console.error('Failed to get engine list:', error)
          this.$msg.error(this.$t('preferences.engine-list-fetch-error') || 'Failed to fetch engine list')
        }
      },
      async fetchEngineInfo () {
        try {
          await this.$store.dispatch('app/fetchEngineInfo')
        } catch (error) {
          console.error('Failed to get engine info:', error)
        }
      },
      autoSaveForm () {
        // Debounce auto-save to avoid too many requests
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout)
        }
        this.saveTimeout = setTimeout(() => {
          // Double-check there are actual changes before submitting
          if (!isEmpty(diffConfig(this.formOriginal, this.form))) {
            this.submitForm('advancedForm')
          }
        }, 800)
      },
      handleLocaleChange (locale) {
        const lng = getLanguage(locale)
        getLocaleManager().changeLanguage(lng)
        this.autoSaveForm()
      },
      onCheckUpdateClick () {
        // 如果正在检查，直接返回
        if (this.isCheckingUpdate) return

        // 设置检查状态
        this.updateCheckingUpdate(true)

        // 显示检查中消息
        this.$msg.info(this.$t('app.checking-for-updates'))

        // 创建临时事件监听器，使用once确保只触发一次
        const onUpdateError = (_event, errMsg) => {
          const msg = errMsg || this.$t('app.update-error-message')
          this.$msg.error(msg)
          this.updateCheckingUpdate(false)
        }

        const onUpdateNotAvailable = () => {
          this.$msg.success(this.$t('app.update-not-available-message'))
          this.updateCheckingUpdate(false)
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.$store.dispatch('preference/updateNewVersion', '')
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
        }

        const onUpdateAvailable = (event, version, releaseNotes) => {
          this.$msg.info(this.$t('app.update-available-message'))
          this.updateCheckingUpdate(false)
          this.$store.dispatch('preference/updateUpdateAvailable', true)
          this.$store.dispatch('preference/updateNewVersion', version)
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
          this.$store.dispatch('preference/updateReleaseNotes', releaseNotes || '')
        }

        // 使用once监听事件，确保事件只处理一次
        this.$electron.ipcRenderer.once('update-error', onUpdateError)
        this.$electron.ipcRenderer.once('update-not-available', onUpdateNotAvailable)
        this.$electron.ipcRenderer.once('update-available', onUpdateAvailable)

        // 设置超时处理，防止无限期等待
        const timeout = setTimeout(() => {
          console.log('[LinkCore] Update check timed out')
          // 移除所有临时事件监听器
          this.$electron.ipcRenderer.removeListener('update-error', onUpdateError)
          this.$electron.ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable)
          this.$electron.ipcRenderer.removeListener('update-available', onUpdateAvailable)

          // 显示超时消息
          this.$msg.error(this.$t('app.update-timeout-message') || '更新检查超时，请稍后重试')
          this.updateCheckingUpdate(false)
        }, 30000) // 30秒超时（含镜像回退时间）

        // 监听任何更新事件，清除超时
        const clearTimeoutListener = () => {
          clearTimeout(timeout)
          console.log('[LinkCore] Update check completed, clearing timeout')
          // 移除清除超时的监听器
          this.$electron.ipcRenderer.removeListener('update-error', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-not-available', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-available', clearTimeoutListener)
        }
        this.$electron.ipcRenderer.once('update-error', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-not-available', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-available', clearTimeoutListener)

        // 发送检查更新命令
        console.log('[LinkCore] Sending check for updates command')
        this.$electron.ipcRenderer.send('command', 'application:check-for-updates')

        // 更新最后检查时间
        this.$store.dispatch('preference/fetchPreference')
          .then((config) => {
            const { lastCheckUpdateTime } = config
            this.form.lastCheckUpdateTime = lastCheckUpdateTime
          })
      },
      async onPreviewUpdateClick () {
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
                    Array.from(node.childNodes || []).forEach(child => {
                      const cleaned = sanitizeNode(child, outDoc)
                      if (cleaned) frag.appendChild(cleaned)
                    })
                    return frag
                  }

                  const el = outDoc.createElement(tag)

                  if (tag === 'a') {
                    const href = normalizeUrlAttr(node.getAttribute('href'))
                    if (!href) {
                      el.setAttribute('href', '#')
                    } else {
                      el.setAttribute('href', href)
                    }
                    el.setAttribute('target', '_blank')
                    el.setAttribute('rel', 'noopener noreferrer')
                  } else if (tag === 'img') {
                    const src = normalizeUrlAttr(node.getAttribute('src'))
                    if (!src) {
                      return null
                    }
                    el.setAttribute('src', src)
                    const alt = node.getAttribute('alt')
                    if (alt) {
                      el.setAttribute('alt', `${alt}`)
                    }
                  }

                  Array.from(node.childNodes || []).forEach(child => {
                    const cleaned = sanitizeNode(child, outDoc)
                    if (cleaned) el.appendChild(cleaned)
                  })
                  return el
                }

                const outDoc = document.implementation.createHTMLDocument('')
                const container = outDoc.createElement('div')
                Array.from(root.childNodes || []).forEach(child => {
                  const cleaned = sanitizeNode(child, outDoc)
                  if (cleaned) container.appendChild(cleaned)
                })
                return container.innerHTML
              } catch (_) {
                return ''
              }
            }
            const looksLikeHtml = /<\/?(p|h[1-6]|ul|ol|li|pre|code|strong|em|a|table|thead|tbody|tr|td|th)[\s>]/i.test(s) || /<br\s*\/?>/i.test(s)
            let html = ''
            if (looksLikeHtml) {
              html = sanitizeHtml(s)
            } else {
              s = s.replace(/\r\n/g, '\n')
              const escapeHtml = (text) => {
                return `${text}`
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
              }
              const escapeAttr = (text) => {
                return `${text}`
                  .replace(/&/g, '&amp;')
                  .replace(/"/g, '&quot;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
              }

              // 预处理：处理代码块
              const codeBlocks = []
              s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
                codeBlocks.push({ lang, code: code.trim() })
                return `\n\n${placeholder}\n\n`
              })

              // 按段落分割
              const blocks = s.split(/\n{2,}/)
              html = blocks.map(block => {
                // 检查是否是代码块占位符
                const codeMatch = /^__CODE_BLOCK_(\d+)__$/.exec(block.trim())
                if (codeMatch) {
                  const index = parseInt(codeMatch[1])
                  const codeBlock = codeBlocks[index]
                  if (codeBlock) {
                    return `<pre><code>${escapeHtml(codeBlock.code)}</code></pre>`
                  }
                }

                const lines = block.split('\n')
                const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0)
                if (!trimmedLines.length) {
                  return ''
                }

                // 处理标题
                const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmedLines[0])
                if (headingMatch && trimmedLines.length === 1) {
                  const level = headingMatch[1].length
                  const text = headingMatch[2]
                  return `<h${level}>${escapeHtml(text)}</h${level}>`
                }

                // 处理水平线
                if (/^[-*_]{3,}$/.test(trimmedLines[0]) && trimmedLines.length === 1) {
                  return '<hr>'
                }

                // 处理图片
                if (trimmedLines.length === 1) {
                  const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmedLines[0])
                  if (imgMatch) {
                    const altRaw = imgMatch[1] || ''
                    const srcRaw = imgMatch[2] || ''
                    const srcTrimmed = `${srcRaw}`.trim()
                    const safeSrc = /^https?:\/\//i.test(srcTrimmed) ? srcTrimmed : ''
                    if (!safeSrc) {
                      return `<p>${escapeHtml(trimmedLines[0])}</p>`
                    }
                    return `<p><img src="${escapeAttr(safeSrc)}" alt="${escapeAttr(altRaw)}"></p>`
                  }
                }

                // 处理列表
                const allBullet = trimmedLines.every(l => /^[-*+]\s+/.test(l))
                const allNumbered = trimmedLines.every(l => /^\d+\.\s+/.test(l))
                if (allBullet) {
                  const items = trimmedLines.map(l => {
                    const text = l.replace(/^[-*+]\s+/, '')
                    return `<li>${this.parseInlineMarkdown(text)}</li>`
                  }).join('')
                  return `<ul>${items}</ul>`
                }
                if (allNumbered) {
                  const items = trimmedLines.map(l => {
                    const text = l.replace(/^\d+\.\s+/, '')
                    return `<li>${this.parseInlineMarkdown(text)}</li>`
                  }).join('')
                  return `<ol>${items}</ol>`
                }

                // 处理引用
                if (trimmedLines.every(l => l.startsWith('>'))) {
                  const content = trimmedLines.map(l => l.replace(/^>\s*/, '')).join('<br>')
                  return `<blockquote>${this.parseInlineMarkdown(content)}</blockquote>`
                }

                // 普通段落
                const inner = trimmedLines.map(line => this.parseInlineMarkdown(line)).join('<br>')
                return `<p>${inner}</p>`
              }).filter(Boolean).join('')
            }
            if (!looksLikeHtml) {
              // 处理纯文本中的URL（避免重复处理HTML中的URL）
              html = html.replace(
                /(?<!href="|src="|<a[^>]*>)(https?:\/\/[^\s<"']+?)(?=<|$|\s)/gi,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
              )
            }
            html = sanitizeHtml(html)
            return html.trim()
          }

          // 内联 markdown 解析辅助函数
          this.parseInlineMarkdown = (text) => {
            const escapeHtml = (t) => {
              return `${t}`
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
            }

            let result = escapeHtml(text)

            // 处理行内代码 `code`
            result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

            // 处理粗体 **text** 或 __text__
            result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            result = result.replace(/__(.+?)__/g, '<strong>$1</strong>')

            // 处理斜体 *text* 或 _text_ (避免与粗体冲突)
            result = result.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>')
            result = result.replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, '<em>$1</em>')

            // 处理删除线 ~~text~~
            result = result.replace(/~~(.+?)~~/g, '<del>$1</del>')

            // 处理链接 [text](url)
            result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

            return result
          }

          const raw = this.releaseNotes
          const html = raw ? buildReleaseNotesHtml(raw) : ''
          const displayContent = html || `<p>${this.$t('app.release-notes-not-found')}</p>`
          this.updatePreviewContent = displayContent
          this.updatePreviewVisible = true
        } catch (e) {
          console.error('[LinkCore] Preview update failed', e)
          if (this.$msg) {
            this.$msg.error(this.$t('app.update-error-message'))
          }
        }
      },
      closeUpdatePreview () {
        this.updatePreviewVisible = false
      },
      handleUpdatePreviewClick (event) {
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
          this.$electron.ipcRenderer.send('command', 'application:open-external', href)
        } catch (e) {
          console.error('[LinkCore] open external url failed:', href, e)
        }
      },

      onProtocolsChange (protocol, enabled) {
        const { protocols } = this.form
        this.form.protocols = {
          ...protocols,
          [protocol]: enabled
        }
      },
      onProxyModeChange (mode) {
        this.form.proxy = {
          ...this.form.proxy,
          mode
        }
      },
      onProxyServerChange (server) {
        this.form.proxy = {
          ...this.form.proxy,
          server
        }
      },
      handleProxyBypassChange (bypass) {
        this.form.proxy = {
          ...this.form.proxy,
          bypass: convertLineToComma(bypass)
        }
      },
      onProxyScopeChange (scope) {
        this.form.proxy = {
          ...this.form.proxy,
          scope: [...scope]
        }
      },
      changeUA (type) {
        const ua = userAgentMap[type]
        if (!ua) {
          return
        }
        this.form.userAgent = ua
      },
      onBtPortDiceClick () {
        const port = generateRandomInt(20000, 24999)
        this.form.listenPort = port
      },
      onDhtPortDiceClick () {
        const port = generateRandomInt(25000, 29999)
        this.form.dhtListenPort = port
      },
      onRpcListenPortChange (value) {
        console.log('onRpcListenPortChange===>', value)
        if (EMPTY_STRING === value) {
          this.form.rpcListenPort = this.rpcDefaultPort
        }
      },
      onRpcPortDiceClick () {
        const port = generateRandomInt(ENGINE_RPC_PORT, 20000)
        this.form.rpcListenPort = port
      },
      onRpcSecretDiceClick () {
        this.hideRpcSecret = false
        const rpcSecret = randomize('Aa0', 16)
        this.form.rpcSecret = rpcSecret

        setTimeout(() => {
          this.hideRpcSecret = true
        }, 2000)
      },
      onSessionResetClick () {
        dialog.showMessageBox({
          type: 'warning',
          title: this.$t('preferences.session-reset'),
          message: this.$t('preferences.session-reset-confirm'),
          buttons: [this.$t('app.yes'), this.$t('app.no')],
          cancelId: 1
        }).then(({ response }) => {
          if (response === 0) {
            this.$store.dispatch('task/purgeTaskRecord')
            this.$store.dispatch('task/pauseAllTask')
              .then(() => {
                this.$electron.ipcRenderer.send('command', 'application:reset-session')
              })
          }
        })
      },

      onFactoryResetClick () {
        dialog.showMessageBox({
          type: 'warning',
          title: this.$t('preferences.factory-reset'),
          message: this.$t('preferences.factory-reset-confirm'),
          buttons: [this.$t('app.yes'), this.$t('app.no')],
          cancelId: 1
        }).then(({ response }) => {
          if (response === 0) {
            this.$electron.ipcRenderer.send('command', 'application:factory-reset')
          }
        })
      },
      syncFormConfig () {
        // 保存成功后，直接使用当前表单数据更新 formOriginal
        // 而不是从后端重新获取，避免竞态条件导致配置被重置
        this.formOriginal = cloneDeep(this.form)
      },
      getEngineMaxConnection (engineBinary) {
        const policy = getEngineConnectionPolicy(engineBinary)
        return Number(policy && policy.max) || ENGINE_MAX_CONNECTION_PER_SERVER
      },
      getEngineDefaultConnection (engineBinary) {
        const policy = getEngineConnectionPolicy(engineBinary)
        return Number(policy && policy.defaultMax) || ENGINE_MAX_CONNECTION_PER_SERVER
      },
      submitForm (formName) {
        this.$refs[formName].validate((valid) => {
          if (!valid) {
            console.error('[LinkCore] preference form valid:', valid)
            return false
          }

          const data = {
            ...diffConfig(this.formOriginal, this.form)
          }

          if ('engineBinary' in data) {
            const engineBinary = data.engineBinary
            const engineMaxConnectionPerServer = this.getEngineMaxConnection(engineBinary)
            const engineDefaultConnectionPerServer = this.getEngineDefaultConnection(engineBinary)
            data['engine-binary'] = data.engineBinary
            data['engine-max-connection-per-server'] = engineMaxConnectionPerServer
            data['max-connection-per-server'] = engineDefaultConnectionPerServer
            delete data.engineBinary
          }

          // 显式处理autoSyncTrackerTime字段，转换为kebab-case
          if ('autoSyncTrackerTime' in data) {
            data['auto-sync-tracker-time'] = data.autoSyncTrackerTime
            delete data.autoSyncTrackerTime
          }

          // 显式处理 GitHub 镜像字段，转换为kebab-case
          if ('useGithubMirror' in data) {
            data['use-github-mirror'] = data.useGithubMirror
            delete data.useGithubMirror
          }
          if ('githubMirrorUrls' in data) {
            data['github-mirror-urls'] = data.githubMirrorUrls
            delete data.githubMirrorUrls
          }

          const {
            autoHideWindow,
            btAutoDownloadContent,
            btTracker,
            rpcListenPort
          } = data

          if ('btAutoDownloadContent' in data) {
            data.followTorrent = btAutoDownloadContent
            data.followMetalink = btAutoDownloadContent
            data.pauseMetadata = !btAutoDownloadContent
          }

          if (btTracker) {
            data.btTracker = reduceTrackerString(convertLineToComma(btTracker))
          }

          if (rpcListenPort === EMPTY_STRING) {
            data.rpcListenPort = this.rpcDefaultPort
          }

          console.log('[LinkCore] preference changed data:', data)

          // 检查是否需要重启
          const needRelaunch = this.isRenderer && (
            ('engine-binary' in data && data['engine-binary'] !== this.formOriginal.engineBinary) ||
            checkIsNeedRestart(data)
          )

          this.$store.dispatch('preference/save', data)
            .then(() => {
              this.$store.dispatch('app/fetchEngineOptions')
              // Don't show success message for auto-save to avoid constant notifications

              changedConfig.basic = {}
              changedConfig.advanced = {}

              if (this.isRenderer) {
                if ('autoHideWindow' in data) {
                  this.$electron.ipcRenderer.send('command',
                                                  'application:auto-hide-window', autoHideWindow)
                }

                // 只有在配置保存成功后才发送重启命令
                if (needRelaunch) {
                  this.$electron.ipcRenderer.send('command', 'application:relaunch')
                  // 发送重启命令后立即返回，不再执行后续的syncFormConfig()
                  return
                }

                // 不需要重启时，才同步表单配置
                this.syncFormConfig()
              }
            })
            .catch((e) => {
              this.$msg.error(this.$t('preferences.save-fail-message'))
              changedConfig.basic = {}
              changedConfig.advanced = {}
            })
        })
      }
    },

    beforeRouteLeave (to, from, next) {
      // Since we now use auto-save on changes, there's no need to check for unsaved changes
      changedConfig.advanced = {}
      changedConfig.basic = {}
      next()
    }
  }
</script>

<style lang="scss">
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
  background: transparent url('~@/assets/no-settings.svg') top center no-repeat;
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
.popup-scale-enter,
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
  background: $--dk-panel-background;
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

.github-mirror-row .el-select .el-input__inner {
  border-right: none;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-color: var(--lc-border-base);
  transition: border-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}

// 悬停整个选择框（含标签区域）即触发边框高亮，而非仅悬停边框线
.github-mirror-row .el-select:hover:not(:focus-within) .el-input__inner {
  border-color: var(--lc-border-hover);
}

.github-mirror-row .el-select .el-input__inner:focus,
.github-mirror-row .el-select .el-input.is-focus .el-input__inner {
  border-color: var(--lc-color-primary);
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
.github-mirror-row:has(.el-select .el-input.is-focus) .github-mirror-actions {
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

.bt-tracker .tracker-row:has(.el-select .el-input.is-focus) {
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
    .el-input__inner {
      border-left: none;
      border-right: none;
      border-radius: 0;
      font-size: 12px;
      border-color: var(--lc-border-base);
      transition: border-color 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    // 悬停整个选择框（含标签区域）即触发边框高亮，而非仅悬停边框线
    &:hover:not(:focus-within) .el-input__inner {
      border-color: var(--lc-border-hover);
    }

    .el-input__inner:focus,
    .el-input.is-focus .el-input__inner {
      border-color: var(--lc-color-primary);
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

</style>
