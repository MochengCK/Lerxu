package com.lerxu.android.update

/**
 * 更新渠道 —— 与桌面端 `update-channel` 用户配置同义、同取值。
 *
 *  - STABLE：只认正式版（GitHub 未标 pre-release，且版本号无预发布后缀）；
 *  - BETA  ：只认预发布版（GitHub 标了 pre-release，或版本号带 beta/rc 后缀）；
 *  - ALL   ：任意未归档版本，取版本最高者（含预发布）。
 *
 * 三渠道语义严格隔离：stable 用户永远不会被推 Beta，beta 用户也不会
 * 被"顺带"推正式版——想升级正式版请切回 stable。这与桌面端
 * `pickReleaseByChannel` 的行为完全一致。
 */
enum class ReleaseChannel(val key: String) {
    STABLE("stable"),
    BETA("beta"),
    ALL("all");

    companion object {
        /** 兼容历史默认值与非法值：一律回落到稳定版 */
        fun fromKey(raw: String?): ReleaseChannel = when (raw?.trim()?.lowercase()) {
            "beta" -> BETA
            "all" -> ALL
            else -> STABLE
        }
    }
}

/**
 * GitHub release 的最小投影（只保留更新检查用到的字段）。
 * 纯数据类，便于单测直接构造、验证选版规则。
 */
data class ReleaseInfo(
    val tag: String,
    val prerelease: Boolean,
    val draft: Boolean,
    /** 发行说明：Markdown 原文（GitHub 的 `body`），渲染前由 ReleaseNotes 归一化 */
    val notes: String,
    val pageUrl: String,
    val apkUrl: String?
)

object ReleasePicker {

    /**
     * 按渠道挑出目标 release；没有符合条件的候选返回 null（＝该渠道暂无更新），
     * 与"拉取失败"（抛异常）是两件事，调用方必须区分。
     */
    fun pick(releases: List<ReleaseInfo>, channel: ReleaseChannel): ReleaseInfo? {
        val pool = releases.filter { r ->
            if (r.draft || r.tag.isBlank()) return@filter false
            when (channel) {
                // 双保险：GitHub 的 pre-release 标志 + 版本号后缀推断。
                // 发布时漏勾 Pre-release 是常见人为失误，只信标志会把 Beta 推给稳定版用户。
                ReleaseChannel.STABLE -> !r.prerelease && !AppVersion.isPrerelease(r.tag)
                // Beta 渠道反之放宽：标志或后缀任一命中即视为测试版
                ReleaseChannel.BETA -> r.prerelease || AppVersion.isPrerelease(r.tag)
                ReleaseChannel.ALL -> true
            }
        }
        var best: ReleaseInfo? = null
        for (r in pool) {
            if (best == null || AppVersion.compare(r.tag, best.tag) > 0) best = r
        }
        return best
    }
}
