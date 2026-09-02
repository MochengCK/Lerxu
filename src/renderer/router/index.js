import { createRouter, createWebHashHistory } from 'vue-router'

import Main from '@/components/Main.vue'
import TaskIndex from '@/components/Task/TaskView.vue'
import { preferenceWindowRoute } from './preferenceRoutes'

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

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
    }
  ]
}

// Vue Router 4: '*' wildcard changed to '/:pathMatch(.*)*'
const routes = isPreferenceWindow
  ? [
    preferenceWindowRoute,
    { path: '/:pathMatch(.*)*', redirect: '/preference-window' }
  ]
  : [
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
      // Pinia not yet initialized during SSR or initial bootstrap
    }
  })
})

router.beforeEach((to, from, next) => {
  let page = '/task'

  if (isPreferenceWindow && !to.path.startsWith('/preference-window')) {
    next('/preference-window')
    return
  }

  if (!isPreferenceWindow && to.path.startsWith('/preference-window')) {
    next('/task')
    return
  }

  if (!isPreferenceWindow && to.path.startsWith('/preference')) {
    next('/task')
    return
  }

  if (to.path.startsWith('/preference')) {
    page = '/preference'
  }

  next()
})

export default router
