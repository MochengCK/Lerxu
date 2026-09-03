<template>
  <el-main class="panel-content">
    <el-form
      ref="basicForm"
      class="form-preference"
      label-position="right"
      size="small"
      :model="form"
      :rules="rules"
    >
      <div
        v-if="activeCategory === 'appearance'"
        class="preference-card"
        data-category="appearance"
      >
        <h3 class="card-title">
          {{ t('preferences.theme') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <mo-theme-switcher
              ref="themeSwitcher"
              v-model="form.theme"
              @change="handleThemeChange"
            />
          </el-col>
        </el-form-item>
      </div>

      <div
        v-if="activeCategory === 'appearance'"
        class="preference-card"
        data-category="appearance"
      >
        <h3 class="card-title">
          {{ t('preferences.ui') }}
        </h3>
        <el-form-item size="small">
          <el-col
            v-if="showHideAppMenuOption"
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.hide-app-menu') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.hide-app-menu-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.hideAppMenu"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-hide-window') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-hide-window-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.autoHideWindow"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="isMac"
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.tray-speedometer') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.tray-speedometer-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.traySpeedometer"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.show-progress-bar') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.show-progress-bar-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.showProgressBar"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.task-detail-default-transparent') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.task-detail-default-transparent-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.taskDetailDefaultTransparent"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="form.taskDetailDefaultTransparent"
            class="form-item-sub-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.task-detail-frosted-strength')"
            >
              <el-slider
                v-model="form.taskDetailFrostedBlur"
                :min="0"
                :max="10"
                :step="1"
                @change="autoSaveForm"
              />
            </el-form-item>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.show-task-type-badge') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.show-task-type-badge-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.showTaskTypeBadge"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="isMac"
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.mac-native-transparent') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.mac-native-transparent-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.macNativeTransparent"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 背景设置卡片 -->
      <div
        v-if="activeCategory === 'appearance'"
        class="preference-card"
        data-category="appearance"
      >
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
            <el-button
              type="primary"
              size="small"
              @click.stop="selectBackgroundImage"
            >
              {{ t('preferences.background-image-select') }}
            </el-button>
          </div>
        </div>
        <el-form-item size="small">
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-image-opacity')"
            >
              <el-slider
                v-model="backgroundImageOpacityPercent"
                :min="30"
                :max="100"
                :step="1"
                @change="autoSaveForm"
              />
            </el-form-item>
          </el-col>
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-image-frosted-strength')"
            >
              <el-slider
                v-model="form.backgroundImageFrostedBlur"
                :min="0"
                :max="10"
                :step="1"
                @change="autoSaveForm"
              />
            </el-form-item>
          </el-col>
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-ui-opacity')"
            >
              <el-slider
                v-model="backgroundUiOpacityPercent"
                :min="40"
                :max="100"
                :step="1"
                @change="autoSaveForm"
              />
            </el-form-item>
          </el-col>
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-ui-opacity-scope')"
            >
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
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-ui-frosted-strength')"
            >
              <el-slider
                v-model="form.backgroundUiFrostedBlur"
                :min="0"
                :max="10"
                :step="1"
                @change="autoSaveForm"
              />
            </el-form-item>
          </el-col>
          <el-col
            v-if="form.backgroundType === 'image'"
            class="form-item-sub"
            :span="24"
          >
            <el-form-item
              class="background-slider-item"
              :label="t('preferences.background-ui-frosted-scope')"
            >
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
      <div
        v-if="isMac && activeCategory === 'basic'"
        class="preference-card"
        data-category="basic"
      >
        <h3 class="card-title">
          {{ t('preferences.run-mode') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <mo-extend-select
              v-model="form.runMode"
              :options="runModes"
              @change="autoSaveForm"
            />
          </el-col>
        </el-form-item>
      </div>

      <!-- 语言设置卡片 -->
      <div
        v-if="activeCategory === 'basic'"
        class="preference-card"
        data-category="basic"
      >
        <h3 class="card-title">
          {{ t('preferences.language') }}
        </h3>
        <div class="language-container">
          <!-- 语言选择框 -->
          <mo-extend-select
            v-model="form.locale"
            :options="locales.map(item => ({ label: item.value === 'auto' ? `${item.label} (${systemLocaleName})` : item.label, value: item.value }))"
            :placeholder="t('preferences.change-language')"
            class="language-select"
            @change="handleLocaleChange(form.locale)"
          />
        </div>
      </div>

      <!-- 快捷键卡片 -->
      <div
        v-if="activeCategory === 'basic'"
        class="preference-card"
        data-category="basic"
      >
        <h3 class="card-title">
          {{ t('preferences.shortcuts') }}
        </h3>
        <el-form-item size="small">
          <el-row
            :gutter="8"
            style="margin-bottom: 8px;"
          >
            <el-col :span="12">
              {{ t('preferences.shortcut-command') }}
            </el-col>
            <el-col :span="12">
              {{ t('preferences.shortcut-keystroke') }}
            </el-col>
          </el-row>
          <el-row
            v-for="command in getShortcutCommands()"
            :key="command"
            :gutter="8"
            style="margin-bottom: 8px;"
          >
            <el-col :span="12">
              <el-input
                :value="getCommandLabel(command)"
                readonly
              />
            </el-col>
            <el-col :span="12">
              <el-input
                :value="formatKeystrokeForDisplay(getKeystrokeByCommand(command))"
                :placeholder="t('preferences.shortcut-placeholder')"
                @keydown="handleShortcutKeydown(command, $event)"
              />
            </el-col>
          </el-row>
          <el-button
            type="warning"
            size="small"
            style="width: 100%;"
            @click="resetShortcuts"
          >
            {{ t('preferences.shortcut-reset-default') }}
          </el-button>
        </el-form-item>
      </div>

      <!-- 启动设置卡片 -->
      <div
        v-if="activeCategory === 'basic'"
        class="preference-card"
        data-category="basic"
      >
        <h3 class="card-title">
          {{ t('preferences.startup') }}
        </h3>
        <el-form-item size="small">
          <el-col
            v-if="!isLinux"
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.open-at-login') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.open-at-login-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.openAtLogin"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.keep-window-state') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.keep-window-state-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.keepWindowState"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-resume-all') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-resume-all-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.resumeAllWhenAppLaunched"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 扩展卡片 -->
      <div
        v-if="activeCategory === 'basic'"
        class="preference-card"
        data-category="basic"
      >
        <h3 class="card-title">
          {{ t('preferences.browser-extensions') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="form-item-sub">
              {{ t('preferences.extension-channel') }}
              <el-input
                :value="appChannelUrl"
                readonly
              >
                <template #append>
                  <el-button
                    class="extension-copy-btn"
                    @click="copyChannelUrl"
                  >
                    <el-icon><DocumentCopy /></el-icon>
                    {{ t('preferences.extension-copy-channel') }}
                  </el-button>
                </template>
              </el-input>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 16px;"
            >
              <span
                class="text-link"
                style="color: #409EFF; cursor: pointer; text-decoration: underline; margin-right: 12px;"
                @click="openBrowserExtension('chrome')"
              >
                Chrome
              </span>
              <span
                class="text-link"
                style="color: #409EFF; cursor: pointer; text-decoration: underline;"
                @click="openBrowserExtension('edge')"
              >
                Edge
              </span>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 12px;"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.extension-intercept-all-downloads') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.extension-intercept-all-downloads-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.extensionInterceptAllDownloads"
                  @change="autoSaveForm"
                />
              </div>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 4px;"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.extension-silent-download') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.extension-silent-download-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.extensionSilentDownload"
                  @change="autoSaveForm"
                />
              </div>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 4px;"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.extension-shift-toggle-enabled') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.extension-shift-toggle-enabled-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.extensionShiftToggleEnabled"
                  @change="autoSaveForm"
                />
              </div>
            </div>
            <div
              class="settings-divider"
              style="margin-top: 16px; margin-bottom: 8px;"
            />
            <div
              class="form-item-sub"
              style="margin-top: 8px;"
            >
              {{ t('preferences.extension-skip-file-extensions') }}
              <div
                class="extension-tag-input"
                @click="focusExtensionInput"
              >
                <transition-group
                  name="tag-fade"
                  tag="div"
                  class="tags-container"
                >
                  <el-tag
                    v-for="ext in extensionTags"
                    :key="ext"
                    closable
                    size="small"
                    class="extension-tag"
                    @close="removeExtension(ext)"
                  >
                    {{ ext }}
                  </el-tag>
                </transition-group>
                <input
                  ref="extensionInputRef"
                  v-model="extensionInput"
                  type="text"
                  class="extension-input"
                  :placeholder="extensionTags.length === 0 ? t('preferences.extension-skip-file-extensions-tips') : ''"
                  @keydown.enter="addExtension"
                  @keydown.delete="handleDeleteKey"
                  @blur="addExtension"
                >
              </div>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 16px;"
            >
              {{ t('preferences.extension-exclude-domains') }}
              <div
                class="extension-tag-input"
                @click="focusDomainInput"
              >
                <transition-group
                  name="tag-fade"
                  tag="div"
                  class="tags-container"
                >
                  <el-tag
                    v-for="domain in domainTags"
                    :key="domain"
                    closable
                    size="small"
                    class="extension-tag"
                    @close="removeDomain(domain)"
                  >
                    {{ domain }}
                  </el-tag>
                </transition-group>
                <input
                  ref="domainInputRef"
                  v-model="domainInput"
                  type="text"
                  class="extension-input"
                  :placeholder="domainTags.length === 0 ? t('preferences.extension-exclude-domains-tips') : ''"
                  @keydown.enter="addDomain"
                  @keydown.delete="handleDomainDeleteKey"
                  @blur="addDomain"
                >
              </div>
            </div>
            <div
              class="form-item-sub"
              style="margin-top: 16px;"
            >
              {{ t('preferences.extension-min-file-size') }}
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
            <div
              class="form-item-sub"
              style="margin-top: 16px;"
            >
              <el-button
                type="primary"
                size="small"
                class="video-detection-settings-btn"
                style="width: 100%;"
                @click="openVideoDetectionSettings"
              >
                {{ t('preferences.video-detection-settings') }}
              </el-button>
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 下载目录卡片 -->
      <div
        v-if="activeCategory === 'transfer'"
        class="preference-card"
        data-category="transfer"
      >
        <h3 class="card-title">
          {{ t('preferences.default-dir') }}
        </h3>
        <el-form-item size="small">
          <el-input
            v-model="form.dir"
            placeholder=""
            :readonly="isMas"
          >
            <template #prepend>
              <mo-history-directory
                @selected="handleHistoryDirectorySelected"
              />
            </template>
            <template #append>
              <mo-select-directory
                v-if="isRenderer"
                @selected="handleNativeDirectorySelected"
              />
            </template>
          </el-input>
          <div
            v-if="isMas"
            class="el-form-item__info"
            style="margin-top: 8px;"
          >
            {{ t('preferences.mas-default-dir-tips') }}
          </div>
        </el-form-item>
      </div>

      <!-- 传输设置卡片 -->
      <div
        v-if="activeCategory === 'transfer'"
        class="preference-card"
        data-category="transfer"
      >
        <h3 class="card-title">
          {{ t('preferences.speed-limit') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub speed-limit-row"
            :span="24"
          >
            {{ t('preferences.transfer-speed-upload') }}
            <el-input-number
              v-model="maxOverallUploadLimitParsed"
              controls-position="right"
              :min="0"
              :max="65535"
              :step="1"
              :label="t('preferences.transfer-speed-download')"
            />
            <el-select
              v-model="uploadUnit"
              style="width: 100px;"
              popper-class="speed-unit-popper"
              @change="handleUploadChange"
            >
              <el-option
                v-for="item in speedUnits"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-col>
          <el-col
            class="form-item-sub speed-limit-row"
            :span="24"
          >
            {{ t('preferences.transfer-speed-download') }}
            <el-input-number
              v-model="maxOverallDownloadLimitParsed"
              controls-position="right"
              :min="0"
              :max="65535"
              :step="1"
              :label="t('preferences.transfer-speed-download')"
            />
            <el-select
              v-model="downloadUnit"
              style="width: 100px;"
              popper-class="speed-unit-popper"
              @change="handleDownloadChange"
            >
              <el-option
                v-for="item in speedUnits"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-col>
        </el-form-item>
      </div>

      <!-- BT设置卡片 -->
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-options') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.bt-save-metadata') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.bt-save-metadata-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.btSaveMetadata"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.bt-auto-download-content') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.bt-auto-download-content-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.btAutoDownloadContent"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
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
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div
              class="settings-divider"
              style="margin: 8px 0;"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="bt-ban-collapse-header" @click="btBanSettingsExpanded = !btBanSettingsExpanded">
              <span class="bt-ban-collapse-title">{{ t('preferences.bt-auto-ban-settings') }}</span>
              <el-icon class="bt-ban-collapse-arrow" :class="{ 'is-expanded': btBanSettingsExpanded }">
                <ArrowRight />
              </el-icon>
            </div>
            <transition name="bt-ban-slide">
              <div v-show="btBanSettingsExpanded" class="bt-ban-settings-body">
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.bt-auto-ban-peer') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.bt-auto-ban-peer-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.btAutoBanPeer"
                  @change="autoSaveForm"
                />
              </div>
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.bt-auto-ban-bad-data') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.bt-auto-ban-bad-data-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.btAutoBanBadData"
                  @change="autoSaveForm"
                />
              </div>
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.bt-auto-ban-zero-progress') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.bt-auto-ban-zero-progress-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.btAutoBanZeroProgress"
                  @change="autoSaveForm"
                />
              </div>
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.bt-auto-ban-snubbing') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.bt-auto-ban-snubbing-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.btAutoBanSnubbing"
                  @change="autoSaveForm"
                />
              </div>
            </div>
            </transition>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
              {{ t('preferences.bt-ip-ban-list') }}
            </div>
            <el-input
              v-model="btIpBanListText"
              type="textarea"
              :rows="3"
              :placeholder="t('preferences.bt-ip-ban-placeholder')"
            />
            <div
              class="el-form-item__info"
              style="margin-top: 8px;"
            >
              {{ t('preferences.bt-ip-ban-tips') }}
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 做种设置卡片 -->
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-seeding-settings') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.keep-seeding') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.keep-seeding-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.keepSeeding"
                @change="onKeepSeedingChange"
              />
            </div>
          </el-col>
          <el-col
            v-if="!form.keepSeeding"
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.seed-ratio') }}
            <el-input-number
              v-model="form.seedRatio"
              controls-position="right"
              :min="1"
              :max="100"
              :step="0.1"
              :label="t('preferences.seed-ratio')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            v-if="!form.keepSeeding"
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.seed-time') }}
            ({{ t('preferences.seed-time-unit') }})
            <el-input-number
              v-model="form.seedTime"
              controls-position="right"
              :min="60"
              :max="525600"
              :step="1"
              :label="t('preferences.seed-time')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.stop-seeding-action') }}
            <el-radio-group
              v-model="form.stopSeedingAction"
              @change="autoSaveForm"
            >
              <el-radio value="pause">
                {{ t('preferences.stop-seeding-action-pause') }}
              </el-radio>
              <el-radio value="complete">
                {{ t('preferences.stop-seeding-action-complete') }}
              </el-radio>
            </el-radio-group>
          </el-col>
        </el-form-item>
      </div>

      <!-- BT Tracker设置卡片 -->
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-tracker') }}
        </h3>
        <el-form-item size="small">
          <div class="form-item-sub bt-tracker">
            <el-row :gutter="4">
              <el-col :span="24">
                <div
                  class="tracker-row"
                  style="display:flex; align-items:stretch;"
                >
                  <div class="tracker-left">
                    <mo-hover-tip
                      effect="dark"
                      :content="isAllTrackerSourcesSelected ? t('preferences.deselect-all-tracker-sources') : t('preferences.select-all-tracker-sources')"
                      placement="bottom"
                    >
                      <el-button
                        size="small"
                        class="sync-tracker-btn"
                        @click="toggleAllTrackerSources"
                      >
                        <mo-icon
                          :name="isAllTrackerSourcesSelected ? 'deselect-all' : 'select-all'"
                          width="12"
                          height="12"
                        />
                      </el-button>
                    </mo-hover-tip>
                  </div>
                  <div
                    class="track-source"
                    style="flex:1;"
                  >
                    <!-- collapse-tags 保证只占一行；max-collapse-tags 由实际宽度动态计算
                         （updateTrackerCollapse），一行内尽量多显示、右侧空间用满后才折叠 -->
                    <el-select
                      ref="trackerSelectRef"
                      v-model="form.trackerSource"
                      class="select-track-source"
                      allow-create
                      filterable
                      multiple
                      collapse-tags
                      :max-collapse-tags="trackerMaxCollapse"
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
                          <span
                            v-if="item.cdn"
                            style="float: right; margin-right: 24px; color: var(--lc-color-primary);"
                          >
                            CDN
                          </span>
                        </el-option>
                      </el-option-group>
                    </el-select>
                  </div>
                  <div class="tracker-right sync-tracker">
                    <mo-hover-tip
                      effect="dark"
                      :content="t('preferences.sync-tracker-tips')"
                      placement="bottom"
                    >
                      <el-button
                        size="small"
                        class="sync-tracker-btn"
                        @click="syncTrackerFromSource"
                      >
                        <mo-icon
                          v-if="trackerSyncing"
                          name="refresh"
                          width="12"
                          height="12"
                          :spin="true"
                        />
                        <mo-icon
                          v-else
                          name="sync"
                          width="12"
                          height="12"
                        />
                      </el-button>
                    </mo-hover-tip>
                    <div class="tracker-source-popup-wrapper">
                      <mo-hover-tip
                        effect="dark"
                        :content="t('preferences.add-source')"
                        placement="bottom"
                        :disabled="trackerSourceConfigVisible"
                      >
                        <el-button
                          size="small"
                          class="sync-tracker-btn"
                          @click="openTrackerSourceConfigDialog"
                        >
                          <mo-icon
                            name="link"
                            width="12"
                            height="12"
                          />
                        </el-button>
                      </mo-hover-tip>
                      <transition name="popup-scale">
                        <div
                          v-if="trackerSourceConfigVisible"
                          class="tracker-source-popup"
                          @click.stop
                        >
                          <div class="tracker-source-popup__header">
                            <span>{{ t('preferences.add-source') }}</span>
                          </div>
                          <div class="tracker-source-popup__body">
                            <el-input
                              v-model="trackerSourceInput"
                              :placeholder="t('preferences.tracker-source-input-placeholder')"
                              clearable
                              size="small"
                              @keydown.enter="addTrackerSourceFromInput"
                            />
                          </div>
                          <div class="tracker-source-popup__footer">
                            <el-button
                              size="small"
                              type="primary"
                              :loading="trackerSourceConfigLoading"
                              :disabled="trackerSourceConfigLoading"
                              @click="addTrackerSourceFromInput"
                            >
                              {{ t('app.submit') }}
                            </el-button>
                          </div>
                        </div>
                      </transition>
                    </div>
                  </div>
                </div>
              </el-col>
            </el-row>
            <el-input
              v-model="form.btTracker"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 10 }"
              auto-complete="off"
              :placeholder="`${t('preferences.bt-tracker-input-tips')}`"
            />
            <div
              class="el-form-item__info tracker-origins-info"
              style="margin-top: 8px;"
            >
              <template v-if="!(originListForDisplay && originListForDisplay.length)">
                {{ t('preferences.bt-tracker-tips') }}
              </template>
              <template v-else>
                {{ t('preferences.added-origins') }}
                <span
                  v-for="o in originListForDisplay"
                  :key="o"
                  style="margin-right: 12px;"
                >
                  <mo-hover-tip
                    effect="dark"
                    :content="t('preferences.long-press-to-delete')"
                    placement="top"
                  >
                    <a
                      href="javascript:;"
                      @mousedown="(e) => onOriginMouseDown(o, e)"
                      @mouseup="() => onOriginMouseUp(o)"
                      @mouseleave="() => onOriginMouseLeave(o)"
                      @click.prevent="() => onOriginClick(o)"
                    >
                      {{ deriveOriginLabel(o) }}
                      <mo-icon
                        name="link"
                        width="12"
                        height="12"
                      />
                    </a>
                  </mo-hover-tip>
                </span>
              </template>
            </div>
          </div>
          <div class="form-item-sub">
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-sync-tracker') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-sync-tracker-desc') }}
                </div>
              </div>
              <el-switch v-model="form.autoSyncTracker" />
            </div>
          </div>
          <div
            v-if="form.autoSyncTracker"
            class="form-item-sub"
            style="margin-top: 12px;"
          >
            <div
              class="sync-time-setting"
              style="display: flex; align-items: center; margin-bottom: 12px;"
            >
              <el-time-picker
                v-model="form.autoSyncTrackerTime"
                placeholder="选择时间"
                format="HH:mm"
                value-format="HH:mm"
                size="small"
                style="width: 100%;"
                @change="autoSaveForm"
              />
            </div>
          </div>
        </el-form-item>
        <div
          v-if="form.lastSyncTrackerTime > 0"
          class="form-item-sub"
          style="margin-top: 16px; text-align: center;"
        >
          <div class="el-form-item__info">
            {{ t('preferences.last-sync-tracker-time') }}: {{ new Date(form.lastSyncTrackerTime).toLocaleString() }}
          </div>
        </div>
      </div>

      <!-- 传输协议卡片 -->
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-transport-protocol') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.bt-connect-protocol') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.bt-connect-protocol-desc') }}
                </div>
              </div>
              <mo-segmented-slider
                :value="form.btConnectProtocol"
                :options="btConnectProtocolOptions"
                size="mini"
                @change="onBtConnectProtocolChange"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-peer-exchange') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-peer-exchange-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.enablePeerExchange"
                @change="(val) => onNatToggleChange('enablePeerExchange', val)"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-lpd') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-lpd-desc') }}
                </div>
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
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-network-discovery') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-dht') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-dht-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.enableDht"
                @change="(val) => onNatToggleChange('enableDht', val)"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-dht6') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-dht6-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.enableDht6"
                @change="(val) => onNatToggleChange('enableDht6', val)"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-upnp') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-upnp-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.enableUpnp"
                @change="(val) => onNatToggleChange('enableUpnp', val)"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.enable-nat-pmp') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.enable-nat-pmp-desc') }}
                </div>
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
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-port-settings') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.bt-port') }}
            <el-input
              v-model="form.listenPort"
              placeholder="BT Port"
              :maxlength="8"
            >
              <template #append>
                <mo-hover-tip
                  effect="dark"
                  :content="t('preferences.random-generate')"
                  placement="bottom"
                  :open-delay="300"
                >
                  <i
                    class="rpc-dice-btn"
                    @click.prevent="onBtPortDiceClick"
                  >
                    <mo-icon
                      name="dice"
                      width="12"
                      height="12"
                    />
                  </i>
                </mo-hover-tip>
              </template>
            </el-input>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
            style="margin-top: 8px;"
          >
            {{ t('preferences.dht-port') }}
            <el-input
              v-model="form.dhtListenPort"
              placeholder="DHT Port"
              :maxlength="8"
            >
              <template #append>
                <mo-hover-tip
                  effect="dark"
                  :content="t('preferences.random-generate')"
                  placement="bottom"
                  :open-delay="300"
                >
                  <i
                    class="rpc-dice-btn"
                    @click.prevent="onDhtPortDiceClick"
                  >
                    <mo-icon
                      name="dice"
                      width="12"
                      height="12"
                    />
                  </i>
                </mo-hover-tip>
              </template>
            </el-input>
          </el-col>
        </el-form-item>
      </div>

      <!-- 连接与缓存卡片 -->
      <div
        v-if="activeCategory === 'bt'"
        class="preference-card"
        data-category="bt"
      >
        <h3 class="card-title">
          {{ t('preferences.bt-connections') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.bt-max-peers') }}
            <el-input
              v-model="form.btMaxPeers"
              :maxlength="5"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
            style="margin-top: 8px;"
          >
            {{ t('preferences.disk-cache') }}
            <el-input
              v-model="form.diskCache"
              :maxlength="16"
              @change="autoSaveForm"
            />
          </el-col>
        </el-form-item>
      </div>

      <!-- ED2K设置卡片 -->
      <div
        v-if="activeCategory === 'ed2k'"
        class="preference-card"
        data-category="ed2k"
      >
        <h3 class="card-title">
          {{ t('preferences.ed2k-options') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.ed2k-listen-port') }}
            <el-input-number
              v-model="form.ed2kListenPort"
              controls-position="right"
              :min="1024"
              :max="65535"
              :step="1"
              :label="t('preferences.ed2k-listen-port')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.ed2k-max-connections') }}
            <el-input-number
              v-model="form.ed2kMaxConnections"
              controls-position="right"
              :min="1"
              :max="1000"
              :step="1"
              :label="t('preferences.ed2k-max-connections')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.ed2k-connection-timeout') }}
            <el-input-number
              v-model="form.ed2kConnectionTimeout"
              controls-position="right"
              :min="5"
              :max="300"
              :step="5"
              :label="t('preferences.ed2k-connection-timeout')"
              @change="autoSaveForm"
            />
            <span style="margin-left: 8px;">{{ t('preferences.ed2k-seconds') }}</span>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.ed2k-max-sources') }}
            <el-input-number
              v-model="form.ed2kMaxSourcesPerFile"
              controls-position="right"
              :min="1"
              :max="500"
              :step="1"
              :label="t('preferences.ed2k-max-sources')"
              @change="autoSaveForm"
            />
          </el-col>
        </el-form-item>
      </div>

      <div
        v-if="activeCategory === 'ed2k'"
        class="preference-card"
        data-category="ed2k"
      >
        <h3 class="card-title">
          {{ t('preferences.ed2k-source-discovery') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div
              class="el-form-item__info"
              style="margin-bottom: 8px;"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.ed2k-server-source') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.ed2k-server-source-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.ed2kServerSourceEnabled"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.ed2k-source-exchange') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.ed2k-source-exchange-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.ed2kSourceExchangeEnabled"
                @change="autoSaveForm"
              />
            </div>
            <div
              v-if="form.ed2kSourceExchangeEnabled"
              style="margin-left: 24px; margin-top: 4px;"
            >
              {{ t('preferences.ed2k-source-exchange-interval') }}
              <el-input-number
                v-model="form.ed2kSourceExchangeInterval"
                controls-position="right"
                :min="30"
                :max="3600"
                :step="30"
                size="small"
                :label="t('preferences.ed2k-source-exchange-interval')"
                @change="autoSaveForm"
              />
              <span style="margin-left: 4px;">{{ t('preferences.ed2k-seconds') }}</span>
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.ed2k-kad') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.ed2k-kad-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.ed2kKadEnabled"
                @change="autoSaveForm"
              />
            </div>
            <div
              v-if="form.ed2kKadEnabled"
              style="margin-left: 24px; margin-top: 8px;"
            >
              <div style="margin-bottom: 4px;">
                {{ t('preferences.ed2k-kad-bootstrap-nodes') }}
              </div>
              <el-input
                v-model="form.ed2kKadBootstrapNodes"
                size="small"
                :placeholder="t('preferences.ed2k-kad-bootstrap-nodes-placeholder')"
                @change="autoSaveForm"
              />
              <div
                class="el-form-item__info"
                style="margin-top: 4px;"
              >
                {{ t('preferences.ed2k-kad-bootstrap-nodes-tips') }}
              </div>
            </div>
          </el-col>
        </el-form-item>
      </div>

      <div
        v-if="activeCategory === 'ed2k'"
        class="preference-card"
        data-category="ed2k"
      >
        <h3 class="card-title">
          {{ t('preferences.ed2k-server-subscription') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div
              class="el-form-item__info"
              style="margin-bottom: 8px;"
            >
              {{ t('preferences.ed2k-server-subscription-tips') }}
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div
              class="extension-tag-input"
              @click="focusEd2kSubscriptionInput"
            >
              <transition-group
                name="tag-fade"
                tag="div"
                class="tags-container"
              >
                <el-tag
                  v-for="url in form.ed2kServerSource"
                  :key="url"
                  closable
                  size="small"
                  class="extension-tag"
                  @close="removeEd2kSubscription(url)"
                >
                  {{ url }}
                </el-tag>
              </transition-group>
              <input
                ref="ed2kSubscriptionInputRef"
                v-model="ed2kSubscriptionInput"
                type="text"
                class="extension-input"
                :placeholder="form.ed2kServerSource.length === 0 ? t('preferences.ed2k-server-source-placeholder') : ''"
                @keydown.enter="addEd2kSubscription"
                @keydown.delete="handleEd2kSubscriptionDeleteKey"
                @blur="addEd2kSubscription"
              >
            </div>
            <div
              v-if="ed2kPresetSubscriptions.length > 0"
              class="ed2k-preset-sources"
            >
              <span class="ed2k-preset-label">{{ t('preferences.ed2k-preset-sources') }}:</span>
              <el-button
                v-for="item in ed2kPresetSubscriptions"
                :key="item.value"
                size="small"
                type="text"
                class="ed2k-preset-btn"
                @click="addPresetSubscription(item.value)"
              >
                + {{ item.label }}
              </el-button>
            </div>
            <div style="margin-top: 8px;">
              <el-button
                size="small"
                :loading="ed2kSyncing"
                :disabled="form.ed2kServerSource.length === 0"
                @click="syncEd2kServersFromSource"
              >
                <el-icon><Refresh /></el-icon>
                {{ t('preferences.ed2k-sync-now') }}
              </el-button>
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.ed2k-auto-sync-server') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.ed2k-auto-sync-server-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.ed2kAutoSyncServer"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="form.ed2kAutoSyncServer"
            class="form-item-sub-sub"
            :span="24"
          >
            <div class="sub-row-reverse">
              <el-time-picker
                v-model="form.ed2kAutoSyncServerTime"
                size="small"
                format="HH:mm"
                value-format="HH:mm"
                :placeholder="t('preferences.ed2k-auto-sync-server-time')"
                style="width: 120px;"
                @change="autoSaveForm"
              />
              <el-input-number
                v-model="form.ed2kAutoSyncServerInterval"
                size="small"
                :min="1"
                :max="168"
                :step="1"
                :label="t('preferences.ed2k-auto-sync-server-interval')"
                style="width: 110px; margin-right: 8px;"
                @change="autoSaveForm"
              />
              <span class="sub-row-label">{{ t('preferences.ed2k-auto-sync-server-interval') }}</span>
            </div>
            <div
              v-if="form.ed2kLastSyncServerTime > 0"
              class="el-form-item__info"
              style="margin-top: 4px;"
            >
              {{ t('preferences.ed2k-last-sync-server-time') }}: {{ formatSyncTime(form.ed2kLastSyncServerTime) }}
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.ed2k-default-servers') }}
            <div
              class="extension-tag-input"
              @click="focusEd2kServerInput"
            >
              <transition-group
                name="tag-fade"
                tag="div"
                class="tags-container"
              >
                <el-tag
                  v-for="server in ed2kServerTags"
                  :key="server"
                  closable
                  size="small"
                  class="extension-tag"
                  @close="removeEd2kServer(server)"
                >
                  {{ server }}
                </el-tag>
              </transition-group>
              <input
                ref="ed2kServerInputRef"
                v-model="ed2kServerInput"
                type="text"
                class="extension-input"
                :placeholder="ed2kServerTags.length === 0 ? t('preferences.ed2k-default-servers-placeholder') : ''"
                @keydown.enter="addEd2kServer"
                @keydown.delete="handleEd2kServerDeleteKey"
                @blur="addEd2kServer"
              >
            </div>
            <div
              class="el-form-item__info"
              style="margin-top: 8px;"
            >
              {{ t('preferences.ed2k-default-servers-tips') }}
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 任务行为卡片 -->
      <div
        v-if="activeCategory === 'task'"
        class="preference-card"
        data-category="task"
      >
        <h3 class="card-title">
          {{ t('preferences.task-behavior') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.max-concurrent-downloads') }}
            <el-input-number
              v-model="form.maxConcurrentDownloads"
              controls-position="right"
              :min="1"
              :max="maxConcurrentDownloads"
              :step="1"
              :label="t('preferences.max-concurrent-downloads')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            {{ t('preferences.max-connection-per-server') }}
            <el-input-number
              v-model="form.maxConnectionPerServer"
              controls-position="right"
              :min="0"
              :max="form.engineMaxConnectionPerServer"
              :step="1"
              :label="t('preferences.max-connection-per-server')"
              @change="autoSaveForm"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.continue') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.continue-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.continue"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.no-confirm-before-delete-task') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.no-confirm-before-delete-task-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.noConfirmBeforeDeleteTask"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-purge-record') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-purge-record-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.autoPurgeRecord"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-open-task-progress-window') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-open-task-progress-window-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.autoOpenTaskProgressWindow"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="form.autoOpenTaskProgressWindow"
            class="form-item-sub-sub"
            :span="24"
          >
            <el-radio-group
              v-model="form.taskProgressWindowMode"
              @change="autoSaveForm"
            >
              <el-radio value="first">
                {{ t('preferences.task-progress-window-first-only') }}
              </el-radio>
              <el-radio value="all">
                {{ t('preferences.task-progress-window-all') }}
              </el-radio>
            </el-radio-group>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.new-task-show-downloading') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.new-task-show-downloading-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.newTaskShowDownloading"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="form.newTaskShowDownloading"
            class="form-item-sub-sub"
            :span="24"
          >
            <mo-hover-tip
              effect="dark"
              :content="t('preferences.new-task-jump-target')"
              placement="top"
              :open-delay="400"
            >
              <el-radio-group
                v-model="form.newTaskJumpTarget"
                @change="autoSaveForm"
              >
                <el-radio value="all">
                  {{ t('preferences.new-task-jump-target-all') }}
                </el-radio>
                <el-radio value="downloading">
                  {{ t('preferences.new-task-jump-target-downloading') }}
                </el-radio>
              </el-radio-group>
            </mo-hover-tip>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.show-task-completed-window') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.show-task-completed-window-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.showTaskCompletedWindow"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.task-completed-notify') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.task-completed-notify-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.taskNotification"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            v-if="form.taskNotification"
            class="form-item-sub-sub"
            :span="24"
          >
            <mo-hover-tip
              effect="dark"
              :content="t('preferences.task-complete-notify-click-action-tips')"
              placement="top"
              :open-delay="400"
            >
              <el-radio-group
                v-model="form.taskCompleteNotifyClickAction"
                @change="autoSaveForm"
              >
                <el-radio value="open-folder">
                  {{ t('preferences.task-complete-notify-click-action-open-folder') }}
                </el-radio>
                <el-radio value="show-app">
                  {{ t('preferences.task-complete-notify-click-action-show-app') }}
                </el-radio>
                <el-radio value="execute-file">
                  {{ t('preferences.task-complete-notify-click-action-execute-file') }}
                </el-radio>
              </el-radio-group>
            </mo-hover-tip>
          </el-col>
        </el-form-item>
      </div>

      <!-- 文件管理卡片 -->
      <div
        v-if="activeCategory === 'file'"
        class="preference-card"
        data-category="file"
      >
        <h3 class="card-title">
          {{ t('preferences.file-handling') }}
        </h3>
        <el-form-item size="small">
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <el-input
              v-model="form.downloadingFileSuffix"
              :placeholder="t('preferences.downloading-file-suffix-tips')"
              :label="t('preferences.downloading-file-suffix')"
              @change="autoSaveForm"
            >
              <template #prepend>
                {{ t('preferences.downloading-file-suffix') }}
              </template>
            </el-input>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.set-file-mtime-on-complete') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.set-file-mtime-on-complete-desc') }}
                </div>
              </div>
              <el-switch
                v-model="form.setFileMtimeOnComplete"
                @change="autoSaveForm"
              />
            </div>
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div
              class="settings-divider"
              style="margin: 8px 0;"
            />
          </el-col>
          <el-col
            class="form-item-sub"
            :span="24"
          >
            <div class="toggle-row toggle-row--with-desc">
              <div class="toggle-row__text">
                <span class="toggle-label">{{ t('preferences.auto-categorize-files') }}</span>
                <div class="toggle-desc">
                  {{ t('preferences.auto-categorize-files-tips') }}
                </div>
              </div>
              <el-switch
                v-model="form.autoCategorizeFiles"
                @change="autoSaveForm"
              />
            </div>
            <div style="margin-top: 8px;">
              <el-button
                type="primary"
                size="small"
                class="edit-rules-btn"
                @click="openFileCategoriesSettings"
              >
                <el-icon><Edit /></el-icon>
                {{ t('preferences.file-categories-edit') }}
              </el-button>
            </div>
          </el-col>
        </el-form-item>
      </div>

      <!-- 安全卡片 -->
      <div
        v-if="activeCategory === 'file'"
        class="preference-card"
        data-category="file"
      >
        <h3 class="card-title">
          {{ t('preferences.security') }}
        </h3>
        <div class="card-content">
          <el-form-item size="small">
            <el-col
              class="form-item-sub"
              :span="24"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.enable-security-scan') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.security-scan-tips') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.enableSecurityScan"
                  @change="autoSaveForm"
                />
              </div>
            </el-col>
            <el-col
              v-if="form.enableSecurityScan"
              class="form-item-sub"
              :span="24"
            >
              <el-form-item :label="t('preferences.security-scan-tool')">
                <mo-extend-select
                  v-model="form.securityScanTool"
                  :options="[
                    { label: t('preferences.security-scan-tool-system'), value: 'system' },
                    { label: t('preferences.security-scan-tool-custom'), value: 'custom' }
                  ]"
                  @change="autoSaveForm"
                />
              </el-form-item>
            </el-col>
            <el-col
              v-if="form.enableSecurityScan && form.securityScanTool === 'custom'"
              class="form-item-sub"
              :span="24"
            >
              <el-form-item :label="t('preferences.custom-security-scan-path')">
                <el-input
                  v-model="form.customSecurityScanPath"
                  :placeholder="t('preferences.custom-security-scan-path-tips')"
                  @change="autoSaveForm"
                >
                  <template #append>
                    <mo-select-directory
                      v-if="isRenderer"
                      type="file"
                      @selected="handleSecurityScanPathSelected"
                    />
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-form-item>
        </div>
      </div>

      <!-- 剪贴板卡片 -->
      <div
        v-if="activeCategory === 'task'"
        class="preference-card"
        data-category="task"
      >
        <h3 class="card-title">
          {{ t('preferences.clipboard-settings') }}
        </h3>
        <div class="card-content">
          <el-form-item size="small">
            <el-col
              class="form-item-sub"
              :span="24"
            >
              <div class="toggle-row toggle-row--with-desc">
                <div class="toggle-row__text">
                  <span class="toggle-label">{{ t('preferences.clipboard-auto-paste') }}</span>
                  <div class="toggle-desc">
                    {{ t('preferences.clipboard-auto-paste-desc') }}
                  </div>
                </div>
                <el-switch
                  v-model="form.clipboardAutoPaste"
                  @change="autoSaveForm"
                />
              </div>
            </el-col>
            <el-col
              v-if="form.clipboardAutoPaste"
              class="form-item-sub"
              :span="24"
            >
              <div class="form-item-sub-sub">
                <div class="toggle-row toggle-row--with-desc">
                  <div class="toggle-row__text">
                    <span class="toggle-label">{{ t('preferences.clipboard-auto-open-add-task') }}</span>
                    <div class="toggle-desc">
                      {{ t('preferences.clipboard-auto-open-add-task-desc') }}
                    </div>
                  </div>
                  <el-switch
                    v-model="form.clipboardAutoOpenAddTask"
                    @change="autoSaveForm"
                  />
                </div>
              </div>
            </el-col>
          </el-form-item>
        </div>
      </div>
    </el-form>

    <div
      v-if="hasNoResults"
      class="no-results"
    >
      <div class="no-results-inner">
        {{ t('preferences.no-settings-found') }}
      </div>
    </div>
  </el-main>
</template>

<script setup>

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

  // 连接协议：优先读 bt-connect-protocol；旧配置无此键时按 enable-utp
  // 推导（true → both，false → tcp），保证升级后不回退默认值。
  const normalizeBtConnectProtocol = (protocol, legacyEnableUtp) => {
    if (protocol === 'both' || protocol === 'utp' || protocol === 'tcp') {
      return protocol
    }
    return legacyEnableUtp === false ? 'tcp' : 'both'
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
      btConnectProtocol,
      listenPort,
      autoPurgeRecord,
      btEncryptionMode,
      btIpBanList,
      btSaveMetadata,
      btAutoBanPeer,
      btAutoBanBadData,
      btAutoBanZeroProgress,
      btAutoBanSnubbing,
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
      macNativeTransparent,
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
      btConnectProtocol: normalizeBtConnectProtocol(btConnectProtocol, enableUtp),
      btMaxPeers: btMaxPeers !== undefined ? btMaxPeers : '128',
      btAutoBanPeer: btAutoBanPeer !== false && btAutoBanPeer !== 'false',
      btAutoBanBadData: btAutoBanBadData !== false && btAutoBanBadData !== 'false',
      btAutoBanZeroProgress: btAutoBanZeroProgress !== false && btAutoBanZeroProgress !== 'false',
      btAutoBanSnubbing: btAutoBanSnubbing !== false && btAutoBanSnubbing !== 'false',
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
      macNativeTransparent: macNativeTransparent === undefined ? false : !!macNativeTransparent,
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
      showTaskTypeBadge: showTaskTypeBadge === undefined ? false : !!showTaskTypeBadge,
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

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import is from 'electron-is'
import { nativeImage, clipboard, ipcRenderer } from 'electron'
import { app, dialog, shell } from '@electron/remote'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message-box/style/css'
import { cloneDeep, isEmpty } from 'lodash'
// mo-history-directory, mo-select-directory, mo-theme-switcher,
// mo-segmented-slider are globally registered in main.js
import { availableLanguages, getLanguage, getSystemLocaleName } from '@shared/locales'
import { getLocaleManager } from '@/components/Locale'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'
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
import keymap from '@shared/keymap'
import '@/components/Icons/dice'
import '@/components/Icons/sync'
import '@/components/Icons/select-all'
import '@/components/Icons/deselect-all'

defineOptions({ name: 'MoPreferenceBasic' })

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const route = useRoute()
const router = useRouter()

const props = defineProps({
  category: {
    type: String,
    default: 'basic'
  }
})

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { searchKeyword } = storeToRefs(preferenceStore)

// --- Data ---
const form = ref(initForm(preferenceConfig.value))
// BT 自动封禁策略折叠状态
const btBanSettingsExpanded = ref(false)
// 限速单位独立存储：不再从 form 值推导（'0' 表示不限速时单位会丢失，
// 且 computed setter 无法写回状态导致下拉选择无效），由 v-model 直接写入
const downloadUnit = ref(extractSpeedUnit(form.value.maxOverallDownloadLimit))
const uploadUnit = ref(extractSpeedUnit(form.value.maxOverallUploadLimit))
const formLabelWidth = ref(calcFormLabelWidth(preferenceConfig.value.locale))
const formOriginal = ref(initForm(preferenceConfig.value))
const locales = ref(availableLanguages)
const rules = ref({})
let saveTimeout = null
const originalLocale = ref(preferenceConfig.value.locale)
const hasNoResults = ref(false)
const collapseTagsBackgroundUiOpacityScope = ref(false)
const collapseTagsBackgroundUiFrostedBlurScope = ref(false)
// measureTextWidth 内部按 ref 使用（.value），此处必须用 ref，裸值会在背景图
// + 多选场景触发 computeScopeSelectCollapse 时抛 null.value TypeError
const textMeasureCanvas = ref(null)
// Tracker 多选可见 tag 数：collapse-tags 模式下动态控制，单行铺满可用宽度后再折叠为 "+N"
const trackerMaxCollapse = ref(1)
const extensionInput = ref('')
const domainInput = ref('')
const ed2kServersText = ref('')
const ed2kServerInput = ref('')
const ed2kSubscriptionInput = ref('')
const ed2kUpdatingForm = ref(false)
const ed2kSyncing = ref(false)
const trackerSourceOptions = ref([])
const trackerSyncing = ref(false)
const trackerSourceConfigVisible = ref(false)
const trackerSourceInput = ref('')
const trackerSourceConfigLoading = ref(false)
let _filterTimer = null
let _extensionUpdateHandler = null
let originHoldTimers = {}
let originHoldActivated = false
const trackerDropdownVisible = ref(false)
const backgroundUiOpacityScopeSelectRef = ref(null)
const backgroundUiFrostedBlurScopeSelectRef = ref(null)
const extensionInputRef = ref(null)
const domainInputRef = ref(null)
const ed2kServerInputRef = ref(null)
const ed2kSubscriptionInputRef = ref(null)
const trackerSelectRef = ref(null)
// 模板 ref="basicForm" 由 setup 中同名 ref 自动绑定（Options API 迁移遗留的 formRefs 映射未实现注册）
const basicForm = ref(null)
const formRefs = {}

// --- Computed ---

      const isRenderer = computed(() => is.renderer())
      const isMac = computed(() => is.macOS())
      const isMas = computed(() => is.mas())
      const isLinux = computed(() => is.linux())
      const btEncryptionOptions = computed(() => {
        return [
          { value: 'none', label: t('preferences.bt-encryption-none') },
          { value: 'adaptive', label: t('preferences.bt-encryption-adaptive') },
          { value: 'force', label: t('preferences.bt-encryption-force') }
        ]
      })
      const btConnectProtocolOptions = computed(() => {
        return [
          { value: 'both', label: t('preferences.bt-connect-protocol-both') },
          { value: 'utp', label: t('preferences.bt-connect-protocol-utp') },
          { value: 'tcp', label: t('preferences.bt-connect-protocol-tcp') }
        ]
      })
      const backgroundTypeOptions = computed(() => {
        return [
          { value: 'color', label: t('preferences.background-type-color') },
          { value: 'image', label: t('preferences.background-type-image') }
        ]
      })
      const systemLocaleName = computed(() => {
        return getSystemLocaleName()
      })
      const activeCategory = computed(() => {
        return props.category || 'basic'
      })
      const title = computed(() => {
        const subnav = subnavs.value.find(item => item.key === activeCategory.value)
        return subnav ? subnav.title : t('preferences.basic')
      })
      const maxConcurrentDownloads = computed(() => {
        return ENGINE_MAX_CONCURRENT_DOWNLOADS
      })
      const extensionTags = computed(() => {
        const value = form.value.extensionSkipFileExtensions || ''
        if (!value.trim()) return []

        // 支持逗号和换行符分隔
        return value
          .split(/[\n,]+/)
          .map(ext => ext.trim())
          .filter(ext => ext.length > 0)
      })
      const domainTags = computed(() => {
        const value = form.value.extensionExcludeDomains || ''
        if (!value.trim()) return []

        // 支持逗号和换行符分隔
        return value
          .split(/[\n,]+/)
          .map(domain => domain.trim())
          .filter(domain => domain.length > 0)
      })
      const ed2kServerTags = computed(() => {
        const value = ed2kServersText.value || ''
        if (!value.trim()) return BUILTIN_ED2K_SERVERS

        // 支持换行符和逗号分隔
        return value
          .split(/[\n,]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
      })
      const ed2kPresetSubscriptions = computed(() => {
        const current = Array.isArray(form.value.ed2kServerSource) ? form.value.ed2kServerSource : []
        const result = []
        ED2K_SERVER_SOURCE_OPTIONS.forEach(group => {
          group.options.forEach(opt => {
            if (!current.includes(opt.value)) {
              result.push({ value: opt.value, label: group.label })
            }
          })
        })
        return result
      })
      const maxOverallDownloadLimitParsed = computed({
        get () {
          return parseInt(form.value.maxOverallDownloadLimit)
        },
        set (value) {
          const limit = value > 0 ? `${value}${downloadUnit.value}` : 0
          form.value.maxOverallDownloadLimit = limit
        }
      })
      const maxOverallUploadLimitParsed = computed({
        get () {
          return parseInt(form.value.maxOverallUploadLimit)
        },
        set (value) {
          const limit = value > 0 ? `${value}${uploadUnit.value}` : 0
          form.value.maxOverallUploadLimit = limit
        }
      })
      const btIpBanListText = computed({
        get () {
          const list = Array.isArray(form.value.btIpBanList) ? form.value.btIpBanList : []
          return list.join('\n')
        },
        set (value) {
          form.value.btIpBanList = normalizeBtIpBanList(value)
          autoSaveForm()
        }
      })
      const runModes = computed(() => {
        let result = [
          {
            label: t('preferences.run-mode-standard'),
            value: APP_RUN_MODE.STANDARD
          },
          {
            label: t('preferences.run-mode-tray'),
            value: APP_RUN_MODE.TRAY
          }
        ]

        if (isMac) {
          result = [
            ...result,
            {
              label: t('preferences.run-mode-hide-tray'),
              value: APP_RUN_MODE.HIDE_TRAY
            }
          ]
        }

        return result
      })
      const speedUnits = computed(() => {
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
      })
      const preferenceBasePath = computed(() => {
        const path = `${route.path || ''}`
        return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
      })
      const subnavs = computed(() => {
        const base = preferenceBasePath.value
        return [
          {
            key: 'basic',
            title: t('preferences.basic'),
            route: `${base}/basic`
          },
          {
            key: 'appearance',
            title: t('preferences.appearance'),
            route: `${base}/appearance`
          },
          {
            key: 'transfer',
            title: t('preferences.transfer-settings'),
            route: `${base}/transfer`
          },
          {
            key: 'bt',
            title: t('preferences.bt-settings'),
            route: `${base}/bt`
          },
          {
            key: 'task',
            title: t('preferences.task-manage'),
            route: `${base}/task`
          },
          {
            key: 'file',
            title: t('preferences.file-manage'),
            route: `${base}/file`
          },
          {
            key: 'advanced',
            title: t('preferences.advanced'),
            route: `${base}/advanced`
          },
          {
            key: 'lab',
            title: t('preferences.lab'),
            route: `${base}/lab`
          }
        ]
      })
      const showHideAppMenuOption = computed(() => {
        return is.windows() || is.linux()
      })
      const backgroundImageOpacityPercent = computed({
        get () {
          const o = Number(form.value.backgroundImageOpacity)
          const clamped = Number.isFinite(o) ? Math.min(Math.max(o, 0.3), 1) : 0.4
          return Math.round(clamped * 100)
        },
        set (value) {
          const n = Number(value)
          const percent = Number.isFinite(n) ? Math.min(Math.max(n, 30), 100) : 40
          form.value.backgroundImageOpacity = percent / 100
        }
      })
      const backgroundUiOpacityPercent = computed({
        get () {
          const o = Number(form.value.backgroundUiOpacity)
          const clamped = Number.isFinite(o) ? Math.min(Math.max(o, 0.4), 1) : 0.9
          return Math.round(clamped * 100)
        },
        set (value) {
          const n = Number(value)
          const percent = Number.isFinite(n) ? Math.min(Math.max(n, 40), 100) : 90
          form.value.backgroundUiOpacity = percent / 100
        }
      })
      const backgroundUiFrostedBlurScopeOptions = computed(() => {
        return [
          { value: 'date-filter', label: t('preferences.background-ui-frosted-scope-date-filter') },
          { value: 'task-category-select', label: t('preferences.background-ui-frosted-scope-task-category-select') },
          { value: 'task-item', label: t('preferences.background-ui-frosted-scope-task-item') },
          { value: 'preference-card', label: t('preferences.background-ui-frosted-scope-preference-card') },
          { value: 'aside', label: t('preferences.background-ui-frosted-scope-aside') },
          { value: 'subnav', label: t('preferences.background-ui-frosted-scope-subnav') }
        ]
      })
      const backgroundUiOpacityScopeOptions = computed(() => {
        return [
          { value: 'date-filter', label: t('preferences.background-ui-opacity-scope-date-filter') },
          { value: 'task-category-select', label: t('preferences.background-ui-opacity-scope-task-category-select') },
          { value: 'task-item', label: t('preferences.background-ui-opacity-scope-task-item') },
          { value: 'preference-card', label: t('preferences.background-ui-opacity-scope-preference-card') },
          { value: 'aside', label: t('preferences.background-ui-opacity-scope-aside') },
          { value: 'subnav', label: t('preferences.background-ui-opacity-scope-subnav') }
        ]
      })
      const backgroundImageDisplay = computed(() => {
        const p = form.value.backgroundImage
        if (!p) return t('preferences.background-image-not-selected')
        try {
          return path.basename(p)
        } catch (_) {
          return p
        }
      })
      const appChannelUrl = computed(() => {
        return `ws://127.0.0.1:${APP_HTTP_PORT}/ws`
      })
            // 本地化文件分类名称
      const localizedFileCategories = computed(() => {
        const categories = { ...form.value.fileCategories }

        // 遍历所有分类，将名称键值转换为本地化文本
        Object.keys(categories).forEach(key => {
          const category = categories[key]
          // 如果名称是键值（如'image-files'），则进行本地化
          if (category.name && category.name.includes('-files')) {
            categories[key] = {
              ...category,
              name: t(`preferences.${category.name}`)
            }
          }
        })

        return categories
      })
      const originListForDisplay = computed(() => {
        const builtin = (TRACKER_SOURCE_OPTIONS || [])
          .map(g => g && g.label ? g.label : '')
          .filter(Boolean)
          .filter(l => l.includes('/'))
          .map(l => `https://github.com/${l}`)
        const saved = Array.isArray(form.value.trackerSourceOrigins) ? form.value.trackerSourceOrigins : []
        const normalizedSaved = saved.map(o => normalizeOriginUrl(o))
        return Array.from(new Set([...builtin.map(normalizeOriginUrl), ...normalizedSaved]))
      })
      const isAllTrackerSourcesSelected = computed(() => {
        // 获取所有可用的源
        const allSources = []
        ;(trackerSourceOptions.value || []).forEach(group => {
          (group.options || []).forEach(opt => {
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
        const selectedSources = Array.isArray(form.value.trackerSource) ? form.value.trackerSource : []

        // 检查是否所有源都被选中
        return allSources.length === selectedSources.length &&
          allSources.every(source => selectedSources.includes(source))
      })

// --- Watchers ---
watch(searchKeyword, (val) => {
  applyFilters(val)
}, { immediate: true })

watch(() => props.category, () => {
  // 切换分类时立即同步过滤，不走 120ms 防抖。
  filterCards(searchKeyword.value, activeCategory.value)
  // 进入 BT 页后 el-select 通过 v-if 首次渲染，nextTick 后 DOM 已挂载但
  // Element Plus 内部可能仍在异步初始化（如 popper 定位）。用双层 RAF
  // 确保布局稳定后再计算折叠数量，同时 updateTrackerCollapse 内部还有
  // RAF 重试机制兜底。
  if (props.category === 'bt') {
    nextTick(() => {
      requestAnimationFrame(() => { updateTrackerCollapse() })
    })
  }
}, { immediate: true })

// Tracker 源变化（勾选/取消/全选/重置/同步落库）后按宽度重算单行可见 tag 数
watch(() => form.value.trackerSource, () => {
  nextTick(() => {
    requestAnimationFrame(() => { updateTrackerCollapse() })
  })
}, { deep: true })

watch(() => form.value.extensionExcludeDomains, () => {
  // 当配置变化时，更新表单显示
  // 这个 watcher 确保从浏览器扩展添加的域名能实时显示在界面上
})

watch(() => form.value.ed2kDefaultServers, (val) => {
  if (ed2kUpdatingForm.value) return
  if (val) {
    ed2kServersText.value = val
  } else {
    ed2kServersText.value = BUILTIN_ED2K_SERVERS.join('\n')
  }
})

let _syncingFromStore = false

watch(form, () => {
  if (_syncingFromStore) return
  autoSaveForm()
}, { deep: true })

watch(() => preferenceConfig.value.engineMaxConnectionPerServer, (val) => {
  if (val === undefined || val === null) return
  _syncingFromStore = true
  form.value.engineMaxConnectionPerServer = val
  formOriginal.value.engineMaxConnectionPerServer = val
  if (form.value.maxConnectionPerServer > val) {
    form.value.maxConnectionPerServer = val
    formOriginal.value.maxConnectionPerServer = val
  }
  nextTick(() => { _syncingFromStore = false })
})

watch(() => preferenceConfig.value.extensionExcludeDomains, (newVal) => {
  if (newVal !== undefined && newVal !== form.value.extensionExcludeDomains) {
    _syncingFromStore = true
    form.value.extensionExcludeDomains = newVal
    formOriginal.value.extensionExcludeDomains = newVal
    nextTick(() => { _syncingFromStore = false })
  }
})

watch(() => preferenceConfig.value.extensionSkipFileExtensions, (newVal) => {
  if (newVal !== undefined && newVal !== form.value.extensionSkipFileExtensions) {
    _syncingFromStore = true
    form.value.extensionSkipFileExtensions = convertCommaToLine(newVal)
    formOriginal.value.extensionSkipFileExtensions = convertCommaToLine(newVal)
    nextTick(() => { _syncingFromStore = false })
  }
})

watch(() => form.value.backgroundType, () => {
  updateUiScopeSelectCollapse()
})

watch(() => form.value.backgroundUiOpacityScope, () => {
  updateUiScopeSelectCollapse()
}, { deep: true })

watch(() => form.value.backgroundUiFrostedBlurScope, () => {
  updateUiScopeSelectCollapse()
}, { deep: true })

watch(trackerSourceConfigVisible, (visible) => {
  if (!visible) {
    document.removeEventListener('mousedown', handleTrackerSourceOutsideClick)
  }
})

// --- Methods ---

      function measureTextWidth(text, font) {
        try {
          const canvas = textMeasureCanvas.value || (textMeasureCanvas.value = document.createElement('canvas'))
          const ctx = canvas.getContext('2d')
          if (!ctx) return `${text || ''}`.length * 10
          ctx.font = font || '12px sans-serif'
          return ctx.measureText(`${text || ''}`).width
        } catch (_) {
          return `${text || ''}`.length * 10
        }
      }
      function onBackgroundTypeChange(value) {
        if (form.value.backgroundType !== value) {
          form.value.backgroundType = value
          autoSaveForm()
        }
      }
      function computeScopeSelectCollapse(selectRef, values, options) {
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
          total += measureTextWidth(label, font) + 46
        })
        return total > available
      }
      function updateUiScopeSelectCollapse() {
        if (!form.value || form.value.backgroundType !== 'image') {
          collapseTagsBackgroundUiOpacityScope.value = false
          collapseTagsBackgroundUiFrostedBlurScope.value = false
          return
        }
        nextTick(() => {
          collapseTagsBackgroundUiOpacityScope.value = computeScopeSelectCollapse(
            backgroundUiOpacityScopeSelectRef.value,
            form.value.backgroundUiOpacityScope,
            backgroundUiOpacityScopeOptions.value
          )
          collapseTagsBackgroundUiFrostedBlurScope.value = computeScopeSelectCollapse(
            backgroundUiFrostedBlurScopeSelectRef.value,
            form.value.backgroundUiFrostedBlurScope,
            backgroundUiFrostedBlurScopeOptions.value
          )
        })
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
          if (!document) return
          const cards = document.querySelectorAll('.preference-card, .preference-bottom-actions')
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
      function getShortcutCommands() {
        const baseCommands = Object.values(keymap)
        const customCommands = Object.values(form.value.customKeymap || {})
        const set = new Set([...baseCommands, ...customCommands, 'task:multi-select'])
        const list = Array.from(set)
        const idx = list.indexOf('task:multi-select')
        if (idx !== -1) {
          list.splice(idx, 1)
        }
        list.push('task:multi-select')
        return list
      }
      function getKeystrokeByCommand(command) {
        if (command === 'task:multi-select') {
          return form.value.taskMultiSelectModifier || ''
        }
        const custom = form.value.customKeymap || {}
        const customEntries = Object.entries(custom)
        for (const [ks, cmd] of customEntries) {
          if (cmd === command) return ks
        }
        const baseEntries = Object.entries(keymap)
        for (const [ks, cmd] of baseEntries) {
          if (cmd === command) return ks
        }
        return ''
      }
      function normalizeKeystroke(event) {
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
      }
      function normalizeModifierKeystroke(event) {
        event.preventDefault()
        const parts = []
        if (event.ctrlKey) parts.push('ctrl')
        if (event.metaKey) parts.push('cmd')
        if (event.shiftKey) parts.push('shift')
        if (event.altKey) parts.push('alt')
        return parts.join('-')
      }
      function normalizeTaskMultiSelectKeystroke(event) {
        const key = `${event && event.key ? event.key : ''}`.toLowerCase()
        if (['control', 'meta', 'shift', 'alt'].includes(key)) {
          return normalizeModifierKeystroke(event)
        }
        return normalizeKeystroke(event)
      }
      function formatKeystrokeForDisplay(keystroke) {
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
      }
      function setTaskMultiSelectModifier(keystroke) {
        if (!keystroke) return
        if (keystroke === form.value.taskMultiSelectModifier) return
        const existingCommand = getCommandByKeystroke(keystroke)
        if (existingCommand) {
          const existingCommandLabel = getCommandLabel(existingCommand)
          const keystrokeDisplay = formatKeystrokeForDisplay(keystroke)
          const message = t('preferences.shortcut-duplicate-message', {
            keystroke: keystrokeDisplay,
            command: existingCommandLabel
          })
          ElMessage({
            type: 'warning',
            message: message,
            duration: 4000,
            dangerouslyUseHTMLString: true,
            showClose: true
          })
          return
        }
        form.value.taskMultiSelectModifier = keystroke
        autoSaveForm()
      }
      function resetShortcuts() {
        form.value.customKeymap = {}
        form.value.taskMultiSelectModifier = 'ctrl'
        autoSaveForm()
      }
      function handleShortcutKeydown(command, event) {
        if (command === 'task:multi-select') {
          setTaskMultiSelectModifier(normalizeTaskMultiSelectKeystroke(event))
          return
        }
        setCommandKeystroke(command, normalizeKeystroke(event))
      }
      function setCommandKeystroke(command, keystroke) {
        if (!keystroke) {
          // 如果没有按键，只是清除当前命令的快捷键
          const custom = { ...(form.value.customKeymap || {}) }
          Object.keys(custom).forEach(k => {
            if (custom[k] === command) {
              delete custom[k]
            }
          })
          form.value.customKeymap = custom
          autoSaveForm()
          return
        }

        // 检查快捷键是否已被其他命令使用
        const existingCommand = getCommandByKeystroke(keystroke)
        if (existingCommand && existingCommand !== command) {
          // 显示错误通知，不允许设置重复快捷键
          const existingCommandLabel = getCommandLabel(existingCommand)
          const keystrokeDisplay = formatKeystrokeForDisplay(keystroke)

          // 使用多语言本地化提示
          const message = t('preferences.shortcut-duplicate-message', {
            keystroke: keystrokeDisplay,
            command: existingCommandLabel
          })
          ElMessage({
            type: 'warning',
            message: message,
            duration: 4000,
            dangerouslyUseHTMLString: true,
            showClose: true
          })
          return
        }

        // 没有冲突，直接应用
        const custom = { ...(form.value.customKeymap || {}) }

        // 删除当前命令的旧快捷键
        Object.keys(custom).forEach(k => {
          if (custom[k] === command) {
            delete custom[k]
          }
        })

        // 设置新的快捷键
        custom[keystroke] = command

        form.value.customKeymap = custom
        autoSaveForm()
      }

      function getCommandByKeystroke(keystroke) {
        // 构建完整的当前快捷键映射
        const currentKeymap = getCurrentKeymap()
        return currentKeymap[keystroke] || null
      }

      function getCurrentKeymap() {
        // 从默认快捷键开始
        const current = { ...keymap }
        const custom = form.value.customKeymap || {}

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

        const multi = form.value.taskMultiSelectModifier || ''
        if (multi) {
          current[multi] = 'task:multi-select'
        }

        return current
      }
      function getCommandLabel(command) {
        const map = {
          'application:quit': 'app.quit',
          'application:new-task': 'task.new-task',
          'application:new-bt-task': 'task.new-bt-task',
          'application:open-file': 'task.open-torrent-file',
          'application:task-list': 'app.task-list',
          'application:preferences': 'app.preferences',
          'application:pause-all-task': 'task.pause-all-task',
          'application:resume-all-task': 'task.resume-all-task',
          'application:select-all-task': 'task.select-all-task',
          'task:multi-select': null
        }
        if (command === 'task:multi-select') {
          return t('preferences.multi-select-task')
        }
        const key = map[command]
        return key ? t(key) : command
      }
      function autoSaveForm() {
        // Debounce auto-save to avoid too many requests
        if (saveTimeout) {
          clearTimeout(saveTimeout)
        }
        saveTimeout = setTimeout(() => {
          // 验证下载中文件后缀格式
          validateDownloadingFileSuffix()

          // Double-check there are actual changes before submitting
          if (!isEmpty(diffConfig(formOriginal.value, form.value))) {
            submitForm('basicForm')
          }
        }, 300)
      }
      // BT 协议开关/选项的专用保存：点击立即保存、失败立即回弹并弹错误
      // 提示。任何异常都必须可见，不能静默失败（否则用户看到的就是
      // "点了没反应"）。
      // 生效方式（引擎已支持 changeGlobalOption 热更新）：
      // - 连接协议（bt-connect-protocol）：由三态选择器处理，立即生效
      // - enable-dht / enable-dht6：关闭立即生效；重新开启在下一个
      //   BT 任务创建时恢复（DHTSetup）
      // - enable-peer-exchange / enable-lpd：立即生效
      // - enable-upnp / enable-nat-pmp：端口映射在引擎启动时执行，
      //   下次引擎启动生效
      function onNatToggleChange(key, value) {
        const data = {}
        data[key] = value
        const original = formOriginal.value[key]
        preferenceStore.save(data)
          .then(() => {
            appStore.fetchEngineOptions()
            formOriginal.value[key] = value
            const restartOnNextBootKeys = ['enableUpnp', 'enableNatPmp']
            if (restartOnNextBootKeys.includes(key)) {
              msg.info(t('preferences.restart-to-apply'))
            }
          })
          .catch(() => {
            // 保存失败：回弹开关，让 UI 与实际配置保持一致，并明确报错
            form.value[key] = original
            msg.error(t('preferences.save-fail-message'))
          })
      }
      function onBtPortDiceClick() {
        const port = generateRandomInt(20000, 24999)
        form.value.listenPort = port
      }
      function onDhtPortDiceClick() {
        const port = generateRandomInt(25000, 29999)
        form.value.dhtListenPort = port
      }
      function validateDownloadingFileSuffix() {
        const suffix = form.value.downloadingFileSuffix
        if (suffix && suffix.trim() !== '' && !suffix.startsWith('.')) {
          // 如果用户输入的后缀不以"."开头，自动添加"."
          form.value.downloadingFileSuffix = '.' + suffix
          msg.warning(t('preferences.downloading-file-suffix-format-warning'))
        }
      }
      function handleLocaleChange(locale) {
        const lng = getLanguage(locale)
        getLocaleManager().changeLanguage(lng)
        // 同步更新 vue-i18n 的 locale，使 t() 实时切换语言（composition 模式用 .value）
        i18n.global.locale.value = lng
        autoSaveForm()
      }
      function handleThemeChange(theme) {
        form.value.theme = theme
        autoSaveForm()
      }
      function normalizeUiScopeValues(values, allowedOptions) {
        const opts = Array.isArray(allowedOptions) ? allowedOptions : []
        const set = new Set(opts.map(s => `${s}`))
        const v = Array.isArray(values) ? values : null
        if (!v) return [...opts]
        const filtered = v
          .map(s => `${s}`.trim())
          .filter(s => set.has(s))
        return filtered.length > 0 ? filtered : [...opts]
      }
      function normalizeUiNumber(value, min, max, fallback) {
        const n = Number(value)
        if (!Number.isFinite(n)) return fallback
        return Math.min(Math.max(n, min), max)
      }
      function getBackgroundImageCacheDir() {
        try {
          const userData = app.getPath('userData')
          return path.join(userData, 'background-images')
        } catch (e) {
          return ''
        }
      }
      function isCachedBackgroundImagePath(p) {
        try {
          const cacheDir = getBackgroundImageCacheDir()
          if (!cacheDir) return false
          const resolvedCache = path.resolve(cacheDir)
          const resolvedPath = path.resolve(p || '')
          const prefix = resolvedCache.endsWith(path.sep) ? resolvedCache : `${resolvedCache}${path.sep}`
          return resolvedPath.toLowerCase().startsWith(prefix.toLowerCase())
        } catch (e) {
          return false
        }
      }
      async function cacheBackgroundImageToAppDir(sourcePath) {
        const src = `${sourcePath || ''}`.trim()
        if (!src) return ''
        if (isCachedBackgroundImagePath(src)) return src

        const cacheDir = getBackgroundImageCacheDir()
        if (!cacheDir) return ''

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
      }
      async function deleteCachedBackgroundImageIfNeeded(p) {
        const target = `${p || ''}`.trim()
        if (!target) return
        if (!isCachedBackgroundImagePath(target)) return
        try {
          await fs.promises.unlink(target)
        } catch (e) {}
      }
      async function selectBackgroundImage() {
        try {
          const result = await dialog.showOpenDialog({
            title: t('preferences.background-image-select'),
            properties: ['openFile'],
            filters: [
              { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }
            ]
          })
          if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return
          }
          const selected = result.filePaths[0]
          const oldPath = form.value.backgroundImage
          const cached = await cacheBackgroundImageToAppDir(selected)
          if (!cached) {
            throw new Error('cache background image failed')
          }
          form.value.backgroundImage = cached
          form.value.backgroundType = 'image'
          autoSaveForm()
          if (oldPath && oldPath !== cached) {
            await deleteCachedBackgroundImageIfNeeded(oldPath)
          }
        } catch (e) {
          msg.error(t('preferences.save-fail-message'))
        }
      }
      function clearBackgroundImage() {
        const oldPath = form.value.backgroundImage
        form.value.backgroundImage = ''
        form.value.backgroundType = 'color'
        autoSaveForm()
        deleteCachedBackgroundImageIfNeeded(oldPath)
      }
      function handleDownloadChange(value) {
        // v-model 已把新单位写入 downloadUnit ref，此处仅重算形如 "1024M" 的引擎配置值
        const rawLimit = form.value.maxOverallDownloadLimit
        const match = String(rawLimit).match(/^(\d+\.?\d*)/)
        const num = match ? match[1] : '0'
        form.value.maxOverallDownloadLimit = parseFloat(rawLimit) > 0 ? `${num}${value}` : 0
        autoSaveForm()
      }
      function handleUploadChange(value) {
        const rawLimit = form.value.maxOverallUploadLimit
        const match = String(rawLimit).match(/^(\d+\.?\d*)/)
        const num = match ? match[1] : '0'
        form.value.maxOverallUploadLimit = parseFloat(rawLimit) > 0 ? `${num}${value}` : 0
        autoSaveForm()
      }
      function onKeepSeedingChange(enable) {
        form.value.seedRatio = enable ? 0 : 1
        form.value.seedTime = enable ? 525600 : 60
        autoSaveForm()
      }
      function onBtEncryptionModeChange(mode) {
        const modeConfig = {
          none: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'plain' },
          adaptive: { 'bt-require-crypto': false, 'bt-min-crypto-level': 'arc4' },
          force: { 'bt-require-crypto': true, 'bt-min-crypto-level': 'arc4' }
        }
        const cfg = modeConfig[mode] || modeConfig.adaptive
        form.value.btEncryptionMode = mode
        form.value.btRequireCrypto = cfg['bt-require-crypto']
        form.value.btMinCryptoLevel = cfg['bt-min-crypto-level']
        autoSaveForm()
      }
      function onBtConnectProtocolChange(mode) {
        form.value.btConnectProtocol = mode
        // uTP 传输保持托管（enable-utp=true），由 bt-connect-protocol
        // 决定策略；这样在三种模式间热切换无需重启引擎。
        form.value.enableUtp = true
        autoSaveForm()
      }
      function handleHistoryDirectorySelected(dir) {
        form.value.dir = dir
        autoSaveForm()
      }
      function addExtension() {
        const input = extensionInput.value.trim()
        if (!input) return

        // 分割扩展名（支持多种分隔符：逗号、分号、空格）
        const newExtensions = input
          .split(/[,，;；\s]+/)
          .map(ext => ext.trim().toLowerCase().replace(/^\./, '')) // 移除开头的点并转小写
          .filter(ext => ext.length > 0)

        if (newExtensions.length === 0) {
          extensionInput.value = ''
          return
        }

        // 获取现有扩展名
        const existingExtensions = extensionTags.value

        // 合并并去重
        const allExtensions = [...existingExtensions, ...newExtensions]
        const uniqueExtensions = Array.from(new Set(allExtensions))

        // 更新表单（使用换行符分隔）
        form.value.extensionSkipFileExtensions = uniqueExtensions.join('\n')

        // 清空输入框
        extensionInput.value = ''

        // 保存
        autoSaveForm()
      }
      function removeExtension(ext) {
        // 从列表中移除指定扩展名
        const extensions = extensionTags.value.filter(e => e !== ext)

        // 更新表单（使用换行符分隔）
        form.value.extensionSkipFileExtensions = extensions.join('\n')

        // 保存
        autoSaveForm()
      }
      function focusExtensionInput() {
        // 点击容器时聚焦到输入框
        nextTick(() => {
          if (extensionInputRef.value) {
            extensionInputRef.value.focus()
          }
        })
      }
      function handleDeleteKey(event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (extensionInput.value === '' && extensionTags.value.length > 0) {
          event.preventDefault()
          const lastExt = extensionTags.value[extensionTags.value.length - 1]
          removeExtension(lastExt)
        }
      }
      function addDomain() {
        const input = domainInput.value.trim()
        if (!input) return

        // 分割域名（支持多种分隔符：逗号、分号、空格）
        const newDomains = input
          .split(/[,，;；\s]+/)
          .map(domain => domain.trim().toLowerCase())
          .filter(domain => domain.length > 0)

        if (newDomains.length === 0) {
          domainInput.value = ''
          return
        }

        // 获取现有域名
        const existingDomains = domainTags.value

        // 合并并去重
        const allDomains = [...existingDomains, ...newDomains]
        const uniqueDomains = Array.from(new Set(allDomains))

        // 更新表单（使用换行符分隔）
        form.value.extensionExcludeDomains = uniqueDomains.join('\n')

        // 清空输入框
        domainInput.value = ''

        // 保存
        autoSaveForm()
      }
      function removeDomain(domain) {
        // 从列表中移除指定域名
        const domains = domainTags.value.filter(d => d !== domain)

        // 更新表单（使用换行符分隔）
        form.value.extensionExcludeDomains = domains.join('\n')

        // 保存
        autoSaveForm()
      }
      function focusDomainInput() {
        // 点击容器时聚焦到输入框
        nextTick(() => {
          if (domainInputRef.value) {
            domainInputRef.value.focus()
          }
        })
      }
      function handleDomainDeleteKey(event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (domainInput.value === '' && domainTags.value.length > 0) {
          event.preventDefault()
          const lastDomain = domainTags.value[domainTags.value.length - 1]
          removeDomain(lastDomain)
        }
      }
      function addEd2kServer() {
        const input = ed2kServerInput.value.trim()
        if (!input) return

        // 分割输入（支持逗号、分号、空格等分隔符）
        const newServers = input
          .split(/[,，;；\s]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)

        if (newServers.length === 0) {
          ed2kServerInput.value = ''
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
        const existingServers = ed2kServerTags.value

        // 合并并去重
        const allServers = [...existingServers, ...normalizedServers]
        const uniqueServers = Array.from(new Set(allServers))
        const serverStr = uniqueServers.join('\n')

        // 更新显示
        ed2kServersText.value = serverStr

        // 同步到表单，以便 autoSaveForm 能检测到变更
        ed2kUpdatingForm.value = true
        form.value.ed2kDefaultServers = convertLineToComma(serverStr)
        ed2kUpdatingForm.value = false

        // 清空输入框
        ed2kServerInput.value = ''

        // 保存
        autoSaveForm()
      }
      function removeEd2kServer(server) {
        // 从列表中移除指定服务器
        const servers = ed2kServerTags.value.filter(s => s !== server)
        const serverStr = servers.join('\n')

        // 更新显示
        ed2kServersText.value = serverStr

        // 同步到表单，以便 autoSaveForm 能检测到变更
        ed2kUpdatingForm.value = true
        form.value.ed2kDefaultServers = convertLineToComma(serverStr)
        ed2kUpdatingForm.value = false

        // 保存
        autoSaveForm()
      }
      function focusEd2kServerInput() {
        // 点击容器时聚焦到输入框
        nextTick(() => {
          if (ed2kServerInputRef.value) {
            ed2kServerInputRef.value.focus()
          }
        })
      }
      function handleEd2kServerDeleteKey(event) {
        // 当输入框为空且按下删除键时，删除最后一个标签
        if (ed2kServerInput.value === '' && ed2kServerTags.value.length > 0) {
          event.preventDefault()
          const lastServer = ed2kServerTags.value[ed2kServerTags.value.length - 1]
          removeEd2kServer(lastServer)
        }
      }
      function addEd2kSubscription() {
        const input = ed2kSubscriptionInput.value.trim()
        if (!input) return

        const current = Array.isArray(form.value.ed2kServerSource) ? form.value.ed2kServerSource : []
        if (!current.includes(input)) {
          form.value.ed2kServerSource = [...current, input]
          autoSaveForm()
        }
        ed2kSubscriptionInput.value = ''
      }
      function addPresetSubscription(url) {
        const current = Array.isArray(form.value.ed2kServerSource) ? form.value.ed2kServerSource : []
        if (!current.includes(url)) {
          form.value.ed2kServerSource = [...current, url]
          autoSaveForm()
        }
      }
      function removeEd2kSubscription(url) {
        const current = Array.isArray(form.value.ed2kServerSource) ? form.value.ed2kServerSource : []
        form.value.ed2kServerSource = current.filter(s => s !== url)
        autoSaveForm()
      }
      function focusEd2kSubscriptionInput() {
        nextTick(() => {
          if (ed2kSubscriptionInputRef.value) {
            ed2kSubscriptionInputRef.value.focus()
          }
        })
      }
      function handleEd2kSubscriptionDeleteKey(event) {
        const current = Array.isArray(form.value.ed2kServerSource) ? form.value.ed2kServerSource : []
        if (ed2kSubscriptionInput.value === '' && current.length > 0) {
          event.preventDefault()
          const last = current[current.length - 1]
          removeEd2kSubscription(last)
        }
      }
      async function syncEd2kServersFromSource() {
        const source = form.value.ed2kServerSource
        if (!source || source.length === 0) {
          return
        }

        ed2kSyncing.value = true
        try {
          const servers = await preferenceStore.fetchEd2kServers(source)
          if (servers && servers.length > 0) {
            // Merge with builtin servers and dedupe
            const merged = [...new Set([...servers, ...BUILTIN_ED2K_SERVERS])]
            const serverStr = merged.join(',')

            ed2kUpdatingForm.value = true
            form.value.ed2kDefaultServers = serverStr
            form.value.ed2kLastSyncServerTime = Date.now()
            ed2kUpdatingForm.value = false

            ed2kServersText.value = convertCommaToLine(serverStr)
            autoSaveForm()
            msg.success(t('preferences.ed2k-sync-success'))
          } else {
            msg.warning(t('preferences.ed2k-sync-empty'))
          }
        } catch (error) {
          console.error('[ED2K] sync servers failed:', error)
          msg.error(t('preferences.ed2k-sync-fail'))
        } finally {
          ed2kSyncing.value = false
        }
      }
      function formatSyncTime(timestamp) {
        if (!timestamp) return ''
        const d = new Date(timestamp)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      }
      function handleNativeDirectorySelected(dir) {
        form.value.dir = dir
        preferenceStore.recordHistoryDirectory(dir)
        autoSaveForm()
      }
      function handleSecurityScanPathSelected(path) {
        form.value.customSecurityScanPath = path
        autoSaveForm()
      }
      function copyChannelUrl() {
        const text = appChannelUrl.value
        if (!text) return
        try {
          clipboard.writeText(text)
          msg.success(t('preferences.save-success-message'))
        } catch (e) {
          msg.error(t('preferences.save-fail-message'))
        }
      }
      // 获取浏览器扩展目录路径
      // 开发环境：<workspace>/extensions/lerxu-webextension
      // 生产环境：<resourcesPath>/lerxu-webextension（extraResources 打包到 asar 外部）
      function getExtensionDir () {
        const rp = process && process.resourcesPath ? process.resourcesPath : ''
        if (rp) {
          // 打包后扩展目录可能在不同位置，依次检查
          const candidates = [
            path.join(rp, 'lerxu-webextension'),
            path.join(rp, 'app.asar', 'extensions', 'lerxu-webextension')
          ]
          for (const p of candidates) {
            if (fs.existsSync(p)) return p
          }
        }
        // 开发环境
        const appPath = app.getAppPath()
        return path.join(appPath, 'extensions', 'lerxu-webextension')
      }

      // 点击浏览器按钮：跳转到对应浏览器的扩展管理页面，
      // 并在文件管理器中打开扩展目录，方便用户在浏览器
      // "加载已解压的扩展程序"时选中该目录。
      async function openBrowserExtension (browser) {
        const extensionDir = getExtensionDir()

        if (!fs.existsSync(extensionDir)) {
          msg.error(t('preferences.extension-file-not-found'))
          return
        }

        const extensionUrl = browser === 'edge' ? 'edge://extensions/' : 'chrome://extensions/'

        // 先启动浏览器并跳转到扩展管理页面
        // shell.openExternal 无法打开 chrome:// 等浏览器内部协议，
        // 由主进程负责启动（Windows 下优先直接调用浏览器可执行文件）
        let result = null
        try {
          result = await ipcRenderer.invoke('open-browser-extension-page', { browser })
        } catch (e) {}

        if (result && result.ok === false) {
          msg.error(t('preferences.extension-open-failed', { url: extensionUrl }))
        } else if (result && result.navigated === false) {
          // Windows 版 Edge 会丢弃命令行传入的 edge:// URL（安全过滤），
          // 因此 Edge 不做任何拉起；Chrome 已在运行时也只激活不导航。
          // 两种情况都把地址复制到剪贴板，提示用户粘贴到地址栏打开。
          try { clipboard.writeText(extensionUrl) } catch (e) {}
          if (result.running) {
            msg.warning(t('preferences.extension-open-running', { url: extensionUrl }))
          } else {
            msg.warning(t('preferences.extension-open-manual', { url: extensionUrl }))
          }
        }

        // 延迟后再打开扩展目录：让资源管理器窗口在浏览器之后出现、
        // 位于最前，方便拖拽加载。此前"先开目录再延迟二次激活"的
        // 方式在 Windows 下会开出两个相同的目录窗口（explorer 带路径
        // 参数是新开窗口而非聚焦已有窗口），已移除。
        setTimeout(() => {
          ipcRenderer.invoke('reveal-extension-dir', { dir: extensionDir })
        }, 1500)
      }
      function openVideoDetectionSettings() {
        ipcRenderer.send('open-video-detection-settings')
      }
      function openFileCategoriesSettings() {
        ipcRenderer.send('open-file-categories-settings')
      }
      function onDirectorySelected(dir) {
        form.value.dir = dir
        autoSaveForm()
      }
      function syncFormConfig() {
        console.log('[Basic] syncFormConfig called')

        preferenceStore.fetchPreference()
          .then((config) => {
            console.log('[Basic] Fetched config:', config)
            form.value = initForm(config)
            formOriginal.value = cloneDeep(form.value)
            downloadUnit.value = extractSpeedUnit(config.maxOverallDownloadLimit)
            uploadUnit.value = extractSpeedUnit(config.maxOverallUploadLimit)
            console.log('[Basic] Form updated:', form.value)
          })
      }
      function submitForm(formName) {
        const formRef = formName === 'basicForm' ? basicForm.value : formRefs[formName]
        if (!formRef) {
          console.error('[Lerxu] form ref not found:', formName)
          return false
        }
        formRef.validate((valid) => {
          if (!valid) {
            console.error('[Lerxu] preference form valid:', valid)
            return false
          }

          const diffResult = diffConfig(formOriginal.value, form.value)
          if (!isEmpty(diffResult)) {
            console.log('[Lerxu] diffConfig result:', JSON.stringify(diffResult))
          }

          const data = {
            ...diffResult,
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

          if ('btAutoBanPeer' in data) {
            data['bt-auto-ban-peer'] = data.btAutoBanPeer ? 'true' : 'false'
          }
          if ('btAutoBanBadData' in data) {
            data['bt-auto-ban-bad-data'] = data.btAutoBanBadData ? 'true' : 'false'
          }
          if ('btAutoBanZeroProgress' in data) {
            data['bt-auto-ban-zero-progress'] = data.btAutoBanZeroProgress ? 'true' : 'false'
          }
          if ('btAutoBanSnubbing' in data) {
            data['bt-auto-ban-snubbing'] = data.btAutoBanSnubbing ? 'true' : 'false'
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

          // 仅在 ed2kDefaultServers 实际发生变化时才加入 data，
          // 避免切换语言等无关操作触发不必要的 ed2k 配置写入
          const currentServers = ed2kServerTags.value
          const builtinStr = BUILTIN_ED2K_SERVERS.join(',')
          const currentStr = currentServers.join(',')
          const newEd2kServers = currentStr !== builtinStr
            ? convertLineToComma(ed2kServersText.value)
            : ''
          if (newEd2kServers !== (formOriginal.value.ed2kDefaultServers || '')) {
            data.ed2kDefaultServers = newEd2kServers
          }

          if (rpcListenPort === EMPTY_STRING) {
            data.rpcListenPort = rpcDefaultPort.value
          }

          console.log('[Lerxu] preference changed data:', data)

          preferenceStore.save(data)
            .then(() => {
              appStore.fetchEngineOptions()
              // 只更新 formOriginal，保持 form 不变
              formOriginal.value = cloneDeep(form.value)
              // Don't show success message for auto-save to avoid constant notifications
            })
            .catch(() => {
              msg.error(t('preferences.save-fail-message'))
            })

          changedConfig.basic = {}
          changedConfig.advanced = {}

          if (isRenderer) {
            if ('autoHideWindow' in data) {
              ipcRenderer.send('command',
                                              'application:auto-hide-window', autoHideWindow)
            }

            if (checkIsNeedRestart(data)) {
              console.warn('[Lerxu] preference change requires restart, data:', data)
              ipcRenderer.send('command', 'application:relaunch')
            }
          }
        })
      }

      // ---- Tracker Methods ----
      function extractTrackerLines(text) {
        const raw = `${text}`
        const tokens = raw.split(/\r?\n|,/)
        return tokens.map(t => `${t}`.trim()).filter(Boolean).filter(t => /^(udp|http|https):\/\//i.test(t))
      }
      function getBuiltinOrigins() {
        return (TRACKER_SOURCE_OPTIONS || [])
          .map(g => g && g.label ? g.label : '')
          .filter(Boolean)
          .filter(l => l.includes('/'))
          .map(l => `https://github.com/${l}`)
      }
      function onOriginMouseDown(o, e) {
        if (!e || e.button !== 0) return
        if (!originHoldTimers) originHoldTimers = {}
        originHoldActivated = false
        const tid = setTimeout(() => {
          originHoldActivated = true
          deleteOrigin(o)
        }, 800)
        originHoldTimers[o] = tid
      }
      function onOriginMouseUp(o) {
        cancelOriginHold(o)
      }
      function onOriginMouseLeave(o) {
        cancelOriginHold(o)
      }
      function cancelOriginHold(o) {
        if (originHoldTimers && originHoldTimers[o]) {
          clearTimeout(originHoldTimers[o])
          delete originHoldTimers[o]
        }
      }
      function onOriginClick(o) {
        if (originHoldActivated) return
        try {
          window.open(o, '_blank')
        } catch (_) {}
      }
      function deleteOrigin(o) {
        const builtin = getBuiltinOrigins()
        if (builtin.includes(o)) {
          msg.warning(t('preferences.builtin-origin-undeletable'))
          return
        }
        const origins = Array.isArray(form.value.trackerSourceOrigins) ? [...form.value.trackerSourceOrigins] : []
        const idx = origins.indexOf(o)
        if (idx >= 0) origins.splice(idx, 1)
        form.value.trackerSourceOrigins = origins
        const discovered = Array.isArray(form.value.trackerSourceDiscovered) ? [...form.value.trackerSourceDiscovered] : []
        const map = typeof form.value.trackerSourceMap === 'object' && form.value.trackerSourceMap ? { ...form.value.trackerSourceMap } : {}
        const filtered = discovered.filter(u => {
          const origin = map[u] || deriveOriginSite(u)
          return origin !== o
        })
        form.value.trackerSourceDiscovered = filtered
        Object.keys(map).forEach(k => { if (map[k] === o) delete map[k] })
        form.value.trackerSourceMap = map
        const selected = Array.isArray(form.value.trackerSource) ? [...form.value.trackerSource] : []
        const selectedFiltered = selected.filter(u => {
          const origin = map[u] || deriveOriginSite(u)
          return origin !== o
        })
        form.value.trackerSource = selectedFiltered
        rebuildTrackerSourceOptions()
        sanitizeSelectedSources()
        autoSaveForm()
        recomputeBtTrackerFromSelected()
        msg.success(t('preferences.origin-removed'))
      }
      function recomputeBtTrackerFromSelected() {
        const selected = Array.isArray(form.value.trackerSource) ? form.value.trackerSource : []
        if (!selected.length) {
          form.value.btTracker = ''
          form.value.lastSyncTrackerTime = Date.now()
          return
        }
        trackerSyncing.value = true
        preferenceStore.fetchBtTracker(selected)
          .then((data) => {
            const texts = Array.isArray(data) ? data : []
            const lines = []
            texts.forEach(t => {
              const ls = extractTrackerLines(t)
              if (ls && ls.length) lines.push(...ls)
            })
            const uniq = Array.from(new Set(lines))
            const tracker = uniq.join('\n')
            form.value.lastSyncTrackerTime = Date.now()
            form.value.btTracker = tracker
            trackerSyncing.value = false
          })
          .catch((_) => {
            trackerSyncing.value = false
          })
      }
      function sanitizeSelectedSources() {
        const allowed = new Set()
        ;(trackerSourceOptions.value || []).forEach(group => {
          (group.options || []).forEach(opt => allowed.add(opt.value))
        })
        const current = Array.isArray(form.value.trackerSource) ? form.value.trackerSource : []
        const filtered = current.filter(v => allowed.has(v))
        if (filtered.length !== current.length) {
          form.value.trackerSource = filtered
        }
      }
      function applyTrackerResult(lines, usedUrls = [], originSite = '') {
        const uniq = Array.from(new Set(lines))
        form.value.btTracker = uniq.join('\n')
        form.value.lastSyncTrackerTime = Date.now()
        const discovered = Array.isArray(form.value.trackerSourceDiscovered) ? [...form.value.trackerSourceDiscovered] : []
        usedUrls.forEach(u => { if (!discovered.includes(u)) discovered.push(u) })
        form.value.trackerSourceDiscovered = discovered
        const origins = Array.isArray(form.value.trackerSourceOrigins) ? [...form.value.trackerSourceOrigins] : []
        const normalizedOrigin = originSite ? normalizeOriginUrl(originSite) : ''
        if (normalizedOrigin && !origins.map(o => normalizeOriginUrl(o)).includes(normalizedOrigin)) origins.push(normalizedOrigin)
        form.value.trackerSourceOrigins = origins
        const map = typeof form.value.trackerSourceMap === 'object' && form.value.trackerSourceMap ? { ...form.value.trackerSourceMap } : {}
        usedUrls.forEach(u => { if (originSite) map[u] = originSite })
        form.value.trackerSourceMap = map
        rebuildTrackerSourceOptions()
        autoSaveForm()
        msg.success(t('preferences.extract-success', { count: uniq.length }))
      }
      function applySourceDiscovery(usedUrls = [], originSite = '') {
        const discovered = Array.isArray(form.value.trackerSourceDiscovered) ? [...form.value.trackerSourceDiscovered] : []
        usedUrls.forEach(u => { if (!discovered.includes(u)) discovered.push(u) })
        form.value.trackerSourceDiscovered = discovered
        const origins = Array.isArray(form.value.trackerSourceOrigins) ? [...form.value.trackerSourceOrigins] : []
        const normalizedOrigin = originSite ? normalizeOriginUrl(originSite) : ''
        if (normalizedOrigin && !origins.map(o => normalizeOriginUrl(o)).includes(normalizedOrigin)) origins.push(normalizedOrigin)
        form.value.trackerSourceOrigins = origins
        const map = typeof form.value.trackerSourceMap === 'object' && form.value.trackerSourceMap ? { ...form.value.trackerSourceMap } : {}
        usedUrls.forEach(u => { if (originSite) map[u] = originSite })
        form.value.trackerSourceMap = map
        rebuildTrackerSourceOptions()
        sanitizeSelectedSources()
        autoSaveForm()
        msg.success(t('preferences.added-origin-files-success', { count: usedUrls.length }))
      }
      function rebuildTrackerSourceOptions() {
        const base = structuredClone(TRACKER_SOURCE_OPTIONS)
        const srcs = Array.isArray(form.value.trackerSourceDiscovered) ? form.value.trackerSourceDiscovered : []
        const groups = {}
        srcs.forEach(u => {
          const groupLabel = deriveTrackerGroup(u) || deriveTrackerGroupByHost(u)
          const opt = { value: u, label: deriveTrackerLabel(u), cdn: false }
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
        trackerSourceOptions.value = base
        sanitizeSelectedSources()
      }
      function deriveTrackerLabel(u) {
        const m = /([^/]+\.txt)(?:\?.*)?$/i.exec(`${u}`)
        if (m) return m[1]
        return u
      }
      // 计算 Tracker 多选在单行内最多能完整显示的 tag 数量：
      // 用 canvas 逐项测量 tag 文本宽度（口径与 computeScopeSelectCollapse 一致），
      // 累加后若还能放下剩余项则全部显示，否则只显示能放下的前 N 个，其余折叠成 "+N"。
      // updateTrackerCollapse 可能在 v-if 首次渲染时被过早调用（el-select 内部 DOM 尚未完成）。
      // _trackerCollapseRafId 用于在下一帧重试，确保布局稳定后才计算 tag 可见数。
      let _trackerCollapseRafId = 0
      let _trackerCollapseRetries = 0
      function updateTrackerCollapse() {
        const refVal = trackerSelectRef.value
        const el = refVal && (refVal.$el || refVal)
        const total = Array.isArray(form.value.trackerSource) ? form.value.trackerSource.length : 0
        if (!el || total === 0) {
          trackerMaxCollapse.value = Math.max(1, total || 1)
          return
        }
        const selection = el.querySelector('.el-select__selection')
        // el-select 通过 v-if 刚渲染时，内部 DOM（.el-select__selection / .el-tag）
        // 可能尚未挂载或宽度为 0。用 requestAnimationFrame 延迟到下一帧重试，
        // 最多重试 10 帧（约 160ms@60fps），覆盖 Element Plus 内部异步渲染周期。
        if (!selection || !selection.clientWidth) {
          if (_trackerCollapseRafId) cancelAnimationFrame(_trackerCollapseRafId)
          _trackerCollapseRetries++
          if (_trackerCollapseRetries > 10) {
            _trackerCollapseRetries = 0
            trackerMaxCollapse.value = Math.max(1, total - 1)
            return
          }
          _trackerCollapseRafId = requestAnimationFrame(() => {
            _trackerCollapseRafId = 0
            updateTrackerCollapse()
          })
          return
        }
        // DOM 已就绪，重置重试计数
        _trackerCollapseRetries = 0
        const avail = selection.clientWidth
        if (!avail) return
        const tagEl = el.querySelector('.el-tag')
        const font = tagEl ? window.getComputedStyle(tagEl).font : '12px sans-serif'
        // 每个 tag 的文本外占位：左右内边距 + 关闭按钮 + 边框，约 34-44px
        const TAG_EXTRA = 40
        const GAP = 6
        // 折叠 chip "+N" 自身宽度 + 右侧空隙预留；全部放得下时不显示 chip，无需预留
        const collapseChipW = 44
        const limit = avail - 12 // selection 左右内边距
        let acc = 0
        let visible = 0
        const vals = form.value.trackerSource
        // 尽量一行放满（不给 chip 预留），全部放得下则全部显示；
        // 放不下时给 "+N" 预留位置，只显示能容纳的前 N 个
        let allFit = true
        for (let i = 0; i < total; i++) {
          const w = measureTextWidth(deriveTrackerLabel(vals[i]), font) + TAG_EXTRA
          if (acc + w + GAP > limit) { allFit = false; break }
          acc += w + GAP
          visible++
        }
        if (allFit) {
          trackerMaxCollapse.value = total
          return
        }
        // 需要折叠：重新按"预留 chip 宽度"计算可见数
        const chipLimit = limit - collapseChipW
        acc = 0
        visible = 0
        for (let i = 0; i < total; i++) {
          const w = measureTextWidth(deriveTrackerLabel(vals[i]), font) + TAG_EXTRA
          if (acc + w + GAP > chipLimit) break
          acc += w + GAP
          visible++
        }
        trackerMaxCollapse.value = Math.max(1, Math.min(visible, total - 1))
      }
      function deriveTrackerGroup(u) {
        const s = `${u}`
        const m1 = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m1) return `${m1[1]}/${m1[2]}`
        const m2 = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m2) return `${m2[1]}/${m2[2]}`
        const m3 = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i.exec(s)
        if (m3) return `${m3[1]}/${m3[2]}`
        if (/down\.adysec\.com/i.test(s)) return 'adysec/tracker'
        return ''
      }
      function deriveTrackerGroupByHost(u) {
        try {
          const { host } = new URL(u)
          return host
        } catch (_) {
          return ''
        }
      }
      function openTrackerSourceConfigDialog() {
        if (trackerSourceConfigVisible.value) {
          closeTrackerSourcePopup()
          return
        }
        trackerSourceInput.value = ''
        trackerSourceConfigVisible.value = true
        nextTick(() => {
          adjustTrackerPopupPosition()
          document.addEventListener('mousedown', handleTrackerSourceOutsideClick)
        })
      }
      function adjustTrackerPopupPosition() {
        const popup = document.querySelector('.tracker-source-popup')
        const wrapper = document.querySelector('.tracker-source-popup-wrapper')
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
      }
      function handleTrackerSourceOutsideClick(e) {
        const popup = document.querySelector('.tracker-source-popup-wrapper')
        if (popup && !popup.contains(e.target)) {
          closeTrackerSourcePopup()
        }
      }
      function closeTrackerSourcePopup() {
        const popup = document.querySelector('.tracker-source-popup')
        if (popup) {
          popup.style.left = ''
          popup.style.right = ''
          popup.style.top = ''
          popup.style.bottom = ''
          popup.style.marginTop = ''
          popup.style.marginBottom = ''
          popup.style.transformOrigin = ''
        }
        trackerSourceConfigVisible.value = false
        document.removeEventListener('mousedown', handleTrackerSourceOutsideClick)
      }
      function onTrackerDropdownVisibleChange(visible) {
        trackerDropdownVisible.value = visible
      }
      function onTrackerSourceChange() {
        autoSaveForm()
        recomputeBtTrackerFromSelected()
      }
      function toggleTrackerDropdown() {
        const selectRef = trackerSelectRef.value
        if (selectRef) {
          if (trackerDropdownVisible.value) {
            selectRef.blur()
          } else {
            selectRef.focus()
          }
        }
      }
      async function addTrackerSourceFromInput() {
        const url = `${trackerSourceInput.value}`.trim()
        if (!url) return
        if (trackerSourceConfigLoading.value) return
        trackerSourceConfigLoading.value = true
        // 提取可能较慢（遍历仓库 README/候选文件），先给出进度提示
        const loadingMsg = ElMessage({ message: t('preferences.extract-progress'), type: 'info', duration: 0 })
        try {
          await configureTrackerFromGithubWithUrl(url)
        } finally {
          trackerSourceConfigLoading.value = false
          try {
            loadingMsg.close()
          } catch (_) {
            ElMessage.closeAll()
          }
        }
        trackerSourceInput.value = ''
        closeTrackerSourcePopup()
      }
      function removeDiscoveredSource(u) {
        const list = Array.isArray(form.value.trackerSourceDiscovered) ? [...form.value.trackerSourceDiscovered] : []
        const idx = list.indexOf(u)
        if (idx >= 0) {
          list.splice(idx, 1)
          form.value.trackerSourceDiscovered = list
          rebuildTrackerSourceOptions()
          autoSaveForm()
        }
      }
      function resetTrackerSelectBoxSources() {
        form.value.trackerSource = []
        form.value.trackerSourceDiscovered = []
        form.value.trackerSourceMap = {}
        rebuildTrackerSourceOptions()
        sanitizeSelectedSources()
        autoSaveForm()
        msg.success(t('preferences.reset-select-sources-success'))
      }
      function toggleAllTrackerSources() {
        // 判断当前是否全选
        if (isAllTrackerSourcesSelected.value) {
          // 如果已全选，则取消全选
          form.value.trackerSource = []
          msg.success(t('preferences.deselect-all-tracker-sources-success'))

          // 清除输入框里的Tracker服务器内容
          recomputeBtTrackerFromSelected()
        } else {
          // 否则全选
          const allSources = []
          ;(trackerSourceOptions.value || []).forEach(group => {
            (group.options || []).forEach(opt => {
              if (opt.value && !allSources.includes(opt.value)) {
                allSources.push(opt.value)
              }
            })
          })

          form.value.trackerSource = allSources
          msg.success(t('preferences.select-all-tracker-sources-success', { count: allSources.length }))

          // 自动同步Tracker
          recomputeBtTrackerFromSelected()
        }

        // 自动保存配置
        autoSaveForm()
      }
      function syncTrackerFromSource() {
        trackerSyncing.value = true
        const { trackerSource } = form.value
        preferenceStore.fetchBtTracker(trackerSource)
          .then((data) => {
            const texts = Array.isArray(data) ? data : []
            const lines = []
            texts.forEach(t => {
              const ls = extractTrackerLines(t)
              if (ls && ls.length) lines.push(...ls)
            })
            const uniq = Array.from(new Set(lines))
            const tracker = uniq.join('\n')
            form.value.lastSyncTrackerTime = Date.now()
            form.value.btTracker = tracker
            trackerSyncing.value = false
            if (!uniq.length) {
              msg.warning(t('preferences.sync-none'))
            } else {
              msg.success(t('preferences.sync-success', { count: uniq.length }))
            }
          })
          .catch((_) => {
            trackerSyncing.value = false
            msg.error(t('preferences.sync-failed'))
          })
      }
      // 渲染层 axios 使用 XHR adapter，proxy 选项不生效；改为走主进程请求，
      // 使「使用系统代理/自定义代理」配置真正作用于 Tracker 源提取
      function getTrackerProxyConfig() {
        const cfg = preferenceConfig.value || {}
        return cfg && typeof cfg.proxy === 'object' && cfg.proxy ? cfg.proxy : {}
      }
      async function fetchTrackerText(url) {
        // 深拷贝去除 Vue 响应式 Proxy 包装，IPC 序列化要求纯原生对象
        const plainParams = JSON.parse(JSON.stringify({ url: `${url}`, proxy: getTrackerProxyConfig() }))
        const text = await ipcRenderer.invoke('tracker-source:fetch', plainParams)
        return `${text || ''}`
      }
      async function configureTrackerFromGithub() {
        try {
          const r = await ElMessageBox.prompt(
            t('preferences.configure-tracker-prompt-message'),
            t('preferences.configure-tracker-prompt-title'),
            {
              confirmButtonText: t('preferences.extract'),
              cancelButtonText: t('app.cancel'),
              inputPlaceholder: t('preferences.tracker-source-input-placeholder')
            }
          )
          const url = `${r.value}`.trim()
          if (!url) return
          await configureTrackerFromGithubWithUrl(url)
        } catch (e) {
          if (e && e === 'cancel') return
          msg.error(t('preferences.extract-failed'))
        }
      }
      async function configureTrackerFromGithubWithUrl(url) {
        try {
          const origin = deriveOriginSite(url)
          if (origin && isOriginDuplicated(origin)) {
            msg.warning(t('preferences.origin-exists'))
            return
          }
          if (isGithubRepoUrl(url)) {
            const result = await resolveGithubRepo(url)
            const lines = result.trackers || []
            if (!lines.length) {
              msg.error(t('preferences.extract-empty-repo'))
              return
            }
            applySourceDiscovery(result.usedUrls || [], origin)
            return
          }
          const raw = toRawUrl(url)
          if (isSourceDuplicated(raw)) {
            msg.warning(t('preferences.source-exists'))
            return
          }
          const resp = await fetchTrackerText(raw)
          const text = `${resp || ''}`
          const trackers = extractTrackerLines(text)
          if (!trackers.length) {
            msg.error(t('preferences.extract-empty-link'))
            return
          }
          applySourceDiscovery([raw], deriveOriginSite(url))
        } catch (e) {
          msg.error(t('preferences.extract-failed'))
        }
      }
      function isOriginDuplicated(origin) {
        const n = normalizeOriginUrl(origin)
        const builtin = getBuiltinOrigins().map(o => normalizeOriginUrl(o))
        const saved = (Array.isArray(form.value.trackerSourceOrigins) ? form.value.trackerSourceOrigins : []).map(o => normalizeOriginUrl(o))
        return builtin.includes(n) || saved.includes(n)
      }
      function isSourceDuplicated(rawUrl) {
        const discovered = Array.isArray(form.value.trackerSourceDiscovered) ? form.value.trackerSourceDiscovered : []
        if (discovered.includes(rawUrl)) return true
        const allOptionValues = []
        ;(trackerSourceOptions.value || []).forEach(g => {
          (g.options || []).forEach(opt => allOptionValues.push(opt.value))
        })
        return allOptionValues.includes(rawUrl)
      }
      function deriveOriginSite(url) {
        const s = `${url}`
        const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(s)
        if (repo) return normalizeOriginUrl(`https://github.com/${repo[1]}/${repo[2]}`)
        let m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m) return normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i.exec(s)
        if (m) return normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)\//i.exec(s)
        if (m) return normalizeOriginUrl(`https://github.com/${m[1]}/${m[2]}`)
        try {
          const u = new URL(s)
          return normalizeOriginUrl(`${u.protocol}//${u.host}`)
        } catch (_) {
          return normalizeOriginUrl(s)
        }
      }
      function normalizeOriginUrl(url) {
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
      }
      function deriveOriginLabel(url) {
        const s = `${url}`
        const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i.exec(s)
        if (m) return `${m[1]}/${m[2]}`
        try {
          const u = new URL(s)
          return u.host
        } catch (_) {
          return s
        }
      }
      function isGithubRepoUrl(url) {
        return /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(`${url}`)
      }
      async function resolveGithubRepo(url) {
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
            const r = await fetchTrackerText(u)
            const text = `${r || ''}`
            const linkUrls = extractTxtLinksFromReadme(text)
            const rawUrls = linkUrls.map(toRawUrl)
            const rawSet = Array.from(new Set(rawUrls))
            const fetched = await fetchTrackersFromUrls(rawSet)
            if (fetched.lines && fetched.lines.length) {
              const preferred = preferCanonicalSources(fetched.usedUrls)
              used.push(...preferred)
              lines = fetched.lines
              break
            }
          } catch (_) {}
        }
        if (!lines.length) {
          const fetched = await fetchTrackersFromUrls(fileCandidates)
          if (fetched.lines && fetched.lines.length) {
            const preferred = preferCanonicalSources(fetched.usedUrls)
            used.push(...preferred)
            lines = fetched.lines
          }
        }
        if (!lines.length && owner.toLowerCase() === 'adysec' && repo.toLowerCase() === 'tracker') {
          try {
            const r = await fetchTrackerText('https://down.adysec.com/trackers_best.txt')
            const text = `${r || ''}`
            const fetched = extractTrackerLines(text)
            if (fetched.length) {
              used.push('https://down.adysec.com/trackers_best.txt')
              lines = fetched
            }
          } catch (_) {}
        }
        return { trackers: lines, usedUrls: used }
      }
      function extractTxtLinksFromReadme(text) {
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
      }
      async function fetchTrackersFromUrls(urls) {
        const allLines = []
        const usedUrls = []
        for (let i = 0; i < urls.length; i++) {
          const u = urls[i]
          try {
            const r = await fetchTrackerText(u)
            const text = `${r || ''}`
            const lines = extractTrackerLines(text)
            if (lines.length) {
              usedUrls.push(u)
              allLines.push(...lines)
            }
          } catch (_) {}
        }
        return { lines: Array.from(new Set(allLines)), usedUrls: Array.from(new Set(usedUrls)) }
      }
      function toRawUrl(url) {
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
      }
      function preferCanonicalSources(urls) {
        const items = (urls || []).map(u => ({ url: u, label: deriveTrackerLabel(u), rank: getSourceRank(u) }))
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
      }
      function getSourceRank(u) {
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
      }

// --- Lifecycle ---
let _trackerResizeObserver = null
onMounted(() => {
      rebuildTrackerSourceOptions()
      window.addEventListener('resize', updateUiScopeSelectCollapse)
      window.addEventListener('resize', updateTrackerCollapse)
      updateUiScopeSelectCollapse()
      // 立即同步过滤卡片，避免组件首次挂载时所有分类卡片都可见
      // 导致 appearance 卡片（排在前 4 个）闪烁显示。
      filterCards(searchKeyword.value, activeCategory.value)
      // 使用 ipcRenderer 直接监听从浏览器扩展更新配置的命令
      if (form.value.ed2kDefaultServers) {
        ed2kServersText.value = form.value.ed2kDefaultServers
      } else {
        ed2kServersText.value = BUILTIN_ED2K_SERVERS.join('\n')
      }
      _extensionUpdateHandler = (event, command) => {
        if (command === 'preference:update-from-extension') {
          console.log('[Basic] Received preference:update-from-extension, syncing config...')
          syncFormConfig()
        }
      }
      ipcRenderer.on('command', _extensionUpdateHandler)
      // 初始即为 BT 分类时，el-select 通过 v-if 首次渲染，需等 DOM 就绪后计算折叠数
      // updateTrackerCollapse 内部有 RAF 重试机制，安全调用
      if (activeCategory.value === 'bt') {
        nextTick(() => { updateTrackerCollapse() })
      }
      // 用 ResizeObserver 监听 el-select 容器尺寸变化（如窗口拖拽、侧边栏折叠），
      // 比 window.resize 更精准地捕获 select 自身的宽度变化
      nextTick(() => {
        const refVal = trackerSelectRef.value
        const el = refVal && (refVal.$el || refVal)
        if (el && typeof ResizeObserver !== 'undefined') {
          _trackerResizeObserver = new ResizeObserver(() => {
            updateTrackerCollapse()
          })
          _trackerResizeObserver.observe(el)
        }
      })
})

onBeforeUnmount(() => {

      document.removeEventListener('mousedown', handleTrackerSourceOutsideClick)
      window.removeEventListener('resize', updateUiScopeSelectCollapse)
      window.removeEventListener('resize', updateTrackerCollapse)
      if (_trackerResizeObserver) {
        _trackerResizeObserver.disconnect()
        _trackerResizeObserver = null
      }
      if (_trackerCollapseRafId) {
        cancelAnimationFrame(_trackerCollapseRafId)
        _trackerCollapseRafId = 0
      }
      if (_filterTimer) {
        clearTimeout(_filterTimer)
      }
      if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
      if (originHoldTimers) {
        Object.keys(originHoldTimers).forEach((key) => {
          clearTimeout(originHoldTimers[key])
        })
        originHoldTimers = {}
      }
      // 移除 ipcRenderer 监听
      if (ipcRenderer && _extensionUpdateHandler) {
        ipcRenderer.removeListener('command', _extensionUpdateHandler)
      }
})

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

  :deep(.add-task-type-floating__close-icon) {
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
  background: transparent url('@/assets/no-settings.svg') top center no-repeat;
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

/* 扩展通道地址输入框右侧复制按钮：修正视觉偏上，略微下移 */
.extension-copy-btn {
  transform: translateY(1px);
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

 .edit-rules-btn .el-icon {
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

 /* BT 自动封禁策略折叠容器 */
 .bt-ban-collapse-header {
   display: flex;
   align-items: center;
   justify-content: space-between;
   padding: 6px 10px;
   background: rgba(0, 0, 0, 0.03);
   border-radius: 6px;
   cursor: pointer;
   user-select: none;
   transition: background 0.2s;
 }
 .bt-ban-collapse-header:hover {
   background: rgba(0, 0, 0, 0.06);
 }
 .bt-ban-collapse-title {
   font-size: 13px;
   font-weight: 500;
   color: var(--lc-text-primary, #303133);
 }
 .bt-ban-collapse-arrow {
   transition: transform 0.25s ease;
   font-size: 12px;
   color: var(--lc-text-secondary, #909399);
 }
 .bt-ban-collapse-arrow.is-expanded {
   transform: rotate(90deg);
 }
 .bt-ban-settings-body {
   padding: 8px 10px 4px;
   overflow: hidden;
 }
 .bt-ban-settings-body .toggle-row {
   margin-bottom: 10px;
 }
 .bt-ban-settings-body .toggle-row:last-child {
   margin-bottom: 0;
 }

 /* 深色模式适配 */
 .theme-dark .bt-ban-collapse-header {
   background: rgba(255, 255, 255, 0.04);
 }
 .theme-dark .bt-ban-collapse-header:hover {
   background: rgba(255, 255, 255, 0.08);
 }
 .theme-dark .bt-ban-collapse-title {
   color: var(--lc-text-primary, #dfe3e8);
 }
 .theme-dark .bt-ban-collapse-arrow {
   color: var(--lc-text-secondary, #8d94a5);
 }

 /* 展开收起过渡动画 */
 .bt-ban-slide-enter-active,
 .bt-ban-slide-leave-active {
   transition: max-height 0.28s ease, opacity 0.28s ease, padding 0.28s ease;
   max-height: 500px;
   overflow: hidden;
 }
 .bt-ban-slide-enter-from,
 .bt-ban-slide-leave-to {
   max-height: 0;
   opacity: 0;
   padding-top: 0;
   padding-bottom: 0;
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

/* 特异性必须高于 :deep(.tracker-row) .tracker-right .el-button（:global 同类
     padding: 0 5px !important / height: 100% !important）。相同特异性时后写的
     规则胜出，而本规则位于其前，故用重复类提高特异性并加 !important 防再被压小 */
  :deep(.tracker-source-popup .tracker-source-popup__footer.tracker-source-popup__footer .el-button.el-button--primary) {
    border-radius: 8px;
    padding: 6px 20px !important;
    height: auto !important;
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

/* Tracker 按钮与输入框等高：按钮容器和按钮拉伸填满 */
:deep(.tracker-row) {
  .tracker-left,
  .tracker-right {
    display: flex;
    align-items: stretch;

    .lc-hover-tip__trigger {
      display: flex !important;
      align-items: stretch !important;
      height: 100%;
    }

    .el-button {
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      vertical-align: top !important;
      /* 图标在按钮内垂直居中 */
      padding: 0 5px !important;
      line-height: 1;
    }
  }

  /* Tracker 多选标签圆角与 GitHub 镜像卡片一致 */
  .el-select .el-tag {
    border-radius: 6px;
  }
}

/* 上传/下载限速行：输入框与单位选择框等高对齐、边缘贴合融为一体 */
:deep(.speed-limit-row) {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  width: 100%;

  // 统一的控件高度，输入框与选择框都继承该变量，
  // 避免 Element Plus 各自尺寸规则（如 select 默认 min-height: 32px）产生错位
  --lc-speed-control-height: 28px;

  /* 输入框：占满剩余宽度，内容锁定统一高度 */
  .el-input-number {
    flex: 1;
    min-width: 0;
    /* 覆盖 Element Plus 内置的 width: 150px */
    width: auto !important;
    --el-component-size: var(--lc-speed-control-height);
    --el-input-height: var(--lc-speed-control-height);
  }

  .el-input-number .el-input__wrapper {
    box-sizing: border-box;
    min-height: var(--lc-speed-control-height);
    height: var(--lc-speed-control-height);
  }

  .el-input-number .el-input__inner {
    height: var(--lc-speed-control-height);
    line-height: var(--lc-speed-control-height);
    text-align: center;
  }

  /* 单位选择框：固定宽度，与输入框严格等高，圆角与光影与输入框一致 */
  .el-select {
    flex-shrink: 0;
    width: 100px;
    --el-select-width: 100px;
    margin-left: -6px;
  }

  .el-select .el-select__wrapper {
    box-sizing: border-box;
    min-height: var(--lc-speed-control-height);
    height: var(--lc-speed-control-height);
    padding: 0 8px;
    line-height: 20px;
    box-shadow: 0 0 0 1px var(--el-border-color) inset;
  }

  /* 一体式圆角：输入框去掉右侧圆角，选择框去掉左侧圆角 */
  .el-input-number.is-controls-right .el-input__wrapper {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    box-shadow: inset 0 1px 0 0 var(--el-border-color, var(--lc-border-base)),
                inset 0 -1px 0 0 var(--el-border-color, var(--lc-border-base)),
                inset 1px 0 0 0 var(--el-border-color, var(--lc-border-base));
  }

  .el-select .el-select__wrapper {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}

</style>

<!-- 非 scoped 全局样式：el-select 下拉面板通过 teleport 挂载到 body，
     scoped 样式（即使 :global）在某些编译器版本下可能无法正确穿透到 body 下的元素。
     使用独立的非 scoped <style> 块确保这些样式真正全局生效。 -->
<style lang="scss">
/* === el-select 下拉面板全局样式 ===
   下拉面板通过 teleport 挂载到 body，必须使用非 scoped <style>。
   Element Plus 的 .el-select-dropdown 默认有 padding: 6px 0，
   .el-select-dropdown__list 也有默认 padding，两者叠加导致
   下拉框顶部和底部出现间距。以下清零这两层 padding 使内容完整显示。 */

/* 下拉面板容器自身 padding 清零 */
.tracker-source-popper.el-select__popper .el-select-dropdown,
.speed-unit-popper.el-select__popper .el-select-dropdown {
  padding: 0;
}

/* 列表容器 padding 清零 */
.tracker-source-popper.el-select__popper .el-select-dropdown__list,
.speed-unit-popper.el-select__popper .el-select-dropdown__list {
  padding: 0;
}

/* Tracker 多选下拉面板：选项行高 28px，与限速单位选择框一致 */
.tracker-source-popper.el-select__popper .el-select-dropdown__item {
  height: 28px;
  line-height: 28px;
  padding: 0 12px;
}

/* Tracker 多选下拉面板：分组标题 */
.tracker-source-popper.el-select__popper .el-select-group__title {
  line-height: 20px;
  padding: 4px 12px;
}

/* 限速单位下拉面板：选项行高 28px */
.speed-unit-popper.el-select__popper .el-select-dropdown__item {
  height: 28px;
  line-height: 28px;
  padding: 0 12px;
}

/* mo-hover-tip trigger 在 el-input append 内撑满，使骰子图标居中 */
.el-input-group__append .lc-hover-tip__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
