<template>
    <div
      ref="root"
      class="lc-extend-select"
      :class="{
        'is-open': open,
        'is-disabled': disabled,
        'is-multiple': multiple,
        'is-filterable': filterable,
        'has-tags': multiple && selectedTags.length > 0,
        'is-drop-top': dropDirection === 'top',
        'is-drop-bottom': dropDirection === 'bottom'
      }"
    >
    <!-- 单一选择框：absolute 定位锚点之上，闭合时是选择框，打开时整体向下延伸 -->
    <div
      class="lc-extend-select__box"
      :class="{ 'is-open': open }"
    >
      <!-- 搜索框（filterable 模式，打开时显示） -->
      <div v-if="filterable && open" class="lc-extend-select__search">
        <input
          ref="searchInput"
          type="text"
          class="lc-extend-select__search-input"
          v-model="searchQuery"
          :placeholder="placeholder"
          @keydown="handleSearchKeydown"
        />
      </div>

      <!-- 选择框头部（非搜索模式或未打开时显示） -->
      <button
        v-show="!filterable || !open"
        type="button"
        class="lc-extend-select__head"
        :disabled="disabled"
        @click="toggle"
      >
        <!-- 多选 tags -->
        <span v-if="multiple" class="lc-extend-select__tags">
          <span
            v-for="tag in selectedTags"
            :key="tag.value"
            class="lc-extend-select__tag"
          >
            <span class="lc-extend-select__tag-text">{{ tag.label }}</span>
            <span
              class="lc-extend-select__tag-close"
              @click.stop="removeTag(tag)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z"/>
              </svg>
            </span>
          </span>
          <span v-if="selectedTags.length === 0" class="lc-extend-select__label is-placeholder">{{ placeholder }}</span>
        </span>
        <!-- 单选 label -->
        <span
          v-else
          class="lc-extend-select__label"
          :class="{ 'is-placeholder': !hasSelection }"
        >
          {{ selectedLabel || placeholder }}
        </span>
        <svg
          class="lc-extend-select__caret"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 15.2 6 9.2l1.4-1.4L12 12.4l4.6-4.6L18 9.2z"
          />
        </svg>
      </button>

      <transition name="lc-extend-select-grow">
        <div
          v-show="open"
          class="lc-extend-select__options-wrap"
        >
          <!-- allow-create: 搜索无结果时显示创建选项 -->
          <div
            v-if="allowCreate && searchQuery && !hasExactMatch"
            class="lc-extend-select__create"
            @click="createOption"
          >
            <span class="lc-extend-select__create-text">{{ createLabel }}</span>
          </div>

          <!-- 分组模式 -->
          <template v-if="hasGroups">
            <div
              v-for="group in filteredGroups"
              :key="group.label"
              class="lc-extend-select__group"
            >
              <div v-if="group.label" class="lc-extend-select__group-title">{{ group.label }}</div>
              <ul class="lc-extend-select__options">
                <li
                  v-for="opt in group.options"
                  :key="opt.value"
                  role="option"
                  :class="{ 'is-selected': isSelected(opt) }"
                  @click="select(opt)"
                >
                  <span class="lc-extend-select__opt-label">{{ opt.label }}</span>
                  <svg
                    v-if="isSelected(opt)"
                    class="lc-extend-select__check"
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M9.5 16.6 5.4 12.5 4 13.9l5.5 5.5 9-9-1.4-1.4z"
                    />
                  </svg>
                </li>
              </ul>
            </div>
            <div v-if="filteredGroups.length === 0 && !allowCreate" class="lc-extend-select__empty">
              {{ emptyText }}
            </div>
          </template>

          <!-- 扁平模式 -->
          <template v-else>
            <ul
              class="lc-extend-select__options"
              role="listbox"
            >
              <li
                v-for="opt in filteredOptions"
                :key="opt.value"
                role="option"
                :class="{ 'is-selected': isSelected(opt) }"
                @click="select(opt)"
              >
                <span class="lc-extend-select__opt-label">{{ opt.label }}</span>
                <svg
                  v-if="isSelected(opt)"
                  class="lc-extend-select__check"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M9.5 16.6 5.4 12.5 4 13.9l5.5 5.5 9-9-1.4-1.4z"
                  />
                </svg>
              </li>
            </ul>
            <div v-if="filteredOptions.length === 0 && !allowCreate" class="lc-extend-select__empty">
              {{ emptyText }}
            </div>
          </template>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number, Array],
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  multiple: {
    type: Boolean,
    default: false
  },
  filterable: {
    type: Boolean,
    default: false
  },
  allowCreate: {
    type: Boolean,
    default: false
  },
  createLabel: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: 'No data'
  },
  size: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'change'])
