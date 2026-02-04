<template>
  <el-main class="panel-content">
    <el-form
      class="form-preference"
      ref="basicForm"
      label-position="right"
      size="mini"
      :model="form"
      :rules="rules"
    >
        <!-- 外观设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.appearance') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <mo-theme-switcher
                v-model="form.theme"
                @change="handleThemeChange"
                ref="themeSwitcher"
              />
            </el-col>
            <el-col v-if="showHideAppMenuOption" class="form-item-sub" :span="16">
              <el-checkbox v-model="form.hideAppMenu" @change="autoSaveForm">
                {{ $t('preferences.hide-app-menu') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="16">
              <el-checkbox v-model="form.autoHideWindow" @change="autoSaveForm">
                {{ $t('preferences.auto-hide-window') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.taskDetailDefaultTransparent" @change="autoSaveForm">
                {{ $t('preferences.task-detail-default-transparent') }}
              </el-checkbox>
            </el-col>
            <el-col v-if="form.taskDetailDefaultTransparent" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.task-detail-frosted-strength')">
                <el-slider
                  v-model="form.taskDetailFrostedBlur"
                  :min="0"
                  :max="10"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="isMac" class="form-item-sub" :span="16">
              <el-checkbox v-model="form.traySpeedometer" @change="autoSaveForm">
                {{ $t('preferences.tray-speedometer') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="16">
              <el-checkbox v-model="form.showProgressBar" @change="autoSaveForm">
                {{ $t('preferences.show-progress-bar') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.task-progress-mode')">
                <el-select
                  v-model="form.taskProgressMode"
                  size="mini"
                  @change="autoSaveForm"
                >
                  <el-option
                    :label="$t('preferences.task-progress-mode-component')"
                    value="component"
                  />
                  <el-option
                    :label="$t('preferences.task-progress-mode-background')"
                    value="background"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.subnav-mode')">
                <el-select
                  v-model="form.subnavMode"
                  size="mini"
                  @change="autoSaveForm"
                >
                  <el-option
                    :label="$t('preferences.subnav-mode-floating')"
                    value="floating"
                  />
                  <el-option
                    :label="$t('preferences.subnav-mode-title')"
                    value="title"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.sidebar-layout-mode')">
                <el-select
                  v-model="form.sidebarLayoutMode"
                  size="mini"
                  @change="autoSaveForm"
                >
                  <el-option
                    :label="$t('preferences.sidebar-layout-mode-floating')"
                    value="floating"
                  />
                  <el-option
                    :label="$t('preferences.sidebar-layout-mode-three-column')"
                    value="three-column"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.floating-bar-display-mode')">
                <el-select
                  v-model="form.floatingBarDisplayMode"
                  size="mini"
                  @change="autoSaveForm"
                >
                  <el-option
                    :label="$t('preferences.floating-bar-display-mode-hover')"
                    value="hover"
                  />
                  <el-option
                    :label="$t('preferences.floating-bar-display-mode-always')"
                    value="always"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24" style="margin-top: 12px;">
              <div style="display: flex; gap: 8px; flex-wrap: nowrap;">
                <el-button
                  size="mini"
                  type="primary"
                  style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  @click="exportUiConfigToFile"
                >导出 JSON 文件</el-button>
                <el-button
                  size="mini"
                  type="primary"
                  style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  @click="exportUiConfigToClipboard"
                >{{ $t('preferences.copy-as-text') }}</el-button>
                <el-button
                  size="mini"
                  type="primary"
                  plain
                  style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: transparent; border-color: #409EFF; color: #409EFF;"
                  @click="importUiConfigFromFile"
                >导入JSON文件</el-button>
                <el-button
                  size="mini"
                  type="primary"
                  plain
                  style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: transparent; border-color: #409EFF; color: #409EFF;"
                  @click="importUiConfigFromTextPrompt"
                >{{ $t('preferences.paste-and-import') }}</el-button>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 背景设置卡片 -->
        <div class="preference-card">
          <span style="display: none;">外观</span>
          <div class="card-title background-type-nav">
            <div class="background-type-nav__left">
              <el-radio-group v-model="form.backgroundType" size="mini" @change="autoSaveForm">
                <el-radio-button label="color">{{ $t('preferences.background-type-color') }}</el-radio-button>
                <el-radio-button label="image">{{ $t('preferences.background-type-image') }}</el-radio-button>
              </el-radio-group>
            </div>
            <div class="background-type-nav__right">
              <el-button type="primary" size="mini" @click.stop="selectBackgroundImage">
                {{ $t('preferences.background-image-select') }}
              </el-button>
            </div>
          </div>
          <el-form-item size="mini">
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-image-opacity')">
                <el-slider
                  v-model="backgroundImageOpacityPercent"
                  :min="30"
                  :max="100"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-image-frosted-strength')">
                <el-slider
                  v-model="form.backgroundImageFrostedBlur"
                  :min="0"
                  :max="10"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-ui-opacity')">
                <el-slider
                  v-model="backgroundUiOpacityPercent"
                  :min="40"
                  :max="100"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-ui-opacity-scope')">
                <el-select
                  ref="backgroundUiOpacityScopeSelect"
                  v-model="form.backgroundUiOpacityScope"
                  filterable
                  multiple
                  :collapse-tags="collapseTagsBackgroundUiOpacityScope"
                  style="width: 100%;"
                  @change="autoSaveForm"
                >
                  <el-option
                    v-for="item in backgroundUiOpacityScopeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-ui-frosted-strength')">
                <el-slider
                  v-model="form.backgroundUiFrostedBlur"
                  :min="0"
                  :max="10"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="form.backgroundType === 'image'" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.background-ui-frosted-scope')">
                <el-select
                  ref="backgroundUiFrostedBlurScopeSelect"
                  v-model="form.backgroundUiFrostedBlurScope"
                  filterable
                  multiple
                  :collapse-tags="collapseTagsBackgroundUiFrostedBlurScope"
                  style="width: 100%;"
                  @change="autoSaveForm"
                >
                  <el-option
                    v-for="item in backgroundUiFrostedBlurScopeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-form-item>
        </div>

        <!-- 运行模式卡片 (仅Mac) -->
        <div v-if="isMac" class="preference-card">
          <h3 class="card-title">{{ $t('preferences.run-mode') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-select v-model="form.runMode" @change="autoSaveForm">
                <el-option
                  v-for="item in runModes"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value">
                </el-option>
              </el-select>
            </el-col>
          </el-form-item>
        </div>

        <!-- 语言设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.language') }}</h3>
          <div class="language-container">
            <!-- 语言选择框 -->
            <el-select
              v-model="form.locale"
              @change="handleLocaleChange(form.locale)"
              :placeholder="$t('preferences.change-language')"
              class="language-select"
            >
              <el-option
                v-for="item in locales"
                :key="item.value"
                :label="item.label"
                :value="item.value">
              </el-option>
            </el-select>
            <!-- 撤回更改按钮 - 使用visibility而非v-if，避免调整卡片大小 -->
            <el-button
              type="danger"
              size="mini"
              @click="undoLocaleChange"
              class="undo-change-btn"
              :style="{ visibility: localeChanged ? 'visible' : 'hidden' }"
            >
              {{ originalLanguageText }}
            </el-button>
          </div>
        </div>

        <!-- 快捷键卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.shortcuts') }}</h3>
          <el-form-item size="mini">
            <el-row :gutter="8" style="margin-bottom: 8px;">
              <el-col :span="12">{{ $t('preferences.shortcut-command') }}</el-col>
              <el-col :span="12">{{ $t('preferences.shortcut-keystroke') }}</el-col>
            </el-row>
            <el-row v-for="command in getShortcutCommands()" :key="command" :gutter="8" style="margin-bottom: 8px;">
              <el-col :span="12">
                <el-input :value="getCommandLabel(command)" readonly />
              </el-col>
              <el-col :span="12">
                <el-input
                  :value="formatKeystrokeForDisplay(getKeystrokeByCommand(command))"
                  @keydown.native="handleShortcutKeydown(command, $event)"
                  :placeholder="$t('preferences.shortcut-placeholder')"
                />
              </el-col>
            </el-row>
            <el-button type="warning" size="mini" style="width: 100%;" @click="resetShortcuts">
              {{ $t('preferences.shortcut-reset-default') }}
            </el-button>
          </el-form-item>
        </div>

        <!-- 启动设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.startup') }}</h3>
          <el-form-item size="mini">
            <el-col
              class="form-item-sub"
              :span="24"
              v-if="!isLinux"
            >
              <el-checkbox v-model="form.openAtLogin" @change="autoSaveForm">
                {{ $t('preferences.open-at-login') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.keepWindowState" @change="autoSaveForm">
                {{ $t('preferences.keep-window-state') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.resumeAllWhenAppLaunched" @change="autoSaveForm">
                {{ $t('preferences.auto-resume-all') }}
              </el-checkbox>
            </el-col>
          </el-form-item>
        </div>

        <!-- 扩展卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.browser-extensions') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="form-item-sub">
                {{ $t('preferences.extension-channel') }}
                <el-input :value="appChannelUrl" readonly>
                  <el-button
                    slot="append"
                    icon="el-icon-document-copy"
                    @click="copyChannelUrl">
                    {{ $t('preferences.extension-copy-channel') }}
                  </el-button>
                </el-input>
              </div>
              <div class="form-item-sub" style="margin-top: 16px;">
                <span
                  class="text-link"
                  style="color: #409EFF; cursor: pointer; text-decoration: underline;"
                  @click="downloadExtension">
                  Chrome
                </span>
              </div>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.extension-tips') }}
              </div>
              <div class="form-item-sub" style="margin-top: 12px;">
                <el-checkbox v-model="form.extensionInterceptAllDownloads" @change="autoSaveForm">
                  {{ $t('preferences.extension-intercept-all-downloads') }}
                </el-checkbox>
              </div>
              <div class="form-item-sub" style="margin-top: 4px;">
                <el-checkbox v-model="form.extensionSilentDownload" @change="autoSaveForm">
                  {{ $t('preferences.extension-silent-download') }}
                </el-checkbox>
              </div>
              <div class="form-item-sub" style="margin-top: 4px;">
                <el-checkbox v-model="form.extensionShiftToggleEnabled" @change="autoSaveForm">
                  {{ $t('preferences.extension-shift-toggle-enabled') }}
                </el-checkbox>
              </div>
              <div class="form-item-sub" style="margin-top: 8px;">
                {{ $t('preferences.extension-skip-file-extensions') }}
                <el-input
                  v-model="form.extensionSkipFileExtensions"
                  @change="autoSaveForm"
                  :placeholder="$t('preferences.extension-skip-file-extensions-tips')"
                />
              </div>
              <div class="form-item-sub" style="margin-top: 16px;">
                <el-button
                  type="primary"
                  size="small"
                  class="video-detection-settings-btn"
                  @click="openVideoDetectionSettings"
                  style="width: 100%;">
                  {{ $t('preferences.video-detection-settings') }}
                </el-button>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 下载目录卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.default-dir') }}</h3>
          <el-form-item size="mini">
            <el-input placeholder="" v-model="form.dir" :readonly="isMas">
              <mo-history-directory
                slot="prepend"
                @selected="handleHistoryDirectorySelected"
              />
              <mo-select-directory
                v-if="isRenderer"
                slot="append"
                @selected="handleNativeDirectorySelected"
              />
            </el-input>
            <div class="el-form-item__info" v-if="isMas" style="margin-top: 8px;">
              {{ $t('preferences.mas-default-dir-tips') }}
            </div>
          </el-form-item>
        </div>

        <!-- 传输设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.transfer-settings') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.transfer-speed-upload') }}
              <el-input-number
                v-model="maxOverallUploadLimitParsed"
                controls-position="right"
                :min="0"
                :max="65535"
                :step="1"
                :label="$t('preferences.transfer-speed-download')"
                >
              </el-input-number>
              <el-select
                style="width: 100px;"
                v-model="uploadUnit"
                @change="handleUploadChange">
                <el-option
                  v-for="item in speedUnits"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value">
                </el-option>
              </el-select>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.transfer-speed-download') }}
              <el-input-number
                v-model="maxOverallDownloadLimitParsed"
                controls-position="right"
                :min="0"
                :max="65535"
                :step="1"
                :label="$t('preferences.transfer-speed-download')">
              </el-input-number>
              <el-select
                style="width: 100px;"
                v-model="downloadUnit"
                @change="handleDownloadChange">
                <el-option
                  v-for="item in speedUnits"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value">
                </el-option>
              </el-select>
            </el-col>
          </el-form-item>
        </div>

        <!-- BT设置卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.bt-settings') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.btSaveMetadata" @change="autoSaveForm">
                {{ $t('preferences.bt-save-metadata') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox
                v-model="form.btAutoDownloadContent"
                @change="autoSaveForm"
              >
                {{ $t('preferences.bt-auto-download-content') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox
                v-model="form.btForceEncryption"
                @change="autoSaveForm"
              >
                {{ $t('preferences.bt-force-encryption') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-switch
                v-model="form.keepSeeding"
                :active-text="$t('preferences.keep-seeding')"
                @change="onKeepSeedingChange"
              >
              </el-switch>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="!form.keepSeeding">
              {{ $t('preferences.seed-ratio') }}
              <el-input-number
                v-model="form.seedRatio"
                @change="autoSaveForm"
                controls-position="right"
                :min="1"
                :max="100"
                :step="0.1"
                :label="$t('preferences.seed-ratio')">
              </el-input-number>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="!form.keepSeeding">
              {{ $t('preferences.seed-time') }}
              ({{ $t('preferences.seed-time-unit') }})
              <el-input-number
                v-model="form.seedTime"
                @change="autoSaveForm"
                controls-position="right"
                :min="60"
                :max="525600"
                :step="1"
                :label="$t('preferences.seed-time')">
              </el-input-number>
            </el-col>
          </el-form-item>
        </div>

        <!-- 任务管理卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.task-manage') }}</h3>
          <el-form-item size="mini">
            <!-- 单设置项 -->
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.max-concurrent-downloads') }}
              <el-input-number
                v-model="form.maxConcurrentDownloads"
                @change="autoSaveForm"
                controls-position="right"
                :min="1"
                :max="maxConcurrentDownloads"
                :step="1"
                :label="$t('preferences.max-concurrent-downloads')">
              </el-input-number>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.max-connection-per-server') }}
              <el-input-number
                v-model="form.maxConnectionPerServer"
                @change="autoSaveForm"
                controls-position="right"
                :min="0"
                :max="form.engineMaxConnectionPerServer"
                :step="1"
                :label="$t('preferences.max-connection-per-server')">
              </el-input-number>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.continue" @change="autoSaveForm">
                {{ $t('preferences.continue') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.noConfirmBeforeDeleteTask" @change="autoSaveForm">
                {{ $t('preferences.no-confirm-before-delete-task') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.autoPurgeRecord" @change="autoSaveForm">
                {{ $t('preferences.auto-purge-record') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.showTaskCompletedWindow" @change="autoSaveForm">
                {{ $t('preferences.show-task-completed-window') }}
              </el-checkbox>
            </el-col>

            <!-- 分隔线 -->
            <el-col class="form-item-sub" :span="24">
              <div class="settings-divider"></div>
            </el-col>

            <!-- 多设置项 -->
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.autoOpenTaskProgressWindow" @change="autoSaveForm">
                {{ $t('preferences.auto-open-task-progress-window') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.autoOpenTaskProgressWindow">
              <el-radio-group v-model="form.taskProgressWindowMode" @change="autoSaveForm">
                <el-radio label="first">{{ $t('preferences.task-progress-window-first-only') }}</el-radio>
                <el-radio label="all">{{ $t('preferences.task-progress-window-all') }}</el-radio>
              </el-radio-group>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.newTaskShowDownloading" @change="autoSaveForm">
                {{ $t('preferences.new-task-show-downloading') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.newTaskShowDownloading">
              <el-tooltip
                effect="dark"
                :content="$t('preferences.new-task-jump-target')"
                placement="top"
                :open-delay="400"
              >
                <el-radio-group v-model="form.newTaskJumpTarget" @change="autoSaveForm">
                  <el-radio label="all">
                    {{ $t('preferences.new-task-jump-target-all') }}
                  </el-radio>
                  <el-radio label="downloading">
                    {{ $t('preferences.new-task-jump-target-downloading') }}
                  </el-radio>
                </el-radio-group>
              </el-tooltip>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.taskNotification" @change="autoSaveForm">
                {{ $t('preferences.task-completed-notify') }}
              </el-checkbox>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.taskNotification">
              <el-tooltip
                effect="dark"
                :content="$t('preferences.task-complete-notify-click-action-tips')"
                placement="top"
                :open-delay="400"
              >
                <el-radio-group v-model="form.taskCompleteNotifyClickAction" @change="autoSaveForm">
                  <el-radio label="open-folder">
                    {{ $t('preferences.task-complete-notify-click-action-open-folder') }}
                  </el-radio>
                  <el-radio label="show-app">
                    {{ $t('preferences.task-complete-notify-click-action-show-app') }}
                  </el-radio>
                  <el-radio label="execute-file">
                    {{ $t('preferences.task-complete-notify-click-action-execute-file') }}
                  </el-radio>
                </el-radio-group>
              </el-tooltip>
            </el-col>
          </el-form-item>
        </div>

        <!-- 文件管理卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.file-manage') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-input
                v-model="form.downloadingFileSuffix"
                @change="autoSaveForm"
                :placeholder="$t('preferences.downloading-file-suffix-tips')"
                :label="$t('preferences.downloading-file-suffix')">
                <template slot="prepend">
                  {{ $t('preferences.downloading-file-suffix') }}
                </template>
              </el-input>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.setFileMtimeOnComplete" @change="autoSaveForm">
                {{ $t('preferences.set-file-mtime-on-complete') }}
              </el-checkbox>
            </el-col>
            <!-- 自动分类文件设置 -->
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.autoCategorizeFiles" @change="autoSaveForm">
                {{ $t('preferences.auto-categorize-files') }}
              </el-checkbox>
              <div class="el-form-item__info">
                {{ $t('preferences.auto-categorize-files-tips') }}
                <el-button
                  type="primary"
                  size="mini"
                  @click="openFileCategoriesSettings"
                  class="edit-rules-btn"
                  icon="el-icon-edit">
                  {{ $t('preferences.file-categories-edit') }}
                </el-button>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 安全卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.security') }}</h3>
          <div class="card-content">
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.enableSecurityScan" @change="autoSaveForm">
                {{ $t('preferences.enable-security-scan') }}
              </el-checkbox>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.security-scan-tips') }}
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.enableSecurityScan">
              <el-form-item :label="$t('preferences.security-scan-tool')">
                <el-select
                  v-model="form.securityScanTool"
                  size="mini"
                  @change="autoSaveForm"
                >
                  <el-option
                    :label="$t('preferences.security-scan-tool-system')"
                    value="system"
                  />
                  <el-option
                    :label="$t('preferences.security-scan-tool-custom')"
                    value="custom"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.enableSecurityScan && form.securityScanTool === 'custom'">
              <el-form-item :label="$t('preferences.custom-security-scan-path')">
                <el-input
                  v-model="form.customSecurityScanPath"
                  @change="autoSaveForm"
                  :placeholder="$t('preferences.custom-security-scan-path-tips')">
                  <mo-select-directory
                    v-if="isRenderer"
                    slot="append"
                    type="file"
                    @selected="handleSecurityScanPathSelected"
                  />
                </el-input>
              </el-form-item>
            </el-col>
          </el-form-item>
          </div>
        </div>

        <!-- 剪贴板卡片 -->
        <div class="preference-card">
          <h3 class="card-title">{{ $t('preferences.clipboard-settings') }}</h3>
          <div class="card-content">
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.clipboardAutoPaste" @change="autoSaveForm">
                {{ $t('preferences.clipboard-auto-paste') }}
              </el-checkbox>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.clipboard-auto-paste-tips') }}
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.clipboardAutoPaste">
              <div style="margin-left: 18px; margin-top: 8px;">
                <el-checkbox v-model="form.clipboardAutoOpenAddTask" @change="autoSaveForm">
                  {{ $t('preferences.clipboard-auto-open-add-task') }}
                </el-checkbox>
                <div class="el-form-item__info" style="margin-top: 8px;">
                  {{ $t('preferences.clipboard-auto-open-add-task-tips') }}
                </div>
              </div>
            </el-col>
          </el-form-item>
          </div>
        </div>
      </el-form>

      <div v-if="hasNoResults" class="no-results">
        <div class="no-results-inner">
          {{ $t('preferences.no-settings-found') }}
        </div>
      </div>

  </el-main>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'
  import { cloneDeep, isEmpty } from 'lodash'
  import HistoryDirectory from '@/components/Preference/HistoryDirectory'
  import SelectDirectory from '@/components/Native/SelectDirectory'
  import ThemeSwitcher from '@/components/Preference/ThemeSwitcher'
  import { availableLanguages, getLanguage } from '@shared/locales'
  import { getLocaleManager } from '@/components/Locale'
  import {
    calcFormLabelWidth,
    changedConfig,
    checkIsNeedRestart,
    convertLineToComma,
    diffConfig,
    extractSpeedUnit
  } from '@shared/utils'
  import {
    APP_HTTP_PORT,
    APP_RUN_MODE,
    EMPTY_STRING,
    ENGINE_MAX_CONCURRENT_DOWNLOADS
  } from '@shared/constants'
  import { reduceTrackerString } from '@shared/utils/tracker'
  import keymap from '@shared/keymap'

  const normalizeTaskMultiSelectModifier = (value) => {
    const raw = `${value || ''}`.trim().toLowerCase()
    if (!raw) return 'ctrl'

    const tokens = raw
      .split(/[-+]/g)
      .map(s => `${s || ''}`.trim())
      .filter(Boolean)
      .map(t => {
        if (t === 'control') return 'ctrl'
        if (t === 'command') return 'cmd'
        if (t === 'meta') return 'cmd'
        if (t === 'commandorcontrol' || t === 'cmdorctrl') return 'cmdctrl'
        return t
      })

    const modifiers = []
    let key = ''
    tokens.forEach(t => {
      if (t === 'cmdctrl' || t === 'ctrl' || t === 'cmd' || t === 'shift' || t === 'alt') {
        if (!modifiers.includes(t)) modifiers.push(t)
      } else {
        key = t
      }
    })

    const normalized = [...modifiers, key].filter(Boolean).join('-')
    return normalized || 'ctrl'
  }

  const BACKGROUND_UI_FROSTED_BLUR_SCOPE_OPTIONS = [
    'date-filter',
    'task-category-select',
    'task-item',
    'preference-card',
    'aside',
    'subnav'
  ]

  const BACKGROUND_UI_OPACITY_SCOPE_OPTIONS = [
    'date-filter',
    'task-category-select',
    'task-item',
    'preference-card',
    'aside',
    'subnav'
  ]

  const initForm = (config) => {
    const {
      autoHideWindow,
      autoPurgeRecord,
      btForceEncryption,
      btSaveMetadata,
      dir,
      downloadingFileSuffix,
      engineMaxConnectionPerServer,
      followMetalink,
      followTorrent,
      hideAppMenu,
      keepSeeding,
      keepWindowState,
      locale,
      maxConcurrentDownloads,
      maxConnectionPerServer,
      maxOverallDownloadLimit,
      maxOverallUploadLimit,
      newTaskShowDownloading,
      newTaskJumpTarget,
      noConfirmBeforeDeleteTask,
      openAtLogin,
      pauseMetadata,
      resumeAllWhenAppLaunched,
      extensionInterceptAllDownloads,
      extensionSilentDownload,
      extensionSkipFileExtensions,
      extensionShiftToggleEnabled,
      runMode,
      seedRatio,
      seedTime,
      showProgressBar,
      taskProgressMode,
      taskNotification,
      taskCompleteNotifyClickAction,
      showTaskCompletedWindow,
      theme,
      traySpeedometer,
      backgroundType,
      backgroundImage,
      backgroundImageOpacity,
      backgroundImageFrostedBlur,
      backgroundUiOpacity,
      backgroundUiOpacityScope,
      backgroundUiFrostedBlur,
      backgroundUiFrostedBlurScope,
      taskDetailDefaultTransparent,
      taskDetailFrostedBlur,
      autoCategorizeFiles,
      fileCategories,
      setFileMtimeOnComplete,
      customKeymap,
      taskMultiSelectModifier,
      subnavMode,
      sidebarLayoutMode,
      autoOpenTaskProgressWindow,
      taskProgressWindowMode,
      clipboardAutoPaste,
      clipboardAutoOpenAddTask,
      floatingBarDisplayMode,
      enableSecurityScan,
      securityScanTool,
      customSecurityScanPath
    } = config

    let normalizedEngineMax = engineMaxConnectionPerServer
    if (typeof normalizedEngineMax !== 'number' || !Number.isFinite(normalizedEngineMax) || normalizedEngineMax < 0) {
      normalizedEngineMax = 0
    }
    let normalizedMaxPerServer = maxConnectionPerServer
    if (typeof normalizedMaxPerServer !== 'number' || !Number.isFinite(normalizedMaxPerServer) || normalizedMaxPerServer < 0) {
      normalizedMaxPerServer = 0
    }
    if (normalizedEngineMax > 0 && normalizedMaxPerServer > normalizedEngineMax) {
      normalizedMaxPerServer = normalizedEngineMax
    }

    const btAutoDownloadContent = followTorrent &&
      followMetalink &&
      !pauseMetadata

    const result = {
      autoHideWindow,
      autoPurgeRecord: autoPurgeRecord || false,
      btAutoDownloadContent,
      btForceEncryption,
      btSaveMetadata,
      continue: config.continue,
      dir,
      downloadingFileSuffix,
      engineMaxConnectionPerServer: normalizedEngineMax,
      followMetalink,
      followTorrent,
      hideAppMenu,
      keepSeeding,
      keepWindowState,
      locale,
      maxConcurrentDownloads,
      maxConnectionPerServer: normalizedMaxPerServer,
      maxOverallDownloadLimit,
      maxOverallUploadLimit,
      newTaskShowDownloading,
      newTaskJumpTarget: newTaskJumpTarget || 'downloading',
      noConfirmBeforeDeleteTask,
      openAtLogin,
      pauseMetadata,
      resumeAllWhenAppLaunched,
      extensionInterceptAllDownloads: extensionInterceptAllDownloads || false,
      extensionSilentDownload: extensionSilentDownload || false,
      extensionSkipFileExtensions: extensionSkipFileExtensions || '',
      extensionShiftToggleEnabled: extensionShiftToggleEnabled || false,
      runMode,
      seedRatio,
      seedTime,
      showProgressBar,
      taskProgressMode: taskProgressMode || 'component',
      taskNotification,
      taskCompleteNotifyClickAction: taskCompleteNotifyClickAction || 'open-folder',
      showTaskCompletedWindow: showTaskCompletedWindow === undefined ? true : !!showTaskCompletedWindow,
      theme,
      traySpeedometer,
      backgroundType: backgroundType || 'color',
      backgroundImage: backgroundImage || '',
      backgroundImageOpacity: (typeof backgroundImageOpacity === 'number' && Number.isFinite(backgroundImageOpacity))
        ? Math.min(Math.max(backgroundImageOpacity, 0.3), 1)
        : 0.4,
      backgroundImageFrostedBlur: (typeof backgroundImageFrostedBlur === 'number' && Number.isFinite(backgroundImageFrostedBlur))
        ? Math.min(Math.max(backgroundImageFrostedBlur, 0), 10)
        : 0,
      backgroundUiOpacity: (typeof backgroundUiOpacity === 'number' && Number.isFinite(backgroundUiOpacity))
        ? Math.min(Math.max(backgroundUiOpacity, 0.4), 1)
        : 0.7,
      backgroundUiOpacityScope: Array.isArray(backgroundUiOpacityScope)
        ? backgroundUiOpacityScope
          .map(s => `${s}`.trim())
          .filter(s => BACKGROUND_UI_OPACITY_SCOPE_OPTIONS.includes(s))
        : [...BACKGROUND_UI_OPACITY_SCOPE_OPTIONS],
      backgroundUiFrostedBlur: (typeof backgroundUiFrostedBlur === 'number' && Number.isFinite(backgroundUiFrostedBlur))
        ? Math.min(Math.max(backgroundUiFrostedBlur, 0), 10)
        : 6,
      backgroundUiFrostedBlurScope: Array.isArray(backgroundUiFrostedBlurScope)
        ? backgroundUiFrostedBlurScope
          .map(s => `${s}`.trim())
          .filter(s => BACKGROUND_UI_FROSTED_BLUR_SCOPE_OPTIONS.includes(s))
        : [...BACKGROUND_UI_FROSTED_BLUR_SCOPE_OPTIONS],
      taskDetailDefaultTransparent: taskDetailDefaultTransparent === undefined ? false : !!taskDetailDefaultTransparent,
      taskDetailFrostedBlur: (typeof taskDetailFrostedBlur === 'number' && Number.isFinite(taskDetailFrostedBlur))
        ? Math.min(Math.max(taskDetailFrostedBlur, 0), 10)
        : 4,
      autoCategorizeFiles: autoCategorizeFiles || false,
      setFileMtimeOnComplete: setFileMtimeOnComplete || false,
      fileCategories: fileCategories || {
        images: { name: 'image-files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
        documents: { name: 'document-files', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx'] },
        audio: { name: 'audio-files', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'] },
        video: { name: 'video-files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
        archives: { name: 'archive-files', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        programs: { name: 'program-files', extensions: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'] },
        others: { name: 'other-files', extensions: [] }
      },
      customKeymap: customKeymap || {},
      taskMultiSelectModifier: normalizeTaskMultiSelectModifier(taskMultiSelectModifier),
      subnavMode: subnavMode || 'floating',
      sidebarLayoutMode: sidebarLayoutMode || 'floating',
      autoOpenTaskProgressWindow: autoOpenTaskProgressWindow === undefined ? true : !!autoOpenTaskProgressWindow,
      taskProgressWindowMode: taskProgressWindowMode || 'first',
      clipboardAutoPaste: clipboardAutoPaste === undefined ? true : !!clipboardAutoPaste,
      clipboardAutoOpenAddTask: clipboardAutoOpenAddTask === undefined ? false : !!clipboardAutoOpenAddTask,
      floatingBarDisplayMode: floatingBarDisplayMode || 'hover',
      enableSecurityScan: enableSecurityScan || false,
      securityScanTool: securityScanTool || 'system',
      customSecurityScanPath: customSecurityScanPath || ''
    }
    return result
  }

  export default {
    name: 'mo-preference-basic',
    components: {
      [HistoryDirectory.name]: HistoryDirectory,
      [SelectDirectory.name]: SelectDirectory,
      [ThemeSwitcher.name]: ThemeSwitcher
    },
    data () {
      const { locale } = this.$store.state.preference.config
      const formOriginal = initForm(this.$store.state.preference.config)
      let form = {}
      // 直接从store中获取配置，不依赖changedConfig
      form = initForm(this.$store.state.preference.config)

      // 确保新字段存在并且是响应式的
      if (!('taskProgressWindowMode' in form)) {
        this.$set(form, 'taskProgressWindowMode', 'first')
      }
      if (!('taskProgressWindowMode' in formOriginal)) {
        this.$set(formOriginal, 'taskProgressWindowMode', 'first')
      }
      if (!('sidebarLayoutMode' in form)) {
        this.$set(form, 'sidebarLayoutMode', 'floating')
      }
      if (!('sidebarLayoutMode' in formOriginal)) {
        this.$set(formOriginal, 'sidebarLayoutMode', 'floating')
      }

      return {
        form,
        formLabelWidth: calcFormLabelWidth(locale),
        formOriginal,
        locales: availableLanguages,
        rules: {},
        saveTimeout: null,
        originalLocale: locale,
        localeChanged: false,
        originalLanguageText: this.$t('preferences.undo-change'),
        hasNoResults: false,
        collapseTagsBackgroundUiOpacityScope: false,
        collapseTagsBackgroundUiFrostedBlurScope: false,
        textMeasureCanvas: null
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      isMac: () => is.macOS(),
      isMas: () => is.mas(),
      isLinux () { return is.linux() },
      title () {
        return this.$t('preferences.basic')
      },
      subnavMode () {
        const { config = {} } = this
        return config.subnavMode || 'floating'
      },
      maxConcurrentDownloads () {
        return ENGINE_MAX_CONCURRENT_DOWNLOADS
      },
      maxOverallDownloadLimitParsed: {
        get () {
          return parseInt(this.form.maxOverallDownloadLimit)
        },
        set (value) {
          const limit = value > 0 ? `${value}${this.downloadUnit}` : 0
          this.form.maxOverallDownloadLimit = limit
        }
      },
      maxOverallUploadLimitParsed: {
        get () {
          return parseInt(this.form.maxOverallUploadLimit)
        },
        set (value) {
          const limit = value > 0 ? `${value}${this.uploadUnit}` : 0
          this.form.maxOverallUploadLimit = limit
        }
      },
      downloadUnit: {
        get () {
          const { maxOverallDownloadLimit } = this.form
          return extractSpeedUnit(maxOverallDownloadLimit)
        },
        set (value) {
          return value
        }
      },
      uploadUnit: {
        get () {
          const { maxOverallUploadLimit } = this.form
          return extractSpeedUnit(maxOverallUploadLimit)
        },
        set (value) {
          return value
        }
      },
      runModes () {
        let result = [
          {
            label: this.$t('preferences.run-mode-standard'),
            value: APP_RUN_MODE.STANDARD
          },
          {
            label: this.$t('preferences.run-mode-tray'),
            value: APP_RUN_MODE.TRAY
          }
        ]

        if (this.isMac) {
          result = [
            ...result,
            {
              label: this.$t('preferences.run-mode-hide-tray'),
              value: APP_RUN_MODE.HIDE_TRAY
            }
          ]
        }

        return result
      },
      speedUnits () {
        return [
          {
            label: 'KB/s',
            value: 'K'
          },
          {
            label: 'MB/s',
            value: 'M'
          }
        ]
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
      showHideAppMenuOption () {
        return is.windows() || is.linux()
      },
      backgroundImageOpacityPercent: {
        get () {
          const o = Number(this.form.backgroundImageOpacity)
          const clamped = Number.isFinite(o) ? Math.min(Math.max(o, 0.3), 1) : 0.4
          return Math.round(clamped * 100)
        },
        set (value) {
          const n = Number(value)
          const percent = Number.isFinite(n) ? Math.min(Math.max(n, 30), 100) : 40
          this.form.backgroundImageOpacity = percent / 100
        }
      },
      backgroundUiOpacityPercent: {
        get () {
          const o = Number(this.form.backgroundUiOpacity)
          const clamped = Number.isFinite(o) ? Math.min(Math.max(o, 0.4), 1) : 0.9
          return Math.round(clamped * 100)
        },
        set (value) {
          const n = Number(value)
          const percent = Number.isFinite(n) ? Math.min(Math.max(n, 40), 100) : 90
          this.form.backgroundUiOpacity = percent / 100
        }
      },
      backgroundUiFrostedBlurScopeOptions () {
        return [
          { value: 'date-filter', label: this.$t('preferences.background-ui-frosted-scope-date-filter') },
          { value: 'task-category-select', label: this.$t('preferences.background-ui-frosted-scope-task-category-select') },
          { value: 'task-item', label: this.$t('preferences.background-ui-frosted-scope-task-item') },
          { value: 'preference-card', label: this.$t('preferences.background-ui-frosted-scope-preference-card') },
          { value: 'aside', label: this.$t('preferences.background-ui-frosted-scope-aside') },
          { value: 'subnav', label: this.$t('preferences.background-ui-frosted-scope-subnav') }
        ]
      },
      backgroundUiOpacityScopeOptions () {
        return [
          { value: 'date-filter', label: this.$t('preferences.background-ui-opacity-scope-date-filter') },
          { value: 'task-category-select', label: this.$t('preferences.background-ui-opacity-scope-task-category-select') },
          { value: 'task-item', label: this.$t('preferences.background-ui-opacity-scope-task-item') },
          { value: 'preference-card', label: this.$t('preferences.background-ui-opacity-scope-preference-card') },
          { value: 'aside', label: this.$t('preferences.background-ui-opacity-scope-aside') },
          { value: 'subnav', label: this.$t('preferences.background-ui-opacity-scope-subnav') }
        ]
      },
      backgroundImageDisplay () {
        const p = this.form.backgroundImage
        if (!p) return this.$t('preferences.background-image-not-selected')
        try {
          const path = require('path')
          return path.basename(p)
        } catch (_) {
          return p
        }
      },
      appChannelUrl () {
        return `http://127.0.0.1:${APP_HTTP_PORT}`
      },
      ...mapState('preference', {
        config: state => state.config,
        searchKeyword: state => state.searchKeyword
      }),
      // 本地化文件分类名称
      localizedFileCategories () {
        const categories = { ...this.form.fileCategories }

        // 遍历所有分类，将名称键值转换为本地化文本
        Object.keys(categories).forEach(key => {
          const category = categories[key]
          // 如果名称是键值（如'image-files'），则进行本地化
          if (category.name && category.name.includes('-files')) {
            categories[key] = {
              ...category,
              name: this.$t(`preferences.${category.name}`)
            }
          }
        })

        return categories
      }
    },
    watch: {
      searchKeyword: {
        handler (val) {
          this.filterCards(val)
        },
        immediate: true
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
      'config.engineMaxConnectionPerServer' (val) {
        if (val === undefined || val === null) {
          return
        }
        this.form.engineMaxConnectionPerServer = val
        this.formOriginal.engineMaxConnectionPerServer = val
        if (this.form.maxConnectionPerServer > val) {
          this.form.maxConnectionPerServer = val
          this.formOriginal.maxConnectionPerServer = val
        }
      },
      // 监控语言变化，更新localeChanged状态
      'form.locale' (newLocale, oldLocale) {
        this.localeChanged = newLocale !== this.originalLocale
      },
      'form.backgroundType' () {
        this.updateUiScopeSelectCollapse()
      },
      'form.backgroundUiOpacityScope': {
        handler () {
          this.updateUiScopeSelectCollapse()
        },
        deep: true
      },
      'form.backgroundUiFrostedBlurScope': {
        handler () {
          this.updateUiScopeSelectCollapse()
        },
        deep: true
      }
    },
    mounted () {
      window.addEventListener('resize', this.updateUiScopeSelectCollapse)
      this.updateUiScopeSelectCollapse()
    },
    beforeDestroy () {
      window.removeEventListener('resize', this.updateUiScopeSelectCollapse)
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
      computeScopeSelectCollapse (selectRef, values, options) {
        const el = selectRef && selectRef.$el
        if (!el) return false
        const v = Array.isArray(values) ? values : []
        if (v.length <= 1) return false
        const inputInner = el.querySelector('.el-input__inner') || el.querySelector('.el-input')
        if (!inputInner) return false
        const rect = inputInner.getBoundingClientRect()
        const width = rect && rect.width ? rect.width : 0
        if (!width) return false
        const available = Math.max(width - 72, 120)
        const map = new Map((options || []).map(o => [o.value, o.label]))
        const font = window.getComputedStyle(inputInner).font
        let total = 0
        v.forEach(val => {
          const label = map.get(val) || `${val}`
          total += this.measureTextWidth(label, font) + 46
        })
        return total > available
      },
      updateUiScopeSelectCollapse () {
        if (!this.form || this.form.backgroundType !== 'image') {
          this.collapseTagsBackgroundUiOpacityScope = false
          this.collapseTagsBackgroundUiFrostedBlurScope = false
          return
        }
        this.$nextTick(() => {
          this.collapseTagsBackgroundUiOpacityScope = this.computeScopeSelectCollapse(
            this.$refs.backgroundUiOpacityScopeSelect,
            this.form.backgroundUiOpacityScope,
            this.backgroundUiOpacityScopeOptions
          )
          this.collapseTagsBackgroundUiFrostedBlurScope = this.computeScopeSelectCollapse(
            this.$refs.backgroundUiFrostedBlurScopeSelect,
            this.form.backgroundUiFrostedBlurScope,
            this.backgroundUiFrostedBlurScopeOptions
          )
        })
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
      getShortcutCommands () {
        const baseCommands = Object.values(keymap)
        const customCommands = Object.values(this.form.customKeymap || {})
        const set = new Set([...baseCommands, ...customCommands, 'task:multi-select'])
        const list = Array.from(set)
        const idx = list.indexOf('task:multi-select')
        if (idx !== -1) {
          list.splice(idx, 1)
        }
        list.push('task:multi-select')
        return list
      },
      getKeystrokeByCommand (command) {
        if (command === 'task:multi-select') {
          return this.form.taskMultiSelectModifier || ''
        }
        const custom = this.form.customKeymap || {}
        const customEntries = Object.entries(custom)
        for (const [ks, cmd] of customEntries) {
          if (cmd === command) return ks
        }
        const baseEntries = Object.entries(keymap)
        for (const [ks, cmd] of baseEntries) {
          if (cmd === command) return ks
        }
        return ''
      },
      normalizeKeystroke (event) {
        event.preventDefault()
        const parts = []
        if (event.ctrlKey || event.metaKey) parts.push('cmdctrl')
        if (event.shiftKey) parts.push('shift')
        if (event.altKey) parts.push('alt')
        let key = event.key || ''
        key = key.toLowerCase()
        if (key === 'control' || key === 'meta' || key === 'shift' || key === 'alt') {
          return ''
        }
        if (key === 'arrowup') key = 'up'
        if (key === 'arrowdown') key = 'down'
        if (key === 'arrowleft') key = 'left'
        if (key === 'arrowright') key = 'right'
        if (key === 'escape') key = 'esc'
        const result = [...parts, key].filter(Boolean).join('-')
        return result
      },
      normalizeModifierKeystroke (event) {
        event.preventDefault()
        const parts = []
        if (event.ctrlKey) parts.push('ctrl')
        if (event.metaKey) parts.push('cmd')
        if (event.shiftKey) parts.push('shift')
        if (event.altKey) parts.push('alt')
        return parts.join('-')
      },
      normalizeTaskMultiSelectKeystroke (event) {
        const key = `${event && event.key ? event.key : ''}`.toLowerCase()
        if (['control', 'meta', 'shift', 'alt'].includes(key)) {
          return this.normalizeModifierKeystroke(event)
        }
        return this.normalizeKeystroke(event)
      },
      formatKeystrokeForDisplay (keystroke) {
        if (!keystroke) return ''
        const parts = keystroke.split('-').filter(Boolean)
        if (parts.length === 0) return ''
        const modifiers = []
        let key = ''
        parts.forEach(p => {
          switch (p) {
          case 'cmdctrl':
            modifiers.push('Ctrl/Cmd')
            break
          case 'ctrl':
            modifiers.push('Ctrl')
            break
          case 'cmd':
            modifiers.push('Cmd')
            break
          case 'shift':
            modifiers.push('Shift')
            break
          case 'alt':
            modifiers.push('Alt')
            break
          default:
            key = p
            break
          }
        })
        const specials = {
          esc: 'Esc',
          up: 'Up',
          down: 'Down',
          left: 'Left',
          right: 'Right'
        }
        const displayKey = specials[key] || (key.length === 1 ? key.toUpperCase() : key)
        return [...modifiers, displayKey].filter(Boolean).join(' + ')
      },
      setTaskMultiSelectModifier (keystroke) {
        if (!keystroke) return
        if (keystroke === this.form.taskMultiSelectModifier) return
        const existingCommand = this.getCommandByKeystroke(keystroke)
        if (existingCommand) {
          const existingCommandLabel = this.getCommandLabel(existingCommand)
          const keystrokeDisplay = this.formatKeystrokeForDisplay(keystroke)
          const message = this.$t('preferences.shortcut-duplicate-message', {
            keystroke: keystrokeDisplay,
            command: existingCommandLabel
          })
          this.$message({
            type: 'warning',
            message: message,
            duration: 4000,
            dangerouslyUseHTMLString: true,
            showClose: true
          })
          return
        }
        this.form.taskMultiSelectModifier = keystroke
        this.autoSaveForm()
      },
      resetShortcuts () {
        this.form.customKeymap = {}
        this.form.taskMultiSelectModifier = 'ctrl'
        this.autoSaveForm()
      },
      handleShortcutKeydown (command, event) {
        if (command === 'task:multi-select') {
          this.setTaskMultiSelectModifier(this.normalizeTaskMultiSelectKeystroke(event))
          return
        }
        this.setCommandKeystroke(command, this.normalizeKeystroke(event))
      },
      setCommandKeystroke (command, keystroke) {
        if (!keystroke) {
          // 如果没有按键，只是清除当前命令的快捷键
          const custom = { ...(this.form.customKeymap || {}) }
          Object.keys(custom).forEach(k => {
            if (custom[k] === command) {
              delete custom[k]
            }
          })
          this.form.customKeymap = custom
          this.autoSaveForm()
          return
        }

        // 检查快捷键是否已被其他命令使用
        const existingCommand = this.getCommandByKeystroke(keystroke)
        if (existingCommand && existingCommand !== command) {
          // 显示错误通知，不允许设置重复快捷键
          const existingCommandLabel = this.getCommandLabel(existingCommand)
          const keystrokeDisplay = this.formatKeystrokeForDisplay(keystroke)

          // 使用多语言本地化提示
          const message = this.$t('preferences.shortcut-duplicate-message', {
            keystroke: keystrokeDisplay,
            command: existingCommandLabel
          })
          this.$message({
            type: 'warning',
            message: message,
            duration: 4000,
            dangerouslyUseHTMLString: true,
            showClose: true
          })
          return
        }

        // 没有冲突，直接应用
        const custom = { ...(this.form.customKeymap || {}) }

        // 删除当前命令的旧快捷键
        Object.keys(custom).forEach(k => {
          if (custom[k] === command) {
            delete custom[k]
          }
        })

        // 设置新的快捷键
        custom[keystroke] = command

        this.form.customKeymap = custom
        this.autoSaveForm()
      },

      getCommandByKeystroke (keystroke) {
        // 构建完整的当前快捷键映射
        const currentKeymap = this.getCurrentKeymap()
        return currentKeymap[keystroke] || null
      },

      getCurrentKeymap () {
        // 从默认快捷键开始
        const current = { ...keymap }
        const custom = this.form.customKeymap || {}

        // 首先移除被自定义快捷键覆盖的默认快捷键
        Object.values(custom).forEach(command => {
          // 找到并删除该命令在默认快捷键中的绑定
          Object.keys(current).forEach(key => {
            if (current[key] === command) {
              delete current[key]
            }
          })
        })

        // 然后应用自定义快捷键
        Object.keys(custom).forEach(key => {
          current[key] = custom[key]
        })

        const multi = this.form.taskMultiSelectModifier || ''
        if (multi) {
          current[multi] = 'task:multi-select'
        }

        return current
      },
      getCommandLabel (command) {
        const map = {
          'application:quit': 'app.quit',
          'application:new-task': 'task.new-task',
          'application:new-bt-task': 'task.new-bt-task',
          'application:open-file': 'task.open-file',
          'application:task-list': 'app.task-list',
          'application:preferences': 'app.preferences',
          'application:pause-all-task': 'task.pause-all-task',
          'application:resume-all-task': 'task.resume-all-task',
          'application:select-all-task': 'task.select-all-task',
          'task:multi-select': null
        }
        if (command === 'task:multi-select') {
          return '多选任务'
        }
        const key = map[command]
        return key ? this.$t(key) : command
      },
      autoSaveForm () {
        // Debounce auto-save to avoid too many requests
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout)
        }
        this.saveTimeout = setTimeout(() => {
          // 验证下载中文件后缀格式
          this.validateDownloadingFileSuffix()

          // Double-check there are actual changes before submitting
          if (!isEmpty(diffConfig(this.formOriginal, this.form))) {
            this.submitForm('basicForm')
          }
        }, 100)
      },
      validateDownloadingFileSuffix () {
        const suffix = this.form.downloadingFileSuffix
        if (suffix && suffix.trim() !== '' && !suffix.startsWith('.')) {
          // 如果用户输入的后缀不以"."开头，自动添加"."
          this.form.downloadingFileSuffix = '.' + suffix
          this.$msg.warning(this.$t('preferences.downloading-file-suffix-format-warning'))
        }
      },
      handleLocaleChange (locale) {
        const lng = getLanguage(locale)
        getLocaleManager().changeLanguage(lng)
        this.autoSaveForm()
        // 更新语言已更改状态
        this.localeChanged = this.form.locale !== this.originalLocale
      },
      // 撤回语言更改
      undoLocaleChange () {
        this.form.locale = this.originalLocale
        this.handleLocaleChange(this.originalLocale)
        this.localeChanged = false
      },
      handleThemeChange (theme) {
        this.form.theme = theme
        this.autoSaveForm()
      },
      normalizeUiScopeValues (values, allowedOptions) {
        const opts = Array.isArray(allowedOptions) ? allowedOptions : []
        const set = new Set(opts.map(s => `${s}`))
        const v = Array.isArray(values) ? values : null
        if (!v) return [...opts]
        const filtered = v
          .map(s => `${s}`.trim())
          .filter(s => set.has(s))
        return filtered.length > 0 ? filtered : [...opts]
      },
      normalizeUiNumber (value, min, max, fallback) {
        const n = Number(value)
        if (!Number.isFinite(n)) return fallback
        return Math.min(Math.max(n, min), max)
      },
      buildUiConfigForExport () {
        const backgroundType = this.form.backgroundType === 'image' ? 'image' : 'color'
        const data = {
          theme: this.form.theme,
          taskDetailDefaultTransparent: !!this.form.taskDetailDefaultTransparent,
          taskDetailFrostedBlur: this.normalizeUiNumber(this.form.taskDetailFrostedBlur, 0, 10, 0),
          subnavMode: this.form.subnavMode === 'title' ? 'title' : 'floating',
          sidebarLayoutMode: this.form.sidebarLayoutMode === 'three-column' ? 'three-column' : 'floating',
          floatingBarDisplayMode: this.form.floatingBarDisplayMode === 'always' ? 'always' : 'hover',
          taskProgressMode: this.form.taskProgressMode === 'background' ? 'background' : 'component',
          showProgressBar: this.form.showProgressBar === undefined ? true : !!this.form.showProgressBar,
          backgroundType,
          backgroundImageOpacity: this.normalizeUiNumber(this.form.backgroundImageOpacity, 0.3, 1, 0.4),
          backgroundImageFrostedBlur: this.normalizeUiNumber(this.form.backgroundImageFrostedBlur, 0, 10, 0),
          backgroundUiOpacity: this.normalizeUiNumber(this.form.backgroundUiOpacity, 0.4, 1, 0.7),
          backgroundUiOpacityScope: this.normalizeUiScopeValues(
            this.form.backgroundUiOpacityScope,
            BACKGROUND_UI_OPACITY_SCOPE_OPTIONS
          ),
          backgroundUiFrostedBlur: this.normalizeUiNumber(this.form.backgroundUiFrostedBlur, 0, 10, 6),
          backgroundUiFrostedBlurScope: this.normalizeUiScopeValues(
            this.form.backgroundUiFrostedBlurScope,
            BACKGROUND_UI_FROSTED_BLUR_SCOPE_OPTIONS
          )
        }

        return {
          type: 'linkcore-ui-config',
          version: 1,
          data
        }
      },
      exportUiConfigToClipboard () {
        try {
          const { clipboard } = require('electron')
          const payload = this.buildUiConfigForExport()
          clipboard.writeText(JSON.stringify(payload, null, 2))
          this.$msg.success(this.$t('preferences.copy-as-text'))
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      escapeHtml (s) {
        const text = `${s ?? ''}`
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      },
      parseUiConfigFromText (raw) {
        const text = `${raw || ''}`.trim()
        if (!text) return null
        const parsed = JSON.parse(text)
        const container = (parsed && typeof parsed === 'object') ? parsed : null
        const data = container && container.type === 'linkcore-ui-config' ? container.data : container
        if (!data || typeof data !== 'object') return null
        const providedKeys = Object.keys(data)
        return { data, providedKeys }
      },
      getUiConfigCandidateFromData (data, providedKeys) {
        const keys = new Set(Array.isArray(providedKeys) ? providedKeys : [])
        const candidate = {}

        if (keys.has('theme')) candidate.theme = data.theme
        if (keys.has('taskDetailDefaultTransparent')) candidate.taskDetailDefaultTransparent = !!data.taskDetailDefaultTransparent
        if (keys.has('taskDetailFrostedBlur')) candidate.taskDetailFrostedBlur = this.normalizeUiNumber(data.taskDetailFrostedBlur, 0, 10, 0)
        if (keys.has('subnavMode')) candidate.subnavMode = data.subnavMode === 'title' ? 'title' : 'floating'
        if (keys.has('sidebarLayoutMode')) candidate.sidebarLayoutMode = data.sidebarLayoutMode === 'three-column' ? 'three-column' : 'floating'
        if (keys.has('floatingBarDisplayMode')) candidate.floatingBarDisplayMode = data.floatingBarDisplayMode === 'always' ? 'always' : 'hover'
        if (keys.has('taskProgressMode')) candidate.taskProgressMode = data.taskProgressMode === 'background' ? 'background' : 'component'
        if (keys.has('showProgressBar')) candidate.showProgressBar = data.showProgressBar === undefined ? true : !!data.showProgressBar

        if (keys.has('backgroundType')) candidate.backgroundType = data.backgroundType === 'image' ? 'image' : 'color'
        if (keys.has('backgroundImageOpacity')) candidate.backgroundImageOpacity = this.normalizeUiNumber(data.backgroundImageOpacity, 0.3, 1, 0.4)
        if (keys.has('backgroundImageFrostedBlur')) candidate.backgroundImageFrostedBlur = this.normalizeUiNumber(data.backgroundImageFrostedBlur, 0, 10, 0)
        if (keys.has('backgroundUiOpacity')) candidate.backgroundUiOpacity = this.normalizeUiNumber(data.backgroundUiOpacity, 0.4, 1, 0.7)
        if (keys.has('backgroundUiOpacityScope')) {
          candidate.backgroundUiOpacityScope = this.normalizeUiScopeValues(
            data.backgroundUiOpacityScope,
            BACKGROUND_UI_OPACITY_SCOPE_OPTIONS
          )
        }
        if (keys.has('backgroundUiFrostedBlur')) candidate.backgroundUiFrostedBlur = this.normalizeUiNumber(data.backgroundUiFrostedBlur, 0, 10, 6)
        if (keys.has('backgroundUiFrostedBlurScope')) {
          candidate.backgroundUiFrostedBlurScope = this.normalizeUiScopeValues(
            data.backgroundUiFrostedBlurScope,
            BACKGROUND_UI_FROSTED_BLUR_SCOPE_OPTIONS
          )
        }

        return candidate
      },
      formatUiConfigPreviewValue (key, value) {
        if (key === 'theme') {
          const v = `${value || ''}`
          if (v === 'auto') return this.$t('preferences.theme-auto')
          if (v === 'light') return this.$t('preferences.theme-light')
          if (v === 'dark') return this.$t('preferences.theme-dark')
          return v || '--'
        }
        if (key === 'backgroundType') {
          const v = `${value || ''}`
          if (v === 'color') return this.$t('preferences.background-type-color')
          if (v === 'image') return this.$t('preferences.background-type-image')
          return v || '--'
        }
        if (key === 'subnavMode') {
          return value === 'title' ? this.$t('preferences.subnav-mode-title') : this.$t('preferences.subnav-mode-floating')
        }
        if (key === 'sidebarLayoutMode') {
          return value === 'three-column' ? this.$t('preferences.sidebar-layout-mode-three-column') : this.$t('preferences.sidebar-layout-mode-floating')
        }
        if (key === 'floatingBarDisplayMode') {
          return value === 'always' ? this.$t('preferences.floating-bar-display-mode-always') : this.$t('preferences.floating-bar-display-mode-hover')
        }
        if (key === 'taskProgressMode') {
          return value === 'background' ? this.$t('preferences.task-progress-mode-background') : this.$t('preferences.task-progress-mode-component')
        }

        if (key === 'taskDetailDefaultTransparent' || key === 'showProgressBar') {
          return value ? '开启' : '关闭'
        }

        if (key === 'backgroundUiOpacity' || key === 'backgroundImageOpacity') {
          const n = Number(value)
          if (!Number.isFinite(n)) return '--'
          return `${Math.round(n * 100)}%`
        }
        if (key === 'taskDetailFrostedBlur' || key === 'backgroundUiFrostedBlur' || key === 'backgroundImageFrostedBlur') {
          const n = Number(value)
          if (!Number.isFinite(n)) return '--'
          return `${Math.round(n)}`
        }

        if (key === 'backgroundUiOpacityScope') {
          const v = Array.isArray(value) ? value : []
          const map = new Map((this.backgroundUiOpacityScopeOptions || []).map(o => [o.value, o.label]))
          return v.map(s => map.get(s) || s).join('、') || '--'
        }
        if (key === 'backgroundUiFrostedBlurScope') {
          const v = Array.isArray(value) ? value : []
          const map = new Map((this.backgroundUiFrostedBlurScopeOptions || []).map(o => [o.value, o.label]))
          return v.map(s => map.get(s) || s).join('、') || '--'
        }

        return `${value ?? '--'}`
      },
      getUiConfigFieldLabel (key) {
        const map = {
          theme: '主题',
          taskDetailDefaultTransparent: this.$t('preferences.task-detail-default-transparent'),
          taskDetailFrostedBlur: this.$t('preferences.task-detail-frosted-strength'),
          subnavMode: this.$t('preferences.subnav-mode'),
          sidebarLayoutMode: this.$t('preferences.sidebar-layout-mode'),
          floatingBarDisplayMode: this.$t('preferences.floating-bar-display-mode'),
          taskProgressMode: this.$t('preferences.task-progress-mode'),
          showProgressBar: this.$t('preferences.show-progress-bar'),
          backgroundType: this.$t('preferences.background-type'),
          backgroundImageOpacity: this.$t('preferences.background-image-opacity'),
          backgroundImageFrostedBlur: this.$t('preferences.background-image-frosted-strength'),
          backgroundUiOpacity: this.$t('preferences.background-ui-opacity'),
          backgroundUiOpacityScope: this.$t('preferences.background-ui-opacity-scope'),
          backgroundUiFrostedBlur: this.$t('preferences.background-ui-frosted-strength'),
          backgroundUiFrostedBlurScope: this.$t('preferences.background-ui-frosted-scope')
        }
        return map[key] || key
      },
      buildUiConfigChangePreview (candidate) {
        const changes = []
        Object.keys(candidate || {}).forEach(key => {
          const next = candidate[key]
          const cur = this.form ? this.form[key] : undefined
          const isArray = Array.isArray(next) || Array.isArray(cur)
          const same = isArray
            ? JSON.stringify(Array.isArray(cur) ? cur : []) === JSON.stringify(Array.isArray(next) ? next : [])
            : cur === next

          if (!same) {
            changes.push({
              key,
              label: this.getUiConfigFieldLabel(key),
              from: this.formatUiConfigPreviewValue(key, cur),
              to: this.formatUiConfigPreviewValue(key, next)
            })
          }
        })
        return changes
      },
      async applyUiConfigFromText (raw) {
        try {
          const parsed = this.parseUiConfigFromText(raw)
          if (!parsed) {
            return 'invalid'
          }

          const candidate = this.getUiConfigCandidateFromData(parsed.data, parsed.providedKeys)
          const changes = this.buildUiConfigChangePreview(candidate)

          const html = changes.length > 0
            ? [
              '<div style="margin-bottom: 8px;">将导入并覆盖以下设置项（仅显示有变化）：</div>',
              '<div style="max-height: 260px; overflow: auto; padding-left: 14px;">',
              ...changes.map(item => {
                const label = this.escapeHtml(item.label)
                const from = this.escapeHtml(item.from)
                const to = this.escapeHtml(item.to)
                return `<div style="margin: 6px 0;"><span style="font-weight: 600;">${label}</span>：${from} → ${to}</div>`
              }),
              '</div>'
            ].join('')
            : '<div>导入的配置与当前一致，仍要导入吗？</div>'

          const confirmed = await this.$confirm(html, '确认导入 UI 配置', {
            confirmButtonText: '导入',
            cancelButtonText: this.$t('preferences.cancel'),
            type: 'warning',
            dangerouslyUseHTMLString: true,
            customClass: 'ui-config-import-confirm'
          }).then(() => true).catch(() => false)

          if (!confirmed) return 'cancelled'

          Object.keys(candidate).forEach(key => {
            this.form[key] = candidate[key]
          })

          this.autoSaveForm()
          this.$nextTick(() => this.updateUiScopeSelectCollapse())
          return 'applied'
        } catch (e) {
          return 'error'
        }
      },
      async exportUiConfigToFile () {
        try {
          const { dialog } = require('@electron/remote')
          const path = require('path')
          const os = require('os')
          const fs = require('fs')

          const payload = this.buildUiConfigForExport()
          const defaultPath = path.join(os.homedir(), 'Desktop', 'linkcore-ui-config.json')

          const result = await dialog.showSaveDialog({
            title: '导出 UI 配置',
            defaultPath,
            filters: [{ name: 'JSON', extensions: ['json'] }]
          })
          if (result.canceled || !result.filePath) return

          await fs.promises.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
          this.$msg.success('导出成功')
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      async importUiConfigFromFile () {
        try {
          const { dialog } = require('@electron/remote')
          const fs = require('fs')

          const result = await dialog.showOpenDialog({
            title: '导入JSON文件',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
          })
          if (result.canceled || !result.filePaths || result.filePaths.length === 0) return

          const filePath = result.filePaths[0]
          const raw = await fs.promises.readFile(filePath, 'utf8')
          const res = await this.applyUiConfigFromText(raw)
          if (res === 'applied') {
            this.$msg.success('导入成功')
            return
          }
          if (res === 'invalid' || res === 'error') {
            this.$msg.error(this.$t('preferences.save-fail-message'))
          }
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      async importUiConfigFromTextPrompt () {
        try {
          const { value } = await this.$prompt('', '粘贴 UI JSON 配置', {
            confirmButtonText: this.$t('preferences.paste-and-import'),
            cancelButtonText: this.$t('preferences.cancel'),
            inputType: 'textarea',
            inputValue: '',
            inputPlaceholder: '在此粘贴 JSON（支持一整段）',
            customClass: 'ui-config-import-prompt'
          })

          const res = await this.applyUiConfigFromText(value)
          if (res === 'applied') {
            this.$msg.success('导入成功')
            return
          }
          if (res === 'invalid' || res === 'error') {
            this.$msg.error(this.$t('preferences.save-fail-message'))
          }
        } catch (e) {
        }
      },
      getBackgroundImageCacheDir () {
        try {
          const { app } = require('@electron/remote')
          const path = require('path')
          const userData = app.getPath('userData')
          return path.join(userData, 'background-images')
        } catch (e) {
          return ''
        }
      },
      isCachedBackgroundImagePath (p) {
        try {
          const path = require('path')
          const cacheDir = this.getBackgroundImageCacheDir()
          if (!cacheDir) return false
          const resolvedCache = path.resolve(cacheDir)
          const resolvedPath = path.resolve(p || '')
          const prefix = resolvedCache.endsWith(path.sep) ? resolvedCache : `${resolvedCache}${path.sep}`
          return resolvedPath.toLowerCase().startsWith(prefix.toLowerCase())
        } catch (e) {
          return false
        }
      },
      async cacheBackgroundImageToAppDir (sourcePath) {
        const src = `${sourcePath || ''}`.trim()
        if (!src) return ''
        if (this.isCachedBackgroundImagePath(src)) return src

        const cacheDir = this.getBackgroundImageCacheDir()
        if (!cacheDir) return ''

        const fs = require('fs')
        const path = require('path')
        const crypto = require('crypto')

        try {
          fs.mkdirSync(cacheDir, { recursive: true })
        } catch (e) {}

        const ext = path.extname(src) || '.img'
        const lowerExt = `${ext || ''}`.toLowerCase()
        const rand = crypto.randomBytes(6).toString('hex')
        const base = `bg-${Date.now()}-${rand}`

        let output = null
        let outputExt = ext

        try {
          if (lowerExt !== '.gif' && lowerExt !== '.svg') {
            const { nativeImage } = require('electron')
            const img = nativeImage.createFromPath(src)
            if (img && !img.isEmpty()) {
              const size = img.getSize()
              const maxSide = 2560
              const w = Number(size && size.width)
              const h = Number(size && size.height)
              const longest = Math.max(Number.isFinite(w) ? w : 0, Number.isFinite(h) ? h : 0)
              const scale = longest > maxSide ? (maxSide / longest) : 1
              const targetW = Math.max(1, Math.round((Number.isFinite(w) ? w : 1) * scale))
              const targetH = Math.max(1, Math.round((Number.isFinite(h) ? h : 1) * scale))
              const processed = scale < 1 ? img.resize({ width: targetW, height: targetH, quality: 'good' }) : img

              if (lowerExt === '.jpg' || lowerExt === '.jpeg' || lowerExt === '.webp') {
                output = processed.toJPEG(80)
                outputExt = '.jpg'
              } else {
                output = processed.toPNG()
                outputExt = '.png'
              }
            }
          }
        } catch (e) {}

        const filename = `${base}${outputExt}`
        const dest = path.join(cacheDir, filename)
        if (output && output.length) {
          await fs.promises.writeFile(dest, output)
        } else {
          await fs.promises.copyFile(src, dest)
        }
        return dest
      },
      async deleteCachedBackgroundImageIfNeeded (p) {
        const target = `${p || ''}`.trim()
        if (!target) return
        if (!this.isCachedBackgroundImagePath(target)) return
        try {
          const fs = require('fs')
          await fs.promises.unlink(target)
        } catch (e) {}
      },
      async selectBackgroundImage () {
        try {
          const { dialog } = require('@electron/remote')
          const result = await dialog.showOpenDialog({
            title: this.$t('preferences.background-image-select'),
            properties: ['openFile'],
            filters: [
              { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }
            ]
          })
          if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return
          }
          const selected = result.filePaths[0]
          const oldPath = this.form.backgroundImage
          const cached = await this.cacheBackgroundImageToAppDir(selected)
          if (!cached) {
            throw new Error('cache background image failed')
          }
          this.form.backgroundImage = cached
          this.form.backgroundType = 'image'
          this.autoSaveForm()
          if (oldPath && oldPath !== cached) {
            await this.deleteCachedBackgroundImageIfNeeded(oldPath)
          }
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      clearBackgroundImage () {
        const oldPath = this.form.backgroundImage
        this.form.backgroundImage = ''
        this.form.backgroundType = 'color'
        this.autoSaveForm()
        this.deleteCachedBackgroundImageIfNeeded(oldPath)
      },
      handleDownloadChange (value) {
        const speedLimit = parseInt(this.form.maxOverallDownloadLimit, 10)
        this.downloadUnit = value
        const limit = speedLimit > 0 ? `${speedLimit}${value}` : 0
        this.form.maxOverallDownloadLimit = limit
        this.autoSaveForm()
      },
      handleUploadChange (value) {
        const speedLimit = parseInt(this.form.maxOverallUploadLimit, 10)
        this.uploadUnit = value
        const limit = speedLimit > 0 ? `${speedLimit}${value}` : 0
        this.form.maxOverallUploadLimit = limit
        this.autoSaveForm()
      },
      onKeepSeedingChange (enable) {
        this.form.seedRatio = enable ? 0 : 1
        this.form.seedTime = enable ? 525600 : 60
        this.autoSaveForm()
      },
      handleHistoryDirectorySelected (dir) {
        this.form.dir = dir
        this.autoSaveForm()
      },
      handleNativeDirectorySelected (dir) {
        this.form.dir = dir
        this.$store.dispatch('preference/recordHistoryDirectory', dir)
        this.autoSaveForm()
      },
      handleSecurityScanPathSelected (path) {
        this.form.customSecurityScanPath = path
        this.autoSaveForm()
      },
      copyChannelUrl () {
        const text = this.appChannelUrl
        if (!text) return
        try {
          const { clipboard } = require('electron')
          clipboard.writeText(text)
          this.$msg.success(this.$t('preferences.save-success-message'))
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      async downloadExtension () {
        const { dialog, app } = require('@electron/remote')
        const fs = require('fs')
        const path = require('path')

        // 扩展文件路径 - 指向目录（支持开发和生产环境）
        const appPath = app.getAppPath()
        const extensionDir = path.join(appPath, 'extensions', 'linkcore-webextension')

        // 检查目录是否存在
        if (!fs.existsSync(extensionDir)) {
          this.$msg.error(this.$t('preferences.extension-file-not-found'))
          return
        }

        // 弹出文件夹选择对话框
        const result = await dialog.showOpenDialog({
          title: '选择扩展文件保存位置',
          defaultPath: require('os').homedir() + '/Desktop',
          properties: ['openDirectory', 'createDirectory']
        })

        // 如果用户取消了选择
        if (result.canceled || result.filePaths.length === 0) {
          return
        }

        const selectedDir = result.filePaths[0]
        const destinationDir = path.join(selectedDir, 'linkcore-webextension')

        try {
          // 复制整个目录到用户选择的位置
          this.copyDirectory(extensionDir, destinationDir)

          // 显示成功消息
          this.$msg.success(this.$t('preferences.extension-download-success'))
        } catch (error) {
          console.error('下载扩展失败:', error)
          this.$msg.error(this.$t('preferences.extension-download-failed'))
        }
      },
      openVideoDetectionSettings () {
        this.$electron.ipcRenderer.send('open-video-detection-settings')
      },
      openFileCategoriesSettings () {
        this.$electron.ipcRenderer.send('open-file-categories-settings')
      },
      onDirectorySelected (dir) {
        this.form.dir = dir
        this.autoSaveForm()
      },
      syncFormConfig () {
        this.$store.dispatch('preference/fetchPreference')
          .then((config) => {
            this.form = initForm(config)
            this.formOriginal = cloneDeep(this.form)
          })
      },
      submitForm (formName) {
        this.$refs[formName].validate((valid) => {
          if (!valid) {
            console.error('[Motrix] preference form valid:', valid)
            return false
          }

          const data = {
            ...diffConfig(this.formOriginal, this.form),
            ...changedConfig.advanced
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

          this.$store.dispatch('preference/save', data)
            .then(() => {
              this.$store.dispatch('app/fetchEngineOptions')
              this.syncFormConfig()
              // Don't show success message for auto-save to avoid constant notifications
            })
            .catch(() => {
              this.$msg.error(this.$t('preferences.save-fail-message'))
            })

          changedConfig.basic = {}
          changedConfig.advanced = {}

          if (this.isRenderer) {
            if ('autoHideWindow' in data) {
              this.$electron.ipcRenderer.send('command',
                                              'application:auto-hide-window', autoHideWindow)
            }

            if (checkIsNeedRestart(data)) {
              this.$electron.ipcRenderer.send('command', 'application:relaunch')
            }
          }
        })
      },

      // 复制目录
      copyDirectory (sourceDir, destinationDir) {
        const fs = require('fs')
        const path = require('path')

        // 创建目标目录
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true })
        }

        // 读取源目录中的所有文件和子目录
        const items = fs.readdirSync(sourceDir)

        for (const item of items) {
          const sourcePath = path.join(sourceDir, item)
          const destinationPath = path.join(destinationDir, item)

          const stat = fs.statSync(sourcePath)

          if (stat.isDirectory()) {
            // 如果是目录，递归复制
            this.copyDirectory(sourcePath, destinationPath)
          } else {
            // 如果是文件，复制文件
            fs.copyFileSync(sourcePath, destinationPath)
          }
        }
      }
    },
    beforeRouteLeave (to, from, next) {
      // Since we now use auto-save on changes, there's no need to check for unsaved changes
      changedConfig.basic = {}
      changedConfig.advanced = {}
      next()
    }
  }
</script>

<style lang="scss" scoped>
.background-type-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.background-type-nav :deep(.el-radio-group) {
  display: inline-flex;
}

.background-type-nav__left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.background-type-nav__right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

:deep(.background-slider-item .el-form-item__label) {
  float: none;
  display: block;
  text-align: left;
  line-height: 1.2;
  padding: 0 0 8px;
}

:deep(.background-slider-item .el-form-item__content) {
  margin-left: 0 !important;
}

:deep(.background-slider-item.el-form-item) {
  margin-bottom: 0px;
}

.content {
  height: 100%;
}

 .panel {
   background: var(--panel-background);
 }

 .panel-header {
   padding: 0 24px;
   border-bottom: 1px solid var(--border-color);
   display: flex;
   align-items: center;
   justify-content: space-between;
 }

 .panel-content {
   padding: 0;
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

 /* 编辑规则按钮优化样式 */
.edit-rules-btn {
   margin-left: 8px;
   padding: 6px 12px;
   border-radius: 6px;
   font-weight: 500;
   transition: all 0.2s ease-in-out;
   border: 1px solid transparent;
  background: var(--primary-color, #409eff);
  color: #fff;
}

 /* 白天模式适配 */
 .theme-light .edit-rules-btn {
   color: #000;
 }

.theme-light .edit-rules-btn:hover {
  color: #000;
  background: linear-gradient(135deg, var(--primary-color, #409eff) 0%, var(--primary-color-light-1, #66b1ff) 100%);
}

.edit-rules-btn:hover {
  background: linear-gradient(135deg, var(--primary-color, #409eff) 0%, var(--primary-color-light-1, #66b1ff) 100%);
  border-color: var(--primary-color-light-1, #66b1ff);
}

.edit-rules-btn:active {
  background: linear-gradient(135deg, var(--primary-color, #409eff) 0%, var(--primary-color-light-1, #66b1ff) 100%);
  border-color: var(--primary-color-light-1, #66b1ff);
}

 .edit-rules-btn .el-icon-edit {
   margin-right: 4px;
   font-size: 12px;
 }

 /* 黑夜模式适配 */
.theme-dark .edit-rules-btn {
  background: var(--primary-color, #409eff);
  border-color: transparent;
  color: #fff;
}

.theme-dark .edit-rules-btn:hover {
  background: linear-gradient(135deg, var(--primary-color, #409eff) 0%, var(--primary-color-light-1, #66b1ff) 100%);
   border-color: var(--primary-color-light-1);
 }

 .theme-dark .edit-rules-btn:active {
   background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-light-1) 100%);
   border-color: var(--primary-color-light-1);
 }

 /* 确保按钮在信息文本中正确对齐 */
 .el-form-item__info .edit-rules-btn {
   vertical-align: middle;
   margin-top: -2px;
 }

 /* 设置分隔线样式 */
 .settings-divider {
   height: 2px;
   background: var(--border-color);
   margin: 24px 0;
   border-radius: 1px;
   opacity: 0.8;
   box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
 }

 /* 暗色主题下的分隔线 */
 .theme-dark .settings-divider {
   background: #4a4a4a;
   box-shadow: 0 1px 2px rgba(255, 255, 255, 0.05);
 }

 /* 视频嗅探设置按钮样式 */
 .video-detection-settings-btn {
   background: #409EFF;
   border-color: #409EFF;
   color: #fff;
   transition: all 0.2s ease-in-out;
 }

 .video-detection-settings-btn:hover {
   background: #66b1ff;
   border-color: #66b1ff;
   color: #fff;
 }

 .video-detection-settings-btn:active {
   background: #3a8ee6;
   border-color: #3a8ee6;
   color: #fff;
 }
</style>
