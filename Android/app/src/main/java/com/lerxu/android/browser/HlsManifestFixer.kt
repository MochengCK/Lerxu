package com.lerxu.android.browser

/**
 * 加密 HLS 清单的**合规化改写**（播放前把清单过一遍）。
 *
 * 为什么需要它（用户点名："手机端的原生播放器好像无法处理加密的 M3U8 流，一旦碰到就无法播放"）：
 * media3 的 `HlsPlaylistParser` 对 `#EXT-X-KEY` 那一行**认得很死**，站上写法稍不合规，
 * 结果不是"报个错"而是**整条 KEY 被静默忽略** —— 加密分片于是被当成明文去解，最后摔出来的
 * 是"容器/清单不支持"，用户看到的就是"碰到加密的就播不了"。三条实测过的死法：
 *
 * 1. **`URI=` 没加双引号**（`URI=key.key` / `URI='key.key'`）：它的 `REGEX_URI` 是
 *    `URI="(.+?)"`，只认双引号 ⇒ 读不到密钥地址；
 * 2. **`METHOD=` 不是一个字节不差的大写标准名**（`METHOD = AES-128`、`method=aes-128`）：
 *    `REGEX_METHOD` 是 `METHOD=(NONE|AES-128|SAMPLE-AES|SAMPLE-AES-CENC|SAMPLE-AES-CTR)\s*(?:,|$)`
 *    —— **大小写敏感、`=` 两侧不许有空格**，不匹配就当这条 KEY 不存在；
 * 3. **fMP4（有 `#EXT-X-MAP`）的 AES-128 没写 `IV=`**：解析器直接抛
 *    "The encryption IV attribute must be present when an initialization segment is encrypted
 *    with METHOD=AES-128."（这条是它**唯一**为加密流设的硬门槛）。按 RFC 8216 §5.2 补齐：
 *    IV = 这条 KEY 所辖**第一个分片的媒体序号**，写成 128 位大端。
 *
 * 只动这三种"写法不合规"，**不改语义**：方法名不认识（例如 `AES-256`）、密钥是 DRM 那套
 * （`SAMPLE-AES` + Widevine）的一律原样留着 —— 那些不是靠改写能救的，硬改只会把
 * 清清楚楚的失败换成一个看不懂的失败。
 *
 * 纯函数（不碰网络、不碰 Android），所以规则直接在 JVM 单测里钉死。
 */
object HlsManifestFixer {

    /** media3 认得的方法名（与 `HlsPlaylistParser` 里那几个常量一一对应）。 */
    private val KNOWN_METHODS =
        setOf("NONE", "AES-128", "SAMPLE-AES", "SAMPLE-AES-CENC", "SAMPLE-AES-CTR")

    private val METHOD_ATTR = Regex("(?i)\\bMETHOD\\s*=\\s*([A-Za-z0-9][A-Za-z0-9\\-]*)")
    private val URI_ATTR = Regex("(?i)\\bURI\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^,\\s]+)")
    private val IV_ATTR = Regex("(?i)\\bIV\\s*=\\s*([0-9A-Fa-fxX]+)")

    /** 可能带 URI 属性的行（要按协议补全的那几个）。 */
    private val URI_TAGS = listOf("#EXT-X-KEY", "#EXT-X-SESSION-KEY", "#EXT-X-MAP", "#EXT-X-MEDIA")

    /**
     * 字节 → 清单文本。
     *
     * 两件"市面上真的会碰到"的事：
     * - **gzip**：不少 CDN 对 `.m3u8` 无条件压（不管有没有 `Accept-Encoding`），而 media3 的
     *   `DefaultHttpDataSource` 不会自动解压 ⇒ 解析器拿到二进制，报
     *   "Input does not start with the #EXTM3U header"。这里按魔数 `1F 8B` 自己解一次。
     * - **BOM**：`EF BB BF` 直接去掉（media3 也能吃，但去掉之后后面的规则更好写）。
     *
     * 解不开就按原样当文本（绝不能因为"解压失败"把一路能播的流弄成不能播）。
     */
    fun decode(raw: ByteArray): String {
        val bytes = if (raw.size >= 2 &&
            raw[0] == 0x1F.toByte() && raw[1] == 0x8B.toByte()
        ) {
            runCatching {
                java.util.zip.GZIPInputStream(raw.inputStream()).use { it.readBytes() }
            }.getOrDefault(raw)
        } else {
            raw
        }
        return String(bytes, Charsets.UTF_8).removePrefix("\uFEFF")
    }

