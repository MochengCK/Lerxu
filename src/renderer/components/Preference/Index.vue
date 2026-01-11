<template>
  <el-container
    class="main panel"
    direction="horizontal"
    style="height: 100vh"
  >
    <template v-if="isThreeColumn">
      <mo-aside />
      <el-aside v-if="showThreeColumnSubnav" width="220px" class="subnav">
        <router-view :key="$route.path" name="subnav" />
      </el-aside>
    </template>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
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
      <router-view :key="$route.path" name="form" />
    </el-container>

    <template v-if="!isThreeColumn">
      <div
        v-if="subnavMode === 'floating'"
        class="subnav-small-screen subnav-right"
      >
        <ul class="menu small-menu">
          <li
            @click="navPreference('basic')"
            :class="{ active: isActive('/preference/basic') || isActive('/preference') }"
          >
            <el-tooltip
              effect="dark"
              :content="$t('preferences.basic')"
              placement="left"
              :open-delay="500"
            >
              <mo-icon name="preference-basic" width="20" height="20" />
            </el-tooltip>
          </li>
          <li
            @click="navPreference('advanced')"
            :class="{ active: isActive('/preference/advanced') }"
          >
            <el-tooltip
              effect="dark"
              :content="$t('preferences.advanced')"
              placement="left"
              :open-delay="500"
            >
              <mo-icon name="preference-advanced" width="20" height="20" />
            </el-tooltip>
          </li>
        </ul>
      </div>
    </template>
  </el-container>
</template>

<script>
  import { mapState } from 'vuex'
  import SubnavSwitcher from '@/components/Subnav/SubnavSwitcher'
  import Aside from '@/components/Aside/Index'
  import '@/components/Icons/preference-basic'
  import '@/components/Icons/preference-advanced'

  export default {
    name: 'mo-content-preference',
    components: {
      [SubnavSwitcher.name]: SubnavSwitcher,
      [Aside.name]: Aside
    },
    computed: {
      ...mapState('preference', {
        subnavMode: state => state.config.subnavMode || 'floating',
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating'
      }),
      isThreeColumn () {
        return this.sidebarLayoutMode === 'three-column'
      },
      showThreeColumnSubnav () {
        return this.isThreeColumn && this.subnavMode !== 'title'
      },
      subnavs () {
        return [
          {
            key: 'basic',
            title: this.$t('preferences.basic'),
            route: '/preference/basic'
          },
          {
            key: 'advanced',
            title: this.$t('preferences.advanced'),
            route: '/preference/advanced'
          }
        ]
      },
      title () {
        const rawPath = `${this.$route.path || ''}`
        const m = rawPath.match(/^\/preference\/(basic|advanced)(?:\/|$)/)
        const key = m && m[1] ? m[1] : 'basic'
        const subnav = this.subnavs.find((item) => item.key === key)
        return subnav ? subnav.title : this.$t('preferences.basic')
      }
    },
    methods: {
      navPreference (category) {
        this.$router.push({
          path: `/preference/${category}`
        }).catch(err => {
          console.log(err)
        })
      },
      isActive (path) {
        return this.$route.path === path
      }
    },
    created () {
      this.$store.dispatch('preference/fetchPreference')
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
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: 16px;
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

.form-preference {
  padding: 16px 16px 64px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  .preference-card {
    background: $--panel-background;
    border-radius: 12px;
    padding: 24px;
    border: 1px solid $--border-color-light;
    transition: all 0.3s ease;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: $--color-text-primary;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid $--border-color-light;
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
    margin-bottom: 20px;
  }

  .el-form-item__content {
    color: $--color-text-regular;
  }

  .form-item-sub {
    margin-bottom: 8px;
    &:last-of-type {
      margin-bottom: 0;
    }
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
</style>
