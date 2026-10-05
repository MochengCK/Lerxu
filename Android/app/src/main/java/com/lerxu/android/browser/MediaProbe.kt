package com.lerxu.android.browser

import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer
import java.util.concurrent.TimeUnit

/**
 * 播放前的**容器探测**：先把这一路流真正是什么问出来，再决定交给 ExoPlayer 的哪一种
 * 数据源。
 *
 * 为什么需要它（用户点名的报错）：
 * `None of the available extractors (...) could read the stream.` 是"当成普通文件
 * 一路嗅探器试过去、谁都不认"的兜底错误 —— 而影视站的地址十有八九是 **m3u8 清单**
 * 或**已失效/需要登录的地址**。前一种只要把 MIME 明确告诉 ExoPlayer（走 HLS 数据源）
 * 就不再进那套嗅探；后一种则应该**当场说清楚**，而不是把一长串提取器名字摔给用户。
 *
 * 判定分两层：
 * - [classify]（纯函数，单测覆盖）：从头几个字节的魔数 / 文本特征 + 响应头认容器；
 * - [probe]（带网络）：照**同一条流的请求头**（Referer / UA / Cookie）取前 64KB ——
 *   影视站的清单与分片几乎都校验防盗链，少了这些头只会拿到 403，探出来的结论就是错的。
 *
 * 探测失败（超时、被拒）不算致命：返回 [Kind.UNKNOWN]，播放侧照旧按原样试播 ——
 * 探测只是"让能确定的事先确定"，不是新的门槛。
 */
object MediaProbe {

    /** 这一路流到底是什么。 */
    enum class Kind {
        /** HLS 清单（m3u8）：第一行是 `#EXTM3U`，或响应头写着 mpegurl。 */
        HLS,

        /** DASH 清单（mpd）。 */
        DASH,

        /** 普通文件（mp4 / flv / ts / webm / mkv / 音频…），交给渐进式数据源 + 提取器。 */
        PROGRESSIVE,

        /** 响应的是一张网页（登录页 / 错误页 / 防盗链提示）。 */
        HTML,

        /** 探不出来（网络失败、被拒、格式认不得）。 */
        UNKNOWN
    }

    /** 探测结果：[kind] 容器，[httpStatus] 响应码（0 = 没连上）。 */
    data class Result(
        val kind: Kind = Kind.UNKNOWN,
        val httpStatus: Int = 0
    ) {
        /** 服务器明确拒绝（需要登录 / 已失效）—— 界面据此给一句人话。 */
        val rejected: Boolean get() = httpStatus == 401 || httpStatus == 403 || httpStatus == 404
    }

    /** 取前多少个字节做判定（清单几十 KB 足够，分片看魔数也够）。 */
    private const val PREFIX_BYTES = 64L * 1024

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
     * 探这一路流。任何异常都不抛出：探不到就是 [Kind.UNKNOWN]。
     */
    fun probe(url: String, headers: Map<String, String>): Result {
        if (url.isBlank()) return Result()
        return runCatching {
            val builder = request(url, headers)
                .header("Range", "bytes=0-${PREFIX_BYTES - 1}")
            client.newCall(builder.build()).execute().use { resp ->
                val contentType = resp.header("Content-Type").orEmpty()
                val prefix = resp.body?.source()?.let { source ->
                    val buffer = Buffer()
                    // 读满 64KB 或读空为止（清单/小文件会被一次读尽）
                    source.read(buffer, PREFIX_BYTES)
                    buffer.readByteArray()
                } ?: ByteArray(0)
                Result(classify(prefix, contentType), resp.code)
            }
        }.getOrElse { Result() }
    }

