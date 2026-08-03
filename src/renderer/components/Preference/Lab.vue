<template>
  <el-main class="panel-content">
    <mo-browser
      v-if="isRenderer"
      class="lab-webview"
      :src="url"
    />
  </el-main>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'

  import { APP_THEME } from '@shared/constants'
  import Browser from '@/components/Browser/Browser'
  import '@/components/Icons/info-square'

  export default {
    name: 'mo-preference-lab',
    components: {
      [Browser.name]: Browser
    },
    data () {
      const { locale } = this.$store.state.preference.config
      return {
        locale
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      ...mapState('app', {
        systemTheme: state => state.systemTheme
      }),
      ...mapState('preference', {
        config: state => state.config,
        theme: state => state.config.theme
      }),
      currentTheme () {
        if (this.theme === APP_THEME.AUTO) {
          return this.systemTheme
        } else {
          return this.theme
        }
      },
      url () {
        const { currentTheme, locale } = this
        const result = `https://motrix.app/lab?lite=true&theme=${currentTheme}&lang=${locale}`
        return result
      }
    }
  }
</script>

<style lang="scss">
.lab-webview {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
}
</style>
