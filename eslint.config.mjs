import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import babelParser from '@babel/eslint-parser'
import globals from 'globals'

// 构建期由 unplugin-auto-import 注入的 Vue / Vue Router / Pinia API。
// ESLint 不知道这些全局，未声明会误报 no-undef。
const autoImportGlobals = {
  ref: 'readonly',
  reactive: 'readonly',
  computed: 'readonly',
  watch: 'readonly',
  watchEffect: 'readonly',
  nextTick: 'readonly',
  toRef: 'readonly',
  toRefs: 'readonly',
  shallowRef: 'readonly',
  triggerRef: 'readonly',
  markRaw: 'readonly',
  readonly: 'readonly',
  inject: 'readonly',
  provide: 'readonly',
  onMounted: 'readonly',
  onBeforeMount: 'readonly',
  onUnmounted: 'readonly',
  onBeforeUnmount: 'readonly',
  onActivated: 'readonly',
  onDeactivated: 'readonly',
  useSlots: 'readonly',
  useAttrs: 'readonly',
  useRoute: 'readonly',
  useRouter: 'readonly',
  defineStore: 'readonly',
  storeToRefs: 'readonly'
}

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src/renderer/dist-electron/**',
      'src/renderer/components/Icons/*.js',
      'src/shared/locales/**',
      '!src/shared/locales/all.js',
      '!src/shared/locales/app.js',
      '!src/shared/locales/index.js',
      '!src/shared/locales/LocaleManager.js'
    ]
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoImportGlobals,
        appId: 'writable',
        __static: 'writable'
      }
    },
    rules: {
      'no-console': 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      // 项目大量使用 `catch (e) {}` 有意忽略错误（清理临时文件、能力探测）
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // ESLint 10 新增的规则：项目里大量「先赋初值、分支里再覆盖」的写法
      // 会被它判成死赋值（37 处），属于既有风格，不是错误。
      'no-useless-assignment': 'off',
      // 单单词组件名（Atom.vue / Icon.vue）是刻意命名
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: babelParser,
        requireConfigFile: false,
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    }
  },
  {
    // 主进程源码经 vite/rollup 打包成 dist/electron/index.js：运行时 `require('相对路径')`
    // 不会被内联，会按产物目录去解析 → "Cannot find module './utils/index'"。
    // 一律用静态 import。pages/ 下的脚本是 file:// 直接加载的普通脚本，不经打包，故排除。
    files: ['src/main/**/*.js'],
    ignores: ['src/main/pages/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name='require'][arguments.0.type='Literal'][arguments.0.value=/^\\.\\.?\\//]",
        message: '主进程会被打包：相对路径 require 在产物里解析不到，请改成顶层 import'
      }]
    }
  }
]
