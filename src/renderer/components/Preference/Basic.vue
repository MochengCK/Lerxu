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
        <div v-if="activeCategory === 'appearance'" class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.theme') }}</h3>
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

        <div v-if="activeCategory === 'appearance'" class="preference-card" data-category="appearance">
          <h3 class="card-title">{{ $t('preferences.ui') }}</h3>
          <el-form-item size="mini">
            <el-col v-if="showHideAppMenuOption" class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.hide-app-menu') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.hide-app-menu-desc') }}</div>
                </div>
                <el-switch v-model="form.hideAppMenu" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-hide-window') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-hide-window-desc') }}</div>
                </div>
                <el-switch v-model="form.autoHideWindow" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="isMac" class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.tray-speedometer') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.tray-speedometer-desc') }}</div>
                </div>
                <el-switch v-model="form.traySpeedometer" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.show-progress-bar') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.show-progress-bar-desc') }}</div>
                </div>
                <el-switch v-model="form.showProgressBar" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.date-filter-frosted') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.date-filter-frosted-desc') }}</div>
                </div>
                <el-switch v-model="form.dateFilterFrosted" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="form.dateFilterFrosted" class="form-item-sub-sub" :span="24">
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
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.task-detail-default-transparent') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.task-detail-default-transparent-desc') }}</div>
                </div>
                <el-switch v-model="form.taskDetailDefaultTransparent" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="form.taskDetailDefaultTransparent" class="form-item-sub-sub" :span="24">
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
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.show-task-type-badge') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.show-task-type-badge-tips') }}</div>
                </div>
                <el-switch v-model="form.showTaskTypeBadge" @change="autoSaveForm" />
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 背景设置卡片 -->
        <div v-if="activeCategory === 'appearance'" class="preference-card" data-category="appearance">
          <div class="card-title background-type-nav">
            <div class="background-type-nav__left">
              <mo-segmented-slider
                ref="backgroundTypeSegmented"
                :value="form.backgroundType"
                :options="backgroundTypeOptions"
                size="mini"
                @change="onBackgroundTypeChange"
              />
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
        <div v-if="isMac && activeCategory === 'basic'" class="preference-card" data-category="basic">
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
        <div v-if="activeCategory === 'basic'" class="preference-card" data-category="basic">
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
                :label="item.value === 'auto' ? `${item.label} (${systemLocaleName})` : item.label"
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
        <div v-if="activeCategory === 'basic'" class="preference-card" data-category="basic">
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
        <div v-if="activeCategory === 'basic'" class="preference-card" data-category="basic">
          <h3 class="card-title">{{ $t('preferences.startup') }}</h3>
          <el-form-item size="mini">
            <el-col
              class="form-item-sub"
              :span="24"
              v-if="!isLinux"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.open-at-login') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.open-at-login-desc') }}</div>
                </div>
                <el-switch v-model="form.openAtLogin" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.keep-window-state') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.keep-window-state-desc') }}</div>
                </div>
                <el-switch v-model="form.keepWindowState" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-resume-all') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-resume-all-desc') }}</div>
                </div>
                <el-switch v-model="form.resumeAllWhenAppLaunched" @change="autoSaveForm" />
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 扩展卡片 -->
        <div v-if="activeCategory === 'basic'" class="preference-card" data-category="basic">
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
              <div class="form-item-sub" style="margin-top: 12px;">
<div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.extension-intercept-all-downloads') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.extension-intercept-all-downloads-desc') }}</div>
                </div>
                <el-switch v-model="form.extensionInterceptAllDownloads" @change="autoSaveForm" />
                </div>
              </div>
              <div class="form-item-sub" style="margin-top: 4px;">
<div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.extension-silent-download') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.extension-silent-download-desc') }}</div>
                </div>
                <el-switch v-model="form.extensionSilentDownload" @change="autoSaveForm" />
                </div>
              </div>
              <div class="form-item-sub" style="margin-top: 4px;">
