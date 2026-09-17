package com.lerxu.android.update

/**
 * 版本号比较（完整 semver 语义，含预发布段）—— 与桌面端
 * `src/main/core/UpdateManager.js` 的 `isNewerVersion` / `isPrereleaseVersion` 同口径。
 *
 * 为什么不能沿用旧的「逐段取数字」比较：旧实现先 `substringBefore('-')`
 * 把预发布后缀整个丢掉，于是 3.2.0-Beta1 / 3.2.0-Beta2 / 3.2.0 会折叠成同一个
 * 3.2.0 —— Beta 用户永远检测不到新 Beta，正式版发布后也感知不到升级。
 * 渠道功能（stable/beta/all）完全建立在「谁比谁新」之上，必须先把这件事做对。
 *
 * 规则：
 *  1. 忽略前导 v/V 与构建元数据（+sha）；
 *  2. major.minor.patch 逐段按数值比较（缺位补 0）；
 *  3. 有预发布段 < 无预发布段（3.2.0-Beta9 < 3.2.0）；
 *  4. 预发布标识逐段比较：纯数字 > 字母前缀+数字后缀 > 其它字典序；
 *     「同前缀+数字后缀」按数值比（Beta2 < Beta10，纯字典序会判反）。
 *
 * 纯 Kotlin、不依赖 Android，便于 JVM 单测直接覆盖。
 */
object AppVersion {

    private data class Parsed(val release: List<Int>, val pre: List<String>)

    /** 「字母前缀 + 数字后缀」拆分（Beta1 → Beta / 1） */
    private val SUFFIX_RE = Regex("^([^0-9]*)([0-9]+)$")

    /** 预发布标识识别，与桌面端 isPrereleaseVersion 的正则保持一致 */
    private val PRERELEASE_RE =
        Regex("[-.](beta|alpha|rc|pre|test|nightly)[.-]?\\d*$", RegexOption.IGNORE_CASE)

    private fun parse(raw: String): Parsed {
        var s = (raw ?: "").trim()
        if (s.startsWith("v") || s.startsWith("V")) s = s.substring(1)
        s = s.substringBefore('+') // 构建元数据不参与比较
        val dash = s.indexOf('-')
        val core = if (dash >= 0) s.substring(0, dash) else s
        val preRaw = if (dash >= 0) s.substring(dash + 1) else ""
        val release = core.split('.').map { seg ->
            // 非数字段（异常版本号）按 0 处理，保证比较不抛异常
            val digits = seg.filter { it.isDigit() }
            val value = digits.toLongOrNull() ?: 0L
            value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
        }
        val pre = if (preRaw.isBlank()) emptyList() else preRaw.split('.').filter { it.isNotEmpty() }
        return Parsed(release, pre)
    }

    /** -1 / 0 / 1：a 小于 / 等于 / 大于 b */
    fun compare(a: String, b: String): Int {
        val pa = parse(a)
        val pb = parse(b)
        val n = maxOf(pa.release.size, pb.release.size)
        for (i in 0 until n) {
            val x = pa.release.getOrElse(i) { 0 }
            val y = pb.release.getOrElse(i) { 0 }
            if (x != y) return if (x > y) 1 else -1
        }
        return comparePre(pa.pre, pb.pre)
    }

    fun isNewer(latest: String, current: String): Boolean = compare(latest, current) > 0

    private fun comparePre(a: List<String>, b: List<String>): Int {
        if (a.isEmpty() && b.isEmpty()) return 0
        if (a.isEmpty()) return 1 // 正式版 > 预发布
        if (b.isEmpty()) return -1
        val n = minOf(a.size, b.size)
        for (i in 0 until n) {
            val c = compareIdentifier(a[i], b[i])
            if (c != 0) return c
        }
        // 前缀全等时标识更多者更大（1.0.0-alpha < 1.0.0-alpha.1）
        return a.size.compareTo(b.size)
    }

    private fun compareIdentifier(x: String, y: String): Int {
        val nx = x.toLongOrNull()
        val ny = y.toLongOrNull()
        if (nx != null && ny != null) return nx.compareTo(ny)
        if (nx != null) return -1 // 数字标识 < 字母标识（semver）
        if (ny != null) return 1
        val mx = SUFFIX_RE.find(x)
        val my = SUFFIX_RE.find(y)
        if (mx != null && my != null && mx.groupValues[1].equals(my.groupValues[1], ignoreCase = true)) {
            val dx = mx.groupValues[2].toLongOrNull() ?: 0L
            val dy = my.groupValues[2].toLongOrNull() ?: 0L
            if (dx != dy) return if (dx > dy) 1 else -1
            return 0
        }
        val c = x.compareTo(y, ignoreCase = true)
        if (c != 0) return if (c > 0) 1 else -1
        // 大小写不同视为不等（3.2.0-Beta1 与 3.2.0-beta1 是不同 tag，但比较结果不敏感）
        return 0
    }

    /** 版本号是否带预发布标识（beta/alpha/rc/pre/test/nightly） */
    fun isPrerelease(version: String): Boolean =
        PRERELEASE_RE.containsMatchIn((version ?: "").trim())
}