    /**
     * 把整份清单过一遍。**不需要改就返回原串**（调用方据此跳过重解析的开销）。
     *
     * [baseUri] = 这份清单自己的地址（用来补协议相对的地址，见 [absolute]）。
     *
     * 先扫一遍有没有 `#EXT-X-MAP`：一份媒体清单要么全是 TS 分片、要么全是 fMP4，
     * 而"要不要补 IV"只跟后者有关（TS 的 IV 本来就可以省，序号自己推）。
     */
    fun fix(text: String, baseUri: String? = null): String {
        if (!text.contains("#EXTM3U")) return text
        val fmp4 = text.contains("#EXT-X-MAP")
        val lines = text.split("\n")
        var seq = mediaSequenceOf(text)
        var emitted = 0
        var changed = false
        val out = ArrayList<String>(lines.size)
        for (line in lines) {
            val tag = line.trim()
            when {
                tag.startsWith("#EXTINF") -> emitted++
                tag.startsWith("#EXT-X-KEY") || tag.startsWith("#EXT-X-SESSION-KEY") -> {
                    // IV 兜底值 = 这条 KEY 所辖**第一个分片**的媒体序号（RFC 8216 §5.2）。
                    // 非 fMP4 不需要补（TS 允许省 IV），传 null 就是不补。
                    val fixed = fixKeyTag(tag, if (fmp4) seq + emitted else null, baseUri)
                    if (fixed != tag) {
                        changed = true
                        out += line.replace(tag, fixed)
                        continue
                    }
                }
                tag.startsWith("#EXT-X-MAP") -> {
                    val fixed = fixUriAttr(tag, baseUri).let { fixMapTag(it, baseUri) }
                    if (fixed != tag) {
                        changed = true
                        out += line.replace(tag, fixed)
                        continue
                    }
                }
                // **分片 / 变体那一行的裸地址**：`//cdn/...` 这种协议相对地址，media3 解析时
                // 拿不到 scheme ⇒ 走不了 http 数据源。按清单自己的协议补上（这是唯一一处
                // 需要把"整行"当地址看的地方，判据就一个：行首是 `//`）
                tag.startsWith("//") -> {
                    // 不用 `?.let { }`：`continue` 出现在内联 lambda 里是实验特性
                    val abs = absolute(tag, baseUri)
                    if (abs != null && abs != tag) {
                        changed = true
                        out += line.replace(tag, abs)
                        continue
                    }
                }
            }
            out += line
        }
        return if (changed) out.joinToString("\n") else text
    }

    /** `#EXT-X-MEDIA-SEQUENCE` 的值（缺省 0 —— 清单不带这一条时就是从头开始）。 */
    private fun mediaSequenceOf(text: String): Long {
        val m = Regex("(?m)^\\s*#EXT-X-MEDIA-SEQUENCE\\s*:\\s*(\\d+)").find(text) ?: return 0L
        return m.groupValues[1].toLongOrNull() ?: 0L
    }

    /**
     * 改一行 `#EXT-X-KEY`（[ivFallback] 非空 = 这是 fMP4 清单，缺 IV 时要补）。
     *
     * 顺序无所谓，三个正则各自独立找各自那个属性。
     */
    private fun fixKeyTag(tag: String, ivFallback: Long?, baseUri: String?): String {
        var out = fixUriAttr(tag, baseUri)

        // ① METHOD：把它写成**一个字节不差**的 `METHOD=<标准大写名>`。
        //    注意判据是"整段匹配文本是否已经是那个样子"，不是"大小写对不对" ——
        //    `METHOD = AES-128` 大小写全对，但 `=` 两侧的空格就足以让 media3 的
        //    REGEX_METHOD 匹配不上（那条正则要求 `METHOD=` 紧跟方法名）
        METHOD_ATTR.find(out)?.let { m ->
            val upper = m.groupValues[1].uppercase()
            if (upper in KNOWN_METHODS && m.value != "METHOD=$upper") {
                out = out.replaceRange(m.range, "METHOD=$upper")
            }
        }

        // ② IV：有就规范化成 `0x` + 32 位十六进制（media3 按 `0x` 前缀解析）；
        //    没有、且这是 fMP4 的 AES-128，就按规范补一个
        val iv = IV_ATTR.find(out)
        if (iv != null) {
            val raw = iv.groupValues[1]
            val norm = ivHex(raw.removePrefix("0x").removePrefix("0X"))
            if (raw != norm) out = out.replaceRange(iv.range, "IV=$norm")
        } else if (ivFallback != null && methodOf(out) == "AES-128") {
            out = out.trimEnd() + ",IV=" + ivHex(java.lang.Long.toHexString(ivFallback))
        }

        return out
    }

    /** `#EXT-X-MAP`（fMP4 的初始化段）同样可能写成裸值/单引号/协议相对。 */
    private fun fixMapTag(tag: String, baseUri: String?): String = fixUriAttr(tag, baseUri)

    /**
     * 把这一行里的 `URI=` 规范化：**补双引号**（media3 的 `REGEX_URI` 只认双引号）、
     * 顺带把协议相对地址补全（[absolute]）。
     */
    private fun fixUriAttr(tag: String, baseUri: String?): String {
        val m = URI_ATTR.find(tag) ?: return tag
        val raw = m.groupValues[1]
        val bare = raw.trim('\'', '"')
        if (bare.isEmpty()) return tag
        val abs = absolute(bare, baseUri) ?: bare
        val quoted = "\"$abs\""
        return if (raw == quoted) tag else tag.replaceRange(m.range, "URI=$quoted")
    }

    /**
     * `//cdn.com/x.ts` → 按清单自己的协议补成绝对地址。
     *
     * 为什么需要：协议相对地址本身合法，但**没有 scheme** 的 URI 落进 media3 的
     * `DefaultDataSource` 分派时既不是 http 也不是 file，直接抛 `Malformed URL`。
     * 判据只有一条（行首是 `//`），不碰任何别的形态。
     */
    private fun absolute(url: String, baseUri: String?): String? {
        if (!url.startsWith("//")) return null
        val scheme = baseUri
            ?.substringBefore("://", "")
            ?.takeIf { it.equals("http", true) || it.equals("https", true) }
            ?: "https"
        return "$scheme:$url"
    }

    private fun methodOf(tag: String): String? =
        METHOD_ATTR.find(tag)?.groupValues?.get(1)?.uppercase()

    /** 十六进制 → `0x` + 32 位小写（不足左补 0，超了取低 128 位）。 */
    private fun ivHex(hex: String): String {
        val cleaned = hex.filter { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }
        val padded = cleaned.lowercase().padStart(32, '0')
        return "0x" + padded.takeLast(32)
    }
}
