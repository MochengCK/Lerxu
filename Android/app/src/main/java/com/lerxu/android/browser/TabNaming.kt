package com.lerxu.android.browser

import java.net.URI

/**
 * 标签页卡片上的文案推导。
 *
 * 抽成纯函数是为了能单测：卡片显示什么只由「页面标题 + 地址」决定，
 * 不依赖任何 Android 组件。规则与桌面端任务列表同口径（标题优先、
 * 退到域名、最后兜底）。
 */
object TabNaming {

    /** 卡片标题：页面标题 → 域名 → 兜底文案（如「新标签页」）。 */
    fun title(pageTitle: String, url: String, fallback: String): String {
        val trimmed = pageTitle.trim()
        if (trimmed.isNotEmpty()) return trimmed
        return host(url).ifEmpty { fallback }
    }

    /**
     * 卡片副标题：去掉协议与开头的 `www.`、去掉末尾斜杠。
     * 本地页面（`file:` / `about:` / `data:`）没有可读地址，返回空串。
     */
    fun subtitle(url: String): String {
        if (url.isBlank()) return ""
        if (url.startsWith("file:") || url.startsWith("about:") || url.startsWith("data:")) return ""
        val noScheme = url.substringAfter("://", url)
        return noScheme.removePrefix("www.").trimEnd('/')
    }

    /** 取主机名（带非默认端口）；解析不出来返回空串。 */
    fun host(url: String): String = runCatching {
        val parsed = URI(url)
        val name = parsed.host?.removePrefix("www.").orEmpty()
        when {
            name.isEmpty() -> ""
            parsed.port > 0 -> "$name:${parsed.port}"
            else -> name
        }
    }.getOrDefault("")
}
