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
    <div class="picker-arrow"></div>
    <div class="picker-header">
      <el-tooltip effect="dark" :content="$t('task.prev-month')" placement="top" :open-delay="500" popper-class="date-picker-tooltip">
        <button class="nav-btn" @click="prevMonth">
          <mo-icon name="chevron-left" width="16" height="16" />
        </button>
      </el-tooltip>
      <el-tooltip effect="dark" :content="$t('task.dblclick-to-today')" placement="top" :open-delay="500" popper-class="date-picker-tooltip">
        <span class="current-month" @dblclick="goToToday">{{ currentYear }}年 {{ currentMonth }}月</span>
      </el-tooltip>
      <el-tooltip effect="dark" :content="$t('task.next-month')" placement="top" :open-delay="500" popper-class="date-picker-tooltip">
        <button class="nav-btn" @click="nextMonth">
          <mo-icon name="chevron-right" width="16" height="16" />
        </button>
      </el-tooltip>
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
    <div class="picker-footer" v-if="value">
      <button class="footer-btn clear-btn" @click="clearFilter">
        {{ $t('task.clear-filter') }}
      </button>
    </div>
  </div>
</template>

<script>
  import '@/components/Icons/chevron-left'
  import '@/components/Icons/chevron-right'

  export default {
    name: 'mo-custom-date-picker',
    props: {
      value: {
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
    },
    directives: {
      'click-outside': {
        bind (el, binding) {
          el._clickOutside = (event) => {
            if (!(el === event.target || el.contains(event.target))) {
              binding.value(event)
            }
          }
          document.addEventListener('click', el._clickOutside)
        },
        unbind (el) {
          document.removeEventListener('click', el._clickOutside)
        }
      }
    },
    data () {
      return {
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
        weekDays: ['日', '一', '二', '三', '四', '五', '六'],
        positionTop: false,
        pickerHeight: 360
      }
    },
    computed: {
      calendarDays () {
        const days = []
        const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1)
        const lastDay = new Date(this.currentYear, this.currentMonth, 0)
        const startDayOfWeek = firstDay.getDay()
        const daysInMonth = lastDay.getDate()

        // 上个月的天数
        const prevMonthLastDay = new Date(this.currentYear, this.currentMonth - 1, 0).getDate()
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          const day = prevMonthLastDay - i
          const prevMonth = this.currentMonth === 1 ? 12 : this.currentMonth - 1
          const prevYear = this.currentMonth === 1 ? this.currentYear - 1 : this.currentYear
          const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          days.push({
            day,
            dateStr,
            otherMonth: true,
            isToday: this.isToday(prevYear, prevMonth, day),
            isSelected: this.value === dateStr,
            taskCount: this.taskCounts[dateStr] || 0
          })
        }

        // 当前月的天数
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          days.push({
            day,
            dateStr,
            otherMonth: false,
            isToday: this.isToday(this.currentYear, this.currentMonth, day),
            isSelected: this.value === dateStr,
            taskCount: this.taskCounts[dateStr] || 0
          })
        }

        // 下个月的天数（补齐6行）
        const remainingDays = 42 - days.length
        for (let day = 1; day <= remainingDays; day++) {
          const nextMonth = this.currentMonth === 12 ? 1 : this.currentMonth + 1
          const nextYear = this.currentMonth === 12 ? this.currentYear + 1 : this.currentYear
          const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          days.push({
            day,
            dateStr,
            otherMonth: true,
            isToday: this.isToday(nextYear, nextMonth, day),
            isSelected: this.value === dateStr,
            taskCount: this.taskCounts[dateStr] || 0
          })
        }

        return days
      },
      pickerStyle () {
        if (!this.triggerRect || !this.triggerRect.right) {
          return {}
        }
        const style = {
          right: `${window.innerWidth - this.triggerRect.right + 8}px`
        }
        if (this.positionTop) {
          style.bottom = `${window.innerHeight - this.triggerRect.top + 10}px`
        } else {
          style.top = `${this.triggerRect.bottom + 10}px`
        }
        return style
      }
    },
    mounted () {
      if (this.value) {
        const [year, month] = this.value.split('-').map(Number)
        if (year && month) {
          this.currentYear = year
          this.currentMonth = month
        }
      }
      this.calculatePosition()
      window.addEventListener('resize', this.calculatePosition)
      // 自动聚焦以支持键盘操作
      this.$nextTick(() => {
        if (this.$refs.picker) {
          this.$refs.picker.focus()
        }
      })
    },
    beforeDestroy () {
      window.removeEventListener('resize', this.calculatePosition)
    },
    methods: {
      calculatePosition () {
        if (!this.triggerRect || !this.triggerRect.bottom) {
          return
        }
        const spaceBelow = window.innerHeight - this.triggerRect.bottom
        const spaceAbove = this.triggerRect.top
        // 如果下方空间不足，且上方空间更大，则显示在上方
        this.positionTop = spaceBelow < this.pickerHeight && spaceAbove > spaceBelow
      },
      isToday (year, month, day) {
        const today = new Date()
        return today.getFullYear() === year &&
          today.getMonth() + 1 === month &&
          today.getDate() === day
      },
      prevMonth () {
        if (this.currentMonth === 1) {
          this.currentMonth = 12
          this.currentYear--
        } else {
          this.currentMonth--
        }
      },
      nextMonth () {
        if (this.currentMonth === 12) {
          this.currentMonth = 1
          this.currentYear++
        } else {
          this.currentMonth++
        }
      },
      goToToday () {
        const today = new Date()
        this.currentYear = today.getFullYear()
        this.currentMonth = today.getMonth() + 1
      },
      selectDate (day) {
        this.$emit('input', day.dateStr)
        this.$emit('change', day.dateStr)
      },
      selectToday () {
        const today = new Date()
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        this.$emit('input', dateStr)
        this.$emit('change', dateStr)
      },
      clearFilter () {
        this.$emit('input', '')
        this.$emit('clear')
      },
      onDayHover (day) {
        this.$emit('hover', day.dateStr)
      },
      onGridMouseLeave () {
        this.$emit('hover', null)
      },
      handleKeydown (event) {
        if (event.key === 'ArrowLeft') {
          this.prevMonth()
        } else if (event.key === 'ArrowRight') {
          this.nextMonth()
        } else if (event.key === 'Escape') {
          this.$emit('close')
        }
      },
      handleClickOutside () {
        this.$emit('close')
      }
    }
  }
