<template>
  <div
    class="custom-date-picker"
    :class="{ 'position-top': positionTop, 'is-frosted': frosted }"
    :style="pickerStyle"
    v-click-outside="handleClickOutside"
    @keydown="handleKeydown"
    tabindex="0"
    ref="picker"
  >
    <div class="picker-header">
      <mo-hover-tip effect="dark" :content="t('task.prev-month')" placement="top" :open-delay="500">
        <button class="nav-btn" @click="prevMonth">
          <mo-icon name="chevron-left" width="16" height="16" />
        </button>
      </mo-hover-tip>
      <mo-hover-tip effect="dark" :content="t('task.dblclick-to-today')" placement="top" :open-delay="500">
        <span class="current-month" @dblclick="goToToday">{{ currentYear }}年 {{ currentMonth }}月</span>
      </mo-hover-tip>
      <mo-hover-tip effect="dark" :content="t('task.next-month')" placement="top" :open-delay="500">
        <button class="nav-btn" @click="nextMonth">
          <mo-icon name="chevron-right" width="16" height="16" />
        </button>
      </mo-hover-tip>
    </div>
    <div class="picker-body">
      <div class="weekdays">
        <span v-for="day in weekDays" :key="day">{{ day }}</span>
      </div>
      <div class="days-grid" @mouseleave="onGridMouseLeave">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="day-cell"
          :class="{
            'other-month': day.otherMonth,
            'today': day.isToday,
            'selected': day.isSelected,
            'has-tasks': day.taskCount > 0
          }"
          @click="selectDate(day)"
          @mouseenter="onDayHover(day)"
        >
          <span class="day-number">{{ day.day }}</span>
          <span v-if="day.taskCount > 0" class="task-count">{{ day.taskCount > 99 ? '99+' : day.taskCount }}</span>
        </div>
      </div>
    </div>
    <div class="picker-footer" v-if="modelValue">
      <button class="footer-btn clear-btn" @click="clearFilter">
        {{ t('task.clear-filter') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import '@/components/Icons/chevron-left'
import '@/components/Icons/chevron-right'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global

const vClickOutside = {
  mounted (el, binding) {
    el._clickOutside = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event)
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted (el) {
    document.removeEventListener('click', el._clickOutside)
  }
}

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  frosted: {
    type: Boolean,
    default: false
  },
  taskCounts: {
    type: Object,
    default: () => ({})
  },
  triggerRect: {
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'change', 'clear', 'hover', 'close'])

defineOptions({ name: 'mo-custom-date-picker' })

const picker = ref(null)
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const positionTop = ref(false)
const pickerHeight = 360

function isToday (year, month, day) {
  const today = new Date()
  return today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === day
}

const calendarDays = computed(() => {
  const days = []
  const firstDay = new Date(currentYear.value, currentMonth.value - 1, 1)
  const lastDay = new Date(currentYear.value, currentMonth.value, 0)
  const startDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const prevMonthLastDay = new Date(currentYear.value, currentMonth.value - 1, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i
    const prevMonth = currentMonth.value === 1 ? 12 : currentMonth.value - 1
    const prevYear = currentMonth.value === 1 ? currentYear.value - 1 : currentYear.value
    const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      day,
      dateStr,
      otherMonth: true,
      isToday: isToday(prevYear, prevMonth, day),
      isSelected: props.modelValue === dateStr,
      taskCount: props.taskCounts[dateStr] || 0
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      day,
      dateStr,
      otherMonth: false,
      isToday: isToday(currentYear.value, currentMonth.value, day),
      isSelected: props.modelValue === dateStr,
      taskCount: props.taskCounts[dateStr] || 0
    })
  }

  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    const nextMonth = currentMonth.value === 12 ? 1 : currentMonth.value + 1
    const nextYear = currentMonth.value === 12 ? currentYear.value + 1 : currentYear.value
    const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      day,
      dateStr,
      otherMonth: true,
      isToday: isToday(nextYear, nextMonth, day),
      isSelected: props.modelValue === dateStr,
      taskCount: props.taskCounts[dateStr] || 0
    })
  }

  return days
})

const pickerStyle = computed(() => {
  if (!props.triggerRect || !props.triggerRect.right) {
    return {}
  }
  const style = {
    right: `${window.innerWidth - props.triggerRect.right + 8}px`
  }
  if (positionTop.value) {
    style.bottom = `${window.innerHeight - props.triggerRect.top + 6}px`
  } else {
    style.top = `${props.triggerRect.bottom + 6}px`
  }
  return style
})

function calculatePosition () {
  if (!props.triggerRect || !props.triggerRect.bottom) return
  const spaceBelow = window.innerHeight - props.triggerRect.bottom
  const spaceAbove = props.triggerRect.top
  positionTop.value = spaceBelow < pickerHeight && spaceAbove > spaceBelow
}

