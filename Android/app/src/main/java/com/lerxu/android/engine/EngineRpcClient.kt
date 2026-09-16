package com.lerxu.android.engine

import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import okhttp3.*
import okio.ByteString
import com.lerxu.android.model.*

/**
 * XferRust JSON-RPC 2.0 WebSocket 客户端
 *
 * 连接 xferrust 守护进程的 WebSocket 端点 (ws://127.0.0.1:port/jsonrpc)，
 * 使用原生协议族（task.* / engine.* / events.*）。
 *
 * 支持特性：
 * - 单发 RPC 请求-响应
 * - 事件订阅（events.subscribe → task.progress / task.complete / ...）
 * - 自动重连
 * - 请求超时
 */
class EngineRpcClient private constructor(
    private val host: String,
    private val port: Int,
    val secret: String,
    private val client: OkHttpClient
) {
    companion object {
        private const val TAG = "EngineRpcClient"
        private const val NORMAL_CLOSURE = 1000
        private const val RECONNECT_DELAY_MS = 2000L
        private const val REQUEST_TIMEOUT_MS = 15000L

        fun create(host: String, port: Int, secret: String = ""): EngineRpcClient {
            val client = OkHttpClient.Builder()
                .retryOnConnectionFailure(true)
                .pingInterval(java.time.Duration.ofSeconds(15))
                .build()
            return EngineRpcClient(host, port, secret, client)
        }
    }

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
        // 引擎 getOptions 的标量值均为 JSON 字符串（"55"/"true"），
        // lenient 模式允许引号字符串解码进 Int/Boolean/Double 字段
        isLenient = true
    }

    private var webSocket: WebSocket? = null
    private val requestMap = mutableMapOf<Int, CompletableDeferred<JsonElement>>()
    private var nextId = 1
    @Synchronized
    private fun nextRequestId(): Int = nextId++

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _events = MutableSharedFlow<EngineEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<EngineEvent> = _events.asSharedFlow()

    private var subscribedToEvents = false
    private var scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var reconnectJob: Job? = null

    enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED }

    /**
     * 建立 WebSocket 连接并订阅事件。
     */
    fun connect() {
        if (_connectionState.value == ConnectionState.CONNECTED ||
            _connectionState.value == ConnectionState.CONNECTING
        ) return

        _connectionState.value = ConnectionState.CONNECTING

        val url = "ws://$host:$port/jsonrpc"
        Log.i(TAG, "Connecting to engine RPC: $url")

        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                _connectionState.value = ConnectionState.CONNECTED
                // 订阅事件
                subscribeEvents()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                handleMessage(bytes.utf8())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.w(TAG, "WebSocket closed: $code $reason")
                _connectionState.value = ConnectionState.DISCONNECTED
                rejectAllPending("WebSocket closed")
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                _connectionState.value = ConnectionState.DISCONNECTED
                rejectAllPending(t.message ?: "WebSocket failure")
                scheduleReconnect()
            }
        })
    }

    /**
     * 主动关闭连接。
     */
    fun disconnect() {
        reconnectJob?.cancel()
        webSocket?.close(NORMAL_CLOSURE, "Client closing")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
        rejectAllPending("Client disconnecting")
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            if (_connectionState.value != ConnectionState.CONNECTED) {
                Log.i(TAG, "Attempting reconnect...")
                connect()
            }
        }
    }

    private fun subscribeEvents() {
        if (subscribedToEvents) return
        subscribedToEvents = true
        scope.launch {
            try {
                callRaw("events.subscribe", buildJsonObject {
                    if (secret.isNotEmpty()) put("token", secret)
                })
                Log.i(TAG, "Subscribed to engine events")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to subscribe events", e)
                subscribedToEvents = false
            }
        }
    }

    /**
     * 处理收到的 WebSocket 消息。
     * 区分 RPC 响应帧（有 id）和事件通知帧（无 id，有 method）。
     */
    private fun handleMessage(text: String) {
        val element = try {
            json.parseToJsonElement(text)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse message: $text", e)
            return
        }

        val obj = element.jsonObject
        val id = obj["id"]?.jsonPrimitive?.intOrNull

        if (id != null) {
            // RPC 响应
            val deferred = synchronized(requestMap) { requestMap.remove(id) }
            if (deferred != null) {
                val error = obj["error"]
                if (error != null) {
                    val msg = (error as? JsonObject)?.get("message")?.jsonPrimitive?.content
                        ?: "RPC error"
                    val code = (error as? JsonObject)?.get("code")?.jsonPrimitive?.intOrNull
                    deferred.completeExceptionally(RpcException(code ?: -1, msg))
                } else {
                    val result = obj["result"] ?: JsonNull
                    deferred.complete(result)
                }
            }
        } else {
            // 事件通知
            val method = obj["method"]?.jsonPrimitive?.content ?: return
            val params = obj["params"]?.jsonObject ?: JsonObject(emptyMap())
            val event = EngineEvent(method = method, params = params)
            scope.launch { _events.emit(event) }
        }
    }

    /**
     * 发送原始 RPC 请求并等待响应。
     */
    suspend fun callRaw(method: String, params: JsonObject = JsonObject(emptyMap())): JsonElement {
        val id = nextRequestId()
        val request = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", if (secret.isNotEmpty()) {
                JsonObject(params.toMutableMap().apply { put("token", JsonPrimitive(secret)) })
            } else params)
        }

        val deferred = CompletableDeferred<JsonElement>()
        synchronized(requestMap) { requestMap[id] = deferred }

        val ws = webSocket
        if (ws == null || _connectionState.value != ConnectionState.CONNECTED) {
            synchronized(requestMap) { requestMap.remove(id) }
            throw RpcException(-1, "Not connected to engine")
        }

        val jsonStr = json.encodeToString(JsonObject.serializer(), request)
        ws.send(jsonStr)

        return try {
            withTimeout(REQUEST_TIMEOUT_MS) { deferred.await() }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            synchronized(requestMap) { requestMap.remove(id) }
            throw RpcException(-1, "Request timeout: $method")
        }
    }

    /**
     * 便捷方法：调用 RPC 并解码结果。
     * 由于 inline + reified 限制，这里用泛型 + serializer 方式。
     */
    suspend fun <T> call(method: String, params: JsonObject = JsonObject(emptyMap()), serializer: kotlinx.serialization.KSerializer<T>): T {
        val result = callRaw(method, params)
        return json.decodeFromString(serializer, result.toString())
    }

    private fun rejectAllPending(reason: String) {
        synchronized(requestMap) {
            requestMap.values.forEach { it.completeExceptionally(RpcException(-1, reason)) }
            requestMap.clear()
        }
    }

    // ─── 高级 API ───

    suspend fun getVersion(): EngineVersion = call("engine.getVersion", serializer = EngineVersion.serializer())

    suspend fun getGlobalStat(): GlobalStat = call("engine.globalStat", serializer = GlobalStat.serializer())

    suspend fun getOptions(): EngineOptions = call("engine.getOptions", serializer = EngineOptions.serializer())

    suspend fun changeOptions(options: Map<String, JsonElement>): Boolean {
        val params = buildJsonObject {
            options.forEach { (k, v) -> put(k, v) }
            if (secret.isNotEmpty()) put("token", secret)
        }
        val result = callRaw("engine.changeOptions", params)
        return result.toString().contains("\"ok\":true")
    }

    suspend fun addUriTask(uris: List<String>, dir: String, out: String = ""): String {
        val params = buildJsonObject {
            put("uris", JsonArray(uris.map { JsonPrimitive(it) }))
            put("dir", dir)
            if (out.isNotEmpty()) put("out", out)
            if (secret.isNotEmpty()) put("token", secret)
        }
        val result = callRaw("task.add", params)
        val gid = (result as? JsonObject)?.get("gid")?.jsonPrimitive?.content ?: ""
        return gid
    }

    suspend fun addMagnet(magnet: String, dir: String, awaitSelection: Boolean = false): String {
        val params = buildJsonObject {
            put("magnet", JsonPrimitive(magnet))
            put("dir", dir)
            if (awaitSelection) put("bt-file-selection", "true")
            if (secret.isNotEmpty()) put("token", secret)
        }
        val result = callRaw("task.add", params)
        val gid = (result as? JsonObject)?.get("gid")?.jsonPrimitive?.content ?: ""
        return gid
    }

    suspend fun addTorrent(torrentBase64: String, dir: String, awaitSelection: Boolean = false): String {
        val params = buildJsonObject {
            put("torrent", JsonPrimitive(torrentBase64))
            put("dir", dir)
            if (awaitSelection) put("bt-file-selection", "true")
            if (secret.isNotEmpty()) put("token", secret)
        }
        val result = callRaw("task.add", params)
        val gid = (result as? JsonObject)?.get("gid")?.jsonPrimitive?.content ?: ""
        return gid
    }

    // ─── 任务级选项（单任务限速 / select-file 文件选择等） ───

    /** 读取任务当前选项（键值均为字符串，如 max-download-limit = "1M"） */
    suspend fun getTaskOption(gid: String): Map<String, String> {
        val result = callRaw("task.getOption", buildJsonObject {
            put("gid", gid)
            if (secret.isNotEmpty()) put("token", secret)
        })
        val obj = result as? JsonObject ?: return emptyMap()
        return obj.mapValues { (_, v) -> (v as? JsonPrimitive)?.content ?: v.toString() }
    }

    /**
     * 修改任务级选项（运行时热生效）：
     * - max-download-limit / max-upload-limit：单任务限速（"1M"/"500K"/字节数，空 = 跟随全局）
     * - select-file：BT 文件选择热更新（1 起算的逗号分隔序号）
     */
    suspend fun changeTaskOption(gid: String, options: Map<String, JsonElement>): Boolean {
        val params = buildJsonObject {
            put("gid", gid)
            options.forEach { (k, v) -> put(k, v) }
            if (secret.isNotEmpty()) put("token", secret)
        }
        val result = callRaw("task.changeOption", params)
        return result.toString().contains("\"ok\":true")
    }

    /** 封禁 BT 节点 IP：durationSec 秒后自动解封；<=0 表示永久 */
    suspend fun banPeer(gid: String, ip: String, durationSec: Long = -1): Boolean {
        val result = callRaw("task.banPeer", buildJsonObject {
            put("gid", gid)
            put("ip", ip)
            put("duration", durationSec)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    /** 解除节点 IP 封禁 */
    suspend fun unbanPeer(gid: String, ip: String): Boolean {
        val result = callRaw("task.unbanPeer", buildJsonObject {
            put("gid", gid)
            put("ip", ip)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    /** 为 BT 任务追加 tracker（立即 announce） */
    suspend fun addTrackers(gid: String, trackers: List<String>): Boolean {
        val result = callRaw("task.addTrackers", buildJsonObject {
            put("gid", gid)
            put("trackers", JsonArray(trackers.map { JsonPrimitive(it) }))
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun tellStatus(gid: String): TaskInfo = call("task.tell", buildJsonObject {
        put("gid", gid)
        if (secret.isNotEmpty()) put("token", secret)
    }, serializer = TaskInfo.serializer())

    suspend fun listTasks(scope: String = "all"): List<TaskInfo> = call("task.list", buildJsonObject {
        put("scope", scope)
        if (this@EngineRpcClient.secret.isNotEmpty()) put("token", this@EngineRpcClient.secret)
    }, serializer = kotlinx.serialization.builtins.ListSerializer(TaskInfo.serializer()))

    suspend fun pauseTask(gid: String): Boolean {
        val result = callRaw("task.pause", buildJsonObject {
            put("gid", gid)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun resumeTask(gid: String): Boolean {
        val result = callRaw("task.resume", buildJsonObject {
            put("gid", gid)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun removeTask(gid: String, deleteFiles: Boolean = false): Boolean {
        val result = callRaw("task.remove", buildJsonObject {
            put("gid", gid)
            if (deleteFiles) put("deleteFiles", true)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun purgeResults(): Boolean {
        val result = callRaw("task.purgeResults", buildJsonObject {
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun getFiles(gid: String): List<TaskFile> = call("task.getFiles", buildJsonObject {
        put("gid", gid)
        if (secret.isNotEmpty()) put("token", secret)
    }, serializer = kotlinx.serialization.builtins.ListSerializer(TaskFile.serializer()))

    suspend fun getPeers(gid: String): List<Peer> = call("task.getPeers", buildJsonObject {
        put("gid", gid)
        if (secret.isNotEmpty()) put("token", secret)
    }, serializer = kotlinx.serialization.builtins.ListSerializer(Peer.serializer()))

    suspend fun getTrackers(gid: String): List<Tracker> = call("task.getTrackers", buildJsonObject {
        put("gid", gid)
        if (secret.isNotEmpty()) put("token", secret)
    }, serializer = kotlinx.serialization.builtins.ListSerializer(Tracker.serializer()))

    suspend fun saveSession(): Boolean {
        val result = callRaw("engine.saveSession", buildJsonObject {
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun shutdown(): Boolean {
        val result = callRaw("engine.shutdown", buildJsonObject {
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    // ─── BT tracker 订阅 ───

    suspend fun getSubscriptions(): List<BtSubscription> = call(
        "engine.getSubscriptions",
        serializer = kotlinx.serialization.builtins.ListSerializer(BtSubscription.serializer())
    )

    /** 添加订阅源；引擎会立即拉取一次，返回创建的订阅（含首次刷新结果） */
    suspend fun addSubscription(name: String, url: String): BtSubscription? {
        val result = callRaw("engine.addSubscription", buildJsonObject {
            put("name", name)
            put("url", url)
            put("enabled", true)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return try {
            json.decodeFromString(BtSubscription.serializer(), result.toString())
        } catch (_: Exception) {
            null
        }
    }

    suspend fun removeSubscription(id: String): Boolean {
        val result = callRaw("engine.removeSubscription", buildJsonObject {
            put("id", id)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    suspend fun toggleSubscription(id: String): Boolean {
        val result = callRaw("engine.toggleSubscription", buildJsonObject {
            put("id", id)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }

    /** 手动刷新单个订阅源，返回本次获取的 tracker 数量（失败返回 null） */
    suspend fun refreshSubscription(id: String): Int? {
        val result = callRaw("engine.refreshSubscription", buildJsonObject {
            put("id", id)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return (result as? JsonObject)?.get("count")?.jsonPrimitive?.content?.toIntOrNull()
    }

    /** 刷新全部订阅源，返回总获取数量 */
    suspend fun refreshAllSubscriptions(): Int? {
        val result = callRaw("engine.refreshAllSubscriptions", buildJsonObject {
            if (secret.isNotEmpty()) put("token", secret)
        })
        return (result as? JsonObject)?.get("count")?.jsonPrimitive?.content?.toIntOrNull()
    }

    suspend fun getAutoUpdateTrackers(): Boolean {
        val result = callRaw("engine.getAutoUpdateTrackers", buildJsonObject {
            if (secret.isNotEmpty()) put("token", secret)
        })
        return (result as? JsonObject)?.get("enabled")?.jsonPrimitive?.content?.toBooleanStrictOrNull() ?: false
    }

    suspend fun setAutoUpdateTrackers(enabled: Boolean): Boolean {
        val result = callRaw("engine.setAutoUpdateTrackers", buildJsonObject {
            put("enabled", enabled)
            if (secret.isNotEmpty()) put("token", secret)
        })
        return result.toString().contains("\"ok\":true")
    }
}

/**
 * RPC 异常
 */
class RpcException(val code: Int, message: String) : Exception(message)
