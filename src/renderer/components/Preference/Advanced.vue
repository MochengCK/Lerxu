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
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.auto-update') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.autoCheckUpdate" @change="autoSaveForm">
                {{ $t('preferences.auto-check-update') }}
              </el-checkbox>
              <div
                class="el-form-item__info"
                style="margin-top: 8px;"
                v-if="form.lastCheckUpdateTime !== 0"
              >
                {{ $t('preferences.last-check-update-time') + ': ' +
                  (form.lastCheckUpdateTime !== 0 ?
                    new Date(form.lastCheckUpdateTime).toLocaleString() :
                    new Date().toLocaleString())
                }}
                <span
                  class="action-link"
                  :class="{
                    'action-link--disabled': isCheckingUpdate,
                    'update-available': updateAvailable && !isCheckingUpdate
                  }"
                  @click.prevent="isCheckingUpdate ? null : (updateAvailable ? onPreviewUpdateClick() : onCheckUpdateClick())"
                >
                  {{ updateAvailable ? $t('app.preview-update') : $t('app.check-updates-now') }}
                </span>
              </div>
              <div
                class="version-item"
                :class="{ 'update-available': updateAvailable, 'is-checking': isCheckingUpdate, 'downloading': isDownloadingUpdate }"
                @click="updateAvailable ? downloadUpdate() : (isCheckingUpdate ? null : onCheckUpdateClick())"
              >
                <span>{{ getVersionText() }}</span>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 代理设置卡片 -->
        <div class="preference-card">
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

        <!-- BT Tracker设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.bt-tracker') }}</h3>
          <el-form-item size="mini">
            <div class="form-item-sub bt-tracker">
              <el-row :gutter="4" style="line-height: 0;">
                <el-col :span="24">
                  <div style="display:flex; align-items:center;">
                    <div style="display:flex; align-items:center; margin-right:4px;">
                      <el-tooltip
                        class="item"
                        effect="dark"
                        :content="isAllTrackerSourcesSelected ? $t('preferences.deselect-all-tracker-sources') : $t('preferences.select-all-tracker-sources')"
                        placement="bottom"
                      >
                        <el-button
                          @click="toggleAllTrackerSources"
                          class="sync-tracker-btn"
                        >
                          <mo-icon :name="isAllTrackerSourcesSelected ? 'deselect-all' : 'select-all'" width="12" height="12" />
                        </el-button>
                      </el-tooltip>
                    </div>
                    <div class="track-source" style="flex:1; transform: translateY(4px);">
                      <el-select
                        class="select-track-source"
                        v-model="form.trackerSource"
                        allow-create
                        filterable
                        multiple
                        style="width:100%; position: relative; top: 4px;"
                      >
                        <el-option-group
                          v-for="group in trackerSourceOptions"
                          :key="group.label"
                          :label="group.label"
                        >
                          <el-option
                            v-for="item in group.options"
                            :key="item.value"
                            :label="item.label"
                            :value="item.value"
                          >
                            <span style="float: left">{{ item.label }}</span>
                            <span style="float: right; margin-right: 24px">
                              <el-tag
                                type="success"
                                size="mini"
                                v-if="item.cdn"
                              >
                                CDN
                              </el-tag>
                            </span>
                          </el-option>
                        </el-option-group>
                      </el-select>
                    </div>
                    <div class="sync-tracker" style="display:flex; align-items:center; margin-left:4px;">
                      <el-tooltip
                        class="item"
                        effect="dark"
                        :content="$t('preferences.sync-tracker-tips')"
                        placement="bottom"
                      >
                        <el-button
                          @click="syncTrackerFromSource"
                          class="sync-tracker-btn"
                        >
                          <mo-icon
                            name="refresh"
                            width="12"
                            height="12"
                            :spin="true"
                            v-if="trackerSyncing"
                          />
                          <mo-icon name="sync" width="12" height="12" v-else />
                        </el-button>
                      </el-tooltip>
                      <el-tooltip
                        class="item"
                        effect="dark"
                        :content="$t('preferences.add-source')"
                        placement="bottom"
                      >
                        <el-button
                          @click="openTrackerSourceConfigDialog"
                          class="sync-tracker-btn"
                          style="margin-left:4px"
                        >
                          <mo-icon name="link" width="12" height="12" />
                        </el-button>
                      </el-tooltip>
                    </div>
                  </div>
                </el-col>
              </el-row>
              <el-input
                type="textarea"
                rows="3"
                auto-complete="off"
                :placeholder="`${$t('preferences.bt-tracker-input-tips')}`"
                v-model="form.btTracker">
              </el-input>
              <div class="el-form-item__info" style="margin-top: 8px;">
                <template v-if="!(originListForDisplay && originListForDisplay.length)">
                  {{ $t('preferences.bt-tracker-tips') }}
                </template>
                <template v-else>
                  {{ $t('preferences.added-origins') }}
                  <span v-for="o in originListForDisplay" :key="o" style="margin-right: 12px;">
                    <el-tooltip class="item" effect="dark" :content="$t('preferences.long-press-to-delete')" placement="top">
                      <a
                        href="javascript:;"
                        @mousedown="(e) => onOriginMouseDown(o, e)"
                        @mouseup="() => onOriginMouseUp(o)"
                        @mouseleave="() => onOriginMouseLeave(o)"
                        @click.prevent="() => onOriginClick(o)"
                      >
                        {{ deriveOriginLabel(o) }}
                        <mo-icon name="link" width="12" height="12" />
                      </a>
                    </el-tooltip>
                  </span>
                </template>
              </div>
            </div>
            <div class="form-item-sub">
              <el-checkbox v-model="form.autoSyncTracker">
                {{ $t('preferences.auto-sync-tracker') }}
              </el-checkbox>
            </div>
            <div class="form-item-sub" v-if="form.autoSyncTracker" style="margin-top: 12px;">
              <div class="sync-time-setting" style="display: flex; align-items: center; margin-bottom: 12px;">
                <el-time-picker
                  v-model="form.autoSyncTrackerTime"
                  placeholder="选择时间"
                  format="HH:mm"
                  value-format="HH:mm"
                  size="mini"
                  style="width: 100%;"
                  @change="autoSaveForm"
                />
              </div>

            </div>
          </el-form-item>
          <div class="form-item-sub" style="margin-top: 16px; text-align: center;" v-if="form.lastSyncTrackerTime > 0">
            <div class="el-form-item__info">
              {{ $t('preferences.last-sync-tracker-time') }}: {{ new Date(form.lastSyncTrackerTime).toLocaleString() }}
            </div>
          </div>
        </div>

        <!-- RPC设置卡片 -->
        <div class="preference-card">
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
        <div class="preference-card">
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
        <div class="preference-card">
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
          </el-form-item>
        </div>

        <!-- 引擎信息卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.engine') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-row :gutter="16" style="margin-bottom: 12px;">
                <el-col :span="24">
                  <strong>{{ $t('preferences.engine-select') }}:</strong>
                  <el-select
                    v-model="form.engineBinary"
                    :placeholder="$t('preferences.engine-select-placeholder')"
                    style="width: 100%; margin-top: 8px;"
                    @change="onEngineBinaryChange"
                  >
                    <el-option
                      v-for="engine in engineList"
                      :key="engine"
                      :label="engine"
                      :value="engine"
                    ></el-option>
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

        <!-- 优先级引擎设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.priority-engine') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.enablePriorityEngine" @change="handlePriorityEngineChange">
                {{ $t('preferences.enable-priority-engine') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="el-form-item__info" style="margin-bottom: 12px;">
                {{ $t('preferences.priority-engine-tips') }}
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24" style="margin-top: 12px;">
              <div class="el-form-item__info">
                <strong>{{ $t('preferences.priority-how-it-works') }}</strong>
                <ul style="margin: 8px 0 0 16px; padding: 0; list-style: disc;">
                  <li>{{ $t('preferences.priority-rule-1') }}</li>
                  <li>{{ $t('preferences.priority-rule-3') }}</li>
                  <li>{{ $t('preferences.priority-rule-auto-min') }}</li>
                </ul>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 视频合并设置卡片 -->
        <div class="preference-card">
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
        <div class="preference-card">
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
              <el-button-group class="ua-group">
                <el-button @click="() => changeUA('aria2')">{{ $t('preferences.user-agent-aria2') }}</el-button>
                <el-button @click="() => changeUA('transmission')">{{ $t('preferences.user-agent-transmission') }}</el-button>
                <el-button @click="() => changeUA('chrome')">{{ $t('preferences.user-agent-chrome') }}</el-button>
                <el-button @click="() => changeUA('du')">{{ $t('preferences.user-agent-du') }}</el-button>
              </el-button-group>
            </el-col>
          </el-form-item>
        </div>

        <!-- 开发者选项卡片 -->
        <div class="preference-card">
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
            <el-button type="primary" size="mini" @click="openAria2ConfEditor">{{ $t('preferences.aria2-conf-edit-button') }}</el-button>
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

    <el-dialog
      custom-class="tab-title-dialog aria2conf-editor-dialog"
      width="900px"
      :visible.sync="aria2ConfEditorVisible"
      :show-close="true"
      :append-to-body="true"
    >
      <div slot="title" class="aria2conf-toolbar">
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="12">
            <el-input :value="aria2ConfPath" disabled>
              <mo-show-in-folder slot="append" v-if="isRenderer" :path="aria2ConfPath" />
            </el-input>
          </el-col>
          <el-col :span="12">
            <el-input v-model="aria2ConfSearch" :placeholder="$t('preferences.aria2-conf-search-placeholder')" clearable />
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="12">
            <el-select v-model="aria2ConfQuickKey" filterable clearable :placeholder="$t('preferences.aria2-conf-quick-key-placeholder')" style="width:100%">
              <el-option v-for="k in aria2ConfCommonKeys" :key="k" :label="k" :value="k" />
            </el-select>
          </el-col>
          <el-col :span="12">
            <el-button type="primary" size="mini" @click="addConfKey">{{ $t('preferences.aria2-conf-add-key') }}</el-button>
            <el-button size="mini" @click="addConfItem">{{ $t('preferences.aria2-conf-add-item') }}</el-button>
            <el-button size="mini" @click="copyAria2ConfText">{{ $t('preferences.copy-as-text') }}</el-button>
            <el-button size="mini" @click="pasteFromClipboard">{{ $t('preferences.paste-and-import') }}</el-button>
          </el-col>
        </el-row>
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="24">
            <el-input type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" v-model="aria2ConfRawText" :placeholder="$t('preferences.aria2-text-placeholder')" />
            <div style="margin-top:8px">
          <el-button type="primary" size="mini" @click="importFromText">{{ $t('preferences.import-from-text') }}</el-button>
            </div>
          </el-col>
        </el-row>
      </div>
      <el-row :gutter="8">
        <el-col :span="24">
          <el-table :data="aria2ConfFilteredItems" :border="false" :stripe="true" size="mini" style="width: 100%">
            <el-table-column :label="$t('preferences.aria2-conf-table-key')" width="300">
              <template slot-scope="scope">
                <el-input v-model="scope.row.key" size="mini" />
              </template>
            </el-table-column>
            <el-table-column :label="$t('preferences.aria2-conf-table-value')">
              <template slot-scope="scope">
                <el-input v-model="scope.row.value" size="mini" />
              </template>
            </el-table-column>
            <el-table-column :label="$t('preferences.aria2-conf-table-action')" width="120">
              <template slot-scope="scope">
                <el-button type="danger" size="mini" @click="removeConfItem(scope.row)">{{ $t('preferences.aria2-conf-delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-col>
      </el-row>
      <div slot="footer" class="dialog-footer">
        <el-button type="primary" @click="saveAria2Conf">{{ $t('preferences.aria2-conf-save') }}</el-button>
      </div>
    </el-dialog>

    <el-dialog
      custom-class="tracker-source-dialog"
      width="640px"
      :visible.sync="trackerSourceConfigVisible"
      :show-close="false"
      :append-to-body="true"
    >
      <div style="display:flex; align-items:center; justify-content:center; padding:8px;">
        <el-input
          v-model="trackerSourceInput"
          :placeholder="$t('preferences.tracker-source-input-placeholder')"
          clearable
          style="max-width:480px;"
        >
          <template slot="prepend">
            <button type="button" class="tracker-source-close-btn" @click="trackerSourceConfigVisible = false">
              <i class="el-icon-close"></i>
            </button>
          </template>
        </el-input>
      </div>
    </el-dialog>
    <div v-if="trackerSourceConfigVisible" class="mo-tracker-source-submit">
      <el-button type="primary" @click="addTrackerSourceFromInput">{{ $t('app.submit') }}</el-button>
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
  import { mapState, mapActions } from 'vuex'
  import { cloneDeep, isEmpty } from 'lodash'
  import randomize from 'randomatic'
  import axios from 'axios'
  import ShowInFolder from '@/components/Native/ShowInFolder'
  import userAgentMap from '@shared/ua'
  import {
    EMPTY_STRING,
    ENGINE_RPC_PORT,
    ENGINE_MAX_CONNECTION_PER_SERVER,
    LOG_LEVELS,
    TRACKER_SOURCE_OPTIONS,
    PROXY_SCOPE_OPTIONS
  } from '@shared/constants'
  import {
    buildRpcUrl,
    calcFormLabelWidth,
    changedConfig,
    checkIsNeedRestart,
    convertCommaToLine,
    convertLineToComma,
    diffConfig,
    generateRandomInt
  } from '@shared/utils'
  import { reduceTrackerString } from '@shared/utils/tracker'
  import '@/components/Icons/dice'
  import '@/components/Icons/sync'
  import '@/components/Icons/refresh'
  import '@/components/Icons/select-all'
  import '@/components/Icons/deselect-all'
  import { getLanguage } from '@shared/locales'
  import { getLocaleManager } from '@/components/Locale'

  const initForm = (config) => {
    const {
      autoCheckUpdate,
      autoSyncTracker,
      autoSyncTrackerInterval,
      autoSyncTrackerTime,
      btTracker,
      dhtListenPort,
      enablePriorityEngine,
      enableUpnp,
      hideAppMenu,
      lastCheckUpdateTime,
      lastSyncTrackerTime,
      listenPort,
      logLevel,
      protocols,
      proxy,
      rpcListenPort,
      rpcSecret,
      scheduler,
      trackerSource,
      trackerSourceDiscovered,
      trackerSourceOrigins,
      trackerSourceMap,
      useProxy,
      userAgent,
      engineBinary
    } = config
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
      autoSyncTracker,
      autoSyncTrackerInterval: autoSyncTrackerInterval || config['auto-sync-tracker-interval'] || 12,
      autoSyncTrackerTime: autoSyncTrackerTime !== undefined ? autoSyncTrackerTime : (config['auto-sync-tracker-time'] !== undefined ? config['auto-sync-tracker-time'] : '00:00'),
      btTracker: convertCommaToLine(btTracker),
      dhtListenPort,
      enablePriorityEngine: enablePriorityEngine !== undefined ? enablePriorityEngine : false,
      enableUpnp,
      hideAppMenu,
      lastCheckUpdateTime,
      lastSyncTrackerTime,
      listenPort,
      logLevel,
      proxy: clonedProxy,
      protocols: { ...protocols },
      rpcListenPort,
      rpcSecret,
      scheduler: clonedScheduler,
      trackerSource,
      trackerSourceDiscovered: Array.isArray(trackerSourceDiscovered) ? [...trackerSourceDiscovered] : (config['tracker-source-discovered'] || []),
      trackerSourceOrigins: Array.isArray(trackerSourceOrigins) ? [...trackerSourceOrigins] : (config['tracker-source-origins'] || []),
      trackerSourceMap: typeof trackerSourceMap === 'object' && trackerSourceMap ? { ...trackerSourceMap } : (config['tracker-source-map'] || {}),
      useProxy,
      userAgent,
      engineBinary: parsedEngineBinary
    }
    return result
  }

  export default {
    name: 'mo-preference-advanced',
    components: {
      [ShowInFolder.name]: ShowInFolder
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
        trackerSourceOptions: [],
        trackerSyncing: false,
        saveTimeout: null,
        engineList: [],
        trackerSourceConfigVisible: false,
        trackerSourceInput: '',
        // 添加标志，用于跟踪引擎配置是否已初始化
        engineConfigInitialized: false,
        aria2ConfEditorVisible: false,
        aria2ConfOriginalLines: [],
        aria2ConfItems: [],
        aria2ConfLoading: false,
        aria2ConfSearch: '',
        aria2ConfQuickKey: '',
        aria2ConfCommonKeys: [
          'max-concurrent-downloads',
          'max-connection-per-server',
          'max-overall-download-limit',
          'max-overall-upload-limit',
          'rpc-listen-port',
          'rpc-secret',
          'user-agent',
          'dir'
        ],
        aria2ConfRawText: '',
        appVersion: '',
        updatePreviewVisible: false,
        updatePreviewContent: '',
        hasNoResults: false,
        ffmpegStatus: {
          installed: false,
          path: ''
        }
      }
    },
    computed: {
      ...mapState('app', ['isCheckingUpdate']),
      ...mapState('preference', ['updateAvailable', 'newVersion', 'isDownloadingUpdate', 'downloadProgress', 'releaseNotes', 'searchKeyword']),
      ...mapState('app', {
        storeEngineInfo: state => state.engineInfo
      }),
      configEngineBinary () {
        const { config = {} } = this.$store.state.preference
        return config.engineBinary || config['engine-binary']
      },
      engineInfo () {
        return this.storeEngineInfo
      },
      subnavMode () {
        const { config = {} } = this.$store.state.preference
        return config.subnavMode || 'floating'
      },
      isRenderer: () => is.renderer(),
      title () {
        return this.$t('preferences.advanced')
      },
      subnavs () {
        return [
          {
            key: 'basic',
            title: this.$t('preferences.basic'),
            route: '/preference/basic'
          },
          {
            key: 'advanced',
            title: this.$t('preferences.advanced'),
            route: '/preference/advanced'
          },
          {
            key: 'lab',
            title: this.$t('preferences.lab'),
            route: '/preference/lab'
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
        sessionPath: state => state.config.sessionPath
      }),
      aria2ConfFilteredItems () {
        const q = `${this.aria2ConfSearch}`.toLowerCase()
        if (!q) return this.aria2ConfItems
        return this.aria2ConfItems.filter(i => {
          const k = `${i.key}`.toLowerCase()
          const v = `${i.value}`.toLowerCase()
          return k.includes(q) || v.includes(q)
        })
      },
      originListForDisplay () {
        const builtin = (TRACKER_SOURCE_OPTIONS || [])
          .map(g => g && g.label ? g.label : '')
          .filter(Boolean)
          .filter(l => l.includes('/'))
          .map(l => `https://github.com/${l}`)
        const saved = Array.isArray(this.form.trackerSourceOrigins) ? this.form.trackerSourceOrigins : []
        const normalizedSaved = saved.map(o => this.normalizeOriginUrl(o))
        return Array.from(new Set([...builtin.map(this.normalizeOriginUrl), ...normalizedSaved]))
      },
      isAllTrackerSourcesSelected () {
        // 获取所有可用的源
        const allSources = []
        ;(this.trackerSourceOptions || []).forEach(group => {
          ;(group.options || []).forEach(opt => {
            if (opt.value && !allSources.includes(opt.value)) {
              allSources.push(opt.value)
            }
          })
        })

        // 如果没有可用源，返回false
        if (allSources.length === 0) {
          return false
        }

        // 获取当前选中的源
        const selectedSources = Array.isArray(this.form.trackerSource) ? this.form.trackerSource : []

        // 检查是否所有源都被选中
        return allSources.length === selectedSources.length &&
               allSources.every(source => selectedSources.includes(source))
      },
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
      }
    },
    watch: {
      searchKeyword: {
        immediate: true,
        handler (val) {
          this.filterCards(val)
        }
      },
      form: {
        handler () {
          // Only save if form has changed from original
          const hasChanges = !isEmpty(diffConfig(this.formOriginal, this.form))
          if (hasChanges) {
            this.autoSaveForm()
          }
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
      },
      // 监听引擎列表变化，确保当前选择的引擎有效
      engineList (newList) {
        if (newList.length > 0) {
          this.initEngineSelection(newList)
        }
      },
      // 监听store中的engineBinary变化，确保表单与最新配置同步
      configEngineBinary: {
        handler (newValue) {
          if (newValue && this.engineList.length > 0) {
            this.form.engineBinary = newValue
            this.formOriginal.engineBinary = newValue
          }
        },
        immediate: true
      }
    },
    async created () {
      // 获取引擎列表
      await this.fetchEngineList()
      this.rebuildTrackerSourceOptions()
    },
    async mounted () {
      await this.fetchEngineList()
      this.rebuildTrackerSourceOptions()
      this.checkFfmpegStatus()
      try {
        const appConfig = await this.$electron.ipcRenderer.invoke('get-app-config')
        this.appVersion = appConfig.version
      } catch (error) {
        console.error('[Motrix] Failed to get app version:', error)
      }
    },
    methods: {
      handlePriorityEngineChange (val) {
        this.$electron.ipcRenderer.send('command', 'application:toggle-priority-engine', val)
        this.autoSaveForm()
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
      filterCards (keyword) {
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
      getBuiltinOrigins () {
        return (TRACKER_SOURCE_OPTIONS || [])
          .map(g => g && g.label ? g.label : '')
          .filter(Boolean)
          .filter(l => l.includes('/'))
          .map(l => `https://github.com/${l}`)
      },
      onOriginMouseDown (o, e) {
        if (!e || e.button !== 0) return
        if (!this.originHoldTimers) this.originHoldTimers = {}
        this.originHoldActivated = false
        const tid = setTimeout(() => {
          this.originHoldActivated = true
          this.deleteOrigin(o)
        }, 800)
        this.originHoldTimers[o] = tid
      },
      onOriginMouseUp (o) {
        this.cancelOriginHold(o)
      },
      onOriginMouseLeave (o) {
        this.cancelOriginHold(o)
      },
      cancelOriginHold (o) {
        if (this.originHoldTimers && this.originHoldTimers[o]) {
          clearTimeout(this.originHoldTimers[o])
          delete this.originHoldTimers[o]
        }
      },
      onOriginClick (o) {
        if (this.originHoldActivated) return
        try {
          window.open(o, '_blank')
        } catch (_) {}
      },
      deleteOrigin (o) {
        const builtin = this.getBuiltinOrigins()
        if (builtin.includes(o)) {
          this.$msg.warning('内置来源不可删除')
          return
        }
        const origins = Array.isArray(this.form.trackerSourceOrigins) ? [...this.form.trackerSourceOrigins] : []
        const idx = origins.indexOf(o)
        if (idx >= 0) origins.splice(idx, 1)
        this.form.trackerSourceOrigins = origins
        const discovered = Array.isArray(this.form.trackerSourceDiscovered) ? [...this.form.trackerSourceDiscovered] : []
        const map = typeof this.form.trackerSourceMap === 'object' && this.form.trackerSourceMap ? { ...this.form.trackerSourceMap } : {}
        const filtered = discovered.filter(u => {
          const origin = map[u] || this.deriveOriginSite(u)
          return origin !== o
        })
        this.form.trackerSourceDiscovered = filtered
        Object.keys(map).forEach(k => { if (map[k] === o) delete map[k] })
        this.form.trackerSourceMap = map
        const selected = Array.isArray(this.form.trackerSource) ? [...this.form.trackerSource] : []
        const selectedFiltered = selected.filter(u => {
          const origin = map[u] || this.deriveOriginSite(u)
          return origin !== o
        })
        this.form.trackerSource = selectedFiltered
        this.rebuildTrackerSourceOptions()
        this.sanitizeSelectedSources()
        this.autoSaveForm()
        this.recomputeBtTrackerFromSelected()
        this.$msg.success(this.$t('preferences.origin-removed'))
      },
      getVersionText () {
        if (this.isDownloadingUpdate) {
          return `下载中 ${this.downloadProgress}%`
        } else if (this.updateAvailable) {
          return `下载新版本 ${this.newVersion}`
        } else {
          return this.appVersion
        }
      },
      hasMsgSupport () {
        return typeof this.$msg !== 'undefined' && this.$msg !== null
      },
      showMessage (type, message) {
        if (this.hasMsgSupport()) {
          this.$msg[type](message)
        } else {
          console.log(`[Motrix] Update message: ${type} - ${message}`)
          if (type === 'error') {
            alert(message)
          }
        }
      },
      downloadUpdate () {
        if (this.isDownloadingUpdate) return
        this.$store.dispatch('preference/updateIsDownloadingUpdate', true)
        this.$store.dispatch('preference/updateDownloadProgress', 0)
        this.showMessage('info', '开始下载新版本...')
        const onDownloadProgress = (event, progress) => {
          this.$store.dispatch('preference/updateDownloadProgress', Math.round(progress.percent))
        }
        const onDownloaded = () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.showMessage('success', '更新下载完成，应用程序将自动重启并安装更新')
          this.$electron.ipcRenderer.removeListener('download-progress', onDownloadProgress)
          this.$electron.ipcRenderer.removeListener('update-downloaded', onDownloaded)
          this.$electron.ipcRenderer.removeListener('update-error', onDownloadError)
        }
        const onDownloadError = () => {
          this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
          this.showMessage('error', '下载更新失败，请检查网络连接后重试')
          this.$electron.ipcRenderer.removeListener('download-progress', onDownloadProgress)
          this.$electron.ipcRenderer.removeListener('update-downloaded', onDownloaded)
          this.$electron.ipcRenderer.removeListener('update-error', onDownloadError)
        }
        this.$electron.ipcRenderer.on('download-progress', onDownloadProgress)
        this.$electron.ipcRenderer.on('update-downloaded', onDownloaded)
        this.$electron.ipcRenderer.on('update-error', onDownloadError)
        this.$electron.ipcRenderer.send('command', 'application:download-update')
      },
      recomputeBtTrackerFromSelected () {
        const selected = Array.isArray(this.form.trackerSource) ? this.form.trackerSource : []
        if (!selected.length) {
          this.form.btTracker = ''
          this.form.lastSyncTrackerTime = Date.now()
          return
        }
        this.trackerSyncing = true
        this.$store.dispatch('preference/fetchBtTracker', selected)
          .then((data) => {
            const texts = Array.isArray(data) ? data : []
            const lines = []
            texts.forEach(t => {
              const ls = this.extractTrackerLines(t)
              if (ls && ls.length) lines.push(...ls)
            })
            const uniq = Array.from(new Set(lines))
            const tracker = uniq.join('\n')
            this.form.lastSyncTrackerTime = Date.now()
            this.form.btTracker = tracker
            this.trackerSyncing = false
          })
          .catch((_) => {
            this.trackerSyncing = false
          })
      },
      sanitizeSelectedSources () {
        const allowed = new Set()
        ;(this.trackerSourceOptions || []).forEach(group => {
          ;(group.options || []).forEach(opt => allowed.add(opt.value))
        })
        const current = Array.isArray(this.form.trackerSource) ? this.form.trackerSource : []
        const filtered = current.filter(v => allowed.has(v))
        if (filtered.length !== current.length) {
          this.form.trackerSource = filtered
        }
      },
      applyTrackerResult (lines, usedUrls = [], originSite = '') {
        const uniq = Array.from(new Set(lines))
        this.form.btTracker = uniq.join('\n')
        this.form.lastSyncTrackerTime = Date.now()
        const discovered = Array.isArray(this.form.trackerSourceDiscovered) ? [...this.form.trackerSourceDiscovered] : []
        usedUrls.forEach(u => { if (!discovered.includes(u)) discovered.push(u) })
        this.form.trackerSourceDiscovered = discovered
        const origins = Array.isArray(this.form.trackerSourceOrigins) ? [...this.form.trackerSourceOrigins] : []
        const normalizedOrigin = originSite ? this.normalizeOriginUrl(originSite) : ''
        if (normalizedOrigin && !origins.map(o => this.normalizeOriginUrl(o)).includes(normalizedOrigin)) origins.push(normalizedOrigin)
        this.form.trackerSourceOrigins = origins
        const map = typeof this.form.trackerSourceMap === 'object' && this.form.trackerSourceMap ? { ...this.form.trackerSourceMap } : {}
        usedUrls.forEach(u => { if (originSite) map[u] = originSite })
        this.form.trackerSourceMap = map
        this.rebuildTrackerSourceOptions()
        this.autoSaveForm()
        this.$msg.success(this.$t('preferences.extract-success', { count: uniq.length }))
      },
      applySourceDiscovery (usedUrls = [], originSite = '') {
        const discovered = Array.isArray(this.form.trackerSourceDiscovered) ? [...this.form.trackerSourceDiscovered] : []
        usedUrls.forEach(u => { if (!discovered.includes(u)) discovered.push(u) })
        this.form.trackerSourceDiscovered = discovered
        const origins = Array.isArray(this.form.trackerSourceOrigins) ? [...this.form.trackerSourceOrigins] : []
        const normalizedOrigin = originSite ? this.normalizeOriginUrl(originSite) : ''
        if (normalizedOrigin && !origins.map(o => this.normalizeOriginUrl(o)).includes(normalizedOrigin)) origins.push(normalizedOrigin)
        this.form.trackerSourceOrigins = origins
        const map = typeof this.form.trackerSourceMap === 'object' && this.form.trackerSourceMap ? { ...this.form.trackerSourceMap } : {}
        usedUrls.forEach(u => { if (originSite) map[u] = originSite })
        this.form.trackerSourceMap = map
        this.rebuildTrackerSourceOptions()
        this.sanitizeSelectedSources()
        this.autoSaveForm()
        this.$msg.success(this.$t('preferences.added-origin-files-success', { count: usedUrls.length }))
      },
      ...mapActions('app', ['updateCheckingUpdate']),
      // 初始化引擎选择
      initEngineSelection (engineList) {
        // 1. 从store获取最新的引擎配置
        const storeConfig = this.$store.state.preference.config
        const storeEngineBinary = storeConfig.engineBinary || storeConfig['engine-binary']

        // 2. 检查store中的引擎配置是否有效
        if (storeEngineBinary && engineList.includes(storeEngineBinary)) {
          // 如果有效，使用store中的配置
          this.form.engineBinary = storeEngineBinary
          this.formOriginal.engineBinary = storeEngineBinary
        } else if (this.form.engineBinary && engineList.includes(this.form.engineBinary)) {
          // 3. 检查当前表单中的引擎配置是否有效
          // 如果有效，保持当前配置
          this.formOriginal.engineBinary = this.form.engineBinary
        } else if (engineList.length > 0) {
          // 4. 否则，使用第一个可用引擎
          this.form.engineBinary = engineList[0]
          this.formOriginal.engineBinary = engineList[0]
          // 保存新的引擎配置
          this.autoSaveForm()
        }
      },
      rebuildTrackerSourceOptions () {
        const base = JSON.parse(JSON.stringify(TRACKER_SOURCE_OPTIONS))
        const srcs = Array.isArray(this.form.trackerSourceDiscovered) ? this.form.trackerSourceDiscovered : []
        const groups = {}
        srcs.forEach(u => {
          const groupLabel = this.deriveTrackerGroup(u) || this.deriveTrackerGroupByHost(u)
          const opt = { value: u, label: this.deriveTrackerLabel(u), cdn: false }
          if (!groupLabel) return
          if (!groups[groupLabel]) groups[groupLabel] = []
          groups[groupLabel].push(opt)
        })
        Object.keys(groups).forEach(label => {
          const idx = base.findIndex(i => i.label === label)
          if (idx >= 0) {
            const exist = base[idx].options || []
            const merged = [...exist]
            groups[label].forEach(opt => {
              if (!merged.find(o => o.value === opt.value)) merged.push(opt)
            })
            base[idx].options = merged
          } else {
            base.push({ label, options: groups[label] })
          }
        })
        this.trackerSourceOptions = base
        this.sanitizeSelectedSources()
      },
      deriveTrackerLabel (u) {
        const m = /([^/]+\.txt)(?:\?.*)?$/i.exec(`${u}`)
        if (m) return m[1]
        return u
      },
      deriveTrackerGroup (u) {
        const s = `${u}`
        const m1 = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m1) return `${m1[1]}/${m1[2]}`
        const m2 = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m2) return `${m2[1]}/${m2[2]}`
        const m3 = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i.exec(s)
        if (m3) return `${m3[1]}/${m3[2]}`
        if (/down\.adysec\.com/i.test(s)) return 'adysec/tracker'
        return ''
      },
      deriveTrackerGroupByHost (u) {
        try {
          const { host } = new URL(u)
          return host
        } catch (_) {
          return ''
        }
      },
      openTrackerSourceConfigDialog () {
        this.trackerSourceInput = ''
        this.trackerSourceConfigVisible = true
      },
      async addTrackerSourceFromInput () {
        const url = `${this.trackerSourceInput}`.trim()
        if (!url) return
        await this.configureTrackerFromGithubWithUrl(url)
        this.trackerSourceInput = ''
      },
      removeDiscoveredSource (u) {
        const list = Array.isArray(this.form.trackerSourceDiscovered) ? [...this.form.trackerSourceDiscovered] : []
        const idx = list.indexOf(u)
        if (idx >= 0) {
          list.splice(idx, 1)
          this.form.trackerSourceDiscovered = list
          this.rebuildTrackerSourceOptions()
          this.autoSaveForm()
        }
      },
      resetTrackerSelectBoxSources () {
        this.form.trackerSource = []
        this.form.trackerSourceDiscovered = []
        this.form.trackerSourceMap = {}
        this.rebuildTrackerSourceOptions()
        this.sanitizeSelectedSources()
        this.autoSaveForm()
        this.$msg.success(this.$t('preferences.reset-select-sources-success'))
      },
      toggleAllTrackerSources () {
        // 判断当前是否全选
        if (this.isAllTrackerSourcesSelected) {
          // 如果已全选，则取消全选
          this.form.trackerSource = []
          this.$msg.success(this.$t('preferences.deselect-all-tracker-sources-success'))

          // 清除输入框里的Tracker服务器内容
          this.recomputeBtTrackerFromSelected()
        } else {
          // 否则全选
          const allSources = []
          ;(this.trackerSourceOptions || []).forEach(group => {
            ;(group.options || []).forEach(opt => {
              if (opt.value && !allSources.includes(opt.value)) {
                allSources.push(opt.value)
              }
            })
          })

          this.form.trackerSource = allSources
          this.$msg.success(this.$t('preferences.select-all-tracker-sources-success', { count: allSources.length }))

          // 自动同步Tracker
          this.recomputeBtTrackerFromSelected()
        }

        // 自动保存配置
        this.autoSaveForm()
      },
      // 获取引擎列表方法
      async fetchEngineList () {
        try {
          const engines = await this.$electron.ipcRenderer.invoke('get-engine-list')
          this.engineList = engines
        } catch (error) {
          console.error('Failed to get engine list:', error)
          this.engineList = []
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
        }, 500)
      },
      onEngineBinaryChange () {
        // 引擎选择变化时，直接触发保存，不更新formOriginal
        this.autoSaveForm()
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
        const onUpdateError = () => {
          this.$msg.error(this.$t('app.update-error-message'))
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
          console.log('[Motrix] Update check timed out')
          // 移除所有临时事件监听器
          this.$electron.ipcRenderer.removeListener('update-error', onUpdateError)
          this.$electron.ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable)
          this.$electron.ipcRenderer.removeListener('update-available', onUpdateAvailable)

          // 显示超时消息
          this.$msg.error(this.$t('app.update-timeout-message') || '更新检查超时，请稍后重试')
          this.updateCheckingUpdate(false)
        }, 10000) // 10秒超时

        // 监听任何更新事件，清除超时
        const clearTimeoutListener = () => {
          clearTimeout(timeout)
          console.log('[Motrix] Update check completed, clearing timeout')
          // 移除清除超时的监听器
          this.$electron.ipcRenderer.removeListener('update-error', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-not-available', clearTimeoutListener)
          this.$electron.ipcRenderer.removeListener('update-available', clearTimeoutListener)
        }
        this.$electron.ipcRenderer.once('update-error', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-not-available', clearTimeoutListener)
        this.$electron.ipcRenderer.once('update-available', clearTimeoutListener)

        // 发送检查更新命令
        console.log('[Motrix] Sending check for updates command')
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
                  'strong', 'em',
                  'a',
                  'img',
                  'table', 'thead', 'tbody', 'tr', 'th', 'td',
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
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
              const blocks = s.split(/\n{2,}/)
              html = blocks.map(block => {
                const lines = block.split('\n')
                const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0)
                if (!trimmedLines.length) {
                  return ''
                }
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
                const allBullet = trimmedLines.every(l => /^[-*]\s+/.test(l))
                const allNumbered = trimmedLines.every(l => /^\d+\.\s+/.test(l))
                if (allBullet) {
                  const items = trimmedLines.map(l => {
                    const text = l.replace(/^[-*]\s+/, '')
                    return `<li>${escapeHtml(text)}</li>`
                  }).join('')
                  return `<ul>${items}</ul>`
                }
                if (allNumbered) {
                  const items = trimmedLines.map(l => {
                    const text = l.replace(/^\d+\.\s+/, '')
                    return `<li>${escapeHtml(text)}</li>`
                  }).join('')
                  return `<ol>${items}</ol>`
                }
                const inner = trimmedLines.map(line => escapeHtml(line)).join('<br>')
                return `<p>${inner}</p>`
              }).filter(Boolean).join('')
            }
            if (!looksLikeHtml) {
              html = html.replace(
                /(https?:\/\/[^\s<]+)/gi,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
              )
            }
            html = sanitizeHtml(html)
            return html.trim()
          }
          const raw = this.releaseNotes
          const html = raw ? buildReleaseNotesHtml(raw) : ''
          const displayContent = html || `<p>${this.$t('app.release-notes-not-found')}</p>`
          this.updatePreviewContent = displayContent
          this.updatePreviewVisible = true
        } catch (e) {
          console.error('[Motrix] Preview update failed', e)
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
          console.error('[Motrix] open external url failed:', href, e)
        }
      },
      syncTrackerFromSource () {
        this.trackerSyncing = true
        const { trackerSource } = this.form
        this.$store.dispatch('preference/fetchBtTracker', trackerSource)
          .then((data) => {
            const texts = Array.isArray(data) ? data : []
            const lines = []
            texts.forEach(t => {
              const ls = this.extractTrackerLines(t)
              if (ls && ls.length) lines.push(...ls)
            })
            const uniq = Array.from(new Set(lines))
            const tracker = uniq.join('\n')
            this.form.lastSyncTrackerTime = Date.now()
            this.form.btTracker = tracker
            this.trackerSyncing = false
            if (!uniq.length) {
              this.$msg.warning(this.$t('preferences.sync-none'))
            } else {
              this.$msg.success(this.$t('preferences.sync-success', { count: uniq.length }))
            }
          })
          .catch((_) => {
            this.trackerSyncing = false
            this.$msg.error(this.$t('preferences.sync-failed'))
          })
      },
      async configureTrackerFromGithub () {
        try {
          const r = await this.$prompt(
            this.$t('preferences.configure-tracker-prompt-message'),
            this.$t('preferences.configure-tracker-prompt-title'),
            {
              confirmButtonText: this.$t('preferences.extract'),
              cancelButtonText: this.$t('app.cancel'),
              inputPlaceholder: this.$t('preferences.tracker-source-input-placeholder')
            }
          )
          const url = `${r.value}`.trim()
          if (!url) return
          await this.configureTrackerFromGithubWithUrl(url)
        } catch (e) {
          if (e && e === 'cancel') return
          this.$msg.error(this.$t('preferences.extract-failed'))
        }
      },
      async configureTrackerFromGithubWithUrl (url) {
        try {
          const origin = this.deriveOriginSite(url)
          if (origin && this.isOriginDuplicated(origin)) {
            this.$msg.warning(this.$t('preferences.origin-exists'))
            return
          }
          if (this.isGithubRepoUrl(url)) {
            const result = await this.resolveGithubRepo(url)
            const lines = result.trackers || []
            if (!lines.length) {
              this.$msg.error(this.$t('preferences.extract-empty-repo'))
              return
            }
            this.applySourceDiscovery(result.usedUrls || [], origin)
            return
          }
          const raw = this.toRawUrl(url)
          if (this.isSourceDuplicated(raw)) {
            this.$msg.warning(this.$t('preferences.source-exists'))
            return
          }
          const resp = await axios.get(raw, { responseType: 'text' })
          const text = `${resp && resp.data ? resp.data : ''}`
          const trackers = this.extractTrackerLines(text)
          if (!trackers.length) {
            this.$msg.error(this.$t('preferences.extract-empty-link'))
            return
          }
          this.applySourceDiscovery([raw], this.deriveOriginSite(url))
        } catch (e) {
          this.$msg.error(this.$t('preferences.extract-failed'))
        }
      },
      isOriginDuplicated (origin) {
        const n = this.normalizeOriginUrl(origin)
        const builtin = this.getBuiltinOrigins().map(o => this.normalizeOriginUrl(o))
        const saved = (Array.isArray(this.form.trackerSourceOrigins) ? this.form.trackerSourceOrigins : []).map(o => this.normalizeOriginUrl(o))
        return builtin.includes(n) || saved.includes(n)
      },
      isSourceDuplicated (rawUrl) {
        const discovered = Array.isArray(this.form.trackerSourceDiscovered) ? this.form.trackerSourceDiscovered : []
        if (discovered.includes(rawUrl)) return true
        const allOptionValues = []
        ;(this.trackerSourceOptions || []).forEach(g => {
          ;(g.options || []).forEach(opt => allOptionValues.push(opt.value))
        })
        return allOptionValues.includes(rawUrl)
      },
      deriveOriginSite (url) {
        const s = `${url}`
        const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(s)
        if (repo) return this.normalizeOriginUrl(`https://github.com/${repo[1]}/${repo[2]}`)
        let m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m) return this.normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i.exec(s)
        if (m) return this.normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m) return this.normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        try {
          const u = new URL(s)
          return this.normalizeOriginUrl(`${u.protocol}//${u.host}`)
        } catch (_) {
          return this.normalizeOriginUrl(s)
        }
      },
      normalizeOriginUrl (url) {
        try {
          const s = `${url}`.trim()
          const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(s)
          if (repo) {
            const owner = repo[1]
            const name = repo[2]
            return `https://github.com/${owner}/${name}`
          }
          const u = new URL(s)
          const protocol = u.protocol.toLowerCase()
          const host = u.host.toLowerCase()
          return `${protocol}//${host}`
        } catch (_) {
          return url.replace(/\/+$/, '')
        }
      },
      deriveOriginLabel (url) {
        const s = `${url}`
        const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(s)
        if (m) return `${m[1]}/${m[2]}`
        try {
          const u = new URL(s)
          return u.host
        } catch (_) {
          return s
        }
      },
      isGithubRepoUrl (url) {
        return /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(`${url}`)
      },
      async resolveGithubRepo (url) {
        const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(`${url}`)
        if (!m) return { trackers: [], usedUrls: [] }
        const owner = m[1]
        const repo = m[2]
        const branches = ['main', 'master']
        const files = [
          'trackers_best.txt',
          'trackers_all.txt',
          'trackers_best_http.txt',
          'trackers_best_https.txt',
          'trackers_best_udp.txt',
          'trackers_best_wss.txt',
          'best.txt'
        ]
        const readmeCandidates = branches.map(b => `https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`)
        const fileCandidates = []
        branches.forEach(b => {
          files.forEach(f => fileCandidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/${f}`))
        })
        const used = []
        let lines = []
        for (let i = 0; i < readmeCandidates.length; i++) {
          const u = readmeCandidates[i]
          try {
            const r = await axios.get(u, { responseType: 'text' })
            const text = `${r && r.data ? r.data : ''}`
            const linkUrls = this.extractTxtLinksFromReadme(text)
            const rawUrls = linkUrls.map(this.toRawUrl)
            const rawSet = Array.from(new Set(rawUrls))
            const fetched = await this.fetchTrackersFromUrls(rawSet)
            if (fetched.lines && fetched.lines.length) {
              const preferred = this.preferCanonicalSources(fetched.usedUrls)
              used.push(...preferred)
              lines = fetched.lines
              break
            }
          } catch (_) {}
        }
        if (!lines.length) {
          const fetched = await this.fetchTrackersFromUrls(fileCandidates)
          if (fetched.lines && fetched.lines.length) {
            const preferred = this.preferCanonicalSources(fetched.usedUrls)
            used.push(...preferred)
            lines = fetched.lines
          }
        }
        if (!lines.length && owner.toLowerCase() === 'adysec' && repo.toLowerCase() === 'tracker') {
          try {
            const r = await axios.get('https://down.adysec.com/trackers_best.txt', { responseType: 'text' })
            const text = `${r && r.data ? r.data : ''}`
            const fetched = this.extractTrackerLines(text)
            if (fetched.length) {
              used.push('https://down.adysec.com/trackers_best.txt')
              lines = fetched
            }
          } catch (_) {}
        }
        return { trackers: lines, usedUrls: used }
      },
      extractTxtLinksFromReadme (text) {
        const raw = `${text}`
        const urls = []
        const regex = /(https?:\/\/[^\s)]+?trackers[^\s)]*?\.txt|https?:\/\/[^\s)]+?best\.txt)/ig
        let m
        while ((m = regex.exec(raw)) !== null) {
          urls.push(m[1])
        }
        const blobRegex = /https?:\/\/github\.com\/[^\s)]+?\.txt/ig
        let mb
        while ((mb = blobRegex.exec(raw)) !== null) {
          urls.push(mb[0])
        }
        return Array.from(new Set(urls))
      },
      async fetchTrackersFromUrls (urls) {
        const allLines = []
        const usedUrls = []
        for (let i = 0; i < urls.length; i++) {
          const u = urls[i]
          try {
            const r = await axios.get(u, { responseType: 'text' })
            const text = `${r && r.data ? r.data : ''}`
            const lines = this.extractTrackerLines(text)
            if (lines.length) {
              usedUrls.push(u)
              allLines.push(...lines)
            }
          } catch (_) {}
        }
        return { lines: Array.from(new Set(allLines)), usedUrls: Array.from(new Set(usedUrls)) }
      },
      toRawUrl (url) {
        const u = `${url}`
        if (/^https:\/\/raw\.githubusercontent\.com\//i.test(u)) return u
        if (/^https:\/\/github\.com\//i.test(u)) {
          return u.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
        }
        const m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/@]+)(?:@([^/]+))?\/(.+)$/i.exec(u)
        if (m) {
          const owner = m[1]
          const repo = m[2]
          const branch = m[3] || 'main'
          const path = m[4]
          return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
        }
        return u
      },
      preferCanonicalSources (urls) {
        const items = (urls || []).map(u => ({ url: u, label: this.deriveTrackerLabel(u), rank: this.getSourceRank(u) }))
        const byLabel = {}
        items.forEach(it => {
          if (!byLabel[it.label]) byLabel[it.label] = []
          byLabel[it.label].push(it)
        })
        const result = []
        Object.keys(byLabel).forEach(label => {
          const arr = byLabel[label]
          arr.sort((a, b) => a.rank - b.rank)
          result.push(arr[0].url)
        })
        return Array.from(new Set(result))
      },
      getSourceRank (u) {
        try {
          const url = new URL(u)
          const host = url.host
          let base = 100
          if (/raw\.githubusercontent\.com$/i.test(host)) base = 1
          else if (/github\.com$/i.test(host)) base = 2
          else if (/cdn\.jsdelivr\.net$/i.test(host)) base = 3
          else if (/down\.adysec\.com$/i.test(host)) base = 4
          // 优先 main 分支
          let branchRank = 0
          const m = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//i.exec(u)
          if (m) {
            const br = m[1].toLowerCase()
            branchRank = br === 'main' ? 0 : (br === 'master' ? 1 : 2)
          }
          return base * 10 + branchRank
        } catch (_) {
          return 999
        }
      },
      extractTrackerLines (text) {
        const raw = `${text}`
        const tokens = raw.split(/\r?\n|,/)
        return tokens.map(t => `${t}`.trim()).filter(Boolean).filter(t => /^(udp|http|https):\/\//i.test(t))
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
      openAria2ConfEditor () {
        this.aria2ConfEditorVisible = true
        this.loadAria2Conf()
      },
      async loadAria2Conf () {
        this.aria2ConfLoading = true
        try {
          const res = await this.$electron.ipcRenderer.invoke('aria2-conf:read')
          const text = res && res.content ? res.content : ''
          const lines = `${text}`.split(/\r?\n/)
          this.aria2ConfOriginalLines = lines
          const items = []
          lines.forEach((line, idx) => {
            const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)\s*$/.exec(line)
            if (m) {
              items.push({ key: m[1], value: m[2], index: idx })
            }
          })
          this.aria2ConfItems = items
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        } finally {
          this.aria2ConfLoading = false
        }
      },
      addConfItem () {
        this.aria2ConfItems = [...this.aria2ConfItems, { key: '', value: '', index: -1 }]
      },
      removeConfItem (row) {
        const idx = this.aria2ConfItems.indexOf(row)
        if (idx !== -1) {
          this.aria2ConfItems.splice(idx, 1)
        }
      },
      async saveAria2Conf () {
        const original = [...this.aria2ConfOriginalLines]
        const kvRegex = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)\s*$/
        const kvMap = {}
        original.forEach(line => {
          const m = kvRegex.exec(line)
          if (m) { kvMap[m[1]] = m[2] }
        })
        this.aria2ConfItems.forEach(item => {
          const k = `${item.key}`.trim()
          if (!k) return
          const v = `${item.value}`.trim()
          kvMap[k] = v
        })
        const rebuilt = original.map(line => {
          const m = kvRegex.exec(line)
          if (!m) return line
          const k = m[1]
          const v = kvMap[k]
          return typeof v !== 'undefined' ? `${k}=${v}` : line
        })
        // 追加原文件中未包含但编辑器新增的键
        const existingKeys = new Set(Object.keys(kvMap))
        original.forEach(line => {
          const m = kvRegex.exec(line)
          if (m) existingKeys.delete(m[1])
        })
        existingKeys.forEach(k => {
          rebuilt.push(`${k}=${kvMap[k]}`)
        })
        const content = rebuilt.join('\n')
        const res = await this.$electron.ipcRenderer.invoke('aria2-conf:write', { content })
        if (res && res.success) {
          this.$msg.success(`${this.$t('preferences.save-success-message')} \n${res.path}`)
          // 立即重新加载以验证写入成功，不关闭编辑器
          await this.loadAria2Conf()
        } else {
          const msg = (res && res.error) ? res.error : this.$t('preferences.save-fail-message')
          this.$msg.error(msg)
        }
      },
      addConfKey () {
        const key = this.aria2ConfQuickKey
        if (!key) return
        const exists = this.aria2ConfItems.find(item => item.key === key)
        if (!exists) {
          this.aria2ConfItems = [...this.aria2ConfItems, { key, value: '', index: -1 }]
        }
      },
      copyAria2ConfText () {
        const text = this.aria2ConfItems
          .filter(i => i.key)
          .map(i => `${i.key}=${i.value}`)
          .join('\n')
        if (text) {
          try {
            const { clipboard } = require('electron')
            clipboard.writeText(text)
          } catch (e) {
          }
        }
      },
      importFromText () {
        const raw = `${this.aria2ConfRawText}`
        const lines = raw.split(/\r?\n/)
        lines.forEach(line => {
          const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)\s*$/.exec(line)
          if (m) {
            const key = m[1]
            const value = m[2]
            const idx = this.aria2ConfItems.findIndex(i => i.key === key)
            if (idx >= 0) {
              this.aria2ConfItems.splice(idx, 1, { ...this.aria2ConfItems[idx], value })
            } else {
              this.aria2ConfItems.push({ key, value, index: -1 })
            }
          }
        })
      },
      async pasteFromClipboard () {
        try {
          const { clipboard } = require('electron')
          const text = clipboard.readText()
          this.aria2ConfRawText = text
          this.importFromText()
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      syncFormConfig () {
        // 保存成功后，直接使用当前表单数据更新 formOriginal
        // 而不是从后端重新获取，避免竞态条件导致配置被重置
        this.formOriginal = cloneDeep(this.form)
      },
      getEngineMaxConnection (engineBinary) {
        if (!engineBinary) {
          return ENGINE_MAX_CONNECTION_PER_SERVER
        }

        if (engineBinary.includes('1.37.0')) {
          return 16
        }

        if (/LinkCore\.exe$/i.test(engineBinary)) {
          return 64
        }

        return ENGINE_MAX_CONNECTION_PER_SERVER
      },
      submitForm (formName) {
        this.$refs[formName].validate((valid) => {
          if (!valid) {
            console.error('[Motrix] preference form valid:', valid)
            return false
          }

          const data = {
            ...diffConfig(this.formOriginal, this.form)
          }

          if ('engineBinary' in data) {
            const engineBinary = data.engineBinary
            const engineMaxConnectionPerServer = this.getEngineMaxConnection(engineBinary)
            data['engine-binary'] = data.engineBinary
            data['engine-max-connection-per-server'] = engineMaxConnectionPerServer
            data['max-connection-per-server'] = engineMaxConnectionPerServer
            delete data.engineBinary
          }

          // 显式处理autoSyncTrackerTime字段，转换为kebab-case
          if ('autoSyncTrackerTime' in data) {
            data['auto-sync-tracker-time'] = data.autoSyncTrackerTime
            delete data.autoSyncTrackerTime
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

          console.log('[Motrix] preference changed data:', data)

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
  .sync-tracker-btn {
    line-height: 0;
  }
  .track-source {
    margin-bottom: 16px;
    .select-track-source {
      width: 100%;
    }
    .el-select__tags {
      overflow-x: auto;
    }
  }
}
.ua-group {
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

.el-dialog.tracker-source-dialog {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.el-dialog.tracker-source-dialog .el-dialog__header {
  display: none;
}

.el-dialog.tracker-source-dialog .el-dialog__body {
  padding: 0;
}

.el-dialog.tracker-source-dialog .el-input-group__prepend {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.el-dialog.tracker-source-dialog .el-input__inner {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.tracker-source-close-btn {
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #606266;
}

.mo-tracker-source-submit {
  position: fixed;
  right: 14px;
  bottom: 24px;
  z-index: 3001;
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

.el-dialog.aria2conf-editor-dialog {
  :deep(.el-dialog__wrapper) {
    background: rgba(0, 0, 0, 0.5);
  }
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  .el-dialog__header {
    padding: 10px 20px;
    border-bottom: none;
  }
  .el-dialog__body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding-bottom: 10px;
  }
  .el-dialog__footer {
    border-top: none;
    background: transparent;
  }
  .dialog-footer {
    position: fixed;
    right: 16px;
    bottom: 16px;
    left: auto;
    padding: 0;
    background: transparent;
  }
  .aria2conf-toolbar {
    background: var(--panel-background);
    padding: 8px 0 4px;
  }
  :deep(.el-table__header-wrapper) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel-background);
  }
  :deep(.el-table--border) {
    border: none !important;
  }
  :deep(.el-table::before),
  :deep(.el-table--border::after),
  :deep(.el-table__border-left-patch),
  :deep(.el-table__border-right-patch) {
    display: none !important;
  }
  :deep(.el-table th),
  :deep(.el-table td),
  :deep(.el-table__header-wrapper th),
  :deep(.el-table__body-wrapper td),
  :deep(.el-table--border .el-table__cell) {
    border: none !important;
  }
}
</style>
