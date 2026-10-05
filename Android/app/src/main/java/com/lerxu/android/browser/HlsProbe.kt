package com.lerxu.android.browser

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * M3U8（HLS）清单的**下载前探测**：估算"下完会有多大"、并认出产物容器。
 *
 * 为什么需要它：HLS 的地址是一条**清单**，不是产物 —— 它自己的 `Content-Length` 只有
 * 几 KB，拿它当"文件大小"给用户看是错的。真正的大小要等引擎把分片抓完才知道，所以这里
 * 照引擎自己那套估算口径先算一遍（见桌面端 `hls-probe-size`）：
 *
 * 1. **主清单**（含 `#EXT-X-STREAM-INF`）→ 取**码率最高**的那条变体（与引擎默认口径
 *    一致：空 `hls-variant` 就是最高码率），再读它的媒体清单；
 * 2. **媒体清单**：总时长 = Σ `#EXTINF`；大小 ≈ 总时长 × `BANDWIDTH` ÷ 8；
 * 3. 清单里没有码率（站点直接给媒体清单）时退一步：探**第一个分片**的长度，按
 *    "总时长 ÷ 该分片时长 × 该分片字节"折算。
 *
 * 结果一定是**估算**（分片码率并不恒定），界面会标"约"。任何一步失败都退回"未知"，
 * 绝不让探测失败影响下载本身。
 */
object HlsProbe {

    /** 探测结果：[bytes] = 预计字节数（0 = 未知），[extension] = 产物容器（空 = 未知）。 */
    data class Info(val bytes: Long = 0L, val extension: String = "")

    /** 清单最大读这么多（正常几十 KB；封顶只是防着拿错地址时把内存吃满）。 */
    private const val MAX_PLAYLIST_BYTES = 4L * 1024 * 1024

