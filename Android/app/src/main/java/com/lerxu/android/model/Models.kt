package com.lerxu.android.model

import kotlinx.serialization.*
import kotlinx.serialization.json.*

/**
 * XferRust 引擎 JSON-RPC 2.0 数据模型
 *
 * 引擎同时支持原生协议（task.* / engine.* / events.*）
 * 和 aria2 兼容协议（aria2.* / system.*）。
 * 这里使用原生协议，所有数值字段均为真实 JSON 数值类型。
 */

// ─── 任务状态 ───

@Serializable
enum class TaskStatus {
    @SerialName("waiting") WAITING,
    @SerialName("active") ACTIVE,
    @SerialName("paused") PAUSED,
    @SerialName("complete") COMPLETE,
    @SerialName("error") ERROR,
    @SerialName("removed") REMOVED;

    companion object {
        fun fromString(s: String?): TaskStatus =
            entries.find { it.name.lowercase() == s?.lowercase() } ?: WAITING
    }
}

@Serializable
data class TaskFile(
    @SerialName("index") val index: Int = 0,
    @SerialName("path") val path: String = "",
    @SerialName("length") val length: Long = 0,
    @SerialName("completedLength") val completedLength: Long = 0,
    @SerialName("selected") val selected: Boolean = true,
    @SerialName("uris") val uris: List<FileUri> = emptyList()
)

@Serializable
data class FileUri(
    @SerialName("uri") val uri: String = "",
    @SerialName("status") val status: String = ""
)

/**
 * BT 节点（task.getPeers 返回，字段与引擎 PeerInfo 对齐）。
 * connected=false 表示本会话已断开（保留最后快照）。
 */
@Serializable
data class Peer(
    @SerialName("addr") val addr: String = "",
    @SerialName("peerId") val peerId: String? = null,
    @SerialName("client") val client: String = "",
    @SerialName("source") val source: String = "",
    @SerialName("choked") val choked: Boolean = false,
    @SerialName("interested") val interested: Boolean = false,
    @SerialName("seed") val seed: Boolean = false,
    @SerialName("downloaded") val downloaded: Long = 0,
    @SerialName("uploaded") val uploaded: Long = 0,
    @SerialName("connected") val connected: Boolean = true,
    @SerialName("encrypted") val encrypted: Boolean = false,
    @SerialName("protocol") val protocol: String = "",
    @SerialName("connectedSecs") val connectedSecs: Long = 0,
    /** 对端下载进度 0-100（磁力元数据未就绪/位图未知时为 null） */
    @SerialName("progress") val progress: Double? = null,
    /** 对端 have 位图（aria2 兼容 hex，节点详情/迷你分片图用） */
    @SerialName("bitfield") val bitfield: String = ""
)

/**
 * BT tracker（task.getTrackers 返回，带 per-tracker announce 状态）。
 */
@Serializable
data class Tracker(
    @SerialName("url") val url: String = "",
    @SerialName("protocol") val protocol: String = "",
    /** working / not-working / waiting */
    @SerialName("status") val status: String = "",
    @SerialName("seeders") val seeders: Int = 0,
    @SerialName("leechers") val leechers: Int = 0,
    @SerialName("peers") val peers: Int = 0,
    @SerialName("lastAnnounceTime") val lastAnnounceTime: Long = 0,
    @SerialName("nextAnnounceTime") val nextAnnounceTime: Long = 0,
    @SerialName("error") val error: String? = null
)

