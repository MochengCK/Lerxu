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
 *   任务列表和全局统计的增量更新，无需轮询
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

        @Volatile
        private var instance: EngineRepository? = null

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
                        _uiState.update { it.copy(connected = false) }
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
        scope.launch { refreshGlobalStat() }
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
            when {
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

    /** 运行时修改引擎全局选项（如 max-concurrent-downloads） */
    suspend fun changeEngineOptions(options: Map<String, JsonElement>): Boolean {
        return try {
            rpcClient.changeOptions(options)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to change engine options", e)
            false
        }
    }

    suspend fun addUriTask(uri: String, dir: String, out: String = ""): String? {
        return try {
            val gid = rpcClient.addUriTask(listOf(uri), dir, out)
            refreshSingleTask(gid)
            refreshGlobalStat()
            gid
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add URI task", e)
            _uiState.update { it.copy(error = e.message) }
            null
        }
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
