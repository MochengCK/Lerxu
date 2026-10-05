package com.lerxu.android.browser

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 网站图标（favicon）的小仓库：**内存 LRU + 磁盘缓存 + 按需抓取**。历史弹窗左边那枚图标
 * 用它（用户点名："左侧图标要显示真实的网站图标"）。
 *
 * 三个来源，按"准不准"排：
 * ① **WebView 自己报上来的**（[put]，接在 `WebChromeClient.onReceivedIcon` 上）——
 *    页面声明了 `<link rel=icon>` 时这一枚最准，连尺寸/样式都对，代价是只覆盖本次打开过的页；
 * ② **磁盘缓存**（[install] 给的 `cacheDir/favicons`）—— ① 抓到的会落盘，下次开 App 直接命中；
 * ③ **按域名抓**（[request]）—— 覆盖历史里那些这次没打开过的站点，候选路径见 [fetch]。
 *
 * 还是拿不到就不画图标，界面退回**通用地球**（见历史弹窗里的 `GenericSiteIcon`）。
 *
 * **为什么总有站点抓不到**（用户问过）：① 站点把图标放在只在 HTML 里声明的路径上；
 * ② 图标是 **SVG** —— `BitmapFactory` 解不了，只有"本次真的打开过、由 WebView 栅格化后
 * 递给我们"的那种才有；③ 站点/CDN 在本机网络下不可达或要过登录态。②里能便宜地补一点：
 * ① 那条路抓到的会落盘，下次还在。
 *
 * 线程：抓取在 [pool]（3 条守护线程）上，缓存与磁盘读写全部 `synchronized` / 在池线程里；
 * Compose 的版本号一律**回到主线程**再自增。
 */
object FaviconStore {

    /** 内存缓存条数上限。300 条历史上限 × 每条 ~10KB ≈ 3MB，取 120 条更保守。 */
    private const val MAX = 120

    /** 单张图标的边长上限（像素）：`.ico` 里常带 128/256 的大图，按显示尺寸 20dp@3x 够用。 */
    private const val ICON_PX = 72

    private const val TIMEOUT_MS = 6000L

    /** 响应体上限：正常 favicon 几 KB，超过这个数多半不是图标（或是个巨型 .ico）。 */
    private const val MAX_BYTES = 512 * 1024

    /** 解析 `<link rel=icon>` 时只扫正文的前这么多字节（图标声明都在 `<head>` 里）。 */
    private const val HEAD_BYTES = 64 * 1024

    /**
     * 版本号：仓库里**新落一枚**图标就 +1。界面读它来重算（谁读谁订阅，见历史弹窗的
     * `SiteIcon`）—— 于是"同一个 host 的多个行"会一起刷新，不会一半有图标一半是通用图标。
     */
    val revision = mutableIntStateOf(0)

    private val main = Handler(Looper.getMainLooper())

