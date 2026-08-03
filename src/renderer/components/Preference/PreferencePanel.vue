<template>
  <el-container
    class="main panel preference-panel"
    direction="horizontal"
    :class="{ 'preference-standalone': isStandalone }"
    style="height: 100vh"
  >
    <el-aside v-if="isStandalone" width="220px" class="subnav preference-subnav-left">
      <div class="preference-subnav-wrapper">
        <router-view name="subnav" />
        <div class="preference-subnav-search">
          <button
            :class="['floating-bar-search preference-search', { 'is-hovered': isPreferenceSearchHovering, 'is-pressed': isPreferenceSearchPressed }]"
            @click="focusPreferenceSearch"
            @mouseenter="handlePreferenceSearchMouseEnter"
            @mouseleave="handlePreferenceSearchMouseLeave"
            @mousedown="handlePreferenceSearchMouseDown"
            @mouseup="handlePreferenceSearchMouseUp"
          >
            <i class="el-icon-search"></i>
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
          </button>
        </div>
      </div>
    </el-aside>
    <template v-if="isThreeColumn">
      <el-aside v-if="showThreeColumnSubnav" width="220px" class="subnav three-column-subnav">
        <router-view name="subnav" />
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
        <h4 class="hidden-xs-only">
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
        <h4 class="hidden-sm-and-up">
          <span class="subnav-title__text">{{ title }}</span>
        </h4>
      </el-header>
      <router-view name="form" ref="preferenceForm" />
    </el-container>

    <template v-if="showSmallScreenNav">
      <div
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
  </el-container>
</template>