</script>

<style lang="scss">
.custom-date-picker {
  position: fixed;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  width: 280px;
  user-select: none;
  z-index: 9999;
  outline: none;
}

.theme-light.has-app-background-image .custom-date-picker {
  background-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-light .custom-date-picker.is-frosted {
  background-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark .custom-date-picker {
  background-color: #2d2d2d;
}

.theme-dark.has-app-background-image .custom-date-picker {
  background-color: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark .custom-date-picker.is-frosted {
  background-color: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
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

/* 箭头 - 默认指向上方（选择框在按钮下方时） */
.custom-date-picker .picker-arrow {
  position: absolute;
  top: -8px;
  right: 12px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid #fff;
}

.theme-light.has-app-background-image .custom-date-picker .picker-arrow {
  border-bottom-color: rgba(255, 255, 255, var(--app-ui-opacity, 0.9));
}

.theme-light .custom-date-picker.is-frosted .picker-arrow {
  border-bottom-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
}

.theme-dark .custom-date-picker .picker-arrow {
  border-bottom-color: #2d2d2d;
}

.theme-dark.has-app-background-image .custom-date-picker .picker-arrow {
  border-bottom-color: rgba(45, 45, 45, var(--app-ui-opacity, 0.9));
}

.theme-dark .custom-date-picker.is-frosted .picker-arrow {
  border-bottom-color: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
}

/* 选择框在按钮上方时，箭头指向下方 */
.custom-date-picker.position-top .picker-arrow {
  top: auto;
  bottom: -8px;
  border-bottom: none;
  border-top: 8px solid #fff;
}

.theme-light.has-app-background-image .custom-date-picker.position-top .picker-arrow {
  border-top-color: rgba(255, 255, 255, var(--app-ui-opacity, 0.9));
}

.theme-light .custom-date-picker.is-frosted.position-top .picker-arrow {
  border-top-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
}

.theme-dark .custom-date-picker.position-top .picker-arrow {
  border-top-color: #2d2d2d;
}

.theme-dark.has-app-background-image .custom-date-picker.position-top .picker-arrow {
  border-top-color: rgba(45, 45, 45, var(--app-ui-opacity, 0.9));
}

.theme-dark .custom-date-picker.is-frosted.position-top .picker-arrow {
  border-top-color: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9)));
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
  color: #409EFF;
  font-weight: 600;
}

.custom-date-picker .day-cell.selected {
  background-color: #409EFF;
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
  color: #409EFF;
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
  color: #409EFF;
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
  background-color: #3a3a3a;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.theme-dark .custom-date-picker .picker-arrow {
  border-bottom-color: #3a3a3a;
}

.theme-dark .custom-date-picker.position-top .picker-arrow {
  border-top-color: #3a3a3a;
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

/* Tooltip z-index fix */
.date-picker-tooltip {
  z-index: 99999 !important;
}
</style>
