<template>
  <el-container
    class="main panel"
    direction="horizontal"
    :class="{ 'preference-standalone': isStandalone }"
    style="height: 100vh"
  >
    <el-aside v-if="isStandalone" width="220px" class="subnav preference-subnav-left">
      <router-view :key="$route.path" name="subnav" />
    </el-aside>
    <template v-if="isThreeColumn">
      <mo-aside v-if="showMainAside" />
      <el-aside v-if="showThreeColumnSubnav" width="220px" class="subnav">
        <router-view :key="$route.path" name="subnav" />
      </el-aside>
    </template>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
        v-if="!isStandalone"
        class="panel-header"
        height="84"
      >
        <h4
          v-if="subnavMode !== 'title'"
          class="hidden-xs-only"
        >
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
        <h4
          v-if="subnavMode === 'floating'"
          class="hidden-sm-and-up"
        >
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
        <mo-subnav-switcher
          v-if="subnavMode === 'title'"
          :title="title"
          :subnavs="subnavs"
        />
      </el-header>
      <router-view :key="$route.path" name="form" ref="preferenceForm" />
    </el-container>

    <template v-if="showSmallScreenNav">
      <div
        v-if="subnavMode === 'floating'"
        class="subnav-small-screen subnav-right"
      >
        <ul class="menu small-menu">
          <li
            v-for="item in subnavItems"
            :key="item.key"
            @click="navPreference(item.key)"
            :class="{ active: isActive(item.route) }"
          >
            <span class="subnav-small-screen__text">{{ item.title }}</span>
          </li>
        </ul>
      </div>
    </template>
    <div v-if="isStandalone" class="preference-bottom-search">
      <button
        :class="['floating-bar-search preference-search', { 'is-expanded': isPreferenceSearchOpen, 'is-hovered': isPreferenceSearchHovering }]"
        @click="focusPreferenceSearch"
        @mouseenter="handlePreferenceSearchMouseEnter"
        @mouseleave="handlePreferenceSearchMouseLeave"
      >
        <input
          ref="preferenceSearchInput"
          class="floating-bar-search-input"
          type="text"
          :placeholder="$t('preferences.search-settings')"
          v-model="preferenceSearchValue"
          @click.stop
          @focus="handlePreferenceSearchFocus"
          @blur="handlePreferenceSearchBlur"
        >
        <i class="el-icon-search"></i>
      </button>
    </div>
  </el-container>
</template>