@Serializable
data class TaskInfo(
    @SerialName("gid") val gid: String = "",
    @SerialName("status") val status: String = "waiting",
    @SerialName("totalLength") val totalLength: Long = 0,
    @SerialName("completedLength") val completedLength: Long = 0,
    @SerialName("uploadLength") val uploadLength: Long = 0,
    @SerialName("downloadSpeed") val downloadSpeed: Long = 0,
    @SerialName("uploadSpeed") val uploadSpeed: Long = 0,
    @SerialName("bitfield") val bitfield: String = "",
    @SerialName("partialBitfield") val partialBitfield: String = "",
    /** 需下载片位图（BT 部分选择文件时非空）：全 0 位 = 未勾选文件的分片，
     *  永远不下载，界面与「未下载」区分显示 */
    @SerialName("wantedBitfield") val wantedBitfield: String = "",
    @SerialName("connections") val connections: Int = 0,
    @SerialName("errorCode") val errorCode: Int = 0,
    @SerialName("errorMessage") val errorMessage: String = "",
    @SerialName("elapsedMs") val elapsedMs: Long = 0,
    @SerialName("dir") val dir: String = "",
    @SerialName("files") val files: List<TaskFile> = emptyList(),
    @SerialName("bittorrent") val bittorrent: BittorrentInfo? = null,
    @SerialName("numSeeders") val numSeeders: Int = 0,
    @SerialName("seeder") val seeder: Boolean = false,
    @SerialName("numPieces") val numPieces: Int = 0,
    @SerialName("pieceLength") val pieceLength: Long = 0,
    /** 磁力/种子添加后等待文件勾选（元数据就绪已自动暂停） */
    @SerialName("awaitingSelection") val awaitingSelection: Boolean = false,
    /** 任务平均速度（活动阶段累计，字节/秒；做种阶段不稀释） */
    @SerialName("averageSpeed") val averageSpeed: Long = 0,
    /** BT infoHash（hex）；非 BT 任务为 null */
    @SerialName("infoHash") val infoHash: String? = null,
    /** 做种分享率（uploaded/total） */
    @SerialName("seedRatio") val seedRatio: Double = 0.0,
    // 完成/错误时间戳（毫秒）：引擎在会话恢复时提供真实值；0 表示未知
    val finishedAt: Long = 0
) {
    val taskStatus: TaskStatus get() = TaskStatus.fromString(status)

    /** 展示用状态：awaitingSelection（元数据就绪待勾选文件）优先于底层 paused */
    val displayStatus: String get() = if (awaitingSelection) "awaiting_selection" else status

    /** 已完成比例（0..1）：夹取上界，引擎两字段口径若漂移（曾出现
     *  completedLength 略超 totalLength）也不会让进度条越界 */
    val progress: Float get() = if (totalLength > 0) {
        (completedLength.toFloat() / totalLength.toFloat()).coerceIn(0f, 1f)
    } else 0f

    val percent: Int get() = (progress * 100).toInt()

    /** 打开文件用：首文件完整路径（相对路径时基于 dir 拼接） */
    val filePath: String get() {
        val p = files.firstOrNull()?.path.orEmpty()
        if (p.isEmpty()) return ""
        return if (java.io.File(p).isAbsolute) p
        else if (dir.isEmpty()) p
        else java.io.File(dir, p).absolutePath
    }

    /**
     * 任务显示名称，解析顺序与桌面端 getTaskName 对齐：
     * BT 种子名 -> 首文件路径 -> 首文件 URI 解码 -> gid
     *
     * 但**非 BT（HTTP / 直链）以首文件路径为准**：引擎会给 HTTP 任务也带一份
     * `bittorrent.info.name`（按地址推出来的），那份名字是**我们传 `out` 之前的原名**；
     * 拿它当显示名，就会出现"列表里是原始文件名、详情里是视频名"这种前后不一致
     *（用户点名的现象 —— 详情读的是 files[].path，列表读的是这里）。
     * BT 反过来：首文件路径是"种子名/文件.mkv"，显示名该用种子名。
     */
    val fileName: String get() {
        val file = files.firstOrNull()
        val base = file?.path.orEmpty()
            .substringAfterLast('/').substringAfterLast('\\')
            .takeIf { it.isNotBlank() }
        if (!isBT && base != null) return base
        bittorrent?.info?.name?.takeIf { it.isNotBlank() }?.let { return it }
        if (base != null) return base
        file?.uris?.firstOrNull()?.uri
            ?.takeIf { it.isNotBlank() }
            ?.let { uri -> uriToFileName(uri).takeIf { it.isNotBlank() }?.let { return it } }
        return gid
    }

    val isBT: Boolean get() = files.isNotEmpty() && files.any { it.uris.isEmpty() }

    val remainingBytes: Long get() = (totalLength - completedLength).coerceAtLeast(0)

    val remainingSeconds: Long get() = if (downloadSpeed > 0) {
        remainingBytes / downloadSpeed
    } else -1

    private fun uriToFileName(uri: String): String {
        if (uri.startsWith("magnet:", ignoreCase = true)) return ""
        val cleaned = uri.substringBefore('#').substringBefore('?')
        val decoded = try {
            java.net.URLDecoder.decode(cleaned, "UTF-8")
        } catch (e: Exception) {
            cleaned
        }
        return decoded.trimEnd('/').substringAfterLast('/').substringAfterLast('\\')
    }
}

