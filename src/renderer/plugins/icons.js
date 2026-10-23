/**
 * Element Plus icon plugin.
 *
 * Registers the icons used in templates as `<el-icon><Close /></el-icon>`.
 *
 * 这里**不再** `import * as` 整包注册：@element-plus/icons-vue 有 293 个图标
 * （源码约 313KB），全量注册会把它们全部打进主 chunk，并在启动时逐个
 * `app.component()`。实际用到的只有下面这 14 个（见各模板里的裸标签）。
 *
 * 新增图标时：先在模板里写 `<el-icon><Xxx /></el-icon>`，再把 `Xxx` 加进
 * 下面的导入与注册表。TaskGeneral / HistoryDirectory / AddTask 里已有本地
 * 导入，重复注册同一个组件是幂等的，不影响。
 */
import {
  Check,
  CircleCheckFilled,
  CircleCloseFilled,
  CirclePlus,
  Close,
  Connection,
  Delete,
  DocumentCopy,
  Edit,
  Loading,
  MagicStick,
  Refresh,
  Search,
  Star
} from '@element-plus/icons-vue'

const ICONS = {
  Check,
  CircleCheckFilled,
  CircleCloseFilled,
  CirclePlus,
  Close,
  Connection,
  Delete,
  DocumentCopy,
  Edit,
  Loading,
  MagicStick,
  Refresh,
  Search,
  Star
}

/**
 * Register the Element Plus icons used by the app.
 * @param {import('vue').App} app
 */
export function setupIcons (app) {
  for (const [name, component] of Object.entries(ICONS)) {
    app.component(name, component)
  }
}
