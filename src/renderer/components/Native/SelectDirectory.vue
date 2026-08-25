<template>
  <button
    type="button"
    class="select-directory"
    aria-label="Select directory"
    @click.stop="onFolderClick"
  >
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        stroke-miterlimit="10"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      >
        <line x1="1" y1="8" x2="23" y2="8" />
        <polygon points="23,23 1,23 1,1 10,1 12,4 23,4" />
      </g>
    </svg>
  </button>
</template>

<script setup>
// Options API 父组件通过 [SelectDirectory.name]: SelectDirectory 注册，必须有 name
defineOptions({ name: 'mo-select-directory' })

import { dialog } from '@electron/remote'

const emit = defineEmits(['selected'])

const onFolderClick = () => {
  dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  }).then(({ canceled, filePaths }) => {
    if (canceled || filePaths.length === 0) {
      return
    }

    const [path] = filePaths
    emit('selected', path)
  })
}
</script>

<style lang="scss">
/* 图标按钮：填满槽位高度、与输入框一体，图标居中；由主题统一绘制外边框与分割线 */
.select-directory {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 28px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 0;
  color: var(--lc-text-secondary);
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--lc-color-primary);
  }

  svg {
    display: block;
  }
}
</style>
