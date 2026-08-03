import Vue from 'vue'
import Router from 'vue-router'

import store from '@/store'
import Main from '@/components/Main'
import TaskIndex from '@/components/Task/TaskView'

Vue.use(Router)

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

const lazySubnav = () => import('@/components/Subnav/PreferenceSubnav')
const lazyBasicForm = () => import('@/components/Preference/Basic')
const lazyAdvancedForm = () => import('@/components/Preference/Advanced')
const lazyLabForm = () => import('@/components/Preference/Lab')

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
  component: () => import('@/components/Preference/PreferencePanel'),
  props: true,
  children: preferenceChildren
}

const routes = isPreferenceWindow
  ? [
    preferenceWindowRoute,
    { path: '*', redirect: '/preference-window' }
  ]
  : [
    mainRoute,
    { path: '*', redirect: '/' }
  ]

const router = new Router({ routes })

router.afterEach((to) => {
  const page = to.path.startsWith('/preference') ? '/preference' : '/task'
  store.dispatch('app/updateCurrentPage', page)
})

router.beforeEach((to, from, next) => {
  let page = '/task'

  if (isPreferenceWindow && !to.path.startsWith('/preference-window')) {
    store.dispatch('app/updateCurrentPage', '/preference')
    next('/preference-window')
    return
  }

  if (!isPreferenceWindow && to.path.startsWith('/preference-window')) {
    store.dispatch('app/updateCurrentPage', page)
    next('/task')
    return
  }

  if (!isPreferenceWindow && to.path.startsWith('/preference')) {
    store.dispatch('app/updateCurrentPage', page)
    next('/task')
    return
  }

  if (to.path.startsWith('/preference')) {
    page = '/preference'
  }

  store.dispatch('app/updateCurrentPage', page)
  next()
})

export default router
