/**
 * 偏好设置窗口的路由定义，被两个入口共享：
 * - router/index.js（主 SPA，偏好设置以 /preference-window 路由形式存在）
 * - router/preference.js（偏好设置独立轻量 bundle 的专属路由）
 * 抽出为独立模块，避免两处定义漂移。
 */

const lazySubnav = () => import('@/components/Subnav/PreferenceSubnav.vue')
const lazyBasicForm = () => import('@/components/Preference/Basic.vue')
const lazyAdvancedForm = () => import('@/components/Preference/Advanced.vue')
const lazyLabForm = () => import('@/components/Preference/Lab.vue')

export const preferenceChildren = [
  {
    path: 'basic',
    alias: '',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'basic' }, form: { category: 'basic' } }
  },
  {
    path: 'appearance',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'appearance' }, form: { category: 'appearance' } }
  },
  {
    path: 'transfer',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'transfer' }, form: { category: 'transfer' } }
  },
  {
    path: 'task',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'task' }, form: { category: 'task' } }
  },
  {
    path: 'file',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'file' }, form: { category: 'file' } }
  },
  {
    path: 'bt',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'bt' }, form: { category: 'bt' } }
  },
  {
    path: 'ed2k',
    components: { subnav: lazySubnav, form: lazyBasicForm },
    props: { subnav: { current: 'ed2k' }, form: { category: 'ed2k' } }
  },
  {
    path: 'advanced',
    components: { subnav: lazySubnav, form: lazyAdvancedForm },
    props: { subnav: { current: 'advanced' }, form: { category: 'advanced' } }
  },
  {
    path: 'lab',
    components: { subnav: lazySubnav, form: lazyLabForm },
    props: { subnav: { current: 'lab' } }
  }
]

export const preferenceWindowRoute = {
  path: '/preference-window',
  name: 'preference-window',
  component: () => import('@/components/Preference/PreferencePanel.vue'),
  props: true,
  children: preferenceChildren
}
