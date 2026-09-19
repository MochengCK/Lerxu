package com.lerxu.android.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.engine.EngineRpcClient
import com.lerxu.android.engine.EngineService
import com.lerxu.android.model.*
import com.lerxu.android.R
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * 引擎数据仓库 —— 统一管理 RPC 调用与事件驱动的状态更新。
 *
 * 架构：
 * - [EngineRpcClient] 负责 WebSocket 连接与 RPC 请求
 * - 事件订阅（task.progress / task.complete / task.error）自动驱动
 *   任务列表的增量更新，无需轮询
 * - 例外：全局速度（engine.globalStat）引擎不推送，只能按自适应间隔主动拉取；
 *   不拉的话顶栏速度会永远停在「建连那一刻」的采样值（见 startStatPolling）
 * - ViewModel 通过 StateFlow 观察 UI 状态
 *
 * 启动时序：
 * 1. EngineService 异步启动引擎进程
 * 2. 引擎 RPC 端口就绪后发送 ENGINE_READY 广播
 * 3. Repository 收到广播后连接 WebSocket
 */
class EngineRepository private constructor(
    private val context: Context,
    private val rpcClient: EngineRpcClient
) {
    companion object {
        private const val TAG = "EngineRepository"

        // 全局速度轮询节奏（与桌面端 EngineClient 的 polling 保持一致）：
        // 有活跃任务时按任务数加压，空闲时逐级退避，界面不可见时不低于 3s
        private const val STAT_POLL_BASE_MS = 1000L
        private const val STAT_POLL_PER_TASK_MS = 100L
        private const val STAT_POLL_MIN_MS = 500L
        private const val STAT_POLL_MAX_MS = 30_000L
        private const val STAT_POLL_HIDDEN_MS = 3_000L

        @Volatile
        private var instance: EngineRepository? = null

        /**
         * 下一次轮询间隔（纯函数，便于单测）：
         * 有活跃任务 → 1000ms 起、每个任务再减 100ms，下限 500ms；
         * 空闲 → 每次 +100ms 逐级退避，上限 30s。
         */
        internal fun nextStatPollInterval(currentMs: Long, activeCount: Int): Long =
            if (activeCount > 0) {
                (STAT_POLL_BASE_MS - STAT_POLL_PER_TASK_MS * activeCount)
                    .coerceAtLeast(STAT_POLL_MIN_MS)
            } else {
                (currentMs + STAT_POLL_PER_TASK_MS)
                    .coerceAtMost(STAT_POLL_MAX_MS)
            }

        /** 界面不可见时把间隔放宽到不低于 3s（引擎照常跑，只是界面少刷几次） */
        internal fun statPollDelayMs(intervalMs: Long, visible: Boolean): Long =
            if (visible) intervalMs else maxOf(intervalMs, STAT_POLL_HIDDEN_MS)

        fun getInstance(context: Context): EngineRepository {
            return instance ?: synchronized(this) {
                instance ?: createRepository(context.applicationContext).also { instance = it }
            }
        }

        private fun createRepository(context: Context): EngineRepository {
            val rpcClient = EngineRpcClient.create(
                EngineManager.getRpcHost(),
                EngineManager.getRpcPort(),
                EngineManager.getRpcSecret()
            )
            return EngineRepository(context, rpcClient)
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    // ─── UI 状态 ───

    data class UiState(
        val connected: Boolean = false,
        val engineStarting: Boolean = true,  // 引擎正在启动
        val engineVersion: EngineVersion? = null,
        val globalStat: GlobalStat = GlobalStat(),
        val tasks: List<TaskInfo> = emptyList(),
        val scopeCounts: Map<String, Int> = emptyMap(),  // 各分类的任务数
        val loading: Boolean = false,
        val error: String? = null
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val taskMap = mutableMapOf<String, TaskInfo>()
    // 完成/错误时间戳（gid → epoch ms），仅会话内有效
    private val finishedAtMap = mutableMapOf<String, Long>()
    // 启动后首次全量同步是否完成：之前的完成/错误任务不补时间（引擎无记录，避免误标为刚刚）
    private var initialSyncDone = false
    private var currentScope = "all"

    // ─── 全局速度轮询状态 ───
    // 引擎只在被问到时才算速度（stat_raw 汇总各任务的无锁原子速度），没有推送事件，
    // 所以顶栏速度必须靠这个循环刷新，否则会停在旧采样值上。
    private var statPollJob: Job? = null
    private var statPollInterval = STAT_POLL_BASE_MS
    @Volatile private var uiVisible = true

    // ─── 引擎就绪广播接收器 ───

    private val engineReadyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                EngineService.ACTION_ENGINE_READY -> {
                    Log.i(TAG, "Engine ready broadcast received, connecting RPC...")
                    _uiState.update { it.copy(engineStarting = false, error = null) }
                    rpcClient.connect()
                }
                EngineService.ACTION_ENGINE_FAILED -> {
                    val error = intent.getStringExtra(EngineService.EXTRA_ERROR) ?: context.getString(R.string.error_engine_start_default)
                    Log.e(TAG, "Engine failed to start: $error")
                    _uiState.update {
                        it.copy(engineStarting = false, error = error)
                    }
                }
            }
        }
    }

    init {
        // 注册广播接收器
        val filter = IntentFilter().apply {
            addAction(EngineService.ACTION_ENGINE_READY)
            addAction(EngineService.ACTION_ENGINE_FAILED)
        }
        context.registerReceiver(engineReadyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)

        // 监听连接状态
        scope.launch {
            rpcClient.connectionState.collect { state ->
                when (state) {
                    EngineRpcClient.ConnectionState.CONNECTED -> {
                        _uiState.update { it.copy(connected = true, error = null, engineStarting = false) }
                        onConnected()
                    }
                    EngineRpcClient.ConnectionState.CONNECTING -> {
                        _uiState.update { it.copy(connected = false) }
                    }
                    EngineRpcClient.ConnectionState.DISCONNECTED -> {
                        // 停掉速度轮询并清零：断线后若留着上一个采样值，
                        // 顶栏会一直显示一个早已失效的速度
                        stopStatPolling()
                        _uiState.update { it.copy(connected = false, globalStat = GlobalStat()) }
                    }
                }
            }
        }

        // 监听引擎事件
        scope.launch {
            rpcClient.events.collect { event ->
                handleEvent(event)
            }
        }
    }

    fun start() {
        // 如果引擎已经在运行，直接连接
        if (EngineManager.isRunning()) {
            Log.i(TAG, "Engine already running, connecting RPC directly")
            _uiState.update { it.copy(engineStarting = false) }
            rpcClient.connect()
        }
        // 否则等待 ENGINE_READY 广播
    }

    fun stop() {
        stopStatPolling()
        scope.launch {
            // 断开前先让引擎把会话落盘（任务进度/终态时间戳不丢）
            try {
                rpcClient.saveSession()
            } catch (e: Exception) {
                Log.w(TAG, "Save session before disconnect failed", e)
            }
            rpcClient.disconnect()
        }
    }

    /**
     * 清除错误状态，重新启动引擎服务
     */
    fun clearErrorAndRetry() {
        _uiState.update { it.copy(error = null, engineStarting = true) }
        EngineService.startEngine(context)
    }

    private suspend fun onConnected() {
        // 握手：获取版本信息
        try {
            val version = rpcClient.getVersion()
            _uiState.update { it.copy(engineVersion = version) }
            Log.i(TAG, "Engine connected: ${version.name} v${version.version} features=${version.features}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get engine version", e)
        }

        // 全量拉取任务列表
        refreshTasks()
        // 首帧速度立刻有值，之后交给自适应轮询持续刷新
        refreshGlobalStat()
        startStatPolling()
        // 内置订阅源：首次运行时注入常用 BT tracker 订阅（异步，不阻塞连接流程）
        scope.launch { seedPresetSubscriptions() }
    }

    /**
     * 内置常用 BT 订阅源：首次连接（无 prefs 标记）且引擎当前没有任何订阅时，
     * 自动注入预置 tracker 订阅（jsDelivr CDN 托管，国内可直达）。
     * 成功后写入标记，此后即使用户删光订阅也不会重新注入。
     * 整体失败（如首次连接抖动）不写标记，下次连接自动重试。
     */
    private suspend fun seedPresetSubscriptions() {
        val prefs = context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("bt_presets_seeded", false)) return
        try {
            if (rpcClient.getSubscriptions().isEmpty()) {
                val presets = listOf(
                    context.getString(R.string.preset_sub_xiu2_best) to
                        "https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection@master/best.txt",
                    context.getString(R.string.preset_sub_ngosang_best) to
                        "https://cdn.jsdelivr.net/gh/ngosang/trackerslist@master/trackers_best.txt",
                    context.getString(R.string.preset_sub_xiu2_all) to
                        "https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection@master/all.txt"
                )
                presets.forEach { (name, url) ->
                    try {
                        rpcClient.addSubscription(name, url)
                    } catch (e: Exception) {
                        Log.w(TAG, "Seed subscription '$name' failed", e)
                    }
                }
            }
            prefs.edit().putBoolean("bt_presets_seeded", true).apply()
        } catch (e: Exception) {
            Log.w(TAG, "Seed preset subscriptions failed, will retry on next connect", e)
        }
    }

    // ─── 事件处理 ───

    private fun handleEvent(event: EngineEvent) {
        val gid = event.gid ?: return
        when (event.method) {
            "task.progress" -> {
                // 增量更新进度
                val existing = taskMap[gid]
                if (existing != null) {
                    val updated = existing.copy(
                        status = event.status ?: existing.status,
                        completedLength = event.completedLength ?: existing.completedLength,
                        totalLength = event.totalLength ?: existing.totalLength,
                        downloadSpeed = event.downloadSpeed ?: existing.downloadSpeed
                    )
                    taskMap[gid] = updated
                    publishTasks()
                }
            }
            "task.start" -> {
                scope.launch { refreshSingleTask(gid) }
            }
            "task.pause" -> {
                taskMap[gid]?.let { taskMap[gid] = it.copy(status = "paused") }
                publishTasks()
            }
            "task.stop" -> {
                taskMap[gid]?.let { taskMap[gid] = it.copy(status = "paused") }
                publishTasks()
            }
            "task.complete" -> {
                taskMap[gid]?.let { taskMap[gid] = it.copy(status = "complete", completedLength = it.totalLength, downloadSpeed = 0) }
                publishTasks()
                scope.launch { refreshGlobalStat() }
            }
            "task.error" -> {
                taskMap[gid]?.let { taskMap[gid] = it.copy(
                    status = "error",
                    errorCode = event.errorCode ?: 0,
                    errorMessage = event.errorMessage ?: "",
                    downloadSpeed = 0
                ) }
                publishTasks()
                scope.launch { refreshGlobalStat() }
            }
        }
    }

    // ─── 数据操作 ───

    private fun publishTasks() {
        val list = taskMap.values.map { t ->
            val recorded = finishedAtMap[t.gid]
            val base = when {
                recorded != null && t.finishedAt != recorded ->
                    t.copy(finishedAt = recorded)
                // 会话内首次观察到完成/错误（事件漏发时的兜底，如 BT seeding 状态）。
                // 引擎已返回真实 finishedAt（会话恢复）时不覆盖，避免盖戳为"刚刚"
                recorded == null && initialSyncDone && t.finishedAt <= 0L &&
                    (t.status == "complete" || t.status == "error" || t.status == "seeding") -> {
                    val now = System.currentTimeMillis()
                    finishedAtMap[t.gid] = now
                    t.copy(finishedAt = now)
                }
                else -> t
            }
            // 引擎还没解析出文件名（排队 / 等元数据）时，用我们请求的那个名字顶上
            base.withRequestedName()
        }
        val counts = mapOf(
            "all" to list.size,
            "active" to list.count { it.status == "active" },
            "seeding" to list.count { it.status == "seeding" },
            "waiting" to list.count { it.status == "waiting" },
            "paused" to list.count { it.status == "paused" },
            "stopped" to list.count { it.status == "complete" || it.status == "error" || it.status == "removed" }
        )
        val filtered = filterAndSort(list)
        _uiState.update { it.copy(tasks = filtered, scopeCounts = counts) }
    }

    private fun filterAndSort(tasks: List<TaskInfo>): List<TaskInfo> {
        val filtered = when (currentScope) {
            "active" -> tasks.filter { it.status == "active" }
            "seeding" -> tasks.filter { it.status == "seeding" }
            "waiting" -> tasks.filter { it.status == "waiting" }
            "paused" -> tasks.filter { it.status == "paused" }
            "stopped" -> tasks.filter { it.status == "complete" || it.status == "error" || it.status == "removed" }
            else -> tasks
        }
        val orderMap = mapOf(
            "active" to 0, "seeding" to 1, "waiting" to 2,
            "paused" to 3, "complete" to 4, "error" to 5, "removed" to 6
        )
        return filtered.sortedWith(compareBy { orderMap[it.status] ?: 7 })
    }

    fun setScope(scope: String) {
        currentScope = scope
        publishTasks()
    }

    suspend fun refreshTasks() {
        _uiState.update { it.copy(loading = true) }
        try {
            val tasks = rpcClient.listTasks("all")
            taskMap.clear()
            tasks.forEach { taskMap[it.gid] = it }
            initialSyncDone = true
            publishTasks()
            _uiState.update { it.copy(loading = false, error = null) }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to refresh tasks", e)
            _uiState.update { it.copy(loading = false, error = e.message) }
        }
    }

    suspend fun refreshSingleTask(gid: String) {
        try {
            val task = rpcClient.tellStatus(gid)
            taskMap[gid] = task
            publishTasks()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to refresh task $gid", e)
        }
    }

    suspend fun refreshGlobalStat() {
        try {
            val stat = rpcClient.getGlobalStat()
            _uiState.update { it.copy(globalStat = stat) }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to refresh global stat", e)
        }
    }

    /**
     * 全局速度轮询：`engine.globalStat` 没有任何推送事件，顶栏的上下行速度只能靠这里刷新。
     * 不轮询的话，速度会永远停在「建连 / 新建任务 / 任务结束」那几个时刻的采样值上
     * （表现为下载中一直显示 0 B/s 或冻在旧数字），看着就是「速度不准」。
     *
     * 节奏与桌面端一致：有活跃任务时 1000ms 起、每多一个任务减 100ms（下限 500ms）；
     * 空闲时每次 +100ms 逐级退避到 30s（引擎空闲时没必要每秒问一次）；
     * 界面不可见时不低于 3s。
     */
    private fun startStatPolling() {
        stopStatPolling()
        statPollInterval = STAT_POLL_BASE_MS
        statPollJob = scope.launch {
            while (isActive) {
                refreshGlobalStat()

                val active = _uiState.value.globalStat.numActive
                statPollInterval = nextStatPollInterval(statPollInterval, active)
                delay(statPollDelayMs(statPollInterval, uiVisible))
            }
        }
    }

    private fun stopStatPolling() {
        statPollJob?.cancel()
        statPollJob = null
    }

    /**
     * 界面可见性（由 Activity 生命周期驱动）。
     * 回到前台时立即补一次采样并复位间隔，避免刚切回来还停在退避后的长间隔上。
     */
    fun setUiVisible(visible: Boolean) {
        if (uiVisible == visible) return
        uiVisible = visible
        if (visible) {
            statPollInterval = STAT_POLL_BASE_MS
            scope.launch { refreshGlobalStat() }
        }
    }

    /** 运行时修改引擎全局选项（如 max-concurrent-downloads） */
    suspend fun changeEngineOptions(options: Map<String, JsonElement>): Boolean {
        return try {
            rpcClient.changeOptions(options)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to change engine options", e)
            false
        }
    }

    suspend fun addUriTask(uri: String, dir: String, out: String = ""): String? =
        addUriTask(uri, dir, out, emptyList())

    /**
     * 带逐任务请求头新增 HTTP 任务（内置浏览器转交下载用）。
     *
     * [headers] 为 `"Name: value"` 行列表，典型内容为 `Referer` / `Cookie` /
     * `User-Agent`；不传 `Origin`。
     */
    suspend fun addUriTask(
        uri: String,
        dir: String,
        out: String = "",
        headers: List<String> = emptyList()
    ): String? {
        return try {
            val gid = rpcClient.addUriTask(listOf(uri), dir, out, headers)
            // 记住我们请求的名字：引擎要等真正开始下载才解析出文件名（见 requestedNames）
            if (out.isNotBlank() && gid.isNotBlank()) requestedNames[gid] = out
            refreshSingleTask(gid)
            refreshGlobalStat()
            gid
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add URI task", e)
            _uiState.update { it.copy(error = e.message) }
            null
        }
    }

    /**
     * 我们**请求的**文件名（gid → 文件名）。
     *
     * 浏览器转交下载时会带 `out`（视频名），但引擎要等真正开始下载、探测到响应头
     * 之后才把解析出的文件名写进 `files[].path` —— 排队 / 等元数据期间那里是空的，
     * 界面于是退回"地址里的文件名"，也就是用户看到的"还是原始名称"；重进应用后
     * 引擎从会话里读回 `out`，名字才对上（用户点名的现象）。
     *
     * 这里把请求时那个名字记下来，界面优先用它；引擎一给出真名就立刻丢弃这条记录。
     */
    private val requestedNames = java.util.concurrent.ConcurrentHashMap<String, String>()

    /**
     * 引擎还没给出文件名时，用我们请求的名字把首文件路径补上。
     *
     * 补在 `files[0].path` 上而不是另开一个显示字段：列表（[TaskInfo.fileName]）
     * 和任务详情（读 `files[].path`）本来就同源，补这里两边一起对 ✓
     */
    private fun TaskInfo.withRequestedName(): TaskInfo {
        val want = requestedNames[gid]?.takeIf { it.isNotBlank() } ?: return this
        val first = files.firstOrNull() ?: return this
        if (first.path.isNotBlank()) {
            // 引擎已经解析出真名（可能与我们请求的不同，比如服务器给了 Content-Disposition）
            requestedNames.remove(gid)
            return this
        }
        return copy(files = listOf(first.copy(path = want)) + files.drop(1))
    }

    suspend fun addMagnetTask(magnet: String, dir: String, awaitSelection: Boolean = false): String? {
        return try {
            val gid = rpcClient.addMagnet(magnet, dir, awaitSelection)
            refreshSingleTask(gid)
            refreshGlobalStat()
            gid
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add magnet task", e)
            _uiState.update { it.copy(error = e.message) }
            null
        }
    }

    suspend fun addTorrentTask(torrentPath: String, dir: String, awaitSelection: Boolean = false): String? {
        return try {
            val file = java.io.File(torrentPath)
            val base64 = android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP)
            val gid = rpcClient.addTorrent(base64, dir, awaitSelection)
            refreshSingleTask(gid)
            refreshGlobalStat()
            gid
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add torrent task", e)
            _uiState.update { it.copy(error = e.message) }
            null
        }
    }

    suspend fun pauseTask(gid: String) {
        try {
            rpcClient.pauseTask(gid)
            taskMap[gid]?.let { taskMap[gid] = it.copy(status = "paused") }
            publishTasks()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to pause task $gid", e)
        }
    }

    suspend fun resumeTask(gid: String) {
        try {
            rpcClient.resumeTask(gid)
            taskMap[gid]?.let { taskMap[gid] = it.copy(status = "active") }
            publishTasks()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resume task $gid", e)
        }
    }

    suspend fun removeTask(gid: String, deleteFiles: Boolean = false) {
        try {
            rpcClient.removeTask(gid, deleteFiles)
            taskMap.remove(gid)
            publishTasks()
            refreshGlobalStat()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove task $gid", e)
        }
    }

    suspend fun purgeResults() {
        try {
            rpcClient.purgeResults()
            taskMap.entries.removeIf { it.value.status == "complete" || it.value.status == "error" || it.value.status == "removed" }
            publishTasks()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to purge results", e)
        }
    }

    fun getTaskByGid(gid: String): TaskInfo? = taskMap[gid]

    fun getRpcClient(): EngineRpcClient = rpcClient
}
