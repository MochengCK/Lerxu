import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

const preferenceChildren = [
  {
    path: 'basic',
    alias: '',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'basic' },
      form: { category: 'basic' }
    }
  },
  {
    path: 'appearance',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'appearance' },
      form: { category: 'appearance' }
    }
  },
  {
    path: 'transfer',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'transfer' },
      form: { category: 'transfer' }
    }
  },
  {
    path: 'task',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'task' },
      form: { category: 'task' }
    }
  },
  {
    path: 'file',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'file' },
      form: { category: 'file' }
    }
  },
  {
    path: 'security',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Basic')
    },
    props: {
      subnav: { current: 'security' },
      form: { category: 'security' }
    }
  },
  {
    path: 'advanced',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Advanced')
    },
    props: {
      subnav: { current: 'advanced' },
      form: { category: 'advanced' }
    }
  },
  {
    path: 'lab',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/Lab')
    },
    props: {
      subnav: { current: 'lab' }
    }
  },
  {
    path: 'bittorrent',
    components: {
      subnav: () => import('@/components/Subnav/PreferenceSubnav'),
      form: () => import('@/components/Preference/BitTorrent')
    },
    props: {
      subnav: { current: 'bittorrent' }
    }
  }
]

const mainRoute = {
  path: '/',
  name: 'main',
  component: require('@/components/Main').default,
  children: [
    {
      path: '/task',
      alias: '/',
      component: require('@/components/Task/Index').default,
      props: {
        status: 'all'
      }
    },
    {
      path: '/task/:status',
      name: 'task',
      component: require('@/components/Task/Index').default,
      props: true
    },
    {
      path: '/task/date/:date',
      name: 'task-date',
      component: require('@/components/Task/Index').default,
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
  component: () => import('@/components/Preference/Index'),
  props: true,
  children: preferenceChildren
}

const routes = isPreferenceWindow
  ? [
    preferenceWindowRoute,
    {
      path: '*',
      redirect: '/preference-window'
    }
  ]
  : [
    mainRoute,
    {
      path: '*',
      redirect: '/'
    }
  ]

const router = new Router({ routes })

// Update currentPage in store when route changes
router.afterEach((to, from) => {
  const store = require('@/store').default
  let page = '/task'

  if (to.path.startsWith('/preference')) {
    page = '/preference'
  }

  store.dispatch('app/updateCurrentPage', page)
})

// Initialize currentPage based on initial route
router.beforeEach((to, from, next) => {
  const store = require('@/store').default
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
