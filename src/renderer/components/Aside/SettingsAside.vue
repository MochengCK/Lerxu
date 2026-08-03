<template>
  <el-aside width="78px" :class="['aside', { 'draggable': asideDraggable, 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isAsideProximityHovered }]" :style="vibrancy">
    <div class="aside-inner">
      <ul class="menu top-menu"></ul>
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
  import '@/components/Icons/menu-preference'

  export default {
    name: 'mo-aside',
    components: {
    },
    data () {
      return {
        isAsideProximityHovered: false
      }
    },
    computed: {
      ...mapState('app', {
        currentPage: state => state.currentPage
      }),
      ...mapState('preference', {
        autoHideAside: state => state.config.autoHideAside
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
      updateAsideProximityHover (event) {
        if (!this.autoHideAside) {
          if (this.isAsideProximityHovered) {
            this.isAsideProximityHovered = false
          }
          return
        }
        if (!event) {
          return
        }
        const height = typeof window !== 'undefined' ? window.innerHeight : 0
        if (!height) {
          return
        }
        const zoneHeight = Math.max(this.$el ? this.$el.offsetHeight : 0, 120) + 100
        const centerY = height / 2
        const top = centerY - zoneHeight / 2
        const bottom = centerY + zoneHeight / 2
        const withinY = event.clientY >= top && event.clientY <= bottom
        const withinX = event.clientX <= 120
        const next = withinX && withinY
        if (next !== this.isAsideProximityHovered) {
          this.isAsideProximityHovered = next
        }
      },
      handleWindowMouseMoveForAside (event) {
        this._asideMouseEvent = event
        if (this._asideMouseRaf) {
          return
        }
        this._asideMouseRaf = window.requestAnimationFrame(() => {
          this._asideMouseRaf = null
          const lastEvent = this._asideMouseEvent
          this._asideMouseEvent = null
          this.updateAsideProximityHover(lastEvent)
        })
      },
      nav (page) {
        if (page === '/preference') {
          this.$electron.ipcRenderer.send('open-preference-window')
          return
        }
        this.$router.push({
          path: page
        }).catch(err => {
          console.log(err)
        })
      }
    },
    mounted () {
      if (typeof window !== 'undefined') {
        this._handleWindowMouseMoveForAside = (event) => {
          this.handleWindowMouseMoveForAside(event)
        }
        window.addEventListener('mousemove', this._handleWindowMouseMoveForAside)
      }
    },
    beforeDestroy () {
      if (typeof window !== 'undefined' && this._handleWindowMouseMoveForAside) {
        window.removeEventListener('mousemove', this._handleWindowMouseMoveForAside)
        this._handleWindowMouseMoveForAside = null
      }
      if (this._asideMouseRaf) {
        window.cancelAnimationFrame(this._asideMouseRaf)
        this._asideMouseRaf = null
      }
    }
  }
</script>

<style lang="scss">
.aside.draggable {
  -webkit-app-region: drag;
}

.aside-inner {
  display: flex;
  height: 100%;
  flex-flow: column;
}

.menu > li.non-draggable,
.menu > li.non-draggable * {
  -webkit-app-region: no-drag;
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
  flex-grow: 1;
  min-height: 0;
}
.bottom-menu {
  margin-bottom: 24px;
  transform: translateY(-20px);
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
