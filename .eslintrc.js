module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    // ES2020+ 全局（BigInt 等），缺失会把 dht.js 里的 BigInt 误报为未定义
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/essential'
  ],
  parserOptions: {
    parser: '@babel/eslint-parser',
    // 本项目没有真正的 Babel 构建链（Vite/esbuild + @vitejs/plugin-vue 直接转译，
    // 不读 .babelrc）。此前靠仓库根放一个 .babelrc 才能让这个 parser 找到配置文件，
    // 而那份 .babelrc 内容是 element-ui 时代的死配置（项目已迁 element-plus）。
    // 官方推荐的等价写法是关掉配置查找，解析行为（ecmaVersion/sourceType）不受影响。
    requireConfigFile: false,
    requireVueCompiler: false,
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  globals: {
    appId: true,
    __static: true,
    // Vue 3 / Vue Router / Pinia 的自动导入 API。
    // 构建期由 unplugin-auto-import 注入（vite.config.js 的 imports: ['vue','vue-router','pinia']），
    // 但 ESLint 不知道这些全局，未声明会误报 no-undef（如 TaskGeneral.vue 的 ref）。
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
  },
  rules: {
    'no-console': 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    // ===== 以下为「真问题」规则，保持 error（会阻断 CI）=====
    // 已实际抓到过：未声明变量（EngineClient.vue 的 3 个标记 → 严格模式下
    // ReferenceError）、跨文件变量泄漏（Basic.vue 用 Advanced.vue 的
    // rpcDefaultPort）、computed 未取 .value（isMac/isRenderer 恒为真）、
    // 对象重复键（后者覆盖前者）、未定义变量等。
    // no-undef / no-dupe-keys / vue/no-ref-as-operand 等沿用 eslint:recommended
    // 与 plugin:vue 的默认 error 级别。
    // 项目大量使用 `catch (e) {}` 有意忽略错误（如清理临时文件、能力探测）
    'no-empty': ['error', {
      allowEmptyCatch: true
    }],

    // ===== 以下为「风格类」规则，降级为 warn（提示但不阻断 CI）=====
    // 背景：这三个规则与项目既有排版长期冲突（历史报错合计 1.9 万处：
    // vue/script-indent 8716、indent 1298、no-unused-vars 112），且各文件
    // 的 script 缩进基准本就不统一（部分顶格、部分缩进 2 或 6 空格），
    // 单一基准无法同时满足。若强制 error，CI 永远为红、规则形同废纸；
    // 降级为 warn 既保留可见性（编辑器仍会标黄提示），又不阻塞流水线。
    // 如需统一风格，可执行 `npx eslint --ext .js,.vue src --fix` 后逐条收紧。
    indent: ['warn', 2],
    'vue/script-indent': ['warn', 2, {
      baseIndent: 0
    }],
    // 回调保留完整签名、模板/组合式 API 中允许临时未使用变量；
    // 未使用的 import 与局部变量仍会以 warn 形式提示清理
    'no-unused-vars': ['warn', {
      args: 'none',
      caughtErrors: 'none'
    }],

    // ===== 与项目约定不符的规则，关闭 =====
    // ASI 防护分号（`;(expr).forEach(...)`）是项目有意写法，用于避免上一行以
    // `[]` / `()` 结尾时的自动分号插入错误
    'no-extra-semi': 'off',
    // Vue 3 允许多根模板节点，该规则仅适用于 Vue 2（HoverTip.vue 为 span + Teleport）
    'vue/no-multiple-template-root': 'off',
    // Vue 3 允许单单词组件名（Atom.vue / Icon.vue 为刻意命名）
    'vue/multi-word-component-names': 'off'
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        indent: 'off'
      }
    }
  ]
}