<div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.extension-shift-toggle-enabled') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.extension-shift-toggle-enabled-desc') }}</div>
                </div>
                <el-switch v-model="form.extensionShiftToggleEnabled" @change="autoSaveForm" />
                </div>
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
        <div v-if="activeCategory === 'transfer'" class="preference-card" data-category="transfer">
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
        <div v-if="activeCategory === 'transfer'" class="preference-card" data-category="transfer">
          <h3 class="card-title">{{ $t('preferences.speed-limit') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub speed-limit-row" :span="24">
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
            <el-col class="form-item-sub speed-limit-row" :span="24">
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
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-options') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.bt-save-metadata') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.bt-save-metadata-desc') }}</div>
                </div>
                <el-switch v-model="form.btSaveMetadata" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.bt-auto-download-content') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.bt-auto-download-content-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.btAutoDownloadContent"
                  @change="autoSaveForm"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="bt-encryption-row">
                <mo-segmented-slider
                  ref="btEncryptionSegmented"
                  :value="form.btEncryptionMode"
                  :options="btEncryptionOptions"
                  size="mini"
                  @change="onBtEncryptionModeChange"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="settings-divider" style="margin: 8px 0;"></div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
                {{ $t('preferences.bt-ip-ban-list') }}
              </div>
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
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-seeding-settings') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.keep-seeding') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.keep-seeding-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.keepSeeding"
                  @change="onKeepSeedingChange"
                />
              </div>
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

        <!-- BT Tracker设置卡片 -->
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-tracker') }}</h3>
          <el-form-item size="mini">
            <div class="form-item-sub bt-tracker">
              <el-row :gutter="4">
                <el-col :span="24">
                  <div class="tracker-row" style="display:flex; align-items:stretch;">
                    <div class="tracker-left">
                      <el-tooltip
                        class="item"
                        effect="dark"
                        :content="isAllTrackerSourcesSelected ? $t('preferences.deselect-all-tracker-sources') : $t('preferences.select-all-tracker-sources')"
                        placement="bottom"
                      >
                        <el-button
                          size="mini"
                          @click="toggleAllTrackerSources"
                          class="sync-tracker-btn"
                        >
                          <mo-icon :name="isAllTrackerSourcesSelected ? 'deselect-all' : 'select-all'" width="12" height="12" />
                        </el-button>
                      </el-tooltip>
                    </div>
                    <div class="track-source" style="flex:1;">
                      <el-select
                        ref="trackerSelectRef"
                        class="select-track-source"
                        v-model="form.trackerSource"
                        allow-create
                        filterable
                        multiple
                        collapse-tags
                        popper-class="tracker-source-popper"
                        style="width:100%;"
                        @change="onTrackerSourceChange"
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
                            <span style="float: right; margin-right: 24px; color: var(--lc-color-primary);" v-if="item.cdn">
                              CDN
                            </span>
                          </el-option>
                        </el-option-group>
                      </el-select>
                    </div>
                    <div class="tracker-right sync-tracker">
                      <el-tooltip
                        class="item"
                        effect="dark"
                        :content="$t('preferences.sync-tracker-tips')"
                        placement="bottom"
                      >
                        <el-button
                          size="mini"
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
                      <div class="tracker-source-popup-wrapper">
                        <el-tooltip
                          class="item"
                          effect="dark"
                          :content="$t('preferences.add-source')"
                          placement="bottom"
                          :disabled="trackerSourceConfigVisible"
                        >
                          <el-button
                            size="mini"
                            @click="openTrackerSourceConfigDialog"
                            class="sync-tracker-btn"
                          >
                            <mo-icon name="link" width="12" height="12" />
                          </el-button>
                        </el-tooltip>
                        <transition name="popup-scale">
                        <div
                          class="tracker-source-popup"
                          v-if="trackerSourceConfigVisible"
                          @click.stop
                        >
                          <div class="tracker-source-popup__header">
                            <span>{{ $t('preferences.add-source') }}</span>
                          </div>
                          <div class="tracker-source-popup__body">
                            <el-input
                              v-model="trackerSourceInput"
                              :placeholder="$t('preferences.tracker-source-input-placeholder')"
                              clearable
                              size="small"
                              @keydown.enter.native="addTrackerSourceFromInput"
                            >
                            </el-input>
                          </div>
                          <div class="tracker-source-popup__footer">
                            <el-button size="mini" type="primary" @click="addTrackerSourceFromInput">{{ $t('app.submit') }}</el-button>
                          </div>
                        </div>
                      </transition>
                      </div>
                    </div>
                  </div>
                </el-col>
              </el-row>
              <el-input
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 10 }"
                auto-complete="off"
                :placeholder="`${$t('preferences.bt-tracker-input-tips')}`"
                v-model="form.btTracker">
              </el-input>
              <div class="el-form-item__info tracker-origins-info" style="margin-top: 8px;">
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
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-sync-tracker') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-sync-tracker-desc') }}</div>
                </div>
                <el-switch v-model="form.autoSyncTracker" />
              </div>
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