defineOptions({ name: 'MoExtendSelect' })

const root = ref(null)
const searchInput = ref(null)

const open = ref(false)
const searchQuery = ref('')
const dropDirection = ref('bottom')

const hasSelection = computed(() => {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.length > 0
  }
  return props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined
})

const flatOptions = computed(() => {
  const flat = []
  for (const item of props.options) {
    if (item.options && Array.isArray(item.options)) {
      for (const sub of item.options) {
        flat.push(sub)
      }
    } else {
      flat.push(item)
    }
  }
  return flat
})

const selectedOption = computed(() => {
  if (props.multiple) return null
  return flatOptions.value.find(opt => String(opt.value) === String(props.modelValue))
})

const selectedLabel = computed(() => {
  if (props.multiple) return ''
  return selectedOption.value ? String(selectedOption.value.label) : ''
})

const selectedTags = computed(() => {
  if (!props.multiple) return []
  const vals = Array.isArray(props.modelValue) ? props.modelValue : []
  return vals.map(v => {
    const opt = flatOptions.value.find(o => String(o.value) === String(v))
    return { value: v, label: opt ? opt.label : String(v) }
  })
})

const hasGroups = computed(() => props.options.some(item => item.options && Array.isArray(item.options)))

const filteredGroups = computed(() => {
  if (!hasGroups.value) return []
  const query = searchQuery.value.toLowerCase().trim()
  return props.options
    .map(group => {
      const opts = (group.options || []).filter(opt => {
        if (!props.multiple && isSelected(opt)) return false
        if (!query) return true
        return String(opt.label).toLowerCase().includes(query)
      })
      return { label: group.label, options: opts }
    })
    .filter(group => group.options.length > 0)
})

const filteredOptions = computed(() => {
  if (hasGroups.value) return []
  const query = searchQuery.value.toLowerCase().trim()
  return flatOptions.value.filter(opt => {
    if (!props.multiple && isSelected(opt)) return false
    if (!query) return true
    return String(opt.label).toLowerCase().includes(query)
  })
})

const hasExactMatch = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return true
  return flatOptions.value.some(opt => String(opt.label).toLowerCase() === query.toLowerCase())
})

function isSelected (opt) {
  if (props.multiple) {
    const vals = Array.isArray(props.modelValue) ? props.modelValue : []
    return vals.some(v => String(v) === String(opt.value))
  }
  return String(opt.value) === String(props.modelValue)
}

function select (opt) {
  if (props.multiple) {
    const vals = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = vals.findIndex(v => String(v) === String(opt.value))
    if (idx >= 0) {
      vals.splice(idx, 1)
    } else {
      vals.push(opt.value)
    }
    emit('update:modelValue', vals)
    emit('change', vals)
    if (props.filterable) {
      searchQuery.value = ''
      nextTick(() => {
        searchInput.value?.focus()
      })
    }
  } else {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
    close()
  }
}

function removeTag (tag) {
  if (props.disabled || !props.multiple) return
  const vals = Array.isArray(props.modelValue) ? props.modelValue.filter(v => String(v) !== String(tag.value)) : []
  emit('update:modelValue', vals)
  emit('change', vals)
}

function createOption () {
  const val = searchQuery.value.trim()
  if (!val) return
  if (props.multiple) {
    const vals = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    if (!vals.some(v => String(v) === val)) {
      vals.push(val)
    }
    emit('update:modelValue', vals)
    emit('change', vals)
  } else {
    emit('update:modelValue', val)
    emit('change', val)
    close()
  }
}

function handleSearchKeydown (e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (props.allowCreate && searchQuery.value && !hasExactMatch.value) {
      createOption()
    } else if (filteredOptions.value.length === 1) {
      select(filteredOptions.value[0])
    }
  } else if (e.key === 'Escape') {
    close()
  }
}

