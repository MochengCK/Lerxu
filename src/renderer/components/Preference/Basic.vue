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
        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.appearance') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <mo-theme-switcher
                v-model="form.theme"
                @change="handleThemeChange"
                ref="themeSwitcher"
              />
            </el-col>
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.ui') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.date-filter-frosted') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.dateFilterFrosted" @change="autoSaveForm">
                {{ $t('preferences.date-filter-frosted') }}
              </el-checkbox>
            </el-col>
            <el-col v-if="form.dateFilterFrosted" class="form-item-sub" :span="24">
              <el-form-item class="background-slider-item" :label="$t('preferences.date-filter-frosted-strength')">
                <el-slider
                  v-model="form.dateFilterFrostedBlur"
                  :min="0"
                  :max="10"
                  :step="1"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.task-detail-default-transparent') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.show-task-type-badge') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.showTaskTypeBadge" @change="autoSaveForm">
                {{ $t('preferences.show-task-type-badge') }}
              </el-checkbox>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.show-task-type-badge-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.task-progress-mode') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <div class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.subnav-mode') }}</h3>
          <el-form-item size="mini">
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
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.auto-hide-aside')">
                <el-checkbox v-model="form.autoHideAside" @change="autoSaveForm" />
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.auto-hide-subnav')">
                <el-checkbox v-model="form.autoHideSubnav" @change="autoSaveForm" />
              </el-form-item>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <el-form-item :label="$t('preferences.auto-hide-floating-bar')">
                <el-checkbox v-model="form.autoHideFloatingBar" @change="autoSaveForm" />
              </el-form-item>
            </el-col>
          </el-form-item>
        </div>

        <!-- 背景设置卡片 -->
        <div class="preference-card" data-category="appearance">
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

        <div class="preference-bottom-actions" data-category="appearance">
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
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

        <!-- 运行模式卡片 (仅Mac) -->
        <div v-if="isMac" class="preference-card" data-category="basic">
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
        <div class="preference-card" data-category="basic">
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
        <div class="preference-card" data-category="basic">
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
        <div class="preference-card" data-category="basic">
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
        <div class="preference-card" data-category="basic">
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
              <div class="settings-divider" style="margin-top: 16px; margin-bottom: 8px;"></div>
              <div class="form-item-sub" style="margin-top: 8px;">
                {{ $t('preferences.extension-skip-file-extensions') }}
                <div class="extension-tag-input" @click="focusExtensionInput">
                  <transition-group name="tag-fade" tag="div" class="tags-container">
                    <el-tag
                      v-for="ext in extensionTags"
                      :key="ext"
                      closable
                      size="small"
                      @close="removeExtension(ext)"
                      class="extension-tag">
                      {{ ext }}
                    </el-tag>
                  </transition-group>
                  <input
                    ref="extensionInput"
                    v-model="extensionInput"
                    type="text"
                    class="extension-input"
                    :placeholder="extensionTags.length === 0 ? $t('preferences.extension-skip-file-extensions-tips') : ''"
                    @keydown.enter="addExtension"
                    @keydown.delete="handleDeleteKey"
                    @blur="addExtension"
                  />
                </div>
              </div>
              <div class="form-item-sub" style="margin-top: 16px;">
                {{ $t('preferences.extension-exclude-domains') }}
                <div class="extension-tag-input" @click="focusDomainInput">
                  <transition-group name="tag-fade" tag="div" class="tags-container">
                    <el-tag
                      v-for="domain in domainTags"
                      :key="domain"
                      closable
                      size="small"
                      @close="removeDomain(domain)"
                      class="extension-tag">
                      {{ domain }}
                    </el-tag>
                  </transition-group>
                  <input
                    ref="domainInput"
                    v-model="domainInput"
                    type="text"
                    class="extension-input"
                    :placeholder="domainTags.length === 0 ? $t('preferences.extension-exclude-domains-tips') : ''"
                    @keydown.enter="addDomain"
                    @keydown.delete="handleDomainDeleteKey"
                    @blur="addDomain"
                  />
                </div>
              </div>
              <div class="form-item-sub" style="margin-top: 16px;">
                {{ $t('preferences.extension-min-file-size') }}
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                  <el-input-number
                    v-model="form.extensionMinFileSize"
                    controls-position="right"
                    :min="0"
                    :max="10240"
                    :step="1"
                    :precision="0"
                    size="small"
                    style="flex: 1; max-width: 150px;"
                  />
                  <span style="color: var(--text-secondary);">MB</span>
                </div>
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
        <div class="preference-card" data-category="transfer">
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
        <div class="preference-card" data-category="transfer">
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
        <div class="preference-card" data-category="transfer">
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
          </el-form-item>
        </div>

        <!-- BT IP封禁卡片 -->
        <div class="preference-card" data-category="transfer">
          <h3 class="card-title">{{ $t('preferences.bt-ip-ban-list') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-input
                type="textarea"
                :rows="3"
                v-model="btIpBanListText"
                :placeholder="$t('preferences.bt-ip-ban-placeholder')"
              >
              </el-input>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.bt-ip-ban-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 做种设置卡片 -->
        <div class="preference-card" data-category="transfer">
          <h3 class="card-title">{{ $t('preferences.bt-seeding-settings') }}</h3>
          <el-form-item size="mini">
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
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.stop-seeding-action') }}
              <el-radio-group v-model="form.stopSeedingAction" @change="autoSaveForm">
                <el-radio label="pause">{{ $t('preferences.stop-seeding-action-pause') }}</el-radio>
                <el-radio label="complete">{{ $t('preferences.stop-seeding-action-complete') }}</el-radio>
              </el-radio-group>
            </el-col>
          </el-form-item>
        </div>

        <!-- BT通知卡片 -->
        <div class="preference-card" data-category="transfer">
          <h3 class="card-title">{{ $t('preferences.bt-level-up-notification-label') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-switch
                v-model="form.btLevelUpNotification"
                :active-text="$t('preferences.bt-level-up-notification-label')"
                @change="autoSaveForm"
              >
              </el-switch>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.bt-level-up-notification-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 任务并发卡片 -->
        <div class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.task-manage') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <!-- 任务删除与记录卡片 -->
        <div class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.auto-purge-record') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <!-- 任务进度与新任务卡片 -->
        <div class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.new-task-show-downloading') }}</h3>
          <el-form-item size="mini">
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
          </el-form-item>
        </div>

        <!-- 任务完成与通知卡片 -->
        <div class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.show-task-completed-window') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <el-checkbox v-model="form.showTaskCompletedWindow" @change="autoSaveForm">
                {{ $t('preferences.show-task-completed-window') }}
              </el-checkbox>
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
        <div class="preference-card" data-category="file">
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
          </el-form-item>
        </div>

        <!-- 文件分类卡片 -->
        <div class="preference-card" data-category="file">
          <h3 class="card-title">{{ $t('preferences.auto-categorize-files') }}</h3>
          <el-form-item size="mini">
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
        <div class="preference-card" data-category="security">
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
        <div class="preference-card" data-category="task">
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
    convertCommaToLine,
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

  const normalizeBtIpBanList = (value) => {
    const list = Array.isArray(value)
      ? value
      : `${value || ''}`.split(/[\n,;，；\s]+/g)
    const result = []
    const seen = new Set()
    list.forEach(item => {
      const text = `${item || ''}`.trim()
      if (!text || seen.has(text)) return
      seen.add(text)
      result.push(text)
    })
    return result
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
      btIpBanList,
      btSaveMetadata,
      btLevelUpNotification,
      dir,
      downloadingFileSuffix,
      engineMaxConnectionPerServer,
      followMetalink,
      followTorrent,
      hideAppMenu,
      keepSeeding,
      stopSeedingAction,
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
      extensionExcludeDomains,
      extensionMinFileSize,
      extensionShiftToggleEnabled,
      runMode,
      seedRatio,
      seedTime,
      showProgressBar,
      dateFilterFrosted,
      dateFilterFrostedBlur,
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
      autoHideAside,
      autoHideSubnav,
      autoHideFloatingBar,
      autoHideTaskPlan,
      autoOpenTaskProgressWindow,
      taskProgressWindowMode,
      clipboardAutoPaste,
      clipboardAutoOpenAddTask,
      floatingBarDisplayMode,
      enableSecurityScan,
      securityScanTool,
      customSecurityScanPath,
      showTaskTypeBadge
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
      btIpBanList: normalizeBtIpBanList(btIpBanList),
      btSaveMetadata,
      btLevelUpNotification: btLevelUpNotification === undefined ? true : !!btLevelUpNotification,
      continue: config.continue,
      dir,
      downloadingFileSuffix,
      engineMaxConnectionPerServer: normalizedEngineMax,
      followMetalink,
      followTorrent,
      hideAppMenu,
      keepSeeding,
      stopSeedingAction: stopSeedingAction === 'complete' ? 'complete' : 'pause',
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
      extensionSkipFileExtensions: convertCommaToLine(extensionSkipFileExtensions || ''),
      extensionExcludeDomains: convertCommaToLine(extensionExcludeDomains || ''),
      extensionMinFileSize: typeof extensionMinFileSize === 'number' ? extensionMinFileSize : 0,
      extensionShiftToggleEnabled: extensionShiftToggleEnabled || false,
      runMode,
      seedRatio,
      seedTime,
      showProgressBar,
      dateFilterFrosted: dateFilterFrosted === undefined ? false : !!dateFilterFrosted,
      dateFilterFrostedBlur: (typeof dateFilterFrostedBlur === 'number' && Number.isFinite(dateFilterFrostedBlur))
        ? Math.min(Math.max(dateFilterFrostedBlur, 0), 10)
        : 6,
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
      autoHideAside: autoHideAside === undefined ? false : !!autoHideAside,
      autoHideSubnav: autoHideSubnav === undefined ? false : !!autoHideSubnav,
      autoHideFloatingBar: autoHideFloatingBar === undefined ? false : !!autoHideFloatingBar,
      autoHideTaskPlan: autoHideTaskPlan === undefined ? false : !!autoHideTaskPlan,
      autoOpenTaskProgressWindow: autoOpenTaskProgressWindow === undefined ? true : !!autoOpenTaskProgressWindow,
      taskProgressWindowMode: taskProgressWindowMode || 'first',
      clipboardAutoPaste: clipboardAutoPaste === undefined ? true : !!clipboardAutoPaste,
      clipboardAutoOpenAddTask: clipboardAutoOpenAddTask === undefined ? false : !!clipboardAutoOpenAddTask,
      floatingBarDisplayMode: floatingBarDisplayMode || 'hover',
      enableSecurityScan: enableSecurityScan || false,
      securityScanTool: securityScanTool || 'system',
      customSecurityScanPath: customSecurityScanPath || '',
      showTaskTypeBadge: showTaskTypeBadge === undefined ? true : !!showTaskTypeBadge
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
    props: {
      category: {
        type: String,
        default: 'basic'
      }
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
      if (!('btIpBanList' in form)) {
        this.$set(form, 'btIpBanList', [])
      }
      if (!('btIpBanList' in formOriginal)) {
        this.$set(formOriginal, 'btIpBanList', [])
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
        textMeasureCanvas: null,
        extensionInput: '',
        domainInput: ''
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      isMac: () => is.macOS(),
      isMas: () => is.mas(),
      isLinux () { return is.linux() },
      activeCategory () {
        return this.category || 'basic'
      },
      title () {
        const subnav = this.subnavs.find(item => item.key === this.activeCategory)
        return subnav ? subnav.title : this.$t('preferences.basic')
      },
      subnavMode () {
        const { config = {} } = this
        return config.subnavMode || 'floating'
      },
      maxConcurrentDownloads () {
        return ENGINE_MAX_CONCURRENT_DOWNLOADS
      },
      extensionTags () {
        const value = this.form.extensionSkipFileExtensions || ''
        if (!value.trim()) return []

        // 支持逗号和换行符分隔
        return value
          .split(/[\n,]+/)
          .map(ext => ext.trim())
          .filter(ext => ext.length > 0)
      },
      domainTags () {
        const value = this.form.extensionExcludeDomains || ''
        if (!value.trim()) return []

        // 支持逗号和换行符分隔
        return value
          .split(/[\n,]+/)
          .map(domain => domain.trim())
          .filter(domain => domain.length > 0)
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
      btIpBanListText: {
        get () {
          const list = Array.isArray(this.form.btIpBanList) ? this.form.btIpBanList : []
          return list.join('\n')
        },
        set (value) {
          this.form.btIpBanList = normalizeBtIpBanList(value)
          this.autoSaveForm()
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
            key: 'security',
            title: this.$t('preferences.security'),
            route: `${base}/security`
          },
          {
            key: 'advanced',
            title: this.$t('preferences.advanced'),
            route: `${base}/advanced`
          },
          {
            key: 'bittorrent',
            title: this.$t('preferences.bittorrent'),
            route: `${base}/bittorrent`
          },
          {
            key: 'lab',
            title: this.$t('preferences.lab'),
            route: `${base}/lab`
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
          this.applyFilters(val)
        },
        immediate: true
      },
      category: {
        handler () {
          this.applyFilters(this.searchKeyword)
        },
        immediate: true
      },
      'form.extensionExcludeDomains' (newVal) {
        // 当配置变化时，更新表单显示
        // 这个 watcher 确保从浏览器扩展添加的域名能实时显示在界面上
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
      'config.extensionExcludeDomains' (newVal) {
        // Update form when extension exclude domains changes externally
        if (newVal !== undefined && newVal !== this.form.extensionExcludeDomains) {
          this.form.extensionExcludeDomains = newVal
          this.formOriginal.extensionExcludeDomains = newVal
        }
      },
      'config.extensionSkipFileExtensions' (newVal) {
        // Update form when extension skip file extensions changes externally
        if (newVal !== undefined && newVal !== this.form.extensionSkipFileExtensions) {
          // 将逗号分隔格式转换为换行符格式
          this.form.extensionSkipFileExtensions = convertCommaToLine(newVal)
          this.formOriginal.extensionSkipFileExtensions = convertCommaToLine(newVal)
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
      // 使用 ipcRenderer 直接监听从浏览器扩展更新配置的命令
      if (this.$electron && this.$electron.ipcRenderer) {
        this._extensionUpdateHandler = (event, command) => {
          if (command === 'preference:update-from-extension') {
            console.log('[Basic] Received preference:update-from-extension, syncing config...')
            this.syncFormConfig()
          }
        }
        this.$electron.ipcRenderer.on('command', this._extensionUpdateHandler)
      }
    },
    beforeDestroy () {
      window.removeEventListener('resize', this.updateUiScopeSelectCollapse)
      // 移除 ipcRenderer 监听
      if (this.$electron && this.$electron.ipcRenderer && this._extensionUpdateHandler) {
        this.$electron.ipcRenderer.removeListener('command', this._extensionUpdateHandler)
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
      applyFilters (keyword) {
        this.filterCards(keyword, this.activeCategory)
      },
      filterCards (keyword, category) {
        this.$nextTick(() => {
          if (!this.$el) return
          const cards = this.$el.querySelectorAll('.preference-card, .preference-bottom-actions')
          const k = (keyword || '').toLowerCase()
          const activeCategory = category || ''
          let visibleCount = 0
          cards.forEach(card => {
            const rawCategory = `${card.dataset.category || ''}`.trim()
            const categories = rawCategory ? rawCategory.split(/\s+/) : []
            const categoryMatch = !activeCategory || categories.includes(activeCategory)
            if (!categoryMatch) {
              card.style.display = 'none'
              return
            }
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
          this.hasNoResults = visibleCount === 0 && (k !== '' || activeCategory)
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
          dateFilterFrosted: !!this.form.dateFilterFrosted,
          dateFilterFrostedBlur: this.normalizeUiNumber(this.form.dateFilterFrostedBlur, 0, 10, 6),
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
        if (keys.has('dateFilterFrosted')) candidate.dateFilterFrosted = !!data.dateFilterFrosted
        if (keys.has('dateFilterFrostedBlur')) candidate.dateFilterFrostedBlur = this.normalizeUiNumber(data.dateFilterFrostedBlur, 0, 10, 6)
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

        if (key === 'taskDetailDefaultTransparent' || key === 'showProgressBar' || key === 'dateFilterFrosted') {
          return value ? '开启' : '关闭'
        }

        if (key === 'backgroundUiOpacity' || key === 'backgroundImageOpacity') {
          const n = Number(value)
          if (!Number.isFinite(n)) return '--'
          return `${Math.round(n * 100)}%`
        }
        if (key === 'taskDetailFrostedBlur' || key === 'backgroundUiFrostedBlur' || key === 'backgroundImageFrostedBlur' || key === 'dateFilterFrostedBlur') {
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
          dateFilterFrosted: this.$t('preferences.date-filter-frosted'),
          dateFilterFrostedBlur: this.$t('preferences.date-filter-frosted-strength'),
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
      addExtension () {
        const input = this.extensionInput.trim()
        if (!input) return

        // 分割扩展名（支持多种分隔符：逗号、分号、空格）
        const newExtensions = input
          .split(/[,，;；\s]+/)
          .map(ext => ext.trim().toLowerCase().replace(/^\./, '')) // 移除开头的点并转小写
          .filter(ext => ext.length > 0)

        if (newExtensions.length === 0) {
          this.extensionInput = ''
          return
        }

        // 获取现有扩展名
        const existingExtensions = this.extensionTags

        // 合并并去重
        const allExtensions = [...existingExtensions, ...newExtensions]
        const uniqueExtensions = Array.from(new Set(allExtensions))

        // 更新表单（使用换行符分隔）
        this.form.extensionSkipFileExtensions = uniqueExtensions.join('\n')

        // 清空输入框
        this.extensionInput = ''

        // 保存
        this.autoSaveForm()
      },
      removeExtension (ext) {
        // 从列表中移除指定扩展名
        const extensions = this.extensionTags.filter(e => e !== ext)

        // 更新表单（使用换行符分隔）
        this.form.extensionSkipFileExtensions = extensions.join('\n')

        // 保存
        this.autoSaveForm()
      },
      focusExtensionInput () {
        // 点击容器时聚焦到输入框
        this.$nextTick(() => {
          if (this.$refs.extensionInput) {
            this.$refs.extensionInput.focus()
          }
        })
      },
      handleDeleteKey (event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (this.extensionInput === '' && this.extensionTags.length > 0) {
          event.preventDefault()
          const lastExt = this.extensionTags[this.extensionTags.length - 1]
          this.removeExtension(lastExt)
        }
      },
      addDomain () {
        const input = this.domainInput.trim()
        if (!input) return

        // 分割域名（支持多种分隔符：逗号、分号、空格）
        const newDomains = input
          .split(/[,，;；\s]+/)
          .map(domain => domain.trim().toLowerCase())
          .filter(domain => domain.length > 0)

        if (newDomains.length === 0) {
          this.domainInput = ''
          return
        }

        // 获取现有域名
        const existingDomains = this.domainTags

        // 合并并去重
        const allDomains = [...existingDomains, ...newDomains]
        const uniqueDomains = Array.from(new Set(allDomains))

        // 更新表单（使用换行符分隔）
        this.form.extensionExcludeDomains = uniqueDomains.join('\n')

        // 清空输入框
        this.domainInput = ''

        // 保存
        this.autoSaveForm()
      },
      removeDomain (domain) {
        // 从列表中移除指定域名
        const domains = this.domainTags.filter(d => d !== domain)

        // 更新表单（使用换行符分隔）
        this.form.extensionExcludeDomains = domains.join('\n')

        // 保存
        this.autoSaveForm()
      },
      focusDomainInput () {
        // 点击容器时聚焦到输入框
        this.$nextTick(() => {
          if (this.$refs.domainInput) {
            this.$refs.domainInput.focus()
          }
        })
      },
      handleDomainDeleteKey (event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (this.domainInput === '' && this.domainTags.length > 0) {
          event.preventDefault()
          const lastDomain = this.domainTags[this.domainTags.length - 1]
          this.removeDomain(lastDomain)
        }
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
        console.log('[Basic] syncFormConfig called')

        this.$store.dispatch('preference/fetchPreference')
          .then((config) => {
            console.log('[Basic] Fetched config:', config)
            this.form = initForm(config)
            this.formOriginal = cloneDeep(this.form)
            console.log('[Basic] Form updated:', this.form)
          })
      },
      submitForm (formName) {
        const form = this.$refs[formName]
        if (!form) {
          console.error('[Motrix] form ref not found:', formName)
          return false
        }
        form.validate((valid) => {
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
            extensionSkipFileExtensions,
            extensionExcludeDomains,
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

          if (extensionSkipFileExtensions) {
            // 将换行符格式转换为逗号分隔格式
            data.extensionSkipFileExtensions = convertLineToComma(extensionSkipFileExtensions)
          }

          if (extensionExcludeDomains) {
            // 将换行符格式转换为逗号分隔格式
            data.extensionExcludeDomains = convertLineToComma(extensionExcludeDomains)
          }

          if (rpcListenPort === EMPTY_STRING) {
            data.rpcListenPort = this.rpcDefaultPort
          }

          console.log('[Motrix] preference changed data:', data)

          this.$store.dispatch('preference/save', data)
            .then(() => {
              this.$store.dispatch('app/fetchEngineOptions')
              // 不立即调用 syncFormConfig，避免覆盖正在编辑的数据
              // this.syncFormConfig()
              // 只更新 formOriginal，保持 form 不变
              this.formOriginal = cloneDeep(this.form)
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
.extension-tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #fff;
  min-height: 32px;
  cursor: text;
  transition: border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);

  &:hover {
    border-color: #c0c4cc;
  }

  &:focus-within {
    border-color: #5b5bfa;
  }
}

.tags-container {
  display: contents;
}

// 标签进入和离开动画
.tag-fade-enter-active {
  animation: tag-fade-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tag-fade-leave-active {
  animation: tag-fade-out 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.tag-fade-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes tag-fade-in {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes tag-fade-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.8);
  }
}

.theme-dark .extension-tag-input {
  background-color: #373737;
  border-color: #5f5f5f;

  &:hover {
    border-color: #6f6f6f;
  }

  &:focus-within {
    border-color: #5b5bfa;
  }
}

.extension-tag {
  margin: 0 !important;
  flex-shrink: 0;
  background-color: transparent !important;
  border-color: #c0c4cc !important;
  color: #606266 !important;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  display: inline-flex !important;
  align-items: center !important;
  height: 24px !important;
  padding: 0 8px !important;
  line-height: 24px !important;
  box-sizing: border-box !important;

  &:hover {
    background-color: #f5f7fa !important;
    border-color: #909399 !important;
    color: #303133 !important;
  }

  :deep(span) {
    line-height: 24px;
    position: relative;
    top: -2px;
  }

  :deep(.el-tag__content) {
    line-height: 24px !important;
    position: relative;
    top: -2px;
  }

  :deep(.el-icon-close) {
    color: #909399 !important;
    transition: color 0.2s;
    margin-left: 4px !important;
    margin-right: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding: 0 !important;
    width: 14px !important;
    height: 14px !important;
    line-height: 14px !important;
    text-align: center !important;
    border-radius: 50%;
    font-size: 12px !important;
    vertical-align: middle !important;
    display: inline-block !important;
    position: relative !important;
    top: 0 !important;
    transform: translateY(0) !important;

    &:hover {
      background-color: #e4e7ed !important;
      color: #606266 !important;
    }

    &::before {
      display: inline-block;
      vertical-align: middle;
    }
  }
}

.theme-dark .extension-tag {
  border-color: #606266 !important;
  color: #e5e5e5 !important;

  &:hover {
    background-color: #2a2a2a !important;
    border-color: #909399 !important;
    color: #ffffff !important;
  }

  :deep(.el-icon-close) {
    color: #8c8c8c;

    &:hover {
      background-color: #3a3a3a;
      color: #e5e5e5;
    }
  }
}

.extension-input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #606266;
  padding: 2px 4px;
  line-height: 1.5;

  &::placeholder {
    color: #c0c4cc;
  }

  &::selection {
    background-color: rgba(91, 91, 250, 0.3);
    color: inherit;
  }
}

.theme-dark .extension-input {
  color: #e5e5e5;

  &::placeholder {
    color: #8c8c8c;
  }

  &::selection {
    background-color: rgba(91, 91, 250, 0.4);
    color: inherit;
  }
}

.tag-input-container {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-background-color);
  min-height: 60px;
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.background-type-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preference-bottom-actions {
  padding: 0;
  width: 100%;
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