<!-- 传输协议卡片 -->
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-transport-protocol') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-utp') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-utp-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enableUtp"
                  @change="(val) => onNatToggleChange('enableUtp', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-peer-exchange') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-peer-exchange-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enablePeerExchange"
                  @change="(val) => onNatToggleChange('enablePeerExchange', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-lpd') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-lpd-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.btEnableLpd"
                  @change="(val) => onNatToggleChange('btEnableLpd', val)"
                />
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 网络发现卡片 -->
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-network-discovery') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-dht') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-dht-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enableDht"
                  @change="(val) => onNatToggleChange('enableDht', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-dht6') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-dht6-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enableDht6"
                  @change="(val) => onNatToggleChange('enableDht6', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-upnp') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-upnp-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enableUpnp"
                  @change="(val) => onNatToggleChange('enableUpnp', val)"
                />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-nat-pmp') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.enable-nat-pmp-desc') }}</div>
                </div>
                <el-switch
                  v-model="form.enableNatPmp"
                  @change="(val) => onNatToggleChange('enableNatPmp', val)"
                />
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 监听端口卡片 -->
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-port-settings') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
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
            <el-col class="form-item-sub" :span="24" style="margin-top: 8px;">
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
          </el-form-item>
        </div>

        <!-- 连接与缓存卡片 -->
        <div v-if="activeCategory === 'bt'" class="preference-card" data-category="bt">
          <h3 class="card-title">{{ $t('preferences.bt-connections') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.bt-max-peers') }}
              <el-input
                :maxlength="5"
                v-model="form.btMaxPeers"
                @change="autoSaveForm"
              />
            </el-col>
            <el-col class="form-item-sub" :span="24" style="margin-top: 8px;">
              {{ $t('preferences.disk-cache') }}
              <el-input
                :maxlength="16"
                v-model="form.diskCache"
                @change="autoSaveForm"
              />
            </el-col>
          </el-form-item>
        </div>

<!-- ED2K设置卡片 -->
        <div v-if="activeCategory === 'ed2k'" class="preference-card" data-category="ed2k">
          <h3 class="card-title">{{ $t('preferences.ed2k-options') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.ed2k-listen-port') }}
              <el-input-number
                v-model="form.ed2kListenPort"
                @change="autoSaveForm"
                controls-position="right"
                :min="1024"
                :max="65535"
                :step="1"
                :label="$t('preferences.ed2k-listen-port')">
              </el-input-number>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.ed2k-max-connections') }}
              <el-input-number
                v-model="form.ed2kMaxConnections"
                @change="autoSaveForm"
                controls-position="right"
                :min="1"
                :max="1000"
                :step="1"
                :label="$t('preferences.ed2k-max-connections')">
              </el-input-number>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.ed2k-connection-timeout') }}
              <el-input-number
                v-model="form.ed2kConnectionTimeout"
                @change="autoSaveForm"
                controls-position="right"
                :min="5"
                :max="300"
                :step="5"
                :label="$t('preferences.ed2k-connection-timeout')">
              </el-input-number>
              <span style="margin-left: 8px;">{{ $t('preferences.ed2k-seconds') }}</span>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.ed2k-max-sources') }}
              <el-input-number
                v-model="form.ed2kMaxSourcesPerFile"
                @change="autoSaveForm"
                controls-position="right"
                :min="1"
                :max="500"
                :step="1"
                :label="$t('preferences.ed2k-max-sources')">
              </el-input-number>
            </el-col>
          </el-form-item>
        </div>

        <div v-if="activeCategory === 'ed2k'" class="preference-card" data-category="ed2k">
          <h3 class="card-title">{{ $t('preferences.ed2k-source-discovery') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="el-form-item__info" style="margin-bottom: 8px;">
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.ed2k-server-source') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.ed2k-server-source-tips') }}</div>
                </div>
                <el-switch v-model="form.ed2kServerSourceEnabled" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.ed2k-source-exchange') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.ed2k-source-exchange-tips') }}</div>
                </div>
                <el-switch v-model="form.ed2kSourceExchangeEnabled" @change="autoSaveForm" />
              </div>
              <div v-if="form.ed2kSourceExchangeEnabled" style="margin-left: 24px; margin-top: 4px;">
                {{ $t('preferences.ed2k-source-exchange-interval') }}
                <el-input-number
                  v-model="form.ed2kSourceExchangeInterval"
                  @change="autoSaveForm"
                  controls-position="right"
                  :min="30"
                  :max="3600"
                  :step="30"
                  size="mini"
                  :label="$t('preferences.ed2k-source-exchange-interval')">
                </el-input-number>
                <span style="margin-left: 4px;">{{ $t('preferences.ed2k-seconds') }}</span>
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.ed2k-kad') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.ed2k-kad-tips') }}</div>
                </div>
                <el-switch v-model="form.ed2kKadEnabled" @change="autoSaveForm" />
              </div>
              <div v-if="form.ed2kKadEnabled" style="margin-left: 24px; margin-top: 8px;">
                <div style="margin-bottom: 4px;">
                  {{ $t('preferences.ed2k-kad-bootstrap-nodes') }}
                </div>
                <el-input
                  v-model="form.ed2kKadBootstrapNodes"
                  size="mini"
                  :placeholder="$t('preferences.ed2k-kad-bootstrap-nodes-placeholder')"
                  @change="autoSaveForm">
                </el-input>
                <div class="el-form-item__info" style="margin-top: 4px;">
                  {{ $t('preferences.ed2k-kad-bootstrap-nodes-tips') }}
                </div>
              </div>
            </el-col>
          </el-form-item>
        </div>

        <div v-if="activeCategory === 'ed2k'" class="preference-card" data-category="ed2k">
          <h3 class="card-title">{{ $t('preferences.ed2k-server-subscription') }}</h3>
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="el-form-item__info" style="margin-bottom: 8px;">
                {{ $t('preferences.ed2k-server-subscription-tips') }}
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="extension-tag-input" @click="focusEd2kSubscriptionInput">
                <transition-group name="tag-fade" tag="div" class="tags-container">
                  <el-tag
                    v-for="url in form.ed2kServerSource"
                    :key="url"
                    closable
                    size="small"
                    @close="removeEd2kSubscription(url)"
                    class="extension-tag">
                    {{ url }}
                  </el-tag>
                </transition-group>
                <input
                  ref="ed2kSubscriptionInput"
                  v-model="ed2kSubscriptionInput"
                  type="text"
                  class="extension-input"
                  :placeholder="form.ed2kServerSource.length === 0 ? $t('preferences.ed2k-server-source-placeholder') : ''"
                  @keydown.enter="addEd2kSubscription"
                  @keydown.delete="handleEd2kSubscriptionDeleteKey"
                  @blur="addEd2kSubscription"
                />
              </div>
              <div v-if="ed2kPresetSubscriptions.length > 0" class="ed2k-preset-sources">
                <span class="ed2k-preset-label">{{ $t('preferences.ed2k-preset-sources') }}:</span>
                <el-button
                  v-for="item in ed2kPresetSubscriptions"
                  :key="item.value"
                  size="mini"
                  type="text"
                  class="ed2k-preset-btn"
                  @click="addPresetSubscription(item.value)"
                >
                  + {{ item.label }}
                </el-button>
              </div>
              <div style="margin-top: 8px;">
                <el-button
                  size="mini"
                  icon="el-icon-refresh"
                  :loading="ed2kSyncing"
                  :disabled="form.ed2kServerSource.length === 0"
                  @click="syncEd2kServersFromSource"
                >
                  {{ $t('preferences.ed2k-sync-now') }}
                </el-button>
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.ed2k-auto-sync-server') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.ed2k-auto-sync-server-desc') }}</div>
                </div>
                <el-switch v-model="form.ed2kAutoSyncServer" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="form.ed2kAutoSyncServer" class="form-item-sub-sub" :span="24">
              <div class="sub-row-reverse">
                <el-time-picker
                  v-model="form.ed2kAutoSyncServerTime"
                  size="mini"
                  format="HH:mm"
                  value-format="HH:mm"
                  :placeholder="$t('preferences.ed2k-auto-sync-server-time')"
                  style="width: 120px;"
                  @change="autoSaveForm"
                />
                <el-input-number
                  v-model="form.ed2kAutoSyncServerInterval"
                  size="mini"
                  :min="1"
                  :max="168"
                  :step="1"
                  :label="$t('preferences.ed2k-auto-sync-server-interval')"
                  style="width: 110px; margin-right: 8px;"
                  @change="autoSaveForm"
                />
                <span class="sub-row-label">{{ $t('preferences.ed2k-auto-sync-server-interval') }}</span>
              </div>
              <div v-if="form.ed2kLastSyncServerTime > 0" class="el-form-item__info" style="margin-top: 4px;">
                {{ $t('preferences.ed2k-last-sync-server-time') }}: {{ formatSyncTime(form.ed2kLastSyncServerTime) }}
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              {{ $t('preferences.ed2k-default-servers') }}
              <div class="extension-tag-input" @click="focusEd2kServerInput">
                <transition-group name="tag-fade" tag="div" class="tags-container">
                  <el-tag
                    v-for="server in ed2kServerTags"
                    :key="server"
                    closable
                    size="small"
                    @close="removeEd2kServer(server)"
                    class="extension-tag">
                    {{ server }}
                  </el-tag>
                </transition-group>
                <input
                  ref="ed2kServerInput"
                  v-model="ed2kServerInput"
                  type="text"
                  class="extension-input"
                  :placeholder="ed2kServerTags.length === 0 ? $t('preferences.ed2k-default-servers-placeholder') : ''"
                  @keydown.enter="addEd2kServer"
                  @keydown.delete="handleEd2kServerDeleteKey"
                  @blur="addEd2kServer"
                />
              </div>
              <div class="el-form-item__info" style="margin-top: 8px;">
                {{ $t('preferences.ed2k-default-servers-tips') }}
              </div>
            </el-col>
          </el-form-item>
        </div>

        <!-- 任务行为卡片 -->
        <div v-if="activeCategory === 'task'" class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.task-behavior') }}</h3>
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
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.continue') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.continue-desc') }}</div>
                </div>
                <el-switch v-model="form.continue" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.no-confirm-before-delete-task') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.no-confirm-before-delete-task-desc') }}</div>
                </div>
                <el-switch v-model="form.noConfirmBeforeDeleteTask" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-purge-record') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-purge-record-desc') }}</div>
                </div>
                <el-switch v-model="form.autoPurgeRecord" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-open-task-progress-window') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-open-task-progress-window-desc') }}</div>
                </div>
                <el-switch v-model="form.autoOpenTaskProgressWindow" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="form.autoOpenTaskProgressWindow" class="form-item-sub-sub" :span="24">
              <el-radio-group v-model="form.taskProgressWindowMode" @change="autoSaveForm">
                <el-radio label="first">{{ $t('preferences.task-progress-window-first-only') }}</el-radio>
                <el-radio label="all">{{ $t('preferences.task-progress-window-all') }}</el-radio>
              </el-radio-group>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.new-task-show-downloading') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.new-task-show-downloading-desc') }}</div>
                </div>
                <el-switch v-model="form.newTaskShowDownloading" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col v-if="form.newTaskShowDownloading" class="form-item-sub-sub" :span="24">
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
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.show-task-completed-window') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.show-task-completed-window-desc') }}</div>
                </div>
                <el-switch v-model="form.showTaskCompletedWindow" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.task-completed-notify') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.task-completed-notify-desc') }}</div>
                </div>
                <el-switch v-model="form.taskNotification" @change="autoSaveForm" />
              </div>
            </el-col>
