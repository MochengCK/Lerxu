<template>
  <div>
    <ul class="theme-switcher">
      <li
        v-for="item in themeOptions"
        :class="['theme-item', item.className, { active: currentValue === item.value }]"
        :key="item.value"
        @click.prevent="() => handleChange(item.value)"
      >
        <div class="theme-thumb"></div>
        <span>{{ item.text }}</span>
      </li>
    </ul>
  </div>
</template>

<script>
  import { APP_THEME } from '@shared/constants'

  export default {
    name: 'mo-theme-switcher',
    props: {
      value: {
        type: String,
        default: APP_THEME.AUTO
      }
    },
    data () {
      return {
        currentValue: this.value
      }
    },
    computed: {
      themeOptions () {
        return [
          {
            className: 'theme-item-auto',
            value: APP_THEME.AUTO,
            text: this.$t('preferences.theme-auto')
          },
          {
            className: 'theme-item-light',
            value: APP_THEME.LIGHT,
            text: this.$t('preferences.theme-light')
          },
          {
            className: 'theme-item-dark',
            value: APP_THEME.DARK,
            text: this.$t('preferences.theme-dark')
          }
        ]
      }
    },
    watch: {
      value (val) {
        if (val !== this.currentValue) {
          this.currentValue = val
        }
      },
      currentValue (val) {
        this.$emit('input', val)
        this.$emit('change', val)
      }
    },
    methods: {
      handleChange (theme) {
        this.currentValue = theme
      }
    }
  }
</script>

<style lang="scss">
.theme-switcher {
  padding: 0;
  margin: 0;
  font-size: 0;
  line-height: 0;
  display: flex;
  gap: 16px;

  .theme-item {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transition: transform 0.15s ease;

    &:hover {
      transform: translateY(-2px);

      .theme-thumb {
        border-color: #888;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }

    span {
      font-size: 12px;
      line-height: 18px;
      color: #666;
      transition: color 0.15s ease;
    }

    &.active {
      .theme-thumb {
        border-color: $--color-primary;
        box-shadow: 0 0 0 2px rgba($--color-primary, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      span {
        color: $--color-primary;
        font-weight: 500;
      }
    }

    &.theme-item-auto .theme-thumb {
      background: url('~@/assets/theme-auto@2x.png') center center no-repeat;
      background-size: cover;
    }
    &.theme-item-light .theme-thumb {
      background: url('~@/assets/theme-light@2x.png') center center no-repeat;
      background-size: cover;
    }
    &.theme-item-dark .theme-thumb {
      background: url('~@/assets/theme-dark@2x.png') center center no-repeat;
      background-size: cover;
    }
  }

  .theme-thumb {
    box-sizing: border-box;
    border: 2px solid #ccc;
    border-radius: 8px;
    width: 72px;
    height: 48px;
    margin-bottom: 8px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }
}
</style>