<script>
  import { mapState } from 'vuex'
  import Aside from '@/components/Aside/SettingsAside'
  import PreferenceAdvanced from '@/components/Preference/Advanced'

  export default {
    name: 'mo-content-preference',
    components: {
      [Aside.name]: Aside
    },
    data () {
      return {
        windowWidth: 0,
        isPreferenceSearchHovering: false,
        isPreferenceSearchFocused: false,
        isPreferenceSearchPressed: false,
        preferenceSearchTimer: null,
        isPreferenceSearchAutoNavigating: false,
        preferenceSearchToken: 0,
        pendingPreferenceSearchKeyword: '',
        preferenceSearchIndex: {},
        preferenceSearchStaticIndexReady: false,
        preferenceSearchLastIndexedPath: ''
      }
    },
    computed: {
      ...mapState('preference', {
        autoHideAside: state => state.config.autoHideAside,
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
        return !this.isSmallWindow
      },
      showMainAside () {
        // In three-column mode, the main aside is not shown;
        // the subnav takes its place as the left sidebar
        return false
      },
      showThreeColumnSubnav () {
        if (this.isStandalone) {
          return false
        }
        return this.isThreeColumn
      },
      showSmallScreenNav () {
        if (this.isStandalone) {
          return false
        }
        // In three-column mode, small screen nav is not needed
        if (this.isThreeColumn) {
          return false
        }
        return true
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
          { key: 'bt', title: this.$t('preferences.bt-settings'), route: `${base}/bt` },
          { key: 'task', title: this.$t('preferences.task-manage'), route: `${base}/task` },
          { key: 'file', title: this.$t('preferences.file-manage'), route: `${base}/file` },
          { key: 'advanced', title: this.$t('preferences.advanced'), route: `${base}/advanced` }
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
      },
      '$route.path' () {
        // Invalidate search index cache when the route changes,
        // so the next search rebuilds the index for the new page.
        this.preferenceSearchLastIndexedPath = ''
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
        this.isPreferenceSearchPressed = false
        this.removePreferenceSearchMouseUpListener()
      },
      handlePreferenceSearchMouseDown () {
        this.isPreferenceSearchPressed = true
        this.addPreferenceSearchMouseUpListener()
      },
      handlePreferenceSearchMouseUp () {
        this.isPreferenceSearchPressed = false
        this.removePreferenceSearchMouseUpListener()
      },
      handlePreferenceSearchFocus () {
        this.isPreferenceSearchFocused = true
      },
      handlePreferenceSearchBlur () {
        this.isPreferenceSearchFocused = false
      },
      addPreferenceSearchMouseUpListener () {
        if (typeof window === 'undefined') {
          return
        }
        if (!this._preferenceSearchMouseUpHandler) {
          this._preferenceSearchMouseUpHandler = () => {
            this.handlePreferenceSearchMouseUp()
          }
        }
        window.addEventListener('mouseup', this._preferenceSearchMouseUpHandler)
      },
      removePreferenceSearchMouseUpListener () {
        if (typeof window === 'undefined' || !this._preferenceSearchMouseUpHandler) {
          return
        }
        window.removeEventListener('mouseup', this._preferenceSearchMouseUpHandler)
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
        this.ensurePreferenceSearchStaticIndex()
        const currentCategory = this.currentPreferenceCategory
        // Only rebuild the DOM-based index when the route has changed since
        // the last scan. Repeated searches on the same page reuse the cache,
        // avoiding expensive textContent reads and reflow on every keystroke.
        if (this.preferenceSearchLastIndexedPath !== this.$route.path) {
          await this.updatePreferenceSearchIndexFromCurrentForm()
          this.preferenceSearchLastIndexedPath = this.$route.path
        }
        if (token !== this.preferenceSearchToken) {
          return
        }
        const matchedCategory = this.findPreferenceSearchMatch(normalized, currentCategory)
        if (!matchedCategory || matchedCategory === currentCategory) {
          return
        }
        this.isPreferenceSearchAutoNavigating = true
        await this.navigateToPreferenceCategory(matchedCategory)
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
      ensurePreferenceSearchStaticIndex () {
        if (this.preferenceSearchStaticIndexReady) {
          return
        }
        const index = { ...this.preferenceSearchIndex }
        const entries = [
          { key: 'advanced', component: PreferenceAdvanced }
        ]
        entries.forEach(entry => {
          const keys = this.extractPreferenceKeysFromComponent(entry.component)
          if (!keys.length) {
            return
          }
          const text = keys.map(key => `${this.$t(key) || ''}`).join(' ').toLowerCase()
          if (text) {
            index[entry.key] = text
          }
        })
        this.preferenceSearchIndex = index
        this.preferenceSearchStaticIndexReady = true
      },
      extractPreferenceKeysFromComponent (component) {
        const render = component && (component.render || (component.options && component.options.render))
        if (typeof render !== 'function') {
          return []
        }
        const source = `${render.toString() || ''}`
        const matches = source.match(/preferences\.[a-z0-9-]+/gi) || []
        return Array.from(new Set(matches))
      },
      async updatePreferenceSearchIndexFromCurrentForm () {
        await this.$nextTick()
        await new Promise(resolve => setTimeout(resolve, 0))
        const formComponent = this.$refs.preferenceForm
        if (!formComponent || !formComponent.$el) {
          return
        }
        const cards = formComponent.$el.querySelectorAll('.preference-card, .preference-bottom-actions')
        const currentCategory = this.currentPreferenceCategory
        const nextIndex = { ...this.preferenceSearchIndex }
        if (!cards.length) {
          const text = `${formComponent.$el.textContent || ''}`.toLowerCase()
          nextIndex[currentCategory] = text
          this.preferenceSearchIndex = nextIndex
          return
        }
        const basicCategories = new Set(['basic', 'appearance', 'transfer', 'bt', 'task', 'file'])
        if (basicCategories.has(currentCategory)) {
          const categoryTextMap = {}
          Array.from(cards).forEach(card => {
            const text = `${card.textContent || ''}`.toLowerCase()
            const rawCategory = `${card.dataset.category || ''}`.trim()
            const categories = rawCategory ? rawCategory.split(/\s+/) : [currentCategory]
            categories.forEach(category => {
              if (!categoryTextMap[category]) {
                categoryTextMap[category] = text
              } else {
                categoryTextMap[category] = `${categoryTextMap[category]} ${text}`
              }
            })
          })
          Object.keys(categoryTextMap).forEach(category => {
            nextIndex[category] = categoryTextMap[category]
          })
          this.preferenceSearchIndex = nextIndex
          return
        }
        const text = Array.from(cards).map(card => card.textContent || '').join(' ').toLowerCase()
        nextIndex[currentCategory] = text
        this.preferenceSearchIndex = nextIndex
      },
      findPreferenceSearchMatch (keyword, currentCategory) {
        const index = this.preferenceSearchIndex || {}
        const categories = [currentCategory, ...this.subnavItems.map(item => item.key).filter(key => key !== currentCategory)]
        for (const key of categories) {
          const text = index[key]
          if (text && text.includes(keyword)) {
            return key
          }
        }
        return ''
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
      // 清理尚未执行的搜索防抖定时器，避免组件销毁后触发导航
      if (this.preferenceSearchTimer) {
        clearTimeout(this.preferenceSearchTimer)
        this.preferenceSearchTimer = null
      }
      if (typeof window !== 'undefined' && this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize)
        this._handleWindowResize = null
      }
      this.removePreferenceSearchMouseUpListener()
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

.subnav-small-screen.subnav-right.is-auto-hide-subnav {
  transform: translateY(-50%) translateX(calc(100% - 12px));
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.subnav-small-screen.subnav-right.is-auto-hide-subnav:hover {
  transform: translateY(-50%) translateX(0);
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

.preference-panel .panel-header {
  position: sticky;
  top: 0;
  z-index: 6;
  background-color: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(var(--app-ui-frosted-blur, 10px));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur, 10px));
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-dark .preference-panel .panel-header {
  background-color: rgba(45, 45, 45, 0.35);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.preference-panel:not(.preference-standalone) .form-preference {
  margin-top: -84px;
  padding-top: 96px;
}

.preference-standalone .preference-subnav-left {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.preference-subnav-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.preference-subnav-search {
  margin-top: auto;
  padding: 12px 16px 18px;
  flex-shrink: 0;
}

.preference-subnav-search .floating-bar-search {
  width: 100%;
  height: 28px;
  border-radius: 8px;
  border: 1px solid $--border-color-base;
  background: transparent;
  padding: 0 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  cursor: text;
  outline: none;
  transition: border-color 0.2s ease;

  &:hover,
  &.is-hovered,
  &:focus-within {
    border-color: $--color-primary;
  }
}

.preference-subnav-search .floating-bar-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: $--color-text-regular;
  font-size: 13px;
  padding: 0;
  height: 100%;
  min-width: 0;

  &::placeholder {
    color: $--color-text-secondary;
    opacity: 0.6;
  }
}

.preference-subnav-search .floating-bar-search i {
  font-size: 14px;
  color: $--task-action-color;
  margin-right: 6px;
  flex-shrink: 0;
}

.theme-dark .preference-subnav-search .floating-bar-search {
  border-color: $--task-item-border-color;

  &:hover,
  &.is-hovered,
  &:focus-within {
    border-color: $--color-primary;
  }
}

.theme-dark .preference-subnav-search .floating-bar-search-input {
  color: var(--lc-text-regular, #ddd);

  &::placeholder {
    color: var(--lc-text-secondary, #999);
    opacity: 0.6;
  }
}

.theme-dark .preference-subnav-search .floating-bar-search i {
  color: var(--lc-text-secondary, #999);
}

.preference-standalone .subnav {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.preference-standalone .subnav-inner {
  margin-top: 46px;
}

.preference-standalone .panel-header {
  border-bottom: none;
}

.preference-standalone .form-preference {
  padding-top: 16px;
  padding-bottom: 24px;
}

.preference-standalone .panel-content::-webkit-scrollbar-track {
  margin-top: 20px;
}

.form-preference {
  padding: 12px 16px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  .preference-card {
    background: transparent;
    border-radius: 12px;
    padding: 20px 24px;
    border: 1px solid $--border-color-light;
    transition: all 0.3s ease;
  }

  .card-title {
    font-size: 17px;
    font-weight: 600;
    color: $--color-text-primary;
    margin-bottom: 16px;
    padding-bottom: 10px;
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
    margin-bottom: 16px;
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

    .el-checkbox {
      .el-checkbox__label {
        font-size: 13px;
        color: $--color-text-secondary;
        transition: color 0.2s;
      }

      .el-checkbox__input.is-checked + .el-checkbox__label {
        color: $--color-text-regular;
      }
    }

    .sub-row-reverse {
      display: flex;
      align-items: center;
      flex-direction: row-reverse;
      justify-content: flex-end;
      gap: 10px;

      .sub-row-label {
        font-size: 13px;
        color: $--color-text-secondary;
      }
    }
  }

  .form-item-sub-sub {
    margin-left: 24px;
    margin-bottom: 10px;
    padding-left: 12px;
    border-left: 2px solid $--border-color-lighter;
    line-height: 1.6;

    .el-checkbox {
      .el-checkbox__label {
        font-size: 13px;
        color: $--color-text-secondary;
        transition: color 0.2s;
      }

      .el-checkbox__input.is-checked + .el-checkbox__label {
        color: $--color-text-regular;
      }
    }

    .el-radio-group {
      .el-radio__label {
        font-size: 13px;
        color: $--color-text-secondary;
      }
    }
  }

  .el-form-item__info {
    line-height: 1.6;
    margin-top: 6px;
  }

  .el-button {
    border-radius: 8px;
  }

  .el-button--mini {
    border-radius: 6px;
  }
}

.theme-light.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Dark theme styles */
.theme-dark .form-preference {
  .preference-card {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .card-title {
    color: $--dk-panel-title-color;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
}

.theme-dark.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
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
</style>
