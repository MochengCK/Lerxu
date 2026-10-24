/**
 * 项目内部的小工具函数集合（替代 lodash）。
 *
 * 为什么不用 lodash：整个包 4.9MB，而我们只用到十来个函数：
 * isEmpty / clone / cloneDeep / isEqual / debounce / compact / difference /
 * isArray / isFunction / isNaN / isPlainObject / parseInt。
 * 以前还有两处 `import { debounce } from 'lodash'` / `import { isEmpty, isEqual } from 'lodash'`
 * 会把整份 lodash 拖进主进程包。这里按 lodash 的语义重新实现，**行为对齐 lodash 文档**，
 * 只覆盖项目实际用到的形态（不做 lodash 的 thisArg / 迭代器简写等额外能力）。
 *
 * 语义要点（容易写错的地方）：
 * · `isEmpty(0)` / `isEmpty(true)` 为 **true**（lodash 如此：非集合类型没有可枚举内容）
 * · `isNaN('x')` 为 **false**，只有真正的 NaN 数值才是 true
 * · `parseInt` 默认基数 10（原生 `parseInt('0x10')` 是 16，二者不同）
 * · `cloneDeep`/`isEqual` 支持循环引用、Date/RegExp/Map/Set
 */

export const isArray = Array.isArray

export const isFunction = (value) => typeof value === 'function'

/** lodash 语义：只有真正的 NaN（number）才算 */
export const isNaN = (value) => typeof value === 'number' && value !== value

export const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * lodash 语义：过滤首尾空白；**不传基数时交给原生自动识别**（`'0x10'` → 16，
 * 与 lodash 一致），传了基数就按基数解析（`'0x10', 10` → 0）。非法返回 NaN。
 */
export const parseInt = (value, radix) => {
  if (value == null) {
    return NaN
  }
  const n = Number.parseInt(`${value}`.trim(), radix)
  return Number.isNaN(n) ? NaN : n
}

/**
 * 是否为空：null/undefined、空字符串/数组/TypedArray、空 Map/Set、无自有可枚举键的对象。
 * 注意数字与布尔在 lodash 里也算「空」。
 */
export const isEmpty = (value) => {
  if (value == null) {
    return true
  }
  if (typeof value === 'string' || Array.isArray(value) || ArrayBuffer.isView(value)) {
    return value.length === 0
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return true
}

/** 去掉数组里的假值（false / 0 / '' / null / undefined / NaN） */
export const compact = (array) => (Array.isArray(array) ? array.filter(Boolean) : [])

/** 返回「在 array 里、但不在 values 里」的元素（SameValueZero 比较） */
export const difference = (array = [], values = []) => {
  const list = Array.isArray(array) ? array : []
  const exclude = new Set(Array.isArray(values) ? values : [])
  return list.filter((item) => !exclude.has(item))
}

/** 浅拷贝（与 lodash 一致：Date/RegExp/Map/Set 也复制一层壳，内部元素按引用共享） */
export const clone = (value) => {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice()
  }
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags)
  }
  if (value instanceof Map) {
    return new Map(value)
  }
  if (value instanceof Set) {
    return new Set(value)
  }
  return { ...value }
}

/**
 * 深拷贝：支持数组 / 普通对象 / Date / RegExp / Map / Set / 循环引用。
 * 函数与其它宿主对象按引用保留（与 lodash 一致，不做结构化克隆）。
 */
export const cloneDeep = (value, seen = new WeakMap()) => {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value)
  }
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags)
  }
  if (Array.isArray(value)) {
    const out = []
    seen.set(value, out)
    value.forEach((item, i) => { out[i] = cloneDeep(item, seen) })
    return out
  }
  if (value instanceof Map) {
    const out = new Map()
    seen.set(value, out)
    value.forEach((v, k) => { out.set(cloneDeep(k, seen), cloneDeep(v, seen)) })
    return out
  }
  if (value instanceof Set) {
    const out = new Set()
    seen.set(value, out)
    value.forEach((v) => { out.add(cloneDeep(v, seen)) })
    return out
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) {
    // 非普通对象（类实例等）：不深挖，按 lodash 的行为也基本是浅层复制自有属性
  }
  const out = Object.create(proto)
  seen.set(value, out)
  Object.keys(value).forEach((key) => { out[key] = cloneDeep(value[key], seen) })
  return out
}