<el-col v-if="form.taskNotification" class="form-item-sub-sub" :span="24">
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
        <div v-if="activeCategory === 'file'" class="preference-card" data-category="file">
          <h3 class="card-title">{{ $t('preferences.file-handling') }}</h3>
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
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.set-file-mtime-on-complete') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.set-file-mtime-on-complete-desc') }}</div>
                </div>
                <el-switch v-model="form.setFileMtimeOnComplete" @change="autoSaveForm" />
              </div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="settings-divider" style="margin: 8px 0;"></div>
            </el-col>
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.auto-categorize-files') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.auto-categorize-files-tips') }}</div>
                </div>
                <el-switch v-model="form.autoCategorizeFiles" @change="autoSaveForm" />
              </div>
              <div style="margin-top: 8px;">
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
        <div v-if="activeCategory === 'file'" class="preference-card" data-category="file">
          <h3 class="card-title">{{ $t('preferences.security') }}</h3>
          <div class="card-content">
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.enable-security-scan') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.security-scan-tips') }}</div>
                </div>
                <el-switch v-model="form.enableSecurityScan" @change="autoSaveForm" />
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
        <div v-if="activeCategory === 'task'" class="preference-card" data-category="task">
          <h3 class="card-title">{{ $t('preferences.clipboard-settings') }}</h3>
          <div class="card-content">
          <el-form-item size="mini">
            <el-col class="form-item-sub" :span="24">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.clipboard-auto-paste') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.clipboard-auto-paste-desc') }}</div>
                </div>
<el-switch v-model="form.clipboardAutoPaste" @change="autoSaveForm" />
</div>
</el-col>
            <el-col class="form-item-sub" :span="24" v-if="form.clipboardAutoPaste">
              <div class="form-item-sub-sub">
<div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ $t('preferences.clipboard-auto-open-add-task') }}</span>
                  <div class="toggle-desc">{{ $t('preferences.clipboard-auto-open-add-task-desc') }}</div>
                </div>