    /**
     * 问一个**普通文件**有多大（下载入口用它给用户看"约多大"）。
     *
     * HEAD 优先；不少 CDN 拒 HEAD（405/403）就退回**只取 0 字节的 GET**
     *（`Range: bytes=0-0`，总长在 `Content-Range` 里）。返回 0 = 问不出来 —— 不算错误：
     * 有服务器就是不给长度，界面显示"未知"即可，绝不让它挡住下载本身。
     */
    fun length(url: String, headers: Map<String, String>): Long {
        if (url.isBlank()) return 0L
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

    /** 带这一路流的请求头（Referer / UA / Cookie）建请求 —— 影视站少了这些只有 403。 */
    private fun request(url: String, headers: Map<String, String>): Request.Builder =
        Request.Builder().url(url).apply {
            headers.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) header(k, v) }
        }

    /**
     * 纯函数：按响应头的 MIME 与前缀字节判定容器。
     *
     * 顺序是先**文本特征**（清单 / 网页都靠它）再**魔数**（二进制容器）：
     * m3u8 只要第一行是 `#EXTM3U` 就成立，比响应头可靠（不少 CDN 回的是一串
     * `application/octet-stream`，甚至 `text/plain`）。
     */
    fun classify(prefix: ByteArray, contentType: String): Kind {
        val ct = contentType.substringBefore(';').trim().lowercase()
        val head = headText(prefix)
        if (head.startsWith("#EXTM3U")) return Kind.HLS
        if (ct.contains("mpegurl")) return Kind.HLS
        if (ct.contains("dash+xml")) return Kind.DASH
        if (head.startsWith("<MPD") || head.startsWith("<?xml") ||
            head.contains("<MPD ") || head.contains("urn:mpeg:dash")
        ) {
            return Kind.DASH
        }
        if (looksLikeHtml(head)) return Kind.HTML
        if (isMp4(prefix) || isFlv(prefix) || isEbml(prefix) || isTs(prefix)) return Kind.PROGRESSIVE
        // 音频（ID3 头 / ADTS 同步字）同样是"渐进式"那一档
        if (ct.startsWith("video/") || ct.startsWith("audio/")) return Kind.PROGRESSIVE
        // 认不出的字节：不算"网页"，也不下结论 —— 交给播放侧按嗅探到的线索试
        return Kind.UNKNOWN
    }

    // ─── 判定细节 ───

    /** 前缀的可读文本（去掉 BOM 与空白，限前 4KB）：清单与网页都是文本。 */
    private fun headText(prefix: ByteArray): String {
        val limit = minOf(prefix.size, 4096)
        if (limit <= 0) return ""
        return String(prefix, 0, limit, Charsets.UTF_8)
            .removePrefix("\uFEFF")
            .trimStart(' ', '\t', '\r', '\n', '\u0000')
    }

    private fun looksLikeHtml(head: String): Boolean {
        val h = head.lowercase()
        return h.startsWith("<!doctype html") || h.startsWith("<html") ||
            h.startsWith("<head") || h.startsWith("<body") ||
            // 头部就是一段 XML 网页（少见的 XHTML 错误页）
            (h.startsWith("<?xml") && h.contains("<html"))
    }

    /** mp4 / m4a / m4v：第 5 到第 8 个字节是 `ftyp`。 */
    private fun isMp4(b: ByteArray): Boolean =
        b.size >= 12 && b[4] == 'f'.code.toByte() && b[5] == 't'.code.toByte() &&
            b[6] == 'y'.code.toByte() && b[7] == 'p'.code.toByte()

    /** FLV：开头就是 `FLV`。 */
    private fun isFlv(b: ByteArray): Boolean =
        b.size >= 3 && b[0] == 'F'.code.toByte() && b[1] == 'L'.code.toByte() &&
            b[2] == 'V'.code.toByte()

    /** Matroska / WebM：EBML 头 `1A 45 DF A3`。 */
    private fun isEbml(b: ByteArray): Boolean =
        b.size >= 4 && b[0] == 0x1A.toByte() && b[1] == 0x45.toByte() &&
            b[2] == 0xDF.toByte() && b[3] == 0xA3.toByte()

    /**
     * MPEG-TS：包长 188，同步字 `0x47` 每隔 188 个字节出现。
     *
     * 三个点连起来才算（只看第一个字节会把一大堆二进制文件误判成 TS）。
     */
    private fun isTs(b: ByteArray): Boolean =
        b.size >= 377 && b[0] == 0x47.toByte() && b[188] == 0x47.toByte() &&
            b[376] == 0x47.toByte()
}
