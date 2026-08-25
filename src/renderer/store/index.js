/**
 * Pinia store entry point.
 *
 * Exports all store composables for use across the application.
 * Replaces the old Vuex store (src/renderer/store/index.js + modules/).
 */
export { useAppStore } from './app'
export { usePreferenceStore } from './preference'
export { useTaskStore } from './task'
