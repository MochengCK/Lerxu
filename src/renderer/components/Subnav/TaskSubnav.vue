<template>
  <nav class="subnav-inner">
    <h3>{{ title }}</h3>
    <ul>
      <li
        @click="() => nav('all')"
        :class="[ current === 'all' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="menu-task" width="20" height="20" />
        </i>
        <span>{{ $t('task.all') }}</span>
      </li>
      <li
        @click="() => nav('active')"
        :class="[ current === 'active' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-start" width="20" height="20" />
        </i>
        <span>{{ $t('task.active') }}</span>
      </li>
      <li
        @click="() => nav('waiting')"
        :class="[ current === 'waiting' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-pause" width="20" height="20" />
        </i>
        <span>{{ $t('task.waiting') }}</span>
      </li>
      <li
        @click="() => nav('stopped')"
        :class="[ current === 'stopped' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-stop" width="20" height="20" />
        </i>
        <span>{{ $t('task.stopped') }}</span>
      </li>
      <li
        @click="showDatePicker"
        :class="[ current === 'date' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="calendar" width="20" height="20" />
        </i>
        <span>{{ $t('task.date-filter') }}</span>
      </li>
    </ul>

    <!-- 日期选择弹窗 -->
    <el-dialog
      :title="$t('task.select-date')"
      :visible.sync="datePickerVisible"
      width="400px"
      :close-on-click-modal="false"
    >
      <div class="date-picker-content">
        <el-date-picker
          v-model="selectedDate"
          type="date"
          :placeholder="$t('task.select-date-placeholder')"
          format="yyyy-MM-dd"
          value-format="yyyy-MM-dd"
          style="width: 100%"
        />
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button @click="datePickerVisible = false">{{ $t('app.cancel') }}</el-button>
        <el-button type="primary" @click="confirmDateFilter">{{ $t('app.submit') }}</el-button>
      </div>
    </el-dialog>
  </nav>
</template>

<script>
  import '@/components/Icons/menu-task'
  import '@/components/Icons/task-start'
  import '@/components/Icons/task-pause'
  import '@/components/Icons/task-stop'
  import '@/components/Icons/calendar'

  export default {
    name: 'mo-task-subnav',
    props: {
      current: {
        type: String,
        default: 'all'
      }
    },
    data () {
      return {
        datePickerVisible: false,
        selectedDate: ''
      }
    },
    computed: {
      title () {
        return this.$t('subnav.task-list')
      }
    },
    methods: {
      nav (status = 'active') {
        this.$router.push({
          path: `/task/${status}`
        }).catch(err => {
          console.log(err)
        })
      },
      showDatePicker () {
        this.datePickerVisible = true
      },
      confirmDateFilter () {
        if (this.selectedDate) {
          // 导航到日期过滤页面
          this.$router.push({
            path: `/task/date/${this.selectedDate}`
          }).catch(err => {
            console.log(err)
          })
        }
        this.datePickerVisible = false
      }
    }
  }
</script>

<style lang="scss" scoped>
  .date-picker-content {
    padding: 20px 0;
  }

  .dialog-footer {
    text-align: right;
  }

  .dialog-footer .el-button {
    margin-left: 10px;
  }
</style>
