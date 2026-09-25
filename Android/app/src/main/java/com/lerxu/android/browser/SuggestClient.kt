package com.lerxu.android.browser

import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 联想词（搜索建议）抓取。
 *
 * 走**应用自己**的 OkHttp，而不是让首页里的 JS 去 fetch：
 * ① 首页是 `file://` 来源，跨域请求联想接口会被 CORS 挡掉（Bing 的 osjson
 *    也没有 CORS 头，且它不接受回调参数、当不了 JSONP）；
 * ② 超时、UA、取消都归我们管，弱网下不会把面板卡在半空。
 *
 * [fetch] 是异步的，**回调在主线程之外的 OkHttp 线程**上执行（调用方自行切主线程），
 * 并返回可取消的 [Call] —— 输入每变一个字都要取消上一次，否则先发出的慢响应
 * 会盖掉后发出的快响应（联想词错位）。
 */
object SuggestClient {

    /** 联想词是「边打字边看」的东西：宁可这次没有，也不能让人等。 */
    private const val TIMEOUT_MS = 2500L

    /**
     * 桌面版同款 UA。部分站点的联想接口对陌生 UA 直接回空数组，
     * 用浏览器 UA 才稳定拿到结果。
     */
    private const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Mobile Safari/537.36"

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            // 允许换一条路重试：手机网络下第一次连接经常失败（DNS 抖动、IPv6 不可达、
            // 刚切换网络），不重试就等于这一次联想词直接没有 —— 用户看到的正是
            // "有时候干脆不显示"。整条 call 仍受 callTimeout 封顶，不会挂很久
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * 预热：把 DNS / TCP / TLS 这几趟往返**提前跑掉**，结果直接丢弃。
     *
     * 联想词是"停下来就得有"的东西，而一次搜索会话里的第一条请求要付整段冷启动
     * （实测 TLS 握手就占 200~360ms，比请求本身还久）。提前发一条，等用户敲下
     * 第一个字时连接已经躺在池子里，每个请求只剩一个 RTT。
     *
     * 用 **HEAD** 而不是 GET：握手一完成、响应头一回来就把连接还回池子（不下载
     * 响应体），否则它会一直被这次预热占着，第一条真实请求只能另开一条冷连接 ——
     * 那就白预热了。两家联想端点都是 HTTP/2（实测 `HEAD` 回 200、不带
     * `Connection: close`），连接复用不受状态码影响。
     */
    fun warmUp(url: String) {
        client.newCall(
            Request.Builder()
                .url(url)
                .header("User-Agent", USER_AGENT)
                .head()
                .build()
        ).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = Unit

            override fun onResponse(call: Call, response: Response) {
                runCatching { response.close() }
            }
        })
    }

    /** 发起一次联想词请求；返回的 [Call] 由调用方在下次输入时取消。 */
    fun fetch(url: String, onResult: (List<String>) -> Unit): Call {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json, text/javascript, */*")
            .header("User-Agent", USER_AGENT)
            .get()
            .build()
        val call = client.newCall(request)
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // 被取消（用户已经改了输入）不算失败：不回调，免得覆盖新结果
                if (call.isCanceled()) return
                onResult(emptyList())
            }

            override fun onResponse(call: Call, response: Response) {
                val body = runCatching {
                    response.use { if (it.isSuccessful) it.body?.string().orEmpty() else "" }
                }.getOrDefault("")
                onResult(Suggestions.parse(body))
            }
        })
        return call
    }
}
