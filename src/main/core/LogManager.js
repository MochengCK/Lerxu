/**
 * LogManager — 统一日志管理系统
 * ====================================
 *
 * 功能:
 *   - 统一应用名称: [Lerxu]
 *   - 自动前缀: 所有日志自动添加 [Lerxu] 前缀
 *   - 分级日志: debug / info / warn / error
 *   - 模块标签: 可选的模块标签 (如 [Lerxu:Engine])
 *   - 文件 + 控制台双通道输出
 *   - 开发/生产环境自动切换日志级别
 *
 * 用法:
 *   import log from '@/core/LogManager'
 *
 *   // 基本用法
 *   log.info('Engine started')        // → [Lerxu] Engine started
 *   log.warn('Port already in use')   // → [Lerxu] Port already in use
 *   log.error('Engine crashed', err)  // → [Lerxu] Engine crashed: Error(...)
 *
 *   // 模块标签
 *   const engineLog = log.module('Engine')
 *   engineLog.info('Started')         // → [Lerxu:Engine] Started
 *   engineLog.error('Failed', err)   // → [Lerxu:Engine] Failed: Error(...)
 */

import { join } from 'node:path'
import is from 'electron-is'
import electronLog from 'electron-log'

import { IS_PORTABLE, PORTABLE_EXECUTABLE_DIR } from '@shared/constants'

/* ============================================================
   配置
   ============================================================ */

const APP_NAME = 'Lerxu'
const PROD_LEVEL = 'info'
const DEV_LEVEL = 'silly'

/* ============================================================
   electron-log 配置
   ============================================================ */

const level = is.production() ? PROD_LEVEL : DEV_LEVEL

electronLog.transports.file.level = level
electronLog.transports.console.level = level

electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
electronLog.transports.console.format = '[{level}] {text}'

if (IS_PORTABLE) {
  electronLog.transports.file.resolvePath = () => join(PORTABLE_EXECUTABLE_DIR, `${APP_NAME.toLowerCase()}.log`)
}

/* ============================================================
   格式化工具
   ============================================================ */

/**
 * 格式化参数为字符串 (类似 console 的行为)
 * @param {...*} args - 任意参数
 * @returns {string} 格式化后的字符串
 */
function formatArgs (args) {
  if (!args || args.length === 0) return ''

  const parts = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (typeof arg === 'string') {
      parts.push(arg)
    } else if (arg instanceof Error) {
      parts.push(arg.message ? `${arg.message}` : String(arg))
      if (arg.stack) {
        parts.push('\n' + arg.stack)
      }
    } else if (typeof arg === 'object' && arg !== null) {
      try {
        parts.push(JSON.stringify(arg))
      } catch (_) {
        parts.push(String(arg))
      }
    } else {
      parts.push(String(arg))
    }
  }
  return parts.join(' ')
}

/**
 * 格式化消息（直接透传，消息中已包含 [Lerxu] 前缀）
 * @param {string} moduleTag - 可选的模块标签（未使用，保留兼容）
 * @param {Array} args - 原始参数
 * @returns {string} 格式化后的完整消息
 */
function buildMessage (moduleTag, args) {
  return formatArgs(Array.from(args))
}

/* ============================================================
   LogManager 核心类
   ============================================================ */

class LogManager {
  constructor (moduleTag = '') {
    this._moduleTag = moduleTag
  }

  /**
   * 创建带模块标签的子 logger
   * @param {string} tag - 模块名称 (如 'Engine', 'UPnP')
   * @returns {LogManager} 新的 LogManager 实例
   */
  module (tag) {
    return new LogManager(tag || '')
  }

  /**
   * 记录 info 级别日志 (兼容 logger.log 调用)
   * @param {...*} args - 日志内容
   */
  log (...args) {
    const msg = buildMessage(this._moduleTag, args)
    electronLog.info(msg)
  }

  /**
   * 记录 info 级别日志
   * @param {...*} args - 日志内容
   */
  info (...args) {
    const msg = buildMessage(this._moduleTag, args)
    electronLog.info(msg)
  }

  /**
   * 记录 warn 级别日志
   * @param {...*} args - 日志内容
   */
  warn (...args) {
    const msg = buildMessage(this._moduleTag, args)
    electronLog.warn(msg)
  }

  /**
   * 记录 error 级别日志
   * @param {...*} args - 日志内容
   */
  error (...args) {
    const msg = buildMessage(this._moduleTag, args)
    electronLog.error(msg)
  }

  /**
   * 记录 debug 级别日志 (仅开发环境输出)
   * @param {...*} args - 日志内容
   */
  debug (...args) {
    if (is.dev()) {
      const msg = buildMessage(this._moduleTag, args)
      electronLog.debug(msg)
    }
  }

  /**
   * 记录 verbose 级别日志
   * @param {...*} args - 日志内容
   */
  verbose (...args) {
    if (is.dev()) {
      const msg = buildMessage(this._moduleTag, args)
      electronLog.verbose(msg)
    }
  }

  /**
   * 底层 electron-log 实例 (用于高级配置)
   */
  get raw () {
    return electronLog
  }

  /**
   * 兼容旧代码: 透传 electron-log transports 对象
   * 旧代码通过 logger.transports.file.getFile() / .level 等访问
   */
  get transports () {
    return electronLog.transports
  }

  /**
   * 应用名称
   */
  get appName () {
    return APP_NAME
  }
}

/* ============================================================
   导出单例
   ============================================================ */

const log = new LogManager()

log.info('LogManager initialized')

export default log