function prevMonth () {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth () {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function goToToday () {
  const today = new Date()
  currentYear.value = today.getFullYear()
  currentMonth.value = today.getMonth() + 1
}

function selectDate (day) {
  emit('update:modelValue', day.dateStr)
  emit('change', day.dateStr)
}

function clearFilter () {
  emit('update:modelValue', '')
  emit('clear')
}

function onDayHover (day) {
  emit('hover', day.dateStr)
}

function onGridMouseLeave () {
  emit('hover', null)
}

function handleKeydown (event) {
  if (event.key === 'ArrowLeft') {
    prevMonth()
  } else if (event.key === 'ArrowRight') {
    nextMonth()
  } else if (event.key === 'Escape') {
    emit('close')
  }
}

function handleClickOutside () {
  emit('close')
}

onMounted(() => {
  if (props.modelValue) {
    const [year, month] = props.modelValue.split('-').map(Number)
    if (year && month) {
      currentYear.value = year
      currentMonth.value = month
    }
  }
  calculatePosition()
  window.addEventListener('resize', calculatePosition)
  nextTick(() => {
    if (picker.value) {
      picker.value.focus()
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', calculatePosition)
})
</script>

<style lang="scss">
.custom-date-picker {
  position: fixed;
  background-color: #fff;
  border-radius: var(--lc-radius-dropdown);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  width: 280px;
  user-select: none;
  z-index: 9999;
  outline: none;
  transform-origin: right top;
}

.custom-date-picker.position-top {
  transform-origin: right bottom;
}

.theme-light.has-app-background-image .custom-date-picker {
  /* 非 frosted：实心不透明（与无背景图时一致）。
     背景图场景不再默认透明——只有开启"日期筛选毛玻璃"才透明模糊。 */
  background-color: #fff;
}

.theme-light .custom-date-picker.is-frosted {
  background-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark .custom-date-picker {
  background-color: var(--lc-bg-dropdown, #2e333b);
}

.theme-dark.has-app-background-image .custom-date-picker {
  background-color: var(--lc-bg-dropdown, #2e333b);
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark .custom-date-picker.is-frosted {
  background-color: var(--lc-bg-dropdown, #2e333b);
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark .custom-date-picker .nav-btn,
.theme-dark .custom-date-picker .current-month,
.theme-dark .custom-date-picker .day-number {
  color: #eee;
}

.theme-dark .custom-date-picker .weekdays span {
  color: #c0c4cc;
}

.custom-date-picker .picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 4px;
}

.custom-date-picker .nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #333;
  transition: background-color 0.2s;
}

.custom-date-picker .nav-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.custom-date-picker .current-month {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.custom-date-picker .current-month:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.custom-date-picker .weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 8px;
}

.custom-date-picker .weekdays span {
  text-align: center;
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
}

.custom-date-picker .days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.custom-date-picker .day-cell {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.custom-date-picker .day-cell:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.custom-date-picker .day-cell.other-month .day-number {
  color: #c0c4cc;
}

.custom-date-picker .day-cell.today {
  background-color: rgba(64, 158, 255, 0.15);
}

.custom-date-picker .day-cell.today .day-number {
  color: #1a7fe0;
  font-weight: 600;
}

.custom-date-picker .day-cell.selected {
  background-color: #1a7fe0;
}

.custom-date-picker .day-cell.selected .day-number {
  color: #fff;
}

.custom-date-picker .day-cell.selected .task-count {
  color: #fff;
}

.custom-date-picker .day-number {
  font-size: 13px;
  color: #333;
  line-height: 1;
}

.custom-date-picker .task-count {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 14px;
  height: 14px;
  padding: 0 2px;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  color: #1a7fe0;
  background-color: transparent;
}

/* 底部操作栏 */
.custom-date-picker .picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.custom-date-picker .footer-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s, color 0.2s;
}

.custom-date-picker .today-btn {
  color: #1a7fe0;
}

.custom-date-picker .today-btn:hover {
  background-color: rgba(64, 158, 255, 0.1);
}

.custom-date-picker .clear-btn {
  color: #909399;
}

.custom-date-picker .clear-btn:hover {
  color: #f56c6c;
  background-color: rgba(245, 108, 108, 0.1);
}

.custom-date-picker .footer-info {
  font-size: 11px;
  color: #909399;
  flex: 1;
  text-align: center;
}

/* 暗色主题 */
.theme-dark .custom-date-picker {
  background-color: var(--lc-bg-dropdown, #2e333b);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.theme-dark .custom-date-picker .nav-btn {
  color: #fff;
}

.theme-dark .custom-date-picker .nav-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
}

.theme-dark .custom-date-picker .current-month {
  color: #fff;
}

.theme-dark .custom-date-picker .current-month:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.theme-dark .custom-date-picker .weekdays span {
  color: #aaa;
}

.theme-dark .custom-date-picker .day-cell:hover {
  background-color: rgba(255, 255, 255, 0.12);
}

.theme-dark .custom-date-picker .day-cell.other-month .day-number {
  color: #666;
}

.theme-dark .custom-date-picker .day-cell.today {
  background-color: rgba(64, 158, 255, 0.25);
}

.theme-dark .custom-date-picker .day-number {
  color: #fff;
}

.theme-dark .custom-date-picker .picker-footer {
  border-top-color: #555;
}

.theme-dark .custom-date-picker .footer-info {
  color: #aaa;
}

.theme-dark .custom-date-picker .clear-btn {
  color: #aaa;
}
</style>
