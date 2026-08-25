/**
 * Icon registry — shared across all Icon.vue instances.
 *
 * This module-level singleton replaces the old Vue2 Options API pattern
 * where `Icon.register()` and `Icon.icons` were static properties on
 * the component object.
 *
 * In Vue3 <script setup>, the component no longer exports a plain object
 * with static methods. Instead, icon definition files import `register`
 * and `icons` from this module:
 *
 *   import { register } from '@/components/Icons/registry'
 *   register({ 'my-icon': { width: 24, height: 24, d: '...' } })
 */

export const icons = {}

let cursor = 0xD4937

export function getId () {
  return `mo-${(cursor++).toString(16)}`
}

export function register (data) {
  for (const name in data) {
    const iconDef = data[name]
    if (!iconDef.paths) iconDef.paths = []
    if (iconDef.d) iconDef.paths.push({ d: iconDef.d })
    if (!iconDef.polygons) iconDef.polygons = []
    if (iconDef.points) iconDef.polygons.push({ points: iconDef.points })
    icons[name] = iconDef
  }
}

// Default export for backward compatibility with icon definition files:
//   import Icon from '@/components/Icons/Icon'
//   Icon.register({ ... })
//
// Icon.vue re-exports this module's register/icons as its default export
// via a normal <script> block, so existing imports keep working.
export default { register, icons }