    /** `accessOrder = true` 就是 LRU：读一下也算用过，被淘汰的是最久没看的。 */
    private val cache = object : LinkedHashMap<String, ImageBitmap>(MAX, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ImageBitmap>) =
            size > MAX
    }

    /** 正在抓的域名：同一域名并发只抓一次（弹窗一开就是几十行，不去重会打成一团）。 */
    private val pending = HashSet<String>()

    private val pool = Executors.newFixedThreadPool(3) { r ->
        Thread(r, "favicon").apply { isDaemon = true }
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .readTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .build()

    /** 落盘目录；[install] 之前是 null（此时只走内存 + 网络，不会崩）。 */
    private var dir: File? = null

    /**
     * 装上磁盘缓存（历史弹窗打开时调一次）。落盘只有一个理由：**让抓到的图标跨启动还在**
     * —— 否则每次开 App 都要把整屏图标重抓一遍，慢的那几秒里用户看到的就是一片通用图标。
     */
    fun install(context: Context) {
        if (dir != null) return
        val target = File(context.applicationContext.cacheDir, "favicons")
        if (target.isDirectory || target.mkdirs()) dir = target
    }

    /** 已经拿到的那一枚；没有就是 null（界面这时画通用图标）。 */
    fun cached(host: String): ImageBitmap? = synchronized(cache) { cache[host] }

    /** WebView 报上来的一枚（最准的来源）：按当前页的域名存下。 */
    fun put(url: String, icon: Bitmap) {
        if (icon.isRecycled) return
        val host = BrowseHistory.hostOf(url)
        if (host.isEmpty()) return
        // 先复制一份再存：这是 WebView 递过来的对象，我们不能假设它之后不会被回收
        //（画面上用到一张已回收的位图就是直接崩）；图标本来就只有几十像素，这点拷贝不值一提
        val copy = runCatching { icon.copy(icon.config ?: Bitmap.Config.ARGB_8888, false) }
            .getOrNull() ?: return
        val scaled = scale(copy)
        writeDisk(host, scaled)
        store(host, scaled.asImageBitmap())
    }

    /**
     * 让这个地址的图标就位：命中内存缓存什么都不做，否则排一次"磁盘 → 网络"。
     *
     * 幂等 —— 列表滚动时每一行都会调它，重复调用没有代价（[pending] 兜着）。
     */
    fun request(url: String) {
        val host = BrowseHistory.hostOf(url)
        if (host.isEmpty()) return
        synchronized(cache) { if (cache.containsKey(host)) return }
        synchronized(pending) { if (!pending.add(host)) return }
        pool.execute {
            val icon = resolve(host, url)
            synchronized(pending) { pending.remove(host) }
            if (icon != null) store(host, icon)
        }
    }

    private fun store(host: String, icon: ImageBitmap) {
        synchronized(cache) { cache[host] = icon }
        main.post { revision.intValue++ }
    }

    /** 磁盘优先，抓到了再落盘（落盘的那份已经是缩好的尺寸）。 */
    private fun resolve(host: String, url: String): ImageBitmap? {
        readDisk(host)?.let { return it.asImageBitmap() }
        val fetched = fetch(host, url) ?: return null
        writeDisk(host, fetched)
        return fetched.asImageBitmap()
    }

    /**
     * 按域名找图标，候选按"命中率 / 代价"排：
     *
     * 1. **`/favicon.ico`** —— 最常规的那一处；
     * 2. **正文里声明的图标** —— 单页应用常把 `index.html` 当 `/favicon.ico` 返回
     *    （HTTP 200 + HTML），于是解不出位图、却在正文里写着真正的地址，顺手在那儿找一次；
     * 3. **`apple-touch-icon(. -precomposed).png`** —— 站点为了"添加到主屏幕"专门放的 PNG，
     *    是**约定路径**，很多"只在 HTML 里声明图标"的站点也白捡得到。
     *
     * **先按这条记录自己的协议试、再试另一个**（老站还在 http 上，新站一律 https）。
     * SVG 一律解不出来（`BitmapFactory` 不认）—— 那种只能靠 WebView 那条路。
     */
    private fun fetch(host: String, url: String): Bitmap? {
        val schemes = if (url.startsWith("http://")) listOf("http", "https") else listOf("https", "http")
        schemes.forEach { scheme ->
            val base = "$scheme://$host"
            get("$base/favicon.ico")?.let { body ->
                decode(body)?.let { return scale(it) }
                iconHref(body)?.let { href ->
                    get(absolute(base, href))?.let { candidate ->
                        decode(candidate)?.let { return scale(it) }
                    }
                }
            }
            listOf("/apple-touch-icon.png", "/apple-touch-icon-precomposed.png").forEach { path ->
                get("$base$path")?.let { body -> decode(body)?.let { return scale(it) } }
            }
        }
        return null
    }

    /** 取一段字节（失败 / 太大都当没有）。 */
    private fun get(url: String): ByteArray? = runCatching {
        client.newCall(Request.Builder().url(url).build()).execute().use { resp ->
            if (!resp.isSuccessful) return@use null
            val length = resp.body?.contentLength() ?: -1L
            if (length > MAX_BYTES) return@use null
            resp.body?.bytes()
        }
    }.getOrNull()?.takeIf { it.isNotEmpty() && it.size <= MAX_BYTES }

    private fun decode(bytes: ByteArray): Bitmap? =
        runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }.getOrNull()

    /**
     * 从（被当成图标返回的）正文里取 `<link rel="…icon…" href="…">` 的地址。
     *
     * 只扫前 [HEAD_BYTES] 个字节：图标声明都在 `<head>` 里，正文深处不会再有。
     * 二进制内容扫一遍也无害 —— 匹配不上就是 null。
     */
    private fun iconHref(bytes: ByteArray): String? {
        val head = String(bytes, 0, minOf(bytes.size, HEAD_BYTES), Charsets.UTF_8)
        Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(head).forEach { match ->
            val tag = match.value
            if (!tag.contains("icon", ignoreCase = true)) return@forEach
            Regex("href\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE)
                .find(tag)?.groupValues?.get(1)?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.let { return it }
        }
        return null
    }

    /** 相对地址补成绝对地址（`/static/x.png`、`//cdn/x.png` 都认）。 */
    private fun absolute(base: String, href: String): String =
        runCatching { URL(URL(base), href).toString() }.getOrDefault(href)

    /** 缩到 [ICON_PX] 见方以内；本来就不大就原样留着（避免一次无谓的重绘）。 */
    private fun scale(src: Bitmap): Bitmap {
        val longest = maxOf(src.width, src.height)
        if (longest <= ICON_PX) return src
        val ratio = ICON_PX.toFloat() / longest
        val w = (src.width * ratio).toInt().coerceAtLeast(1)
        val h = (src.height * ratio).toInt().coerceAtLeast(1)
        return runCatching { Bitmap.createScaledBitmap(src, w, h, true) }.getOrDefault(src)
    }

    // ─── 磁盘缓存（键 = 域名，文件名 = host 的哈希；一份 PNG 约 1~3KB） ───

    private fun diskFile(host: String): File? =
        dir?.let { File(it, Integer.toHexString(host.hashCode()) + ".png") }

    private fun readDisk(host: String): Bitmap? {
        val file = diskFile(host) ?: return null
        if (!file.isFile) return null
        return runCatching { BitmapFactory.decodeFile(file.absolutePath) }.getOrNull()
    }

    private fun writeDisk(host: String, icon: Bitmap) {
        val file = diskFile(host) ?: return
        runCatching { FileOutputStream(file).use { icon.compress(Bitmap.CompressFormat.PNG, 100, it) } }
    }
}