function handleDocClick (e) {
  if (root.value && !root.value.contains(e.target) && open.value) {
    close()
  }
}

function handleKeydown (e) {
  if (e.key === 'Escape' && open.value) {
    close()
  }
}

function handleScrollOrResize () {
  if (open.value) {
    updateDropDirection()
  }
}

function updateDropDirection () {
  if (!root.value) return
  const rect = root.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top
  const estimatedHeight = 200
  if (spaceBelow >= estimatedHeight) {
    dropDirection.value = 'bottom'
  } else if (spaceAbove >= estimatedHeight) {
    dropDirection.value = 'top'
  } else {
    dropDirection.value = spaceBelow >= spaceAbove ? 'bottom' : 'top'
  }
}

function toggle () {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    updateDropDirection()
    if (props.filterable) {
      searchQuery.value = ''
      nextTick(() => {
        searchInput.value?.focus()
      })
    }
  }
}

function close () {
  open.value = false
  searchQuery.value = ''
}

function focus () {
  if (props.disabled) return
  open.value = true
  updateDropDirection()
  if (props.filterable) {
    searchQuery.value = ''
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
}

function blur () {
  close()
}

onMounted(() => {
  document.addEventListener('click', handleDocClick)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('scroll', handleScrollOrResize, true)
  window.addEventListener('resize', handleScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('scroll', handleScrollOrResize, true)
  window.removeEventListener('resize', handleScrollOrResize)
})

defineExpose({ focus, blur, close })
</script>

<style lang="scss">
  .lc-extend-select {
    position: relative;
    width: 100%;
    height: 24px;
    box-sizing: border-box;

    /* 多选模式或带搜索时自适应高度 */
    &.has-tags {
      height: auto;
      min-height: 24px;
    }

    &.is-disabled {
      opacity: 0.6;

      .lc-extend-select__head {
        cursor: not-allowed;
      }
    }

    /* 单一选择框：absolute 定位（随弹窗动画同步），内含 head + options，打开时整体向下延伸 */
    &__box {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      box-sizing: border-box;
      overflow: hidden;
      /* 闭合时背景透明，融入所在容器/程序背景；展开时切换为独立下拉背景色 */
      background-color: transparent;
      border: 1px solid var(--lc-task-item-border, var(--lc-border-base));
      border-radius: var(--lc-radius-dropdown);
      box-shadow: none;
      transform-origin: center top;
      /* 闭合态 max-height 仅容纳 head（24 + 上下 border 2 = 26 + 余量 2 ≈ 32），
         展开态放大到 320px 容纳 head + 选项区（max 220 + padding），
         用 max-height 而非 grid 1fr 动画——Chrome 对 grid 1fr + overflow:auto 子项
         会将 1fr 解析为 ul padding（min-content 视为 0），导致选项区始终只 8px 高、显示不全 */
      max-height: 32px;
      transition: border-color 0.24s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.24s cubic-bezier(0.4, 0, 0.2, 1), transform 0.24s cubic-bezier(0.33, 1, 0.68, 1), padding-top 0.24s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.24s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.24s cubic-bezier(0.33, 1, 0.68, 1);

      /* 展开时整体略微放大 + 高亮边框 + 浮起阴影 + 独立下拉背景色；
         padding-top 4px：所选项（head）随展开下移，框体顶部锚定、向下延伸来容纳。
         overflow 切为 visible + max-height 放大：选项区完整撑开，
         避免被弹窗/容器边界裁切导致显示不全 */
      &.is-open {
        overflow: visible;
        border-color: var(--el-color-primary);
        background-color: var(--lc-bg-dropdown, #fff);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        transform: scale(1.02);
        padding-top: 4px;
        max-height: 320px;
      }
    }

    /* 向上展开时 box 从底部锚定，max-height 改为 320 不变（向上同样需要足够空间） */
    &.is-drop-top .lc-extend-select__box {
      top: auto;
      bottom: 0;
      transform-origin: center bottom;
      padding-top: 0;
      transition: border-color 0.24s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.24s cubic-bezier(0.4, 0, 0.2, 1), transform 0.24s cubic-bezier(0.33, 1, 0.68, 1), padding-bottom 0.24s cubic-bezier(0.33, 1, 0.68, 1), max-height 0.24s cubic-bezier(0.33, 1, 0.68, 1);

      &.is-open {
        padding-top: 0;
        padding-bottom: 4px;
        box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
        max-height: 320px;
      }
    }

    /* 向上展开时，弹窗内容顺序翻转：options 在上、head 在下，
       通过 flex-direction: column-reverse 实现 */
    &.is-drop-top .lc-extend-select__box {
      display: flex;
      flex-direction: column-reverse;
    }

    /* 向上展开时搜索框也需要翻转跟随 —— column-reverse 已自动翻转 DOM 顺序 */

    /* 向上展开时 caret 翻转方向修正：原始 is-open 旋转 180°，
       向上时应该旋回 0°（箭头指上） */
    &.is-drop-top.is-open .lc-extend-select__caret {
      transform: rotate(0deg);
    }
    &.is-drop-top:not(.is-open) .lc-extend-select__caret {
      transform: rotate(180deg);
    }

    /* 搜索框 */
    &__search {
      padding: 4px;
      box-sizing: border-box;
    }

    &__search-input {
      width: 100%;
      height: 24px;
      box-sizing: border-box;
      padding: 0 8px;
      border: 1px solid var(--lc-border-base, #d3dde6);
      border-radius: 6px;
      background-color: transparent;
      color: var(--lc-text-regular, #333);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s ease;

      &:focus {
        border-color: var(--el-color-primary);
      }

      &::placeholder {
        color: var(--lc-text-placeholder, #999);
      }
    }

    /* 选择框上部显示区 */
    &__head {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 24px;
      padding: 0 10px;
      box-sizing: border-box;
      border: none;
      background-color: transparent;
      color: var(--lc-text-regular, #333);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      /* 展开/收起时仅过渡文字颜色，位置保持不动 */
      transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);

      .lc-extend-select.is-open & {
        color: var(--el-color-primary);
      }

      /* 选择框所选项的悬停高亮背景：仅在展开时显示。
         上下贴满（24px 高亮 = 选项行高亮同高），左右内缩 4px 与选项区节奏一致 */
      &::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 4px;
        right: 4px;
        z-index: 0;
        border-radius: 6px;
        background-color: var(--lc-bg-hover);
        opacity: 0;
        transition: opacity 0.15s ease;
        pointer-events: none;
        /* 与下拉选项一致，叠加一层明显加深 */
        box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.06);
      }

      /* 未展开时选择框不触发悬停高亮 */
      .lc-extend-select:not(.is-open) &:hover::before {
        opacity: 0;
      }

      .lc-extend-select.is-open &:hover::before {
        opacity: 1;
      }

      .lc-extend-select__label,
      .lc-extend-select__caret,
      .lc-extend-select__tags {
        position: relative;
        z-index: 1;
      }
    }

    &__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;

      &.is-placeholder {
        color: var(--lc-text-secondary, #999);
        opacity: 0.7;
      }
    }

    /* 多选 tags */
    &__tags {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      padding: 1px 0;
    }

    &__tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      height: 20px;
      padding: 0 4px 0 6px;
      border-radius: 4px;
      background-color: var(--lc-bg-hover, #f0f4f8);
      color: var(--lc-text-regular, #333);
      font-size: 12px;
      line-height: 1;
      box-sizing: border-box;
    }

    &__tag-text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__tag-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      cursor: pointer;
      color: var(--lc-text-secondary, #999);
      transition: background-color 0.15s ease, color 0.15s ease;

      &:hover {
        background-color: var(--lc-color-danger, #f56c6c);
        color: #fff;
      }
    }

    &__caret {
      flex-shrink: 0;
      margin-left: 6px;
      color: var(--lc-text-secondary, #999);
      /* 与选项区展开动画同步 */
      transition: transform 0.24s cubic-bezier(0.33, 1, 0.68, 1);
    }

    &.is-open .lc-extend-select__caret {
      transform: rotate(180deg);
    }

    /* 选项区外层：使用 block 布局（不用 grid 1fr——Chrome 对 overflow 子项的
       grid 1fr 会 floor 到 ul padding，导致选项区只显示 8px、显示不全）。
       高度由 box 的 max-height 动画统一控制（box 32px→320px） */
    &__options-wrap {
      display: block;
    }

    /* 创建选项按钮 */
    &__create {
      padding: 4px;
      cursor: pointer;

      &:hover {
        background-color: var(--lc-bg-hover);
      }
    }

    &__create-text {
      display: block;
      padding: 0 6px;
      height: 24px;
      line-height: 24px;
      font-size: 14px;
      color: var(--lc-text-regular, #333);
    }

    /* 空状态 */
    &__empty {
      padding: 8px 10px;
      text-align: center;
      color: var(--lc-text-placeholder, #999);
      font-size: 14px;
    }

    /* 分组标题 */
    &__group-title {
      padding: 4px 10px 2px;
      color: var(--lc-text-secondary, #999);
      font-size: 12px;
      font-weight: 500;
    }

    /* 选项区（重做）：统一 4px 节奏 ——
       ul 四边 padding 4px、行间距 4px、行高 24px（与 head 同高），
       悬停高亮直接画在 li 上（圆角 6px，即 li 本体），由此得到：
       上/下/左/右边缘间距 = 4px，选项间距 = 4px，head 与首项间距 = 4px，
       高亮高度恒为 24px；选项文字距边框 4+6=10px，与 head 文字/箭头对齐 */
    &__options {
      list-style: none;
      margin: 0;
      padding: 4px;
      box-sizing: border-box;
      min-height: 0;
      max-height: 220px;
      overflow-y: auto;
      overflow-x: hidden;

      li {
        position: relative;
        display: flex;
        align-items: center;
        margin: 0;
        padding: 0 6px;
        height: 24px;
        box-sizing: border-box;
        border-radius: 6px;
        color: var(--lc-text-regular, #333);
        font-size: 14px;
        text-align: left;
        cursor: pointer;
        transition: color 0.15s ease, background-color 0.15s ease;

        /* 选项间距：与四周边缘同为 4px */
        & + li {
          margin-top: 4px;
        }

        /* 悬停高亮：直接以 li 为背景载体，叠加一层明显加深，明暗主题通用 */
        &:hover {
          background-color: var(--lc-bg-hover);
          box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.06);
        }

        &.is-selected {
          color: var(--el-color-primary);
        }

        .lc-extend-select__opt-label {
          position: relative;
          z-index: 1;
        }
      }
    }

    &__opt-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__check {
      flex-shrink: 0;
      margin-left: 4px;
      color: var(--el-color-primary);
    }
  }

  /* 选项区展开/收起：网格行高 0fr↔1fr 按内容实际高度精确生长 + 淡入淡出，
     展开用 ease-out、收起稍快用 ease-in，动画期间内部裁剪，右侧不会闪现滚动条 */
  /* 旧 grid-template-rows 动画已废弃（见 __options-wrap 注释）。
     box 的 max-height 过渡承担展开/收起动画，下面 class 保留为无害的空操作。 */
  .lc-extend-select-grow-enter-active,
  .lc-extend-select-grow-leave-active {
    transition: opacity 0.18s ease-out;
  }
  .lc-extend-select-grow-leave-active {
    transition: opacity 0.13s ease-in;
  }
  .lc-extend-select-grow-enter-from,
  .lc-extend-select-grow-leave-to {
    opacity: 0;
  }

  /* 动画进行中强制裁剪，避免 overflow-y:auto 在高度受限瞬间闪现滚动条 */
  .lc-extend-select-grow-enter-active .lc-extend-select__options,
  .lc-extend-select-grow-leave-active .lc-extend-select__options {
    overflow: hidden;
  }

  /* 深色模式：默认 --lc-bg-hover 与浮层底色过于接近，改用明显提亮的悬停背景 */
  .theme-dark .lc-extend-select__head::before {
    background-color: #454c57;
    box-shadow: none;
  }

  .theme-dark .lc-extend-select__options li:hover {
    background-color: #454c57;
    box-shadow: none;
  }

  .theme-dark .lc-extend-select__tag {
    background-color: #363b44;
    color: #c4cad3;
  }

  .theme-dark .lc-extend-select__create:hover {
    background-color: #363b44;
  }
</style>
