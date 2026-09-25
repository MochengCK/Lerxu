package com.lerxu.android.browser

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.webkit.CookieManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/**
 * 影视模式封面图的加载（内存缓存 + 降采样）。
 *
 * 为什么不交给 WebView / 不引 Coil：封面地址是我们在**原生界面**里画的（影视页的
 * 网页这一层被整屏盖住，图不能复用网页的缓存），而这些图普遍挂在**校验防盗链**的
 * CDN 上 —— 没有 `Referer`（页面地址）、`User-Agent`（WebView 的）与站点 Cookie，
 * 服务器直接回 403。带上这三样后它就是一条普通的 GET，值不上一个新依赖。
 *
 * 约束：
 * - **只走内存**：封面是一屏几秒的临时内容，落盘只会在事后留下永不读的垃圾；
 * - **绝不抛**：任何失败（超时 / 403 / 不是图）都返回 `null`，界面画占位块；
 * - **可取消**：卡片滚出屏幕时协程被取消，请求跟着断（同一地址仍有别的卡片在等则
 *   继续跑，等最后一个等待者走了才真的取消）；
 * - **同地址合并**：同一张封面（主列表与推荐区常有重复）只发一次请求。
 */
object CoverImageLoader {

    /** 缓存上限：取堆的 1/8 与 24MB 的较小值。 */
    private const val MAX_CACHE_BYTES = 24L * 1024 * 1024

    /** 封面是"锦上添花"的东西：慢一点无所谓，但不能占着连接不还。 */
    private const val TIMEOUT_MS = 8000L

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private val memory by lazy {
        object : LruCache<String, Bitmap>(cacheBytes()) {
            override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
        }
    }

    /** 后台执行的载入任务都挂在这个作用域上：等待者取消不致于把任务本身带走。 */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** 正在飞的请求：`url → 任务`（合并同一地址的并发请求，见 [load]）。 */
    private val inFlight = ConcurrentHashMap<String, Entry>()

    private class Entry(val job: Deferred<Bitmap?>) {
        /** 等待者数量：降到 0 才真的取消这次请求。 */
        var waiters: Int = 0
    }

    /** 已经解好的封面（同步、不阻塞）；没有就返回 `null`。 */
    fun cached(url: String): Bitmap? {
        if (url.isEmpty()) return null
        return runCatching { memory.get(url) }.getOrNull()
    }

    /**
     * 取一张封面：[cached] 没有就发请求（已有同地址请求则并入）。
     *
     * [referer] 是影视页地址、[ua] 是 WebView 正在用的 UA（都用于过防盗链），
     * [targetWidthPx] 用于降采样（按目标宽选 `inSampleSize`，2 的幂）。
     */
    suspend fun load(url: String, referer: String, ua: String, targetWidthPx: Int): Bitmap? {
        if (url.isEmpty()) return null
        memory.get(url)?.let { return it }
        val entry = synchronized(inFlight) {
            inFlight[url] ?: Entry(
                scope.async(start = CoroutineStart.LAZY) { fetch(url, referer, ua, targetWidthPx) }
            ).also {
                inFlight[url] = it
                it.job.start()
            }
        }
        synchronized(inFlight) { entry.waiters++ }
        return try {
            entry.job.await()
        } catch (e: Exception) {
            // 请求失败、或被取消（调用方自己滚出屏幕 / 任务被收走）：都不算异常，
            // 界面拿到 null 就画占位块
            null
        } finally {
            synchronized(inFlight) {
                entry.waiters--
                if (entry.waiters <= 0) {
                    inFlight.remove(url, entry)
                    entry.job.cancel()
                }
            }
        }
    }

    private suspend fun fetch(url: String, referer: String, ua: String, targetWidthPx: Int): Bitmap? {
        val bytes = runCatching { download(url, referer, ua) }.getOrNull() ?: return null
        val bitmap = runCatching { decode(bytes, targetWidthPx) }.getOrNull() ?: return null
        runCatching { memory.put(url, bitmap) }
        return bitmap
    }

    private suspend fun download(url: String, referer: String, ua: String): ByteArray? {
        val call = runCatching {
            val builder = Request.Builder()
                .url(url)
                .header("Accept", "image/avif,image/webp,image/*,*/*;q=0.8")
                .get()
            if (ua.isNotBlank()) builder.header("User-Agent", ua)
            val ref = referer.takeIf { it.startsWith("http") }
            if (ref != null) {
                builder.header("Referer", ref)
                cookieFor(url, ref)?.let { builder.header("Cookie", it) }
            } else {
                cookieFor(url, "")?.let { builder.header("Cookie", it) }
            }
            client.newCall(builder.build())
        }.getOrNull() ?: return null

        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { runCatching { call.cancel() } }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resume(null)
                }

                override fun onResponse(call: Call, response: Response) {
                    val body = runCatching {
                        response.use { if (it.isSuccessful) it.body?.bytes() else null }
                    }.getOrNull()
                    if (cont.isActive) cont.resume(body)
                }
            })
        }
    }

    /**
     * 该带上哪个 Cookie：**图片地址自己的优先**（CDN 常单独下发），没有就用页面
     * 的那份（站点把图挂在自己的域名下时只有页面 Cookie 认得）。
     */
    private fun cookieFor(url: String, referer: String): String? = runCatching {
        val manager = CookieManager.getInstance()
        manager.getCookie(url)?.takeIf { it.isNotBlank() }
            ?: referer.takeIf { it.isNotEmpty() }?.let { manager.getCookie(it) }?.takeIf { it.isNotBlank() }
    }.getOrNull()

    private fun decode(bytes: ByteArray, targetWidthPx: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            // 降采样按 2 的幂（BitmapFactory 只认这个），取"缩完仍不小于目标宽"的最大档
            var sample = 1
            while (targetWidthPx > 0 && bounds.outWidth / (sample * 2) >= targetWidthPx) sample *= 2
            inSampleSize = sample
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }

    private fun cacheBytes(): Int {
        val limit = Runtime.getRuntime().maxMemory() / 8
        return minOf(limit, MAX_CACHE_BYTES).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
}