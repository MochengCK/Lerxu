/**
 * 偏好设置独立轻量 bundle（preference.html）的专属路由。
 * 与主 SPA 的 router/index.js 完全隔离：不引入 Main/Task 等主窗口组件，
 * 路由表只含偏好设置树，使该 bundle 保持轻量。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

import { preferenceWindowRoute } from './preferenceRoutes'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    preferenceWindowRoute,
    { path: '/:pathMatch(.*)*', redirect: '/preference-window' }
  ]
})

router.afterEach((to) => {
  // 与主路由一致：路由变化后同步 currentPage（偏好设置恒为 /preference）。
  // 用动态 import 避免 Pinia 初始化前的循环依赖。
  const page = to.path.startsWith('/preference') ? '/preference' : '/task'
  import('@/store').then(({ useAppStore }) => {
    try {
      const appStore = useAppStore()
      appStore.updateCurrentPage(page)
    } catch (e) {
      // Pinia 尚未初始化时忽略
    }
  })
})

router.beforeEach((to, from, next) => {
  if (!to.path.startsWith('/preference-window')) {
    next('/preference-window')
    return
  }
  next()
})

export default router
