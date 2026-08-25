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

<script setup>
import { ref, computed, watch } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { APP_THEME } from '@shared/constants'

const props = defineProps({
  modelValue: {
    type: String,
    default: APP_THEME.AUTO
  }
})

const emit = defineEmits(['update:modelValue', 'change'])
defineOptions({ name: 'mo-theme-switcher' })

const { t } = i18n.global

const currentValue = ref(props.modelValue)

const themeOptions = computed(() => [
  {
    className: 'theme-item-auto',
    value: APP_THEME.AUTO,
    text: t('preferences.theme-auto')
  },
  {
    className: 'theme-item-light',
    value: APP_THEME.LIGHT,
    text: t('preferences.theme-light')
  },
  {
    className: 'theme-item-dark',
    value: APP_THEME.DARK,
    text: t('preferences.theme-dark')
  }
])

watch(() => props.modelValue, (val) => {
  if (val !== currentValue.value) {
    currentValue.value = val
  }
})

watch(currentValue, (val) => {
  emit('update:modelValue', val)
  emit('change', val)
})

function handleChange (theme) {
  currentValue.value = theme
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
        border-color: var(--el-color-primary);
        box-shadow: 0 0 0 2px var(--el-color-primary-light-7), 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      span {
        color: var(--el-color-primary);
        font-weight: 500;
      }
    }

    &.theme-item-auto .theme-thumb {
      background: url('@/assets/theme-auto@2x.png') center center no-repeat;
      background-size: cover;
    }
    &.theme-item-light .theme-thumb {
      background: url('@/assets/theme-light@2x.png') center center no-repeat;
      background-size: cover;
    }
    &.theme-item-dark .theme-thumb {
      background: url('@/assets/theme-dark@2x.png') center center no-repeat;
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