    private const val TIMEOUT_MS = 8_000L

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }

    /**
     * 探一条 HLS 清单。[headers] 是这一路流的请求头（Referer / UA / Cookie）——
     * 影视站的清单与分片几乎都校验防盗链，少了必然 403。
     */
    fun probe(url: String, headers: Map<String, String>): Info = runCatching {
        val root = fetch(url, headers) ?: return Info()
        val variant = parseMaster(root, url)
        val mediaUrl: String
        val mediaText: String
        val bandwidth: Long
        if (variant != null) {
            mediaUrl = variant.url
            mediaText = fetch(variant.url, headers) ?: return Info()
            bandwidth = variant.bandwidth
        } else {
            mediaUrl = url
            mediaText = root
            bandwidth = bandwidthOf(root)
        }
        estimate(mediaUrl, mediaText, bandwidth, headers)
    }.getOrDefault(Info())

    // ─── 解析 ───

    /** 主清单里码率最高的那条变体；不是主清单（没有 STREAM-INF）返回 null。 */
    private fun parseMaster(text: String, baseUrl: String): Variant? {
        val lines = playlistLines(text)
        var best: Variant? = null
        var pendingBandwidth = -1L
        for (line in lines) {
            if (line.startsWith("#EXT-X-STREAM-INF")) {
                pendingBandwidth = attributeOf(line, "AVERAGE-BANDWIDTH")
                    ?: attributeOf(line, "BANDWIDTH") ?: -1L
                continue
            }
            if (line.startsWith("#")) continue
            val bw = pendingBandwidth
            pendingBandwidth = -1L
            if (bw < 0) continue
            val uri = resolve(baseUrl, line) ?: continue
            if (best == null || bw > best.bandwidth) best = Variant(uri, bw)
        }
        return best
    }

    /**
     * 媒体清单里能拿到的码率。
     *
     * 直接给的媒体清单通常没有这一项，此时返回 0（退回分片折算那条路）。
     */
    private fun bandwidthOf(text: String): Long {
        for (line in playlistLines(text)) {
            if (!line.startsWith("#EXT-X-STREAM-INF")) continue
            return attributeOf(line, "AVERAGE-BANDWIDTH")
                ?: attributeOf(line, "BANDWIDTH") ?: 0L
        }
        return 0L
    }

    /** 媒体清单里分片的时长与第一条分片的地址（`#EXTINF` 后面那一行）。 */
    private fun segments(text: String): Pair<Double, String> {
        var total = 0.0
        var firstUri = ""
        var pending = -1.0
        for (line in playlistLines(text)) {
            if (line.startsWith("#EXTINF")) {
                pending = line.substringAfter(':', "").substringBefore(',').trim().toDoubleOrNull() ?: -1.0
                continue
            }
            if (line.startsWith("#")) continue
            if (pending > 0) total += pending
            if (firstUri.isEmpty() && pending > 0) firstUri = line
            pending = -1.0
        }
        return total to firstUri
    }

    /** 第一条分片的时长（分片折算要用它）。 */
    private fun firstSegmentDuration(text: String): Double {
        for (line in playlistLines(text)) {
            if (!line.startsWith("#EXTINF")) continue
            return line.substringAfter(':', "").substringBefore(',').trim().toDoubleOrNull() ?: 0.0
        }
        return 0.0
    }

    private fun estimate(
        mediaUrl: String,
        mediaText: String,
        bandwidth: Long,
        headers: Map<String, String>
    ): Info {
        val (duration, firstUri) = segments(mediaText)
        val container = containerOf(firstUri)
        if (duration <= 0.0) return Info(0L, container)
        if (bandwidth > 0L) return Info((duration * bandwidth / 8.0).toLong(), container)
        // 没有码率：探第一个分片的真实长度，按"总时长 ÷ 分片时长 × 分片字节"折算
        val segDur = firstSegmentDuration(mediaText)
        if (firstUri.isEmpty() || segDur <= 0.0) return Info(0L, container)
        val segUrl = resolve(mediaUrl, firstUri) ?: return Info(0L, container)
        val segBytes = lengthOf(segUrl, headers)
        if (segBytes <= 0L) return Info(0L, container)
        return Info((duration / segDur * segBytes).toLong(), container)
    }

    /** 分片地址 → 产物容器（引擎按实际容器定扩展名，这里照同一套认）。 */
    private fun containerOf(segmentUri: String): String =
        when (VideoSniffer.extensionOf(segmentUri)) {
            "ts", "m2ts", "mts" -> "ts"
            "m4s", "mp4", "m4v", "cmfv" -> "mp4"
            "aac", "m4a", "mp3" -> "m4a"
            else -> ""
        }

    // ─── 请求 ───

    private fun fetch(url: String, headers: Map<String, String>): String? = runCatching {
        client.newCall(request(url, headers).build()).execute().use { resp ->
            if (!resp.isSuccessful) return@use null
            resp.peekBody(MAX_PLAYLIST_BYTES).string()
        }
    }.getOrNull()

    /** 问一个分片有多大：HEAD 优先，被拒（不少 CDN 回 405/403）就退回只取 0 字节的 GET。 */
    private fun lengthOf(url: String, headers: Map<String, String>): Long {
        val head = runCatching {
            client.newCall(request(url, headers).head().build()).execute().use { resp ->
                if (!resp.isSuccessful) return@use 0L
                resp.header("Content-Length")?.trim()?.toLongOrNull() ?: 0L
            }
        }.getOrDefault(0L)
        if (head > 0L) return head
        return runCatching {
            val req = request(url, headers).header("Range", "bytes=0-0").build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use 0L
                resp.header("Content-Range")?.substringAfter('/', "")?.trim()?.toLongOrNull() ?: 0L
            }
        }.getOrDefault(0L)
    }

    private fun request(url: String, headers: Map<String, String>): Request.Builder {
        val builder = Request.Builder().url(url)
        headers.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) builder.header(k, v) }
        return builder
    }

    // ─── 小工具 ───

    private fun playlistLines(text: String): List<String> =
        text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()

    /** `#EXT-X-STREAM-INF:BANDWIDTH=1234,...` 里的某个数值属性（没有返回 null）。 */
    private fun attributeOf(line: String, name: String): Long? {
        val attrs = line.substringAfter(':', "")
        for (pair in attrs.split(',')) {
            val key = pair.substringBefore('=', "").trim()
            if (key != name) continue
            val value = pair.substringAfter('=', "").trim().trim('"')
            return value.toLongOrNull() ?: value.toDoubleOrNull()?.toLong()
        }
        return null
    }

    /** 清单里的相对地址 → 绝对地址（解析不出来返回 null）。 */
    private fun resolve(playlistUrl: String, ref: String): String? =
        runCatching { playlistUrl.toHttpUrlOrNull()?.resolve(ref)?.toString() }.getOrNull()

    private data class Variant(val url: String, val bandwidth: Long)
}
