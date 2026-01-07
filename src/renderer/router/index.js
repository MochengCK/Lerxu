import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

const router = new Router({
  routes: [
    {
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
        },
        {
          path: '/preference',
          name: 'preference',
          component: require('@/components/Preference/Index').default,
          props: true,
          children: [
            {
              path: 'basic',
              alias: '',
              components: {
                subnav: require('@/components/Subnav/PreferenceSubnav').default,
                form: require('@/components/Preference/Basic').default
              },
              props: {
                subnav: { current: 'basic' }
              }
            },
            {
              path: 'advanced',
              components: {
                subnav: require('@/components/Subnav/PreferenceSubnav').default,
                form: require('@/components/Preference/Advanced').default
              },
              props: {
                subnav: { current: 'advanced' }
              }
            },
            {
              path: 'lab',
              components: {
                subnav: require('@/components/Subnav/PreferenceSubnav').default,
                form: require('@/components/Preference/Lab').default
              },
              props: {
                subnav: { current: 'lab' }
              }
            }
          ]
        }
      ]
    },
    {
      path: '*',
      redirect: '/'
    }
  ]
})

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

  if (to.path.startsWith('/preference')) {
    page = '/preference'
  }

  store.dispatch('app/updateCurrentPage', page)
  next()
})

export default router