@Serializable
data class BittorrentInfo(
    @SerialName("info") val info: BittorrentInfoName? = null
)

@Serializable
data class BittorrentInfoName(
    @SerialName("name") val name: String = ""
)

@Serializable
data class GlobalStat(
    @SerialName("downloadSpeed") val downloadSpeed: Long = 0,
    @SerialName("uploadSpeed") val uploadSpeed: Long = 0,
    @SerialName("numActive") val numActive: Int = 0,
    @SerialName("numWaiting") val numWaiting: Int = 0,
    @SerialName("numStopped") val numStopped: Int = 0,
    @SerialName("numStoppedTotal") val numStoppedTotal: Int = 0
)

@Serializable
data class EngineVersion(
    @SerialName("name") val name: String = "",
    @SerialName("version") val version: String = "",
    @SerialName("features") val features: List<String> = emptyList()
)

@Serializable
data class EngineOptions(
    @SerialName("max-concurrent-downloads") val maxConcurrentDownloads: Int = 5,
    @SerialName("dir") val dir: String = "",
    @SerialName("split") val split: Int = 32,
    @SerialName("max-connection-per-server") val maxConnectionPerServer: Int = 32,
    @SerialName("min-split-size") val minSplitSize: String = "1M",
    @SerialName("bt-max-peers") val btMaxPeers: Int = 100,
    @SerialName("bt-adaptive") val btAdaptive: Boolean = true,
    @SerialName("max-overall-download-limit") val maxOverallDownloadLimit: String = "0",
    @SerialName("max-overall-upload-limit") val maxOverallUploadLimit: String = "0",
    // 引擎返回 adaptive/force/plain；"auto" 仅在键缺失时兜底
    @SerialName("bt-encryption") val btEncryption: String = "auto",
    @SerialName("bt-protocol") val btProtocol: String = "tcp+utp",
    @SerialName("bt-seed-mode") val btSeedMode: Boolean = false,
    @SerialName("bt-seed-ratio") val btSeedRatio: Double = 0.0,
    // 0 = 系统随机分配端口
    @SerialName("bt-listen-port") val btListenPort: Int = 0,
    @SerialName("dht-listen-port") val dhtListenPort: Int = 0,
    // 本地节点发现（LSD）与 UPnP/NAT-PMP 端口映射开关
    @SerialName("bt-enable-lpd") val btEnableLpd: Boolean = true,
    @SerialName("bt-port-mapping") val btPortMapping: Boolean = true
)

/** BT tracker 订阅源（engine.getSubscriptions 返回，字段与引擎 TrackerSubscription 对齐） */
@Serializable
data class BtSubscription(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("url") val url: String = "",
    @SerialName("enabled") val enabled: Boolean = true,
    @SerialName("last_updated") val lastUpdated: Long = 0,
    @SerialName("last_count") val lastCount: Int = 0,
    @SerialName("last_error") val lastError: String = ""
)

// ─── 事件 ───

@Serializable
data class EngineEvent(
    @SerialName("method") val method: String = "",
    @SerialName("params") val params: JsonObject = JsonObject(emptyMap())
) {
    val gid: String? get() = (params["gid"] as? JsonPrimitive)?.content
    val status: String? get() = (params["status"] as? JsonPrimitive)?.content
    val completedLength: Long? get() = (params["completedLength"] as? JsonPrimitive)?.content?.toLongOrNull()
    val totalLength: Long? get() = (params["totalLength"] as? JsonPrimitive)?.content?.toLongOrNull()
    val downloadSpeed: Long? get() = (params["downloadSpeed"] as? JsonPrimitive)?.content?.toLongOrNull()
    val errorCode: Int? get() = (params["errorCode"] as? JsonPrimitive)?.content?.toIntOrNull()
    val errorMessage: String? get() = (params["errorMessage"] as? JsonPrimitive)?.content
}

// ─── 添加任务结果 ───

@Serializable
data class AddTaskResult(
    @SerialName("gid") val gid: String = ""
)
