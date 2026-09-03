import { createRouter, createWebHashHistory } from 'vue-router'

import Main from '@/components/Main.vue'
import TaskIndex from '@/components/Task/TaskView.vue'

const mainRoute = {
  path: '/',
  name: 'main',
  component: Main,
  children: [
    {
      path: '/task',
      alias: '/',
      component: TaskIndex,
      props: { status: 'all' }
    },
    {
      path: '/task/:status',
      name: 'task',
      component: TaskIndex,
      props: true
    },
    {
      path: '/task/date/:date',
      name: 'task-date',
      component: TaskIndex,
      props: (route) => ({
        status: 'date',
        filterDate: route.params.date
      })
    },
    {
      // 偏好设置（内嵌视图）：复用 TaskView 布局，左侧任务导航保持不变，
      // 仅内容区切换为「顶部分类标签栏 + 设置表单」的设置视图。
      // /preference 与 /preference/:category 共用一个路由记录，
      // category 缺省为 basic（见 TaskView 内的 computed）。
      path: '/preference/:category?',
      name: 'preference',
      component: TaskIndex,
      props: () => ({})
    }
  ]
}

// Vue Router 4: '*' wildcard changed to '/:pathMatch(.*)*'
const routes = [
  mainRoute,
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to) => {
  // Store dispatch will be handled by the component layer after Pinia is initialized.
  // During migration, we use a lazy import to avoid circular dependency.
  const page = to.path.startsWith('/preference') ? '/preference' : '/task'
  import('@/store').then(({ useAppStore }) => {
    try {
      const appStore = useAppStore()
      appStore.updateCurrentPage(page)
    } catch (e) {
      // Pinia not yet initialized during initial bootstrap
    }
  })
})

export default router
