<template>
  <el-progress
    :percentage="displayPercent"
    :show-text="false"
    :status="isActive ? 'success' : undefined"
    :color="color"
    :define-back-color="backColor"
    :class="{ 'is-pending-selection': pendingSelection }">
  </el-progress>
</template>

<script>
  import { TASK_STATUS } from '@shared/constants'
  import { calcProgress } from '@shared/utils'
  import colors from '@shared/colors'

  export default {
    name: 'mo-task-progress',
    data () {
      return {
        displayPercent: 0,
        ticker: null,
        baseCompleted: 0,
        baseTime: 0,
        currentSpeed: 0,
        lastIndeterminate: false
      }
    },
    props: {
      total: {
        type: Number
      },
      completed: {
        type: Number
      },
      status: {
        type: String,
        default: TASK_STATUS.ACTIVE
      },
      speed: {
        type: Number,
        default: 0
      },
      pendingSelection: {
        type: Boolean,
        default: false
      }
    },
    watch: {
      percent: {
        handler (val) {
          const p = Number.isFinite(val) ? val : 0
          if (!Number.isFinite(this.displayPercent)) {
            this.displayPercent = p
          } else if (!this.isActive) {
            this.displayPercent = p
          } else if (Math.abs(p - this.displayPercent) > 2) {
            // 确保进度只能前进，不能后退（防止回弹）
            if (p > this.displayPercent) {
              this.displayPercent = p
            }
          }
          this.baseCompleted = Number.isFinite(this.completed) ? this.completed : 0
          this.baseTime = Date.now()
        },
        immediate: true
      },
      speed: {
        handler (val) {
          this.currentSpeed = Number.isFinite(val) ? val : 0
          if (this.currentSpeed > 0 && this.baseTime === 0) {
            this.baseCompleted = Number.isFinite(this.completed) ? this.completed : 0
            this.baseTime = Date.now()
          }
        },
        immediate: true
      },
      status (val) {
        if (val === TASK_STATUS.COMPLETE || val === TASK_STATUS.SEEDING || val === TASK_STATUS.MERGING) {
          this.displayPercent = 100
        } else {
          this.displayPercent = this.percent
        }
      },
      // 活跃状态切换时启停平滑动画定时器，避免非活跃任务常驻定时器
      isActive (val) {
        if (val) {
          this.startTicker()
        } else {
          this.stopTicker()
        }
      }
    },
    computed: {
      isActive () {
        return this.status === TASK_STATUS.ACTIVE
      },
      percent () {
        const raw = calcProgress(this.total, this.completed)
        if (this.status === TASK_STATUS.COMPLETE || this.status === TASK_STATUS.SEEDING || this.status === TASK_STATUS.MERGING) {
          return 100
        }
        if (!Number.isFinite(raw)) {
          return 0
        }
        if (raw < 0) {
          return 0
        }
        if (raw > 100) {
          return 100
        }
        return raw
      },
      color () {
        if (this.pendingSelection) {
          return '#f0ad4e'
        }
        return colors[this.status]
      },
      backColor () {
        // 进度条轨道（背景）颜色：通过 define-back-color prop 以内联样式生效，
        // 普通 CSS 无法覆盖。失败任务使用与应用错误色一致的纯红（100% 不透明），
        // BT 待选择文件使用橙色背景，其余状态返回空串保持 element-ui 默认。
        if (this.status === TASK_STATUS.ERROR) {
          return '#FF6157'
        }
        if (this.pendingSelection) {
          return '#F6C46B'
        }
        return ''
      }
    },
    mounted () {
      // 仅活跃任务需要 250ms 平滑进度动画；非活跃任务由 percent
      // watch 直接同步，避免每个任务项都常驻一个定时器
      if (this.isActive) {
        this.startTicker()
      }
    },
    methods: {
      startTicker () {
        if (this.ticker) {
          return
        }
        this.ticker = setInterval(() => this.animateProgress(), 250)
      },
      stopTicker () {
        if (this.ticker) {
          clearInterval(this.ticker)
          this.ticker = null
        }
      },
      animateProgress () {
        if (!this.isActive) {
          if (this.status === TASK_STATUS.COMPLETE || this.status === TASK_STATUS.SEEDING || this.status === TASK_STATUS.MERGING) {
            this.displayPercent = 100
          } else {
            this.displayPercent = this.percent
          }
          return
        }
        const total = Number.isFinite(this.total) ? this.total : 0
        if (!(total > 0)) {
          if (this.currentSpeed > 0) {
            const min = 5
            const max = 15
            const step = 0.6
            let next = Number.isFinite(this.displayPercent) ? (this.displayPercent + step) : min
            if (next > max) {
              next = min
            }
            this.displayPercent = next
            this.lastIndeterminate = true
            return
          }
          this.lastIndeterminate = false
          const actual = this.percent
          if (!Number.isFinite(this.displayPercent) || actual > this.displayPercent) {
            this.displayPercent = actual
          }
          return
        }
        const actual = this.percent
        if (this.lastIndeterminate) {
          if (actual > this.displayPercent) {
            this.displayPercent = actual
          }
          this.lastIndeterminate = false
        }
        if (!(this.currentSpeed > 0 && this.baseTime > 0)) {
          if (!Number.isFinite(this.displayPercent) || actual > this.displayPercent) {
            this.displayPercent = actual
          }
          return
        }
        const now = Date.now()
        const elapsed = Math.max(0, now - this.baseTime) / 1000
        const estCompleted = this.baseCompleted + this.currentSpeed * elapsed
        const estClamped = Math.min(estCompleted, total)
        const estPercent = calcProgress(total, estClamped)
        let leadMax = 3
        if (actual >= 99) {
          leadMax = 0.2
        } else if (actual >= 95) {
          leadMax = 1
        }
        const target = Math.min(estPercent, actual + leadMax, 100)
        let next
        if (!Number.isFinite(this.displayPercent)) {
          next = target
        } else {
          const alpha = 0.4
          next = this.displayPercent + (target - this.displayPercent) * alpha
        }
        if (!Number.isFinite(next)) {
          next = actual
        }
        if (next >= this.displayPercent) {
          this.displayPercent = next
        }
      }
    },
    beforeDestroy () {
      this.stopTicker()
    }
  }
</script>
