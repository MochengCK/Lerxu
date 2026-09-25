package com.lerxu.android.browser

import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/**
 * 搜索引擎定义。
 *
 * [searchUrl] 与 [suggestUrl] 都用 `%s` 作关键词占位符（关键词需先做 URL 编码）。
 * [regionHints] 列出该引擎作为默认选择的 ISO 3166-1 两位国家/地区码——
 * 仅在「按网络探测不出可用引擎」时作为回退依据（见 [SearchEnginePick]）。
 */
data class SearchEngine(
    val key: String,
    val name: String,
    val searchUrl: String,
    /** 联想词（搜索建议）端点。取不到时地址栏就只提示本地历史，功能不受影响。 */
    val suggestUrl: String,
    val regionHints: List<String> = emptyList()
)

/**
 * 内置引擎目录。`key` 是持久化标识，**改动会导致用户已选引擎丢失**，
 * 只增不改。
 */
object SearchEngines {

    const val KEY_GOOGLE = "google"
    const val KEY_BING = "bing"

    // 内置引擎只保留两个：Bing（国内可用，region hint CN）与 Google（国外）。
    // 其余引擎的 key 已下线，若用户曾持久化过它们，byKey 会回退到 Bing。
    // 高清真实图标随 APK 内置（drawable-nodpi/engine_*.png，官方站点取回、
    // 白底已抠除），界面按 key 映射加载，不在数据目录里挂资源引用。
    //
    // suggestUrl 两家返回同一形状的裸 JSON 数组：["关键词", ["建议1", "建议2", ...]]，
    // 因此解析只有一份（[SuggestParser]）。Bing 的 osjson 端点不带任何回调参数，
    // 不能当 JSONP 用；Google 的 complete/search 走 client=firefox 这个最稳的口子。
    val all: List<SearchEngine> = listOf(
        SearchEngine(
            KEY_BING,
            "Bing 必应",
            "https://www.bing.com/search?q=%s",
            "https://api.bing.com/osjson.aspx?query=%s",
            listOf("CN")
        ),
        SearchEngine(
            KEY_GOOGLE,
            "Google 谷歌",
            "https://www.google.com/search?q=%s",
            "https://suggestqueries.google.com/complete/search?client=firefox&q=%s"
        )
    )

    /** 探测不出任何结果时的兜底（各家网络环境下基本都可达）。 */
    const val FALLBACK_KEY = KEY_BING

    fun byKey(key: String?): SearchEngine =
        all.firstOrNull { it.key == key } ?: all.first { it.key == KEY_BING }

    /** 该国家/地区码对应的区域引擎 key（无则 null）。 */
    fun regionEngineKey(countryIso: String?): String? {
        val cc = countryIso?.trim()?.uppercase().orEmpty()
        if (cc.isEmpty()) return null
        return all.firstOrNull { cc in it.regionHints }?.key
    }
}

/**
 * 首启「按用户的网络自动选择搜索引擎」的判定。
 *
 * 判据顺序（全部来自 [NetworkProfile] 的实测结果，不做任何假设）：
 * 1. 没有网络 → 只能按区域回退（区域引擎 → 兜底）；
 * 2. 能直连 Google → Google（探测通过说明用户的网络确实可达，区域不重要）；
 * 3. 不能直连 Google → 优先区域引擎（如中国大陆 → 必应），否则兜底。
 *
 * 纯函数：探测与持久化在 [SearchEngineDetector]，便于单测。
 */
object SearchEnginePick {

    /** 选择结果的成因，用于在设置页说明「为什么自动选了这个」。 */
    enum class Reason { REACHABLE, REGION, OFFLINE, FALLBACK }

    data class Choice(val key: String, val reason: Reason)

    fun pick(
        countryIso: String?,
        googleReachable: Boolean,
        hasNetwork: Boolean
    ): Choice {
        val region = SearchEngines.regionEngineKey(countryIso)
        if (!hasNetwork) {
            return Choice(region ?: SearchEngines.FALLBACK_KEY, Reason.OFFLINE)
        }
        if (googleReachable) {
            return Choice(SearchEngines.KEY_GOOGLE, Reason.REACHABLE)
        }
        return if (region != null) {
            Choice(region, Reason.REGION)
        } else {
            Choice(SearchEngines.FALLBACK_KEY, Reason.FALLBACK)
        }
    }
}

/**
 * 地址栏输入 → 目标 URL。
 *
 * 地址栏同时承担「输网址」与「搜关键词」两件事：看起来像地址就直接打开，
 * 否则用当前搜索引擎搜。规则尽量保守——宁可把可疑输入当搜索词，
 * 也不要因为误判成域名而打开一个不存在的站点。
 */
