<template>
  <el-dialog
    v-model="dialogVisible"
    class="preference-dialog"
    modal-class="preference-dialog-overlay"
    append-to-body
    :modal="true"
    :close-on-click-modal="true"
    :show-close="true"
    destroy-on-close
    @open="onDialogOpen"
  >
    <template #header>
      <!-- 顶栏只留右上角关闭按钮（Element Plus 自己的 .el-dialog__headerbtn）：
           左上角的「偏好设置」大标题改由侧边栏第一个分组标签「设置」承担，
           右上角的搜索设置已移除。顶栏本身不占纵向空间，
           左侧一段留给侧边栏（见 preference-dialog.scss 的 --pref-header-h）。 -->
    </template>

    <div class="preference-dialog-body">
      <!-- 侧边栏导航：与主窗口侧边栏同构 —— 分组标签 + 分组内的选项 -->
      <nav class="preference-sidebar">
        <div class="preference-nav-scroll">
          <div
            v-for="section in preferenceNavSections"
            :key="section.key"
            class="preference-section"
          >
            <div class="preference-section-label">{{ section.label }}</div>
            <ul class="preference-nav-list">
              <li
                v-for="item in section.items"
                :key="item.value"
                class="preference-nav-item"
                :class="{ 'is-active': currentCategory === item.value }"
                @click="navPreference(item.value)"
              >
                <i class="preference-nav-icon">
                  <mo-icon
                    :name="item.icon"
                    width="17"
                    height="17"
                  />
                </i>
                <span class="preference-nav-label">{{ item.label }}</span>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <!-- 右侧设置内容 -->
      <div
        ref="contentRef"
        class="preference-content"
      >
        <component
          :is="preferenceFormComponent"
          :category="currentCategory"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import i18n from '@/plugins/i18n'
import { useAppStore } from '@/store'
import { storeToRefs } from 'pinia'
import PreferenceBasic from '@/components/Preference/Basic.vue'
import PreferenceAdvanced from '@/components/Preference/Advanced.vue'

// 导入侧边栏导航图标
import '@/components/Icons/preference-basic'
import '@/components/Icons/preference-appearance'
import '@/components/Icons/preference-transfer'
import '@/components/Icons/preference-bt'
import '@/components/Icons/preference-extension'
import '@/components/Icons/preference-task'
import '@/components/Icons/preference-file'
import '@/components/Icons/preference-advanced'
import '@/components/Icons/video'

const { t } = i18n.global
const appStore = useAppStore()

const { preferenceVisible, preferenceCategory } = storeToRefs(appStore)

const dialogVisible = computed({
  get: () => preferenceVisible.value,
  set: (val) => appStore.updatePreferenceVisible(val)
})

const currentCategory = computed(() => preferenceCategory.value || 'basic')

const contentRef = ref(null)

// 侧边栏分类：与主窗口侧边栏同构，按「设置 → 下载 → 扩展」三组排列。
// 第一个分组标签「设置」同时充当弹窗标题（左上角原「偏好设置」大标题已移除）。
const preferenceNavSections = computed(() => [
  {
    key: 'settings',
    label: t('preferences.section-settings'),
    items: [
      { value: 'basic', label: t('preferences.basic'), icon: 'preference-basic' },
      { value: 'appearance', label: t('preferences.appearance'), icon: 'preference-appearance' }
    ]
  },
  {
    key: 'download',
    label: t('preferences.section-download'),
    items: [
      { value: 'transfer', label: t('preferences.transfer-settings'), icon: 'preference-transfer' },
      { value: 'bt', label: t('preferences.bt-settings'), icon: 'preference-bt' },
      { value: 'task', label: t('preferences.task-manage'), icon: 'preference-task' },
      { value: 'file', label: t('preferences.file-manage'), icon: 'preference-file' }
    ]
  },
  {
    key: 'media',
    label: t('preferences.section-media'),
    items: [
      { value: 'video', label: t('preferences.video'), icon: 'video' }
    ]
  },
  {
    key: 'extension',
    label: t('preferences.section-extension'),
    items: [
      { value: 'extension', label: t('preferences.browser-extensions'), icon: 'preference-extension' },
      { value: 'advanced', label: t('preferences.advanced'), icon: 'preference-advanced' }
    ]
  }
])

const preferenceFormComponent = computed(() => {
  switch (currentCategory.value) {
    case 'advanced':
      return PreferenceAdvanced
    default:
      return PreferenceBasic
  }
})

function navPreference (category = 'basic') {
  appStore.updatePreferenceCategory(category)
}

// 切换分类时重置内容区滚动位置
watch(currentCategory, () => {
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
  })
})

function onDialogOpen () {
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
  })
}
</script>

<style lang="scss">
@import '@/components/Theme/Variables';
@import '@/components/Theme/Light/Variables';
@import './preference-dialog.scss';
</style>
