import { createRouter, createWebHashHistory } from 'vue-router'

import Main from '@/components/Main.vue'
import TaskIndex from '@/components/Task/TaskView.vue'

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

const lazySubnav = () => import('@/components/Subnav/PreferenceSubnav.vue')
const lazyBasicForm = () => import('@/components/Preference/Basic.vue')
const lazyAdvancedForm = () => import('@/components/Preference/Advanced.vue')
const lazyLabForm = () => import('@/components/Preference/Lab.vue')

const preferenceChildren = [
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

const preferenceWindowRoute = {
  path: '/preference-window',
  name: 'preference-window',
  component: () => import('@/components/Preference/PreferencePanel.vue'),
  props: true,
  children: preferenceChildren
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