object BrowserUrl {

    private val DOMAIN_RE =
        Regex("^[A-Za-z0-9][A-Za-z0-9._-]*\\.[A-Za-z]{2,}(:\\d{1,5})?(/.*)?$")
    private val IP_RE = Regex("^\\d{1,3}(\\.\\d{1,3}){3}(:\\d{1,5})?(/.*)?$")
    private val SCHEMES = listOf(
        "http://", "https://", "ftp://", "file://", "content://",
        "magnet:", "ed2k://", "thunder://", "about:"
    )

    /** 是否应被当作网址直接打开（否则当搜索词）。 */
    fun looksLikeUrl(input: String): Boolean {
        val s = input.trim()
        if (s.isEmpty()) return false
        val lower = s.lowercase()
        if (SCHEMES.any { lower.startsWith(it) }) return true
        // 带空格的输入一律当搜索词（域名里不可能有空格）
        if (s.any { it.isWhitespace() }) return false
        if (lower == "localhost" || lower.startsWith("localhost:") ||
            lower.startsWith("127.0.0.1") || lower.startsWith("[::1]")
        ) {
            return true
        }
        return DOMAIN_RE.matches(s) || IP_RE.matches(s)
    }

    /** 关键词 URL 编码：空格用 `%20`（`+` 在部分引擎里会被当字面加号）。 */
    fun encodeQuery(query: String): String =
        URLEncoder.encode(query, "UTF-8").replace("+", "%20")

    /**
     * 地址栏输入 + 当前引擎 → 最终 URL；输入为空白返回 null（调用方忽略）。
     */
    fun toUrl(input: String, engine: SearchEngine): String? {
        val s = input.trim()
        if (s.isEmpty()) return null
        if (looksLikeUrl(s)) {
            // 补全裸域名：example.com → https://example.com
            val lower = s.lowercase()
            val hasScheme = SCHEMES.any { lower.startsWith(it) }
            return if (hasScheme) s else "https://$s"
        }
        return engine.searchUrl.replace("%s", encodeQuery(s))
    }

    /** 是否为首页/关于页这类无需联网的地址。 */
    fun isInternalPage(url: String): Boolean =
        url.startsWith("about:") || url.startsWith("file:///android_asset/")
}

/**
 * 联想词（搜索建议）：URL 构造与响应解析，都是纯函数。
 *
 * 只做「关键词 → 建议词」这一步；真正的网络请求在 [SuggestClient]。
 * 失败、超时、格式不对都返回空列表 —— 面板会退回只显示本地历史，
 * 用户看到的是「这次没有联想词」，而不是一个报错或空白面板。
 */
object Suggestions {

    /** 解析上限：引擎一次通常也就给十条左右，取满即可（面板那边另有显示上限）。 */
    const val MAX_ITEMS = 10

    private val json = Json {
        isLenient = true
        ignoreUnknownKeys = true
    }

    /** 关键词 → 联想词端点 URL；关键词空白时返回 null（调用方忽略）。 */
    fun url(engine: SearchEngine, query: String): String? {
        val q = query.trim()
        if (q.isEmpty()) return null
        return engine.suggestUrl.replace("%s", BrowserUrl.encodeQuery(q))
    }

    /**
     * 预热用的端点 URL（见 [SuggestClient.warmUp]）。
     *
     * 拿一个单字母查询把连接热起来：目的只是走完 DNS / TCP / TLS，结果一律丢弃，
     * 所以用哪个词都无所谓 —— 取一个必然有结果的短词，免得某些引擎对空串回 400。
     */
    fun warmUpUrl(engine: SearchEngine): String? = url(engine, WARMUP_QUERY)

    private const val WARMUP_QUERY = "a"

    /**
     * 解析联想词响应。
     *
     * Bing（osjson）与 Google（complete/search）返回的是同一形状的裸数组：
     * `["关键词", ["建议1", "建议2", …]]`。形状不对就返回空列表，不抛异常。
     */
    fun parse(body: String): List<String> {
        val root = runCatching { json.parseToJsonElement(body) }.getOrNull() as? JsonArray
            ?: return emptyList()
        val items = root.getOrNull(1) as? JsonArray ?: return emptyList()
        val out = ArrayList<String>(items.size)
        for (item in items) {
            val text = ((item as? JsonPrimitive)?.content ?: "").trim()
            if (text.isEmpty() || out.contains(text)) continue
            out.add(text)
            if (out.size >= MAX_ITEMS) break
        }
        return out
    }
}
