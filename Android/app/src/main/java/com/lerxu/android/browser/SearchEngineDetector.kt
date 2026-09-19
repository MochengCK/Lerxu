package com.lerxu.android.browser

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.TelephonyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * 首次启动「按用户的网络自动选择搜索引擎」。
 *
 * 判据只有两个实测来源：**所在区域**（SIM / 网络注册国家码，其次系统 Locale）
 * 与**能否直连探测端点**。区域决定回退项，连通性决定首选——用户的网络是
 * 事实，不做任何"某地在某地一定用什么"的假设（[SearchEnginePick] 里是纯逻辑）。
 *
 * 只跑一次：首次启动写 `search_engine_initialized`；用户手动选过之后
 * （`search_engine_pinned`）任何自动逻辑都不再覆盖用户的选择。
 */
object SearchEngineDetector {

    const val PREF_ENGINE = "search_engine"
    const val PREF_REASON = "search_engine_reason"
    const val PREF_INITIALIZED = "search_engine_initialized"
    const val PREF_PINNED = "search_engine_pinned"

    /** 探测端点：返回 204 的极简页面，流量可忽略。 */
    private const val PROBE_URL = "https://www.google.com/generate_204"

    /** 探测超时：首次选择不能把界面卡住，宁可判为不可达。 */
    private const val PROBE_TIMEOUT_MS = 2500L

    private val probeClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    /** 是否有可用网络（含移动网络；只判断"有没有"，不判断质量）。 */
    fun hasNetwork(context: Context): Boolean = try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val network = cm?.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network)
        caps != null && (
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            )
    } catch (_: Exception) {
        false
    }

    /** 所在区域：SIM / 网络注册国家码优先，取不到用系统 Locale。 */
    fun countryIso(context: Context): String? {
        try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val fromNetwork = tm?.networkCountryIso?.takeIf { it.length == 2 }
            if (fromNetwork != null) return fromNetwork.uppercase(Locale.ROOT)
            val fromSim = tm?.simCountryIso?.takeIf { it.length == 2 }
            if (fromSim != null) return fromSim.uppercase(Locale.ROOT)
        } catch (_: Exception) {
            // 无电话服务 / 权限受限：退回 Locale
        }
        val locale = Locale.getDefault()
        return locale.country.takeIf { it.length == 2 }?.uppercase(Locale.ROOT)
    }

    /** 探测能否直连（失败、超时、非 2xx/3xx 都算不可达）。 */
    suspend fun canReach(url: String = PROBE_URL): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(url).get().build()
            probeClient.newCall(request).execute().use { resp -> resp.isSuccessful }
        } catch (_: Exception) {
            false
        }
    }

    /** 当前引擎 key（没设置过就按区域即时给一个，不发起探测）。 */
    fun currentKey(context: Context): String {
        val prefs = context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
        prefs.getString(PREF_ENGINE, null)?.let { return it }
        return SearchEnginePick
            .pick(countryIso(context), googleReachable = false, hasNetwork = false)
            .key
    }

    /**
     * 首次启动自动选择（幂等）：已初始化则直接返回当前值，用户手动选过则原样保留。
     *
     * 返回最终 key；任何一步失败都会返回可用的兜底值，不抛异常。
     */
    suspend fun ensureInitialized(context: Context): String {
        val prefs = context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
        val initialized = prefs.getBoolean(PREF_INITIALIZED, false)
        val pinned = prefs.getBoolean(PREF_PINNED, false)
        if (initialized || pinned) return currentKey(context)

        val country = countryIso(context)
        val online = hasNetwork(context)
        val reachable = online && canReach()
        val choice = SearchEnginePick.pick(country, reachable, online)
        prefs.edit()
            .putString(PREF_ENGINE, choice.key)
            .putString(PREF_REASON, choice.reason.name)
            .putBoolean(PREF_INITIALIZED, true)
            .apply()
        return choice.key
    }

    /** 用户在设置页手动选择：落盘并打上 pinned（此后不再被自动逻辑覆盖）。 */
    fun setEngine(context: Context, key: String, pinned: Boolean = true) {
        context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_ENGINE, key)
            .putBoolean(PREF_INITIALIZED, true)
            .putBoolean(PREF_PINNED, pinned)
            .apply()
    }

    /** 恢复「跟随网络自动选择」：清掉 pinned，下次进入时重选。 */
    fun clearPinned(context: Context) {
        context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_INITIALIZED, false)
            .putBoolean(PREF_PINNED, false)
            .apply()
    }

    /** 上次自动选择的原因（用于设置页说明），无则 null。 */
    fun lastReason(context: Context): SearchEnginePick.Reason? {
        val raw = context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            .getString(PREF_REASON, null) ?: return null
        return runCatching { SearchEnginePick.Reason.valueOf(raw) }.getOrNull()
    }
}