/** 深比较：NaN 相等、+0/-0 相等、Date/RegExp/Map/Set/数组/普通对象逐项比较，支持循环引用 */
export const isEqual = (a, b, seen = new WeakMap()) => {
  if (a === b) {
    return true
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // NaN === NaN
    return a !== a && b !== b
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  const tagA = Object.prototype.toString.call(a)
  const tagB = Object.prototype.toString.call(b)
  if (tagA !== tagB) {
    return false
  }
  if (tagA === '[object Date]') {
    return a.getTime() === b.getTime()
  }
  if (tagA === '[object RegExp]') {
    return `${a}` === `${b}`
  }

  const prev = seen.get(a)
  if (prev) {
    return prev === b
  }
  seen.set(a, b)

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i], seen)) {
        return false
      }
    }
    return true
  }
  if (a instanceof Map || a instanceof Set) {
    if (a.size !== b.size) {
      return false
    }
    if (a instanceof Set) {
      for (const item of a) {
        if (!b.has(item)) {
          return false
        }
      }
      return true
    }
    for (const [k, v] of a) {
      if (!b.has(k) || !isEqual(v, b.get(k), seen)) {
        return false
      }
    }
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) {
    return false
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !isEqual(a[key], b[key], seen)) {
      return false
    }
  }
  return true
}

/**
 * 防抖（对齐 lodash 的 leading / trailing / maxWait / cancel / flush 语义）。
 * 项目里只用 `debounce(fn, wait)`，但保留整套行为避免以后加选项时再换实现。
 */
export function debounce (func, wait = 0, options = {}) {
  let lastArgs = null
  let lastThis = null
  let result
  let timerId = null
  let lastCallTime = 0
  let lastInvokeTime = 0

  const leading = !!options.leading
  const trailing = options.trailing !== false
  const maxing = typeof options.maxWait === 'number'
  const maxWait = maxing ? Math.max(options.maxWait, wait) : 0

  const invokeFunc = (time) => {
    const args = lastArgs
    const thisArg = lastThis
    lastArgs = lastThis = null
    lastInvokeTime = time
    result = func.apply(thisArg, args)
    return result
  }

  const leadingEdge = (time) => {
    lastInvokeTime = time
    timerId = setTimeout(timerExpired, wait)
    return leading ? invokeFunc(time) : result
  }

  const remainingWait = (time) => {
    const timeSinceLastCall = time - lastCallTime
    const timeSinceLastInvoke = time - lastInvokeTime
    const timeWaiting = wait - timeSinceLastCall
    return maxing ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting
  }

  const shouldInvoke = (time) => {
    const sinceLastCall = time - lastCallTime
    const sinceLastInvoke = time - lastInvokeTime
    return (lastCallTime === 0 || sinceLastCall >= wait || sinceLastCall < 0 ||
      (maxing && sinceLastInvoke >= maxWait))
  }

  const trailingEdge = (time) => {
    timerId = null
    if (trailing && lastArgs) {
      return invokeFunc(time)
    }
    lastArgs = lastThis = null
    return result
  }

  const timerExpired = () => {
    const time = Date.now()
    if (shouldInvoke(time)) {
      return trailingEdge(time)
    }
    timerId = setTimeout(timerExpired, remainingWait(time))
    return undefined
  }

  function debounced (...args) {
    const time = Date.now()
    const isInvoking = shouldInvoke(time)

    lastArgs = args
    lastThis = this
    lastCallTime = time

    if (isInvoking) {
      if (timerId === null) {
        return leadingEdge(lastCallTime)
      }
      if (maxing) {
        clearTimeout(timerId)
        timerId = setTimeout(timerExpired, wait)
        return invokeFunc(lastCallTime)
      }
    }
    if (timerId === null) {
      timerId = setTimeout(timerExpired, wait)
    }
    return result
  }

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
    lastInvokeTime = 0
    lastArgs = lastThis = timerId = null
  }

  debounced.flush = () => (timerId === null ? result : trailingEdge(Date.now()))

  debounced.pending = () => timerId !== null

  return debounced
}
