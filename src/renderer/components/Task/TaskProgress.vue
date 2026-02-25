<template>
  <el-progress
    v-if="isActive"
    :percentage="displayPercent"
    :show-text="false"
    status="success"
    :color="color">
  </el-progress>
  <el-progress
    v-else
    :percentage="displayPercent"
    :show-text="false"
    :color="color">
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
        if (val === TASK_STATUS.COMPLETE || val === TASK_STATUS.SEEDING) {
          this.displayPercent = 100
        } else {
          this.displayPercent = this.percent
        }
      }
    },
    computed: {
      isActive () {
        return this.status === TASK_STATUS.ACTIVE
      },
      percent () {
        const raw = calcProgress(this.total, this.completed)
        if (this.status === TASK_STATUS.COMPLETE || this.status === TASK_STATUS.SEEDING) {
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
        return colors[this.status]
      }
    },
    mounted () {
      const interval = 100
      this.ticker = setInterval(() => {
        if (!this.isActive) {
          if (this.status === TASK_STATUS.COMPLETE || this.status === TASK_STATUS.SEEDING) {
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
          // 从不确定状态切换时，只在实际进度更大时更新
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
        // 确保进度只能前进，不能后退
        if (next >= this.displayPercent) {
          this.displayPercent = next
        }
      }, interval)
    },
    beforeDestroy () {
      if (this.ticker) {
        clearInterval(this.ticker)
        this.ticker = null
      }
    }
  }
</script>