<script>
  import { mapState } from 'vuex'
  import SubnavSwitcher from '@/components/Subnav/SubnavSwitcher'
  import Aside from '@/components/Aside/Index'

  export default {
    name: 'mo-content-preference',
    components: {
      [SubnavSwitcher.name]: SubnavSwitcher,
      [Aside.name]: Aside
    },
    data () {
      return {
        windowWidth: 0,
        isPreferenceSearchHovering: false,
        isPreferenceSearchFocused: false,
        preferenceSearchTimer: null,
        isPreferenceSearchAutoNavigating: false,
        preferenceSearchToken: 0,
        pendingPreferenceSearchKeyword: ''
      }
    },
    computed: {
      ...mapState('preference', {
        subnavMode: state => state.config.subnavMode || 'floating',
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating',
        preferenceSearchKeyword: state => state.searchKeyword
      }),
      preferenceSearchValue: {
        get () {
          return this.preferenceSearchKeyword
        },
        set (val) {
          this.$store.dispatch('preference/updateSearchKeyword', val)
        }
      },
      isPreferenceSearchOpen () {
        return true
      },
      preferenceBasePath () {
        const path = `${this.$route.path || ''}`
        return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
      },
      isStandalone () {
        return this.preferenceBasePath === '/preference-window'
      },
      isSmallWindow () {
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        if (!width) {
          return false
        }
        return width < 700
      },
      isThreeColumn () {
        if (this.sidebarLayoutMode !== 'three-column') {
          return false
        }
        return !this.isSmallWindow
      },
      showMainAside () {
        if (this.isStandalone) {
          return false
        }
        if (!this.isThreeColumn) {
          return false
        }
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        if (!width) {
          return false
        }
        return width >= 960
      },
      showThreeColumnSubnav () {
        if (this.isStandalone) {
          return false
        }
        return this.isThreeColumn && this.subnavMode !== 'title'
      },
      showSmallScreenNav () {
        if (this.isStandalone) {
          return false
        }
        if (this.sidebarLayoutMode !== 'three-column') {
          return true
        }
        return !this.isThreeColumn
      },
      subnavs () {
        return this.subnavItems.map(item => ({
          key: item.key,
          title: item.title,
          route: item.route
        }))
      },
      subnavItems () {
        const base = this.preferenceBasePath
        return [
          { key: 'basic', title: this.$t('preferences.basic'), route: `${base}/basic` },
          { key: 'appearance', title: this.$t('preferences.appearance'), route: `${base}/appearance` },
          { key: 'transfer', title: this.$t('preferences.transfer-settings'), route: `${base}/transfer` },
          { key: 'task', title: this.$t('preferences.task-manage'), route: `${base}/task` },
          { key: 'file', title: this.$t('preferences.file-manage'), route: `${base}/file` },
          { key: 'security', title: this.$t('preferences.security'), route: `${base}/security` },
          { key: 'advanced', title: this.$t('preferences.advanced'), route: `${base}/advanced` },
          { key: 'bittorrent', title: this.$t('preferences.bittorrent'), route: `${base}/bittorrent` }
        ]
      },
      title () {
        const rawPath = `${this.$route.path || ''}`
        const parts = rawPath.replace(/^\/preference(?:-window)?\//, '').split('/')
        const key = parts && parts[0] ? parts[0] : 'basic'
        const subnav = this.subnavs.find(item => item.key === key)
        return subnav ? subnav.title : this.$t('preferences.basic')
      },
      currentPreferenceCategory () {
        const rawPath = `${this.$route.path || ''}`
        const parts = rawPath.replace(/^\/preference(?:-window)?\//, '').split('/')
        return parts && parts[0] ? parts[0] : 'basic'
      }
    },
    watch: {
      preferenceSearchKeyword (val) {
        this.schedulePreferenceSearch(val)
      }
    },
    methods: {
      navPreference (category) {
        const base = this.preferenceBasePath
        this.$router.push({
          path: `${base}/${category}`
        }).catch(err => {
          console.log(err)
        })
      },
      isActive (path) {
        const current = this.$route.path
        if (current === path) {
          return true
        }
        const base = this.preferenceBasePath
        return current === base && path === `${base}/basic`
      },
      handleWindowResize () {
        if (typeof window === 'undefined') {
          return
        }
        this.windowWidth = window.innerWidth || 0
      },
      focusPreferenceSearch () {
        this.$nextTick(() => {
          const input = this.$refs.preferenceSearchInput
          if (input && input.focus) {
            input.focus()
          }
        })
      },
      handlePreferenceSearchMouseEnter () {
        this.isPreferenceSearchHovering = true
      },
      handlePreferenceSearchMouseLeave () {
        this.isPreferenceSearchHovering = false
      },
      handlePreferenceSearchFocus () {
        this.isPreferenceSearchFocused = true
      },
      handlePreferenceSearchBlur () {
        this.isPreferenceSearchFocused = false
      },
      schedulePreferenceSearch (keyword) {
        if (this.preferenceSearchTimer) {
          clearTimeout(this.preferenceSearchTimer)
          this.preferenceSearchTimer = null
        }
        const normalized = `${keyword || ''}`.trim()
        if (!normalized) {
          this.pendingPreferenceSearchKeyword = ''
          return
        }
        if (this.isPreferenceSearchAutoNavigating) {
          this.pendingPreferenceSearchKeyword = normalized
          return
        }
        this.preferenceSearchTimer = setTimeout(() => {
          this.runPreferenceSearch(normalized)
        }, 200)
      },
      async runPreferenceSearch (keyword) {
        const normalized = `${keyword || ''}`.trim().toLowerCase()
        if (!normalized) {
          return
        }
        const token = ++this.preferenceSearchToken
        if (this.isPreferenceSearchAutoNavigating) {
          this.pendingPreferenceSearchKeyword = keyword
          return
        }
        const currentCategory = this.currentPreferenceCategory
        const currentMatched = await this.checkCurrentPreferenceMatch(normalized)
        if (token !== this.preferenceSearchToken) {
          return
        }
        if (currentMatched) {
          return
        }
        this.isPreferenceSearchAutoNavigating = true
        const categories = this.subnavItems.map(item => item.key).filter(key => key !== currentCategory)
        let matchedCategory = ''
        for (const key of categories) {
          await this.navigateToPreferenceCategory(key)
          if (token !== this.preferenceSearchToken) {
            this.isPreferenceSearchAutoNavigating = false
            return
          }
          const matched = await this.checkCurrentPreferenceMatch(normalized)
          if (token !== this.preferenceSearchToken) {
            this.isPreferenceSearchAutoNavigating = false
            return
          }
          if (matched) {
            matchedCategory = key
            break
          }
        }
        if (!matchedCategory) {
          await this.navigateToPreferenceCategory(currentCategory)
        }
        this.isPreferenceSearchAutoNavigating = false
        if (this.pendingPreferenceSearchKeyword) {
          const nextKeyword = this.pendingPreferenceSearchKeyword
          this.pendingPreferenceSearchKeyword = ''
          this.runPreferenceSearch(nextKeyword)
        }
      },
      async navigateToPreferenceCategory (category) {
        const base = this.preferenceBasePath
        const targetPath = `${base}/${category}`
        if (this.$route.path !== targetPath) {
          await this.$router.push({ path: targetPath }).catch(() => {})
        }
        await this.$nextTick()
        await new Promise(resolve => setTimeout(resolve, 0))
      },
      async checkCurrentPreferenceMatch (keyword) {
        await this.$nextTick()
        await new Promise(resolve => setTimeout(resolve, 0))
        const formComponent = this.$refs.preferenceForm
        if (!formComponent || !formComponent.$el) {
          return false
        }
        if (typeof formComponent.hasNoResults === 'boolean') {
          return !formComponent.hasNoResults
        }
        const cards = formComponent.$el.querySelectorAll('.preference-card, .preference-bottom-actions')
        if (!cards.length) {
          const text = `${formComponent.$el.textContent || ''}`.toLowerCase()
          return text.includes(keyword)
        }
        return Array.from(cards).some(card => {
          if (card.style && card.style.display === 'none') {
            return false
          }
          const text = `${card.textContent || ''}`.toLowerCase()
          return text.includes(keyword)
        })
      }
    },
    mounted () {
      if (typeof window !== 'undefined') {
        this.handleWindowResize()
        this._handleWindowResize = () => {
          this.handleWindowResize()
        }
        window.addEventListener('resize', this._handleWindowResize)
      }
    },
    beforeDestroy () {
      if (typeof window !== 'undefined' && this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize)
        this._handleWindowResize = null
      }
    }
  }
</script>

<style lang="scss">
.subnav-small-screen.subnav-right {
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  background-color: transparent;
  border-radius: 100px;
  opacity: 0.5;
  transition: opacity 0.3s ease;
  padding: 8px;
}

.subnav-small-screen.subnav-right:hover {
  opacity: 1;
}

.subnav-small-screen .menu {
  list-style: none;
  padding: 0;
  margin: 0 auto;
  user-select: none;
  cursor: default;
}

.subnav-small-screen .menu > li {
  width: auto;
  height: auto;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.25s, border-radius 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  border: none;
  box-shadow: none;
  &:focus,
  &:active {
    outline: none;
    border: none;
    box-shadow: none;
  }
}

.subnav-small-screen .menu > li:hover {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.subnav-small-screen .menu > li.active {
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
}

.subnav-small-screen .menu svg {
  padding: 6px;
  color: $--icon-color;
  outline: none;
  border: none;
  box-shadow: none;
}

.subnav-small-screen__text {
  font-size: 12px;
  color: $--color-text-regular;
  line-height: 1;
  white-space: nowrap;
}

.subnav-small-screen .small-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 4px 0;
}

.subnav-small-screen .small-menu > li {
  margin-top: 8px;
  margin-bottom: 8px;
}

.subnav-small-screen .small-menu > li:first-child {
  margin-top: 0;
}

.subnav-small-screen .small-menu > li:last-child {
  margin-bottom: 0;
}

.preference-standalone .preference-subnav-left {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.preference-standalone .subnav {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.preference-standalone .subnav-inner {
  margin-top: 10px;
}

.preference-standalone .panel-header {
  border-bottom: none;
}

.preference-standalone .form-preference {
  padding-top: 10px;
  padding-bottom: 72px;
}

.form-preference {
  padding: 12px 16px 64px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  .preference-card {
    background: $--panel-background;
    border-radius: 12px;
    padding: 28px;
    border: 1px solid $--border-color-light;
    transition: all 0.3s ease;
  }

  .card-title {
    font-size: 17px;
    font-weight: 600;
    color: $--color-text-primary;
    margin-bottom: 24px;
    padding-bottom: 14px;
    border-bottom: 1px solid $--border-color-light;
    letter-spacing: 0.3px;
  }

  .card-content {
    padding-top: 0;
  }

  .el-switch__label {
    font-weight: normal;
    color: $--color-text-regular;
    &.is-active {
      color: $--color-text-regular;
    }
  }

  .el-checkbox__input.is-checked + .el-checkbox__label {
    color: $--color-text-regular;
  }

  .el-form-item {
    a {
      color: $--color-text-regular;
      text-decoration: none;
      &:hover {
        color: $--color-text-primary;
        text-decoration: underline;
      }
      &:active {
        color: $--color-text-primary;
      }
    }
  }

  .el-form-item.el-form-item--mini {
    margin-bottom: 24px;
  }

  .el-form-item__content {
    color: $--color-text-regular;
    line-height: 1.6;
  }

  .form-item-sub {
    margin-bottom: 12px;
    line-height: 1.6;
    &:last-of-type {
      margin-bottom: 0;
    }
  }

  .el-form-item__info {
    line-height: 1.6;
    margin-top: 6px;
  }
}

.theme-light.has-app-background-image .form-preference {
  .preference-card {
    background-color: rgba(255, 255, 255, var(--app-ui-opacity-preference-card, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Dark theme styles */
.theme-dark .form-preference {
  .preference-card {
    background: $--dk-panel-background;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .card-title {
    color: $--dk-panel-title-color;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
}

.theme-dark.has-app-background-image .form-preference {
  .preference-card {
    background-color: rgba(52, 52, 52, var(--app-ui-opacity-preference-card, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Ensure card width matches panel-header width */
@media only screen and (min-width: 568px) {
  .form-preference {
    padding-right: 29px !important;
  }
}

.form-actions {
  position: sticky;
  bottom: 0;
  left: auto;
  z-index: 10;
  width: -webkit-fill-available;
  box-sizing: border-box;
  padding: 24px 16px;
}

.action-link {
  cursor: pointer;
  color: $--link-color;
  &.update-available {
    font-weight: bold;
  }
  &:hover {
    color: $--link-hover-color;
    text-decoration: underline;
  }
}

/* Language container styles for connected look */
.language-container {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.language-select {
  width: 100%;
  border-radius: 4px 4px 0 0 !important;
  border-bottom: none !important;
  margin-bottom: -1px !important;
  position: relative;
  z-index: 2;

  /* Light theme styles */
  .el-input__inner {
    background: $--input-background-color !important;
    border-color: $--border-color-base !important;
    color: $--color-text-primary !important;
  }

  .el-input__inner:focus {
    border-color: $--color-primary !important;
  }
}

/* Dark theme styles for better integration */
.theme-dark .language-select {
  .el-input__inner {
    background: $--dk-panel-background !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: $--dk-panel-title-color !important;
  }

  .el-input__inner:focus {
    border-color: $--color-primary !important;
  }
}

.undo-change-btn {
  width: 100%;
  border-radius: 0 0 4px 4px !important;
  margin-top: -2px !important;
  height: 32px;
  line-height: 30px;
  padding: 0 12px;
  background-color: $--button-danger-background-color !important;
  border-color: $--button-danger-border-color !important;
  color: $--button-danger-font-color !important;
}

.preference-bottom-search {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 1200;
}

.preference-bottom-search .floating-bar-search {
  position: relative;
  top: auto;
  left: auto;
  transform: none;
  opacity: 1;
  pointer-events: auto;
  width: 220px;
  height: 40px;
  border-radius: 24px;
  border: 1px solid $--speedometer-border-color;
  background-color: $--task-item-action-verify-background;
  padding: 0;
  overflow: hidden;
  color: $--task-item-action-color;
  box-sizing: border-box;
  transition: width 0.15s ease-out, transform 0.15s ease-out, background-color 0.15s, border-color 0.15s;
}

.preference-bottom-search .floating-bar-search.is-expanded {
  width: 220px;
  transform: none;
}

.preference-bottom-search .floating-bar-search.is-hovered {
  transform: translateY(-6px) scale(1.03);
  border-color: $--speedometer-hover-border-color;
  background-color: $--floating-bar-item-hover-background;
}

.preference-bottom-search .floating-bar-search-input {
  position: absolute;
  left: 15px;
  top: 0;
  height: 100%;
  width: 160px;
  border: none;
  outline: none;
  background-color: transparent;
  color: inherit;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s ease-out;
}

.preference-bottom-search .floating-bar-search.is-expanded .floating-bar-search-input {
  opacity: 1;
}

.preference-bottom-search .floating-bar-search i {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: $--floating-bar-item-color;
  z-index: 10;
}

.preference-bottom-search .floating-bar-search:hover {
  border-color: $--speedometer-hover-border-color;
  background-color: $--floating-bar-item-hover-background;
}

.theme-light .preference-bottom-search .floating-bar-search {
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.theme-dark .preference-bottom-search .floating-bar-search {
  background-color: rgba(45, 45, 45, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-color: $--dk-task-item-action-border-color;
  color: $--dk-task-item-action-color;
}

.theme-dark .preference-bottom-search .floating-bar-search.is-hovered {
  background-color: $--dk-task-item-action-verify-hover-background;
  border-color: $--dk-task-item-action-border-color;
}

.theme-dark .preference-bottom-search .floating-bar-search:hover {
  background-color: $--dk-task-item-action-verify-hover-background;
  border-color: $--dk-task-item-action-border-color;
}

.theme-dark .preference-bottom-search .floating-bar-search i {
  color: $--dk-task-item-action-color;
}
</style>
