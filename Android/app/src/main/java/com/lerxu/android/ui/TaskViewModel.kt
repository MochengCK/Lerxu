package com.lerxu.android.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lerxu.android.data.EngineRepository
import com.lerxu.android.model.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * 主 ViewModel —— 连接 Repository 与 Compose UI。
 *
 * 通过 StateFlow 暴露 UI 状态，UI 层观察变化自动刷新。
 */
class TaskViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = EngineRepository.getInstance(app)

    val uiState: StateFlow<EngineRepository.UiState> = repository.uiState

    // ─── 任务操作 ───

    fun start() {
        repository.start()
    }

    fun stop() {
        repository.stop()
    }

    fun clearErrorAndRetry() {
        repository.clearErrorAndRetry()
    }

    fun setScope(scope: String) {
        repository.setScope(scope)
    }

    fun refreshTasks() {
        viewModelScope.launch { repository.refreshTasks() }
    }

    fun refreshGlobalStat() {
        viewModelScope.launch { repository.refreshGlobalStat() }
    }

    /** 界面可见性：不可见时把速度轮询放宽到 3s（与桌面端一致的省电策略） */
    fun setUiVisible(visible: Boolean) {
        repository.setUiVisible(visible)
    }

    fun addUriTask(uri: String, dir: String, out: String = "") {
        viewModelScope.launch {
            repository.addUriTask(uri, dir, out)
        }
    }

    /** 磁力添加（可带文件勾选流程：元数据就绪后自动暂停等待选择） */
    fun addMagnetTask(magnet: String, dir: String, awaitSelection: Boolean = false) {
        viewModelScope.launch {
            repository.addMagnetTask(magnet, dir, awaitSelection)
        }
    }

    /** 种子文件添加（可带文件勾选流程） */
    fun addTorrentTask(path: String, dir: String, awaitSelection: Boolean = false) {
        viewModelScope.launch {
            repository.addTorrentTask(path, dir, awaitSelection)
        }
    }

    // ─── 任务级选项（单任务限速 / select-file 文件选择 / 节点封禁） ───

    /** 读取任务当前选项（如 max-download-limit），失败返回空 map */
    suspend fun fetchTaskOption(gid: String): Map<String, String> = try {
        repository.getRpcClient().getTaskOption(gid)
    } catch (_: Exception) {
        emptyMap()
    }

    /** 修改任务级选项（max-download-limit / max-upload-limit / select-file），运行时热生效 */
    suspend fun changeTaskOption(gid: String, options: Map<String, kotlinx.serialization.json.JsonElement>): Boolean = try {
        repository.getRpcClient().changeTaskOption(gid, options)
    } catch (_: Exception) {
        false
    }

    /** 封禁 BT 节点 IP（durationSec <= 0 表示永久） */
    suspend fun banPeer(gid: String, ip: String, durationSec: Long = -1): Boolean = try {
        repository.getRpcClient().banPeer(gid, ip, durationSec)
    } catch (_: Exception) {
        false
    }

    /** 解除节点 IP 封禁 */
    suspend fun unbanPeer(gid: String, ip: String): Boolean = try {
        repository.getRpcClient().unbanPeer(gid, ip)
    } catch (_: Exception) {
        false
    }

    /** 为 BT 任务追加 tracker */
    suspend fun addTrackers(gid: String, trackers: List<String>): Boolean = try {
        repository.getRpcClient().addTrackers(gid, trackers)
    } catch (_: Exception) {
        false
    }

    /** 直接调 RPC（详情页轮询 peers/trackers 用） */
    suspend fun fetchPeers(gid: String): List<Peer> = try {
        repository.getRpcClient().getPeers(gid)
    } catch (_: Exception) {
        emptyList()
    }

    suspend fun fetchTrackers(gid: String): List<Tracker> = try {
        repository.getRpcClient().getTrackers(gid)
    } catch (_: Exception) {
        emptyList()
    }

    suspend fun fetchTaskDetail(gid: String): TaskInfo? = try {
        repository.getRpcClient().tellStatus(gid)
    } catch (_: Exception) {
        null
    }

    fun pauseTask(gid: String) {
        viewModelScope.launch { repository.pauseTask(gid) }
    }

    fun resumeTask(gid: String) {
        viewModelScope.launch { repository.resumeTask(gid) }
    }

    fun removeTask(gid: String, deleteFiles: Boolean = false) {
        viewModelScope.launch { repository.removeTask(gid, deleteFiles) }
    }

    fun purgeResults() {
        viewModelScope.launch { repository.purgeResults() }
    }

    /**
     * 设置同时下载任务数：持久化到偏好（下次启动生效），
     * 并通过 engine.changeOptions 让运行中的引擎立即生效。
     */
    fun setMaxConcurrent(count: Int) {
        val app = getApplication<Application>()
        app.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            .edit().putInt("max_concurrent", count).apply()
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("max-concurrent-downloads" to JsonPrimitive(count)))
        }
    }

    // ─── 引擎全局选项（修改经 changeOptions 立即生效；引擎会把设置落盘到会话，重启后自动恢复） ───

    /** 读取引擎当前全局选项（引擎未连接时返回 null，UI 使用默认值） */
    suspend fun fetchEngineOptions(): EngineOptions? = try {
        repository.getRpcClient().getOptions()
    } catch (_: Exception) {
        null
    }

    /** 单任务连接数（split）：下载时生效；同时持久化偏好供引擎启动时作为 CLI 默认 */
    fun setSplitConnections(count: Int) {
        persistEnginePref("engine_split", count)
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("split" to JsonPrimitive(count)))
        }
    }

    /** 单服务器连接数（max-connection-per-server）：实际连接数取与 split 的较小值 */
    fun setMaxConnPerServer(count: Int) {
        persistEnginePref("engine_max_conn_per_server", count)
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("max-connection-per-server" to JsonPrimitive(count)))
        }
    }

    /** 全局下载限速（字节/秒，0 = 不限速）：立即生效 */
    fun setOverallDownloadLimit(bytesPerSec: Long) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("max-overall-download-limit" to JsonPrimitive(bytesPerSec)))
        }
    }

    /** 全局上传限速（字节/秒，0 = 不限速）：立即生效 */
    fun setOverallUploadLimit(bytesPerSec: Long) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("max-overall-upload-limit" to JsonPrimitive(bytesPerSec)))
        }
    }

    /** BT 最大节点数（bt-max-peers）：下载时生效；同时持久化偏好供引擎启动时作为 CLI 默认 */
    fun setBtMaxPeers(count: Int) {
        persistEnginePref("engine_bt_max_peers", count)
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-max-peers" to JsonPrimitive(count)))
        }
    }

    /** BT 加密模式（bt-encryption：adaptive/force/plain）：立即下发活动 BT 引擎 */
    fun setBtEncryption(mode: String) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-encryption" to JsonPrimitive(mode)))
        }
    }

    /** BT 传输协议（bt-protocol：tcp+utp/tcp/utp）：立即下发活动 BT 引擎 */
    fun setBtProtocol(protocol: String) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-protocol" to JsonPrimitive(protocol)))
        }
    }

    /** BT 智能连接调度（bt-adaptive）：按吞吐边际收益动态增减连接 */
    fun setBtAdaptive(on: Boolean) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-adaptive" to JsonPrimitive(on)))
        }
    }

    /** 完成后自动做种（bt-seed-mode）：BT 任务下载完成后转入做种 */
    fun setBtSeedMode(on: Boolean) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-seed-mode" to JsonPrimitive(on)))
        }
    }

    /** 停止做种分享率（bt-seed-ratio，0 = 不限/持续做种到手动停止） */
    fun setBtSeedRatio(ratio: Double) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-seed-ratio" to JsonPrimitive(ratio)))
        }
    }

    /** BT 监听端口（bt-listen-port，0 = 随机端口）：新建 BT 任务时生效，端口被占自动回退 */
    fun setBtListenPort(port: Int) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-listen-port" to JsonPrimitive(port)))
        }
    }

    /** DHT 监听端口（dht-listen-port，0 = 随机端口）：新建 BT 任务时生效，端口被占自动回退 */
    fun setDhtListenPort(port: Int) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("dht-listen-port" to JsonPrimitive(port)))
        }
    }

    /** 本地节点发现（bt-enable-lpd，LSD 组播）：新建 BT 任务时生效 */
    fun setBtEnableLpd(on: Boolean) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-enable-lpd" to JsonPrimitive(on)))
        }
    }

    /** 端口映射（bt-port-mapping，UPnP/NAT-PMP）：新建 BT 任务时生效 */
    fun setBtPortMapping(on: Boolean) {
        viewModelScope.launch {
            repository.changeEngineOptions(mapOf("bt-port-mapping" to JsonPrimitive(on)))
        }
    }

    // ─── BT tracker 订阅源管理 ───

    suspend fun fetchSubscriptions(): List<BtSubscription> = try {
        repository.getRpcClient().getSubscriptions()
    } catch (_: Exception) {
        emptyList()
    }

    /** 添加订阅源；引擎会立即拉取一次。返回 null 表示引擎未连接 */
    suspend fun addSubscription(name: String, url: String): BtSubscription? = try {
        repository.getRpcClient().addSubscription(name, url)
    } catch (_: Exception) {
        null
    }

    suspend fun removeSubscription(id: String) {
        try { repository.getRpcClient().removeSubscription(id) } catch (_: Exception) {}
    }

    suspend fun toggleSubscription(id: String) {
        try { repository.getRpcClient().toggleSubscription(id) } catch (_: Exception) {}
    }

    /** 刷新单个订阅源，返回获取的 tracker 数量 */
    suspend fun refreshSubscription(id: String): Int? = try {
        repository.getRpcClient().refreshSubscription(id)
    } catch (_: Exception) {
        null
    }

    /** 刷新全部订阅源，返回总数量 */
    suspend fun refreshAllSubscriptions(): Int? = try {
        repository.getRpcClient().refreshAllSubscriptions()
    } catch (_: Exception) {
        null
    }

    suspend fun fetchAutoUpdateTrackers(): Boolean = try {
        repository.getRpcClient().getAutoUpdateTrackers()
    } catch (_: Exception) {
        true
    }

    suspend fun setAutoUpdateTrackers(enabled: Boolean) {
        try { repository.getRpcClient().setAutoUpdateTrackers(enabled) } catch (_: Exception) {}
    }

    fun getTaskByGid(gid: String): TaskInfo? = repository.getTaskByGid(gid)

    fun getRpcClient() = repository.getRpcClient()

    /** 引擎启动 CLI 默认值用的偏好（EngineManager 启动时读取，见 engine_* 键） */
    private fun persistEnginePref(key: String, value: Int) {
        getApplication<Application>().getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            .edit().putInt(key, value).apply()
    }
}
