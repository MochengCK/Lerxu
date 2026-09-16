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
    <!-- 触发器：闭合态就是一个标准选择框（单行高 24px） -->
    <button
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

    <!-- 选项浮层：标准弹窗（Teleport 到 body + fixed 定位，
         避免被偏好设置内容区等滚动容器裁切） -->
    <Teleport to="body">
      <transition name="lc-extend-select-pop">
        <div
          v-show="open"
          ref="panel"
          class="lc-extend-select__panel"
          :class="{ 'is-drop-top': dropDirection === 'top' }"
          :style="panelStyle"
        >
          <!-- 搜索框（filterable 模式） -->
          <div v-if="filterable" class="lc-extend-select__search">
            <input
              ref="searchInput"
              type="text"
              class="lc-extend-select__search-input"
              v-model="searchQuery"
              :placeholder="placeholder"
              @keydown="handleSearchKeydown"
            />
          </div>

          <div class="lc-extend-select__options-wrap">
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
        </div>
      </transition>
    </Teleport>
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
const panel = ref(null)
const searchInput = ref(null)

const open = ref(false)
const searchQuery = ref('')
const dropDirection = ref('bottom')
// 浮层位置（fixed 定位，随触发器位置/滚动实时更新）
const panelStyle = ref({})

// 浮层与触发器之间的间距
const PANEL_GAP = 6

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
  if (!open.value) return
  const inTrigger = root.value && root.value.contains(e.target)
  const inPanel = panel.value && panel.value.contains(e.target)
  if (!inTrigger && !inPanel) {
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

// 计算浮层位置：以触发器宽度为宽，贴在触发器下方（或上方）并留出间距
function updatePanelPosition () {
  if (!root.value) return
  const rect = root.value.getBoundingClientRect()
  const next = {
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`
  }
  if (dropDirection.value === 'top') {
    next.bottom = `${Math.round(window.innerHeight - rect.top + PANEL_GAP)}px`
    next.top = 'auto'
  } else {
    next.top = `${Math.round(rect.bottom + PANEL_GAP)}px`
    next.bottom = 'auto'
  }
  panelStyle.value = next
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
  updatePanelPosition()
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
  /* ==========================================================================
     自定义选择框（mo-extend-select）
     --------------------------------------------------------------------------
     结构：触发器（.lc-extend-select__head，闭合态即标准选择框）
         + 浮层（.lc-extend-select__panel，Teleport 到 body，fixed 定位）

     设计：浮层是**独立的标准弹窗**——与触发器之间留 6px 间距、圆角 + 投影，
       不再像旧版那样让选择框本体向下生长（两者连成一体）。
     ========================================================================== */
  .lc-extend-select {
    position: relative;
    width: 100%;
    height: 24px;
    box-sizing: border-box;

    /* 多选 tags 换行时高度自适应 */
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

    /* 触发器：标准选择框外观 */
    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 100%;
      min-height: 24px;
      padding: 0 8px;
      box-sizing: border-box;
      border: 1px solid var(--lc-border-base, #d3dde6);
      border-radius: var(--lc-radius-dropdown);
      background-color: transparent;
      color: var(--lc-text-regular, #333);
      font-size: 13px;
      line-height: 1.4;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

      &:hover:not(:disabled) {
        border-color: var(--lc-border-hover, #8492a6);
      }
    }

    /* 展开时触发器边框高亮，与输入框聚焦一致 */
    &.is-open .lc-extend-select__head {
      border-color: var(--el-color-primary);
    }

    /* 触发器内部相对定位，避免与浮层投影互相干扰 */
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
      transition: transform 0.2s ease;
    }

    &.is-open .lc-extend-select__caret {
      transform: rotate(180deg);
    }

    /* 向上展开时箭头指上 */
    &.is-drop-top.is-open .lc-extend-select__caret {
      transform: rotate(0deg);
    }
  }

  /* --------------------------------------------------------------------------
     浮层：标准弹窗
     -------------------------------------------------------------------------- */
  .lc-extend-select__panel {
    position: fixed;
    z-index: 5200;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    max-height: 300px;
    background-color: var(--lc-bg-dropdown, #fff);
    border: 1px solid var(--lc-border-base, #d3dde6);
    border-radius: var(--lc-radius-dropdown);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06);
    transform-origin: top center;

    &.is-drop-top {
      transform-origin: bottom center;
    }
  }

  /* 搜索框：固定在浮层顶部，不随选项滚动 */
  .lc-extend-select__search {
    flex: 0 0 auto;
    padding: 4px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--lc-border-lighter, #eef2f7);
  }

  .lc-extend-select__search-input {
    width: 100%;
    height: 24px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid var(--lc-border-base, #d3dde6);
    border-radius: 6px;
    background-color: transparent;
    color: var(--lc-text-regular, #333);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: var(--el-color-primary);
    }

    &::placeholder {
      color: var(--lc-text-placeholder, #999);
    }
  }

  /* 选项滚动区 */
  .lc-extend-select__options-wrap {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* 创建选项按钮 */
  .lc-extend-select__create {
    padding: 4px;
    cursor: pointer;

    &:hover {
      background-color: var(--lc-bg-hover);
    }
  }

  .lc-extend-select__create-text {
    display: block;
    padding: 0 6px;
    height: 24px;
    line-height: 24px;
    font-size: 13px;
    color: var(--lc-text-regular, #333);
  }

  /* 空状态 */
  .lc-extend-select__empty {
    padding: 8px 10px;
    text-align: center;
    color: var(--lc-text-placeholder, #999);
    font-size: 13px;
  }

  /* 分组标题 */
  .lc-extend-select__group-title {
    padding: 4px 10px 2px;
    color: var(--lc-text-secondary, #999);
    font-size: 12px;
    font-weight: 500;
  }

  /* 选项列表：统一 4px 节奏（四周 padding 4px、行间距 4px、行高 24px） */
  .lc-extend-select__options {
    list-style: none;
    margin: 0;
    padding: 4px;
    box-sizing: border-box;

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
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: color 0.15s ease, background-color 0.15s ease;

      /* 选项间距：与四周边缘同为 4px */
      & + li {
        margin-top: 4px;
      }

      &:hover {
        background-color: var(--lc-bg-hover);
        box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.06);
      }

      &.is-selected {
        color: var(--el-color-primary);
      }
    }
  }

  .lc-extend-select__opt-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .lc-extend-select__check {
    flex-shrink: 0;
    margin-left: 4px;
    color: var(--el-color-primary);
  }

  /* --------------------------------------------------------------------------
     浮层展开/收起动画：标准下拉的「浮起 + 淡入」
     -------------------------------------------------------------------------- */
  .lc-extend-select-pop-enter-active {
    transition: opacity 0.16s ease-out, transform 0.16s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .lc-extend-select-pop-leave-active {
    transition: opacity 0.12s ease-in, transform 0.12s ease-in;
  }

  .lc-extend-select-pop-enter-from,
  .lc-extend-select-pop-leave-to {
    opacity: 0;
    transform: scale(0.98);
  }

  /* 深色模式：默认 --lc-bg-hover 与浮层底色过于接近，改用明显提亮的悬停背景 */
  .theme-dark .lc-extend-select__options li:hover {
    background-color: #454c57;
    box-shadow: none;
  }

  .theme-dark .lc-extend-select__tag {
    background-color: #363b44;
    color: #c4cad3;
  }
</style>
