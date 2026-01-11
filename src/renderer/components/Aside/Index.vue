<template>
  <el-aside width="78px" :class="['aside', { 'draggable': asideDraggable }]" :style="vibrancy">
    <div class="aside-inner">
      <ul class="menu top-menu">
        <li
          @click="nav('/task')"
          class="non-draggable"
          :class="{ active: currentPage === '/task' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('menu.task')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-task" width="20" height="20" />
          </el-tooltip>
        </li>
      </ul>
      <ul class="menu bottom-menu">
        <li
          @click="nav('/preference')"
          class="non-draggable"
          :class="{ active: currentPage === '/preference' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('subnav.preferences')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-preference" width="20" height="20" />
          </el-tooltip>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'
  import '@/components/Icons/menu-task'
  import '@/components/Icons/menu-preference'

  export default {
    name: 'mo-aside',
    components: {
    },
    computed: {
      ...mapState('app', {
        currentPage: state => state.currentPage
      }),
      asideDraggable () {
        return is.macOS()
      },
      vibrancy () {
        return is.macOS()
          ? {
            backgroundColor: 'transparent'
          }
          : {}
      }
    },
    methods: {
      nav (page) {
        this.$router.push({
          path: page
        }).catch(err => {
          console.log(err)
        })
      }
    }
  }
</script>

<style lang="scss">
.aside {
  -webkit-app-region: drag;
}

.aside-inner {
  display: flex;
  height: 100%;
  flex-flow: column;
}
.menu {
    list-style: none;
    padding: 0;
    margin: 0 auto;
    user-select: none;
    cursor: default;
    > li {
      width: 32px;
      height: 32px;
      margin-top: 24px;
      cursor: pointer;
      border-radius: 16px;
      transition: background-color 0.25s, border-radius 0.25s;
      display: flex;
      align-items: center;
      justify-content: center;
      &:hover {
        background-color: rgba(255, 255, 255, 0.15);
        border-radius: 8px;
      }
      &.active {
        background-color: rgba(255, 255, 255, 0.25);
        border-radius: 8px;
      }
    }
    svg {
      padding: 6px;
      color: #fff;
    }
  }
.top-menu {
  flex: 1;
}
.bottom-menu {
  margin-bottom: 24px;
  transform: translateY(0);
}
.aside.draggable {
  border-radius: 100px;
  background-color: var(--speedometer-background);
  opacity: 0.5;
  transition: opacity 0.3s ease;
  &:hover {
    opacity: 1;
  }
}
</style>