<el-switch v-model="form.clipboardAutoOpenAddTask" @change="autoSaveForm" />
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
  import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'
  import { availableLanguages, getLanguage, getSystemLocaleName } from '@shared/locales'
  import { getLocaleManager } from '@/components/Locale'
  import {
    calcFormLabelWidth,
    changedConfig,
    checkIsNeedRestart,
    convertLineToComma,
    convertCommaToLine,
    diffConfig,
    extractSpeedUnit,
    generateRandomInt
  } from '@shared/utils'
  import {
    APP_HTTP_PORT,
    APP_RUN_MODE,
    BUILTIN_ED2K_SERVERS,
    ED2K_SERVER_SOURCE_OPTIONS,
    EMPTY_STRING,
    ENGINE_MAX_CONCURRENT_DOWNLOADS,
    TRACKER_SOURCE_OPTIONS
  } from '@shared/constants'
  import { reduceTrackerString } from '@shared/utils/tracker'
  import axios from 'axios'
  import keymap from '@shared/keymap'
  import '@/components/Icons/dice'
  import '@/components/Icons/sync'
  import '@/components/Icons/select-all'
  import '@/components/Icons/deselect-all'

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

  const normalizeBtEncryptionMode = (mode, legacyForceEncryption) => {
    if (mode === 'none' || mode === 'adaptive' || mode === 'force') {
      return mode
    }
    if (legacyForceEncryption === true || legacyForceEncryption === 'true') {
      return 'force'
    }
    return 'adaptive'
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
      btMaxPeers,
      dhtListenPort,
      diskCache,
      enableDht,
      enableDht6,
      btEnableLpd,
      enableNatPmp,
      enablePeerExchange,
      enableUpnp,
      enableUtp,
      listenPort,
      autoPurgeRecord,
      btEncryptionMode,
      btIpBanList,
      btSaveMetadata,
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
      autoHideAside,
      autoHideTaskPlan,
      autoOpenTaskProgressWindow,
      taskProgressWindowMode,
      clipboardAutoPaste,
      clipboardAutoOpenAddTask,
      enableSecurityScan,
      securityScanTool,
      customSecurityScanPath,
      showTaskTypeBadge,
      ed2kListenPort,
      ed2kMaxConnections,
      ed2kConnectionTimeout,
      ed2kMaxSourcesPerFile,
      ed2kDefaultServers,
      ed2kServerSourceEnabled,
      ed2kSourceExchangeEnabled,
      ed2kSourceExchangeInterval,
      ed2kKadEnabled,
      ed2kKadBootstrapNodes,
      ed2kServerSource,
      ed2kAutoSyncServer,
      ed2kAutoSyncServerInterval,
      ed2kAutoSyncServerTime,
      ed2kLastSyncServerTime,
      autoSyncTracker,
      autoSyncTrackerInterval,
      autoSyncTrackerTime,
      lastSyncTrackerTime,
      trackerSource,
      trackerSourceDiscovered,
      trackerSourceOrigins,
      trackerSourceMap,
      btTracker
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
      btEncryptionMode: normalizeBtEncryptionMode(btEncryptionMode, config.btForceEncryption),
      btMaxPeers: btMaxPeers !== undefined ? btMaxPeers : '128',
      dhtListenPort,
      diskCache: diskCache || '128M',
      enableDht: enableDht === true,
      enableDht6: enableDht6 === true,
      btEnableLpd: btEnableLpd === true,
      enableNatPmp: enableNatPmp === true,
      enablePeerExchange: enablePeerExchange === true,
      enableUpnp: enableUpnp === true,
      enableUtp: enableUtp === true,
      listenPort,
      btIpBanList: normalizeBtIpBanList(btIpBanList),
      btSaveMetadata,
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
      autoHideAside: autoHideAside === undefined ? false : !!autoHideAside,
      autoHideTaskPlan: autoHideTaskPlan === undefined ? false : !!autoHideTaskPlan,
      autoOpenTaskProgressWindow: autoOpenTaskProgressWindow === undefined ? true : !!autoOpenTaskProgressWindow,
      taskProgressWindowMode: taskProgressWindowMode || 'first',
      clipboardAutoPaste: clipboardAutoPaste === undefined ? true : !!clipboardAutoPaste,
      clipboardAutoOpenAddTask: clipboardAutoOpenAddTask === undefined ? false : !!clipboardAutoOpenAddTask,
      enableSecurityScan: enableSecurityScan || false,
      securityScanTool: securityScanTool || 'system',
      customSecurityScanPath: customSecurityScanPath || '',
      showTaskTypeBadge: showTaskTypeBadge === undefined ? true : !!showTaskTypeBadge,
      ed2kListenPort: ed2kListenPort || 4662,
      ed2kMaxConnections: ed2kMaxConnections || 200,
      ed2kConnectionTimeout: ed2kConnectionTimeout || 30,
      ed2kMaxSourcesPerFile: ed2kMaxSourcesPerFile || 100,
      ed2kDefaultServers: ed2kDefaultServers || '',
      ed2kServerSourceEnabled: ed2kServerSourceEnabled === undefined ? true : !!ed2kServerSourceEnabled,
      ed2kSourceExchangeEnabled: ed2kSourceExchangeEnabled === undefined ? true : !!ed2kSourceExchangeEnabled,
      ed2kSourceExchangeInterval: ed2kSourceExchangeInterval || 300,
      ed2kKadEnabled: ed2kKadEnabled === undefined ? false : !!ed2kKadEnabled,
      ed2kKadBootstrapNodes: ed2kKadBootstrapNodes || '',
      ed2kServerSource: Array.isArray(ed2kServerSource) ? ed2kServerSource : [],
      ed2kAutoSyncServer: ed2kAutoSyncServer === undefined ? false : !!ed2kAutoSyncServer,
      ed2kAutoSyncServerInterval: ed2kAutoSyncServerInterval || 24,
      ed2kAutoSyncServerTime: ed2kAutoSyncServerTime || '00:00',
      ed2kLastSyncServerTime: ed2kLastSyncServerTime || 0,
      autoSyncTracker,
      autoSyncTrackerInterval: autoSyncTrackerInterval || config['auto-sync-tracker-interval'] || 12,
      autoSyncTrackerTime: autoSyncTrackerTime !== undefined ? autoSyncTrackerTime : (config['auto-sync-tracker-time'] !== undefined ? config['auto-sync-tracker-time'] : '00:00'),
      btTracker: convertCommaToLine(btTracker),
      lastSyncTrackerTime,
      trackerSource,
      trackerSourceDiscovered: Array.isArray(trackerSourceDiscovered) ? [...trackerSourceDiscovered] : (config['tracker-source-discovered'] || []),
      trackerSourceOrigins: Array.isArray(trackerSourceOrigins) ? [...trackerSourceOrigins] : (config['tracker-source-origins'] || []),
      trackerSourceMap: typeof trackerSourceMap === 'object' && trackerSourceMap ? { ...trackerSourceMap } : (config['tracker-source-map'] || {})
    }
    return result
  }

  export default {
    name: 'mo-preference-basic',
    components: {
      [HistoryDirectory.name]: HistoryDirectory,
      [SelectDirectory.name]: SelectDirectory,
      [ThemeSwitcher.name]: ThemeSwitcher,
      [SegmentedSlider.name]: SegmentedSlider
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
        domainInput: '',
        ed2kServersText: '',
        ed2kServerInput: '',
        ed2kSubscriptionInput: '',
        ed2kUpdatingForm: false,
        ed2kSyncing: false,
        trackerSourceOptions: [],
        trackerSyncing: false,
        trackerSourceConfigVisible: false,
        trackerSourceInput: ''
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      isMac: () => is.macOS(),
      isMas: () => is.mas(),
      isLinux () { return is.linux() },
      btEncryptionOptions () {
        return [
          { value: 'none', label: this.$t('preferences.bt-encryption-none') },
          { value: 'adaptive', label: this.$t('preferences.bt-encryption-adaptive') },
          { value: 'force', label: this.$t('preferences.bt-encryption-force') }
        ]
      },
      backgroundTypeOptions () {
        return [
          { value: 'color', label: this.$t('preferences.background-type-color') },
          { value: 'image', label: this.$t('preferences.background-type-image') }
        ]
      },
      systemLocaleName () {
        return getSystemLocaleName()
      },
      activeCategory () {
        return this.category || 'basic'
      },
      title () {
        const subnav = this.subnavs.find(item => item.key === this.activeCategory)
        return subnav ? subnav.title : this.$t('preferences.basic')
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
      ed2kServerTags () {
        const value = this.ed2kServersText || ''
        if (!value.trim()) return BUILTIN_ED2K_SERVERS

        // 支持换行符和逗号分隔
        return value
          .split(/[\n,]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
      },
      ed2kPresetSubscriptions () {
        const current = Array.isArray(this.form.ed2kServerSource) ? this.form.ed2kServerSource : []
        const result = []
        ED2K_SERVER_SOURCE_OPTIONS.forEach(group => {
          group.options.forEach(opt => {
            if (!current.includes(opt.value)) {
              result.push({ value: opt.value, label: group.label })
            }
          })
        })
        return result
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
        return `ws://127.0.0.1:${APP_HTTP_PORT}/ws`
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
          // 切换分类时立即同步过滤，不走 120ms 防抖。
          // 否则组件重建瞬间所有卡片都可见，appearance 卡片排在前 4 个，
          // 会闪烁显示外观分类内容，120ms 后才被隐藏。
          this.filterCards(this.searchKeyword, this.activeCategory)
        },
        immediate: true
      },
      'form.extensionExcludeDomains' (newVal) {
        // 当配置变化时，更新表单显示
        // 这个 watcher 确保从浏览器扩展添加的域名能实时显示在界面上
      },
      'form.ed2kDefaultServers' (val) {
        if (this.ed2kUpdatingForm) return
        if (val) {
          this.ed2kServersText = val
        } else {
          // 没有用户自定义服务器时，使用内置服务器列表
          this.ed2kServersText = BUILTIN_ED2K_SERVERS.join('\n')
        }
      },
      form: {
        handler () {
          // autoSaveForm already debounces and checks diffConfig internally,
          // so we avoid a redundant synchronous diffConfig pass here.
          this.autoSaveForm()
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
      },
      trackerSourceConfigVisible (visible) {
        if (!visible) {
          document.removeEventListener('mousedown', this.handleTrackerSourceOutsideClick)
        }
      }
    },
    mounted () {
      this.rebuildTrackerSourceOptions()
      window.addEventListener('resize', this.updateUiScopeSelectCollapse)
      this.updateUiScopeSelectCollapse()
      // 立即同步过滤卡片，避免组件首次挂载时所有分类卡片都可见
      // 导致 appearance 卡片（排在前 4 个）闪烁显示。
      this.filterCards(this.searchKeyword, this.activeCategory)
      // 使用 ipcRenderer 直接监听从浏览器扩展更新配置的命令
      if (this.form.ed2kDefaultServers) {
        this.ed2kServersText = this.form.ed2kDefaultServers
      } else {
        this.ed2kServersText = BUILTIN_ED2K_SERVERS.join('\n')
      }
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
      document.removeEventListener('mousedown', this.handleTrackerSourceOutsideClick)
      window.removeEventListener('resize', this.updateUiScopeSelectCollapse)
      if (this._filterTimer) {
        clearTimeout(this._filterTimer)
      }
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
        this.saveTimeout = null
      }
      if (this.originHoldTimers) {
        Object.keys(this.originHoldTimers).forEach((key) => {
          clearTimeout(this.originHoldTimers[key])
        })
        this.originHoldTimers = {}
      }
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
      onBackgroundTypeChange (value) {
        if (this.form.backgroundType !== value) {
          this.form.backgroundType = value
          this.autoSaveForm()
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
          const cards = this.$el.querySelectorAll('.preference-card, .preference-bottom-actions')
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
          return this.$t('preferences.multi-select-task')
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
        }, 300)
      },
      // BT 协议开关/选项的专用保存：点击立即保存、失败立即回弹并弹错误
      // 提示。任何异常都必须可见，不能静默失败（否则用户看到的就是
      // "点了没反应"）。
      // 生效方式（引擎已支持 changeGlobalOption 热更新）：
      // - enable-utp：立即生效（出站/入站实时响应）
      // - enable-dht / enable-dht6：关闭立即生效；重新开启在下一个
      //   BT 任务创建时恢复（DHTSetup）
      // - enable-peer-exchange / enable-lpd：立即生效
      // - enable-upnp / enable-nat-pmp：端口映射在引擎启动时执行，
      //   下次引擎启动生效
      onNatToggleChange (key, value) {
        const data = {}
        data[key] = value
        const original = this.formOriginal[key]
        this.$store.dispatch('preference/save', data)
          .then(() => {
            this.$store.dispatch('app/fetchEngineOptions')
            this.formOriginal[key] = value
            const restartOnNextBootKeys = ['enableUpnp', 'enableNatPmp']
            if (restartOnNextBootKeys.includes(key)) {
              this.$msg.info(this.$t('preferences.restart-to-apply'))
            }
          })
          .catch(() => {
            // 保存失败：回弹开关，让 UI 与实际配置保持一致，并明确报错
            this.form[key] = original
            this.$msg.error(this.$t('preferences.save-fail-message'))
          })
      },
      onBtPortDiceClick () {
        const port = generateRandomInt(20000, 24999)
        this.form.listenPort = port
      },
      onDhtPortDiceClick () {
        const port = generateRandomInt(25000, 29999)
        this.form.dhtListenPort = port
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
      onBtEncryptionModeChange (mode) {
        const modeConfig = {
          none: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'plain' },
          adaptive: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'arc4' },
          force: { 'bt-require-crypto': true, 'bt-min-crypto-level': 'arc4' }
        }
        const cfg = modeConfig[mode] || modeConfig.adaptive
        this.form.btEncryptionMode = mode
        this.form.btRequireCrypto = cfg['bt-require-crypto']
        this.form.btMinCryptoLevel = cfg['bt-min-crypto-level']
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
      addEd2kServer () {
        const input = this.ed2kServerInput.trim()
        if (!input) return

        // 分割输入（支持逗号、分号、空格等分隔符）
        const newServers = input
          .split(/[,，;；\s]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)

        if (newServers.length === 0) {
          this.ed2kServerInput = ''
          return
        }

        // 确保每个服务器都有端口，没有则添加默认端口 4661
        const normalizedServers = newServers.map(s => {
          if (!s.includes(':')) {
            return `${s}:4661`
          }
          return s
        })

        // 获取现有服务器列表
        const existingServers = this.ed2kServerTags

        // 合并并去重
        const allServers = [...existingServers, ...normalizedServers]
        const uniqueServers = Array.from(new Set(allServers))
        const serverStr = uniqueServers.join('\n')

        // 更新显示
        this.ed2kServersText = serverStr

        // 同步到表单，以便 autoSaveForm 能检测到变更
        this.ed2kUpdatingForm = true
        this.form.ed2kDefaultServers = convertLineToComma(serverStr)
        this.ed2kUpdatingForm = false

        // 清空输入框
        this.ed2kServerInput = ''

        // 保存
        this.autoSaveForm()
      },
      removeEd2kServer (server) {
        // 从列表中移除指定服务器
        const servers = this.ed2kServerTags.filter(s => s !== server)
        const serverStr = servers.join('\n')

        // 更新显示
        this.ed2kServersText = serverStr

        // 同步到表单，以便 autoSaveForm 能检测到变更
        this.ed2kUpdatingForm = true
        this.form.ed2kDefaultServers = convertLineToComma(serverStr)
        this.ed2kUpdatingForm = false

        // 保存
        this.autoSaveForm()
      },
      focusEd2kServerInput () {
        // 点击容器时聚焦到输入框
        this.$nextTick(() => {
          if (this.$refs.ed2kServerInput) {
            this.$refs.ed2kServerInput.focus()
          }
        })
      },
      handleEd2kServerDeleteKey (event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (this.ed2kServerInput === '' && this.ed2kServerTags.length > 0) {
          event.preventDefault()
          const lastServer = this.ed2kServerTags[this.ed2kServerTags.length - 1]
          this.removeEd2kServer(lastServer)
        }
      },
      addEd2kSubscription () {
        const input = this.ed2kSubscriptionInput.trim()
        if (!input) return

        const current = Array.isArray(this.form.ed2kServerSource) ? this.form.ed2kServerSource : []
        if (!current.includes(input)) {
          this.form.ed2kServerSource = [...current, input]
          this.autoSaveForm()
        }
        this.ed2kSubscriptionInput = ''
      },
      addPresetSubscription (url) {
        const current = Array.isArray(this.form.ed2kServerSource) ? this.form.ed2kServerSource : []
        if (!current.includes(url)) {
          this.form.ed2kServerSource = [...current, url]
          this.autoSaveForm()
        }
      },
      removeEd2kSubscription (url) {
        const current = Array.isArray(this.form.ed2kServerSource) ? this.form.ed2kServerSource : []
        this.form.ed2kServerSource = current.filter(s => s !== url)
        this.autoSaveForm()
      },
      focusEd2kSubscriptionInput () {
        this.$nextTick(() => {
          if (this.$refs.ed2kSubscriptionInput) {
            this.$refs.ed2kSubscriptionInput.focus()
          }
        })
      },
      handleEd2kSubscriptionDeleteKey (event) {
        const current = Array.isArray(this.form.ed2kServerSource) ? this.form.ed2kServerSource : []
        if (this.ed2kSubscriptionInput === '' && current.length > 0) {
          event.preventDefault()
          const last = current[current.length - 1]
          this.removeEd2kSubscription(last)
        }
      },
      async syncEd2kServersFromSource () {
        const source = this.form.ed2kServerSource
        if (!source || source.length === 0) {
          return
        }

        this.ed2kSyncing = true
        try {
          const servers = await this.$store.dispatch('preference/fetchEd2kServers', source)
          if (servers && servers.length > 0) {
            // Merge with builtin servers and dedupe
            const merged = [...new Set([...servers, ...BUILTIN_ED2K_SERVERS])]
            const serverStr = merged.join(',')

            this.ed2kUpdatingForm = true
            this.form.ed2kDefaultServers = serverStr
            this.form.ed2kLastSyncServerTime = Date.now()
            this.ed2kUpdatingForm = false

            this.ed2kServersText = convertCommaToLine(serverStr)
            this.autoSaveForm()
            this.$msg.success(this.$t('preferences.ed2k-sync-success'))
          } else {
            this.$msg.warning(this.$t('preferences.ed2k-sync-empty'))
          }
        } catch (error) {
          console.error('[ED2K] sync servers failed:', error)
          this.$msg.error(this.$t('preferences.ed2k-sync-fail'))
        } finally {
          this.ed2kSyncing = false
        }
      },
      formatSyncTime (timestamp) {
        if (!timestamp) return ''
        const d = new Date(timestamp)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
          title: this.$t('preferences.select-extension-file-path'),
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
          console.error('[LinkCore] form ref not found:', formName)
          return false
        }
        form.validate((valid) => {
          if (!valid) {
            console.error('[LinkCore] preference form valid:', valid)
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

          if ('btEncryptionMode' in data) {
            const mode = data.btEncryptionMode
            const modeConfig = {
              none: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'plain' },
              adaptive: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'arc4' },
              force: { 'bt-require-crypto': true, 'bt-min-crypto-level': 'arc4' }
            }
            const cfg = modeConfig[mode] || modeConfig.adaptive
            data['bt-require-crypto'] = cfg['bt-require-crypto']
            data['bt-min-crypto-level'] = cfg['bt-min-crypto-level']
            // 保留 btEncryptionMode 以便持久化到 system.json（bt-encryption-mode），
            // 否则重新打开偏好设置时会因读取不到该值而回退到默认值 adaptive。
            delete data.btForceEncryption
            delete data.btRequireCrypto
            delete data.btMinCryptoLevel
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

          // 如果服务器列表与内置列表不同，则保存用户自定义列表
          const currentServers = this.ed2kServerTags
          const builtinStr = BUILTIN_ED2K_SERVERS.join(',')
          const currentStr = currentServers.join(',')
          if (currentStr !== builtinStr) {
            data.ed2kDefaultServers = convertLineToComma(this.ed2kServersText)
          } else {
            // 与内置列表一致，清空配置以使用内置默认值
            data.ed2kDefaultServers = ''
          }

          if (rpcListenPort === EMPTY_STRING) {
            data.rpcListenPort = this.rpcDefaultPort
          }

          console.log('[LinkCore] preference changed data:', data)

          this.$store.dispatch('preference/save', data)
            .then(() => {
              this.$store.dispatch('app/fetchEngineOptions')
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

      // ---- Tracker Methods ----
      extractTrackerLines (text) {
        const raw = `${text}`
        const tokens = raw.split(/\r?\n|,/)
        return tokens.map(t => `${t}`.trim()).filter(Boolean).filter(t => /^(udp|http|https):\/\//i.test(t))
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
          this.$msg.warning(this.$t('preferences.builtin-origin-undeletable'))
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
      rebuildTrackerSourceOptions () {
        const base = structuredClone(TRACKER_SOURCE_OPTIONS)
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
        if (this.trackerSourceConfigVisible) {
          this.closeTrackerSourcePopup()
          return
        }
        this.trackerSourceInput = ''
        this.trackerSourceConfigVisible = true
        this.$nextTick(() => {
          this.adjustTrackerPopupPosition()
          document.addEventListener('mousedown', this.handleTrackerSourceOutsideClick)
        })
      },
      adjustTrackerPopupPosition () {
        const popup = this.$el.querySelector('.tracker-source-popup')
        const wrapper = this.$el.querySelector('.tracker-source-popup-wrapper')
        if (!popup || !wrapper) return
        const popupRect = popup.getBoundingClientRect()
        const viewportW = window.innerWidth
        const viewportH = window.innerHeight
        popup.style.left = ''
        popup.style.right = ''
        popup.style.top = ''
        popup.style.bottom = ''
        // 默认从按钮位置（顶部）放大缩小
        popup.style.transformOrigin = 'top right'
        if (popupRect.right > viewportW - 8) {
          popup.style.right = '0'
        }
        if (popupRect.left < 8) {
          popup.style.left = '0'
          popup.style.right = ''
          // 左侧对齐时锚点跟随
          popup.style.transformOrigin = 'top left'
        }
        if (popupRect.bottom > viewportH - 8) {
          popup.style.top = 'auto'
          popup.style.bottom = '100%'
          popup.style.marginBottom = '6px'
          popup.style.marginTop = '0'
          // 翻转到按钮上方时，从按钮位置（弹窗底部）放大缩小
          if (popup.style.right === '0') {
            popup.style.transformOrigin = 'bottom right'
          } else if (popup.style.left === '0') {
            popup.style.transformOrigin = 'bottom left'
          } else {
            popup.style.transformOrigin = 'bottom right'
          }
        }
      },
      handleTrackerSourceOutsideClick (e) {
        const popup = this.$el.querySelector('.tracker-source-popup-wrapper')
        if (popup && !popup.contains(e.target)) {
          this.closeTrackerSourcePopup()
        }
      },
      closeTrackerSourcePopup () {
        const popup = this.$el.querySelector('.tracker-source-popup')
        if (popup) {
          popup.style.left = ''
          popup.style.right = ''
          popup.style.top = ''
          popup.style.bottom = ''
          popup.style.marginTop = ''
          popup.style.marginBottom = ''
          popup.style.transformOrigin = ''
        }
        this.trackerSourceConfigVisible = false
        document.removeEventListener('mousedown', this.handleTrackerSourceOutsideClick)
      },
      onTrackerDropdownVisibleChange (visible) {
        this.trackerDropdownVisible = visible
      },
      onTrackerSourceChange () {
        this.autoSaveForm()
        this.recomputeBtTrackerFromSelected()
      },
      toggleTrackerDropdown () {
        const selectRef = this.$refs.trackerSelectRef
        if (selectRef) {
          if (this.trackerDropdownVisible) {
            selectRef.blur()
          } else {
            selectRef.focus()
          }
        }
      },
      async addTrackerSourceFromInput () {
        const url = `${this.trackerSourceInput}`.trim()
        if (!url) return
        await this.configureTrackerFromGithubWithUrl(url)
        this.trackerSourceInput = ''
        this.closeTrackerSourcePopup()
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
  padding: 3px 8px 3px 4px;
  border: 1px solid var(--lc-border-base);
  border-radius: 6px;
  background-color: var(--lc-bg-input);
  min-height: 28px;
  max-height: 120px;
  overflow-y: auto;
  box-sizing: border-box;
  cursor: text;
  transition: border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);

  &:hover {
    border-color: var(--lc-border-hover);
  }

  &:focus-within {
    border-color: var(--lc-color-primary);
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

.extension-tag {
  margin: 0 !important;
  flex-shrink: 0;
  background-color: var(--lc-tag-info-bg) !important;
  border-color: var(--lc-tag-info-border) !important;
  color: var(--lc-tag-info-text) !important;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  display: inline-flex !important;
  align-items: center !important;
  height: 20px !important;
  padding: 0 8px !important;
  line-height: 20px !important;
  font-size: 12px !important;
  box-sizing: border-box !important;

  &:hover {
    background-color: var(--lc-bg-hover) !important;
    border-color: var(--lc-border-hover) !important;
    color: var(--lc-text-primary) !important;
  }

  :deep(span) {
    line-height: 20px;
    position: relative;
    top: -2px;
  }

  :deep(.el-tag__content) {
    line-height: 20px !important;
    position: relative;
    top: -2px;
  }

  :deep(.el-icon-close) {
    color: var(--lc-text-secondary) !important;
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
      background-color: var(--lc-bg-active) !important;
      color: var(--lc-text-primary) !important;
    }

    &::before {
      display: inline-block;
      vertical-align: middle;
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
  color: var(--lc-text-regular);
  padding: 2px 4px;
  line-height: 1.5;

  &::placeholder {
    color: var(--lc-text-placeholder);
  }

  &::selection {
    background-color: var(--lc-color-primary-lighter);
    color: inherit;
  }
}

.ed2k-preset-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.ed2k-preset-label {
  font-size: 12px;
  color: var(--lc-text-secondary);
  margin-right: 2px;
}

.ed2k-preset-btn {
  padding: 2px 6px !important;
  font-size: 12px !important;
  color: var(--lc-color-primary) !important;

  &:hover {
    color: var(--lc-color-primary) !important;
    text-decoration: underline;
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

 /* BT 加密模式选择行 */
 .bt-encryption-row {
   display: flex;
   align-items: center;
   gap: 16px;
   flex-wrap: wrap;
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

/* Local popup for adding tracker source (appears below the button) */
.tracker-source-popup-wrapper {
  position: relative;
  display: inline-flex;
}

.tracker-source-popup {
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

.tracker-source-popup__header {
  padding: 10px 14px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lc-text-primary, #333);
}

.tracker-source-popup__body {
  padding: 10px 14px;
}

:deep(.tracker-source-popup__body .el-input__inner) {
  padding-left: 8px;
  padding-right: 8px;
  background-color: transparent !important;
}

.tracker-source-popup__footer {
  display: flex;
  justify-content: center;
  padding: 4px 8px 12px;
}

:deep(.tracker-source-popup__footer .el-button--primary) {
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

/* 上传/下载限速行：输入框与单位选择框融为一体 */
:deep(.speed-limit-row .el-input-number.is-controls-right .el-input__inner) {
  border-right: none;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

:deep(.speed-limit-row .el-select .el-input__inner) {
  border-left: none;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
