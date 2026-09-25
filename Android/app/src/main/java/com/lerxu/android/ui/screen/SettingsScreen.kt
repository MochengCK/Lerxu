package com.lerxu.android.ui.screen

import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BrightnessAuto
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchColors
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.lerxu.android.BuildConfig
import com.lerxu.android.R
import com.lerxu.android.browser.SearchEngineDetector
import com.lerxu.android.browser.SearchEnginePick
import com.lerxu.android.browser.SearchEngines
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.model.BtSubscription
import com.lerxu.android.model.EngineVersion
import com.lerxu.android.ui.MainActivity
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.update.ReleaseChannel
import com.lerxu.android.update.UpdateManager
import kotlinx.coroutines.launch

// ── 设置项取值范围与限速预设 ──

private val SPLIT_RANGE = 1..32
private val PER_SERVER_RANGE = 1..32
private val BT_PEERS_RANGE = 10..200

/** BT 加密模式取值（引擎侧校验：adaptive/force/plain） */
private val ENCRYPTION_VALUES = listOf("adaptive", "force", "plain")

/** BT 传输协议取值（引擎侧校验：tcp+utp/tcp/utp） */
private val PROTOCOL_VALUES = listOf("tcp+utp", "tcp", "utp")

/** 停止做种分享率预设（0 = 不限，持续做种到手动停止） */
private val SEED_RATIOS = listOf(0.0, 0.5, 1.0, 2.0, 3.0)

/** 把引擎返回的限速字节值映射到档位：预设命中则选中，否则落到"自定义"槽 */
private fun applyLimitIndex(bytes: Long, setIndex: (Int) -> Unit, setCustom: (Long?) -> Unit) {
    val presetIndex = DL_LIMIT_BYTES.indexOfFirst { it == bytes }
    if (presetIndex >= 0) {
        setIndex(presetIndex)
        setCustom(null)
    } else {
        setIndex(DL_LIMIT_BYTES.size)
        setCustom(bytes)
    }
}

/**
 * 解析手动输入的限速值：支持 K/M 后缀（如 500K、2M、1.5M），
 * 无后缀默认 KB/s；0 为不限速。返回字节/秒，格式非法返回 null。
 */
private fun parseLimitInput(raw: String): Long? {
    val t = raw.trim().lowercase().removeSuffix("bps").removeSuffix("b")
    val m = Regex("^([0-9]+(?:\\.[0-9]+)?)\\s*([km]?)$").find(t) ?: return null
    val n = m.groupValues[1].toDoubleOrNull() ?: return null
    val mult = when (m.groupValues[2]) {
        "m" -> 1_048_576.0
        else -> 1_024.0
    }
    return (n * mult).toLong().coerceIn(0L, 2_000_000_000L)
}

/** 全局下载限速预设（引擎要求字节/秒的非负整数，0 = 不限速） */
private data class DlLimitPreset(val label: String, val bytesPerSec: Long)

/** 限速预设的字节值（不含 UI 文案，供非 Composable 上下文使用）；末尾为"自定义"槽 */
private val DL_LIMIT_BYTES = listOf(0L, 512_000L, 1_048_576L, 5_242_880L, 10_485_760L, 52_428_800L)

@Composable
private fun dlLimitPresets(): List<DlLimitPreset> = listOf(
    DlLimitPreset(stringResource(R.string.dl_unlimited), 0L),
    DlLimitPreset("500 KB/s", 512_000L),
    DlLimitPreset("1 MB/s", 1_048_576L),
    DlLimitPreset("5 MB/s", 5_242_880L),
    DlLimitPreset("10 MB/s", 10_485_760L),
    DlLimitPreset("50 MB/s", 52_428_800L)
)

/**
 * 设置页 —— 保存目录、下载并发、任务记录维护与关于。
 * 与主界面统一：surfaceContainerLow 分区卡片 + primary 点缀。
 */
@Composable
fun SettingsScreen(
    viewModel: TaskViewModel,
    engineVersion: EngineVersion?,
    themePref: String = "system",
    onThemeChange: (String) -> Unit = {},
    searchEngineKey: String = "bing",
    onSearchEngineChange: (String) -> Unit = {},
    adBlock: Boolean = true,
    onAdBlockChange: (Boolean) -> Unit = {}
) {
    val context = LocalContext.current
    val colorScheme = MaterialTheme.colorScheme
    val clipboard = LocalClipboardManager.current
    val scrollState = rememberScrollState()

    val prefs = remember { context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE) }
    var maxConcurrent by remember {
        mutableIntStateOf(prefs.getInt("max_concurrent", EngineManager.DEFAULT_MAX_CONCURRENT))
    }
    val downloadDir = remember { EngineManager.getDownloadDirSafe() }

    // ── 引擎实时选项：进入设置时读取（引擎会把改动落盘到会话，重启后自动恢复） ──
    // 默认值与 EngineManager 启动参数保持一致：split/per-server 32、BT 节点 100
    var split by remember { mutableIntStateOf(32) }
    var maxConnPerServer by remember { mutableIntStateOf(32) }
    var btMaxPeers by remember { mutableIntStateOf(100) }
    var dlLimitIndex by remember { mutableIntStateOf(0) }
    var ulLimitIndex by remember { mutableIntStateOf(0) }
    // 自定义限速：index == DL_LIMIT_BYTES.size 表示停在"自定义"档，customBytes 存实际值
    var dlCustomBytes by remember { mutableStateOf<Long?>(null) }
    var ulCustomBytes by remember { mutableStateOf<Long?>(null) }
    var showDlLimitDialog by remember { mutableStateOf(false) }
    var showUlLimitDialog by remember { mutableStateOf(false) }
    var btEncryptionIndex by remember { mutableIntStateOf(0) }
    var btProtocolIndex by remember { mutableIntStateOf(0) }
    var btAdaptive by remember { mutableStateOf(true) }
    var btSeedMode by remember { mutableStateOf(false) }
    var btSeedRatioIndex by remember { mutableIntStateOf(0) }
    // 监听端口：0 = 随机分配；对话框按需弹出
    var btListenPort by remember { mutableIntStateOf(0) }
    var dhtListenPort by remember { mutableIntStateOf(0) }
    var showBtPortDialog by remember { mutableStateOf(false) }
    var showDhtPortDialog by remember { mutableStateOf(false) }
    var btEnableLpd by remember { mutableStateOf(true) }
    var btPortMapping by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        viewModel.fetchEngineOptions()?.let { opts ->
            split = opts.split.coerceIn(SPLIT_RANGE.first, SPLIT_RANGE.last)
            maxConnPerServer = opts.maxConnectionPerServer.coerceIn(PER_SERVER_RANGE.first, PER_SERVER_RANGE.last)
            btMaxPeers = opts.btMaxPeers.coerceIn(BT_PEERS_RANGE.first, BT_PEERS_RANGE.last)
            val dl = opts.maxOverallDownloadLimit.toLongOrNull() ?: 0L
            applyLimitIndex(
                bytes = dl,
                setIndex = { dlLimitIndex = it },
                setCustom = { dlCustomBytes = it }
            )
            val ul = opts.maxOverallUploadLimit.toLongOrNull() ?: 0L
            applyLimitIndex(
                bytes = ul,
                setIndex = { ulLimitIndex = it },
                setCustom = { ulCustomBytes = it }
            )
            btEncryptionIndex = ENCRYPTION_VALUES.indexOf(opts.btEncryption)
                .takeIf { it >= 0 } ?: 0
            btProtocolIndex = PROTOCOL_VALUES.indexOf(opts.btProtocol)
                .takeIf { it >= 0 } ?: 0
            btAdaptive = opts.btAdaptive
            btSeedMode = opts.btSeedMode
            btSeedRatioIndex = SEED_RATIOS.indexOfFirst { it == opts.btSeedRatio }
                .takeIf { it >= 0 } ?: 0
            btListenPort = opts.btListenPort.coerceIn(0, 65535)
            dhtListenPort = opts.dhtListenPort.coerceIn(0, 65535)
            btEnableLpd = opts.btEnableLpd
            btPortMapping = opts.btPortMapping
        }
    }

    // ── 清除任务记录：二次确认 ──
    var showPurgeConfirm by remember { mutableStateOf(false) }

    // ── 语言切换 ──
    var showLanguageDialog by remember { mutableStateOf(false) }
    val languagePref = remember {
        prefs.getString(MainActivity.KEY_LANGUAGE, "") ?: ""
    }

    // ── 应用更新检测 ──
    var autoUpdateCheck by remember {
        mutableStateOf(prefs.getBoolean("auto_update_check", true))
    }
    var checkingUpdate by remember { mutableStateOf(false) }
    LaunchedEffect(checkingUpdate) {
        if (checkingUpdate) {
            UpdateManager.checkNow(context)
            checkingUpdate = false
        }
    }

    // ── 更新渠道：stable（正式版）/ beta（测试版）/ all（含内测），与桌面端同一套语义 ──
    var updateChannel by remember {
        mutableStateOf(ReleaseChannel.fromKey(prefs.getString(UpdateManager.KEY_CHANNEL, null)))
    }
    var showChannelDialog by remember { mutableStateOf(false) }

    // ── 启动默认入口（引导里选过，这里可改；下次打开 App 生效）──
    var startPage by remember { mutableStateOf(StartPagePrefs.read(context)) }
    var showStartPageDialog by remember { mutableStateOf(false) }

    // ── 主题切换 ──
    var showThemeDialog by remember { mutableStateOf(false) }
    var showSearchEngineDialog by remember { mutableStateOf(false) }
    // 跟随网络自动选择是否仍生效（用户手动选过就不再自动改）
    var enginePinned by remember {
        mutableStateOf(
            prefs.getBoolean(SearchEngineDetector.PREF_PINNED, false)
        )
    }
    val engineScope = rememberCoroutineScope()

    // ── BT tracker 订阅源 ──
    val scope = rememberCoroutineScope()
    var subscriptions by remember { mutableStateOf<List<BtSubscription>>(emptyList()) }
    var autoUpdateTrackers by remember { mutableStateOf(true) }
    var showAddSubscription by remember { mutableStateOf(false) }
    var refreshingAll by remember { mutableStateOf(false) }
    // 移除订阅源：二次确认后再真正删除
    var pendingRemoveSub by remember { mutableStateOf<BtSubscription?>(null) }

    fun reloadSubscriptions() {
        scope.launch { subscriptions = viewModel.fetchSubscriptions() }
    }
    LaunchedEffect(Unit) {
        autoUpdateTrackers = viewModel.fetchAutoUpdateTrackers()
        subscriptions = viewModel.fetchSubscriptions()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(6.dp))

        // ── 下载 ──
        SettingsSection(stringResource(R.string.settings_download)) {
            // 保存目录：点击复制，方便到文件管理器中定位
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        clipboard.setText(AnnotatedString(downloadDir))
                        Toast.makeText(context, context.getString(R.string.copied_save_dir), Toast.LENGTH_SHORT).show()
                    }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.settings_save_dir),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        downloadDir,
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.width(10.dp))
                Icon(
                    Icons.Default.ContentCopy,
                    contentDescription = stringResource(R.string.copy),
                    modifier = Modifier.size(15.dp),
                    tint = colorScheme.onSurfaceVariant
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 同时下载任务数：步进调节，运行中的引擎立即生效
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.max_concurrent),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.max_concurrent_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Stepper(
                    value = maxConcurrent,
                    onValueChange = {
                        maxConcurrent = it
                        prefs.edit().putInt("max_concurrent", it).apply()
                        viewModel.setMaxConcurrent(it)
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 单任务连接数：HTTP 分片参数，下载时生效
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.split_count),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.split_count_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Stepper(
                    value = split,
                    range = SPLIT_RANGE,
                    onValueChange = {
                        split = it
                        viewModel.setSplitConnections(it)
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 单服务器连接数：与单任务连接数取较小值作为 HTTP 实际连接上限
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.per_server_connections),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.per_server_connections_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Stepper(
                    value = maxConnPerServer,
                    range = PER_SERVER_RANGE,
                    onValueChange = {
                        maxConnPerServer = it
                        viewModel.setMaxConnPerServer(it)
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 全局下载限速：预设档位 + 末档"自定义"（点档位数值或选中自定义弹输入框），立即生效
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.dl_limit),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.dl_limit_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                val dlPresets = dlLimitPresets()
                PresetCycler(
                    index = dlLimitIndex,
                    labels = dlPresets.map { it.label } + listOf(
                        dlCustomBytes?.let { formatBytes(it) + "/s" }
                            ?: stringResource(R.string.custom_value)
                    ),
                    onChange = {
                        if (it == DL_LIMIT_BYTES.size) {
                            showDlLimitDialog = true
                        } else {
                            dlLimitIndex = it
                            dlCustomBytes = null
                            viewModel.setOverallDownloadLimit(DL_LIMIT_BYTES[it])
                        }
                    },
                    onEdit = { showDlLimitDialog = true }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 全局上传限速：主要影响 BT 做种上传，立即生效
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.ul_limit),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.ul_limit_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                val ulPresets = dlLimitPresets()
                PresetCycler(
                    index = ulLimitIndex,
                    labels = ulPresets.map { it.label } + listOf(
                        ulCustomBytes?.let { formatBytes(it) + "/s" }
                            ?: stringResource(R.string.custom_value)
                    ),
                    onChange = {
                        if (it == DL_LIMIT_BYTES.size) {
                            showUlLimitDialog = true
                        } else {
                            ulLimitIndex = it
                            ulCustomBytes = null
                            viewModel.setOverallUploadLimit(DL_LIMIT_BYTES[it])
                        }
                    },
                    onEdit = { showUlLimitDialog = true }
                )
            }
        }

        // ── BitTorrent ──
        SettingsSection(stringResource(R.string.settings_bt_section)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_max_peers),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_max_peers_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Stepper(
                    value = btMaxPeers,
                    range = BT_PEERS_RANGE,
                    step = 5,
                    onValueChange = {
                        btMaxPeers = it
                        viewModel.setBtMaxPeers(it)
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 智能连接调度：按吞吐边际收益动态增减节点连接
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_adaptive),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_adaptive_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = btAdaptive,
                    onCheckedChange = {
                        btAdaptive = it
                        viewModel.setBtAdaptive(it)
                    },
                    colors = lerxuSwitchColors()
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // BT 加密：立即热下发到活动 BT 引擎
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_encryption),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_encryption_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                PresetCycler(
                    index = btEncryptionIndex,
                    labels = listOf(
                        stringResource(R.string.bt_encryption_adaptive),
                        stringResource(R.string.bt_encryption_force),
                        stringResource(R.string.bt_encryption_plain)
                    ),
                    onChange = {
                        btEncryptionIndex = it
                        viewModel.setBtEncryption(ENCRYPTION_VALUES[it])
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 传输协议：立即热下发到活动 BT 引擎
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_protocol),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_protocol_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                PresetCycler(
                    index = btProtocolIndex,
                    labels = listOf(
                        stringResource(R.string.bt_protocol_tcp_utp),
                        stringResource(R.string.bt_protocol_tcp),
                        stringResource(R.string.bt_protocol_utp)
                    ),
                    onChange = {
                        btProtocolIndex = it
                        viewModel.setBtProtocol(PROTOCOL_VALUES[it])
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 完成后自动做种
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_seed_mode),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_seed_mode_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = btSeedMode,
                    onCheckedChange = {
                        btSeedMode = it
                        viewModel.setBtSeedMode(it)
                    },
                    colors = lerxuSwitchColors()
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 停止做种分享率（0 = 不限）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_seed_ratio),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_seed_ratio_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                PresetCycler(
                    index = btSeedRatioIndex,
                    labels = listOf(
                        stringResource(R.string.seed_ratio_unlimited),
                        "0.5×", "1.0×", "2.0×", "3.0×"
                    ),
                    onChange = {
                        btSeedRatioIndex = it
                        viewModel.setBtSeedRatio(SEED_RATIOS[it])
                    }
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // BT 监听端口：点击弹输入对话框；新建 BT 任务时生效
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showBtPortDialog = true }
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_listen_port),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_listen_port_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = if (btListenPort == 0) stringResource(R.string.port_random) else btListenPort.toString(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colorScheme.onSurfaceVariant
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // DHT 监听端口：点击弹输入对话框
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showDhtPortDialog = true }
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.dht_listen_port),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.dht_listen_port_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = if (dhtListenPort == 0) stringResource(R.string.port_random) else dhtListenPort.toString(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colorScheme.onSurfaceVariant
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 本地节点发现（LSD 组播）：无需 tracker 即可发现同一局域网内的节点
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_enable_lpd),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_enable_lpd_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = btEnableLpd,
                    onCheckedChange = {
                        btEnableLpd = it
                        viewModel.setBtEnableLpd(it)
                    },
                    colors = lerxuSwitchColors()
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 端口映射（UPnP/NAT-PMP）：自动在路由器上建立映射以提升可连接性
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.bt_port_mapping),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.bt_port_mapping_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = btPortMapping,
                    onCheckedChange = {
                        btPortMapping = it
                        viewModel.setBtPortMapping(it)
                    },
                    colors = lerxuSwitchColors()
                )
            }
        }

        // ── BT 服务器（tracker 订阅源） ──
        SettingsSection(stringResource(R.string.settings_bt_servers)) {
            // 自动更新开关
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.auto_update_subscriptions),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.auto_update_subscriptions_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = autoUpdateTrackers,
                    onCheckedChange = {
                        autoUpdateTrackers = it
                        scope.launch { viewModel.setAutoUpdateTrackers(it) }
                    },
                    colors = lerxuSwitchColors()
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 全部刷新
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.refresh_all_subscriptions),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        if (refreshingAll) stringResource(R.string.refreshing_subscriptions) else stringResource(R.string.refresh_subscriptions_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                TextButton(
                    onClick = {
                        refreshingAll = true
                        scope.launch {
                            val n = viewModel.refreshAllSubscriptions()
                            reloadSubscriptions()
                            refreshingAll = false
                            Toast.makeText(
                                context,
                                if (n != null) context.getString(R.string.trackers_updated, n) else context.getString(R.string.refresh_failed),
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    },
                    enabled = !refreshingAll
                ) {
                    Text(stringResource(R.string.refresh), color = colorScheme.primary)
                }
            }

            // 订阅源列表
            subscriptions.forEach { sub ->
                SubscriptionRow(
                    sub = sub,
                    onToggle = {
                        // 先乐观更新 UI，再同步引擎
                        subscriptions = subscriptions.map {
                            if (it.id == sub.id) it.copy(enabled = !sub.enabled) else it
                        }
                        scope.launch { viewModel.toggleSubscription(sub.id) }
                    },
                    onRefresh = {
                        scope.launch {
                            viewModel.refreshSubscription(sub.id)
                            reloadSubscriptions()
                        }
                    },
                    onRemove = {
                        // 先弹移除确认，不直接删
                        pendingRemoveSub = sub
                    }
                )
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = colorScheme.outlineVariant,
                    thickness = 0.5.dp
                )
            }

            // 添加订阅源
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showAddSubscription = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.primary
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(R.string.add_subscription),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = colorScheme.primary
                )
            }
        }

        // ── 启动：默认入口（下载器 / 浏览器）──
        SettingsSection(stringResource(R.string.settings_section_start)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showStartPageDialog = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.settings_start_page),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        startPageLabel(startPage),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }

        // ── 浏览器 ──
        SettingsSection(stringResource(R.string.settings_browser)) {
            // 自动拦截广告：**默认开**。开关只改这一件事——拦网络 + 隐藏广告位
            //（见 AdBlocker），不碰页面自己的内容
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.settings_ad_block),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.settings_ad_block_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = adBlock,
                    onCheckedChange = onAdBlockChange,
                    colors = lerxuSwitchColors()
                )
            }
        }

        // ── 外观 ──
        SettingsSection(stringResource(R.string.settings_appearance)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showThemeDialog = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.theme),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        themeLabel(themePref),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }

        // ── 语言 ──
        SettingsSection(stringResource(R.string.settings_language)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showLanguageDialog = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.language),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        languageLabel(prefs.getString(MainActivity.KEY_LANGUAGE, "") ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }

        // ── 浏览器：搜索引擎（内置浏览器用） ──
        SettingsSection(stringResource(R.string.tab_browser)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showSearchEngineDialog = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.browser_engine_title),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        engineSubtitle(context, searchEngineKey, enginePinned),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }

        // ── 维护 ──
        SettingsSection(stringResource(R.string.settings_maintenance)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showPurgeConfirm = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.purge_task_records),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.purge_task_records_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }

        // ── 关于 ──
        SettingsSection(stringResource(R.string.settings_about)) {
            SettingsInfoRow(stringResource(R.string.about_version), BuildConfig.VERSION_NAME)
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 自动检测更新开关（启动时检查 GitHub Releases）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.auto_update_check),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        stringResource(R.string.auto_update_check_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = autoUpdateCheck,
                    onCheckedChange = {
                        autoUpdateCheck = it
                        prefs.edit().putBoolean("auto_update_check", it).apply()
                    },
                    colors = lerxuSwitchColors()
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // ── 设为默认浏览器 ──
            // 默认关闭：开关状态**直接读系统**（我们现在是不是默认浏览器），不另存偏好 ——
            // 存一份自己的布尔值只会在用户在系统设置里改动后与事实不一致。
            // 角色机制是 API 29+ 才有的；更低的系统上这行不出现。
            val roleManager = remember {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    context.getSystemService(android.app.role.RoleManager::class.java)
                } else {
                    null
                }
            }
            val roleAvailable =
                roleManager?.isRoleAvailable(android.app.role.RoleManager.ROLE_BROWSER) == true
            var isDefaultBrowser by remember { mutableStateOf(isDefaultBrowserApp(context)) }
            // 回到前台重读：用户可能在系统"默认应用"里改过（应用内撤销不了这个角色）
            val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
            DisposableEffect(lifecycleOwner) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_RESUME) {
                        isDefaultBrowser = isDefaultBrowserApp(context)
                    }
                }
                lifecycleOwner.lifecycle.addObserver(observer)
                onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
            }
            val roleLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.StartActivityForResult()
            ) { isDefaultBrowser = isDefaultBrowserApp(context) }
            if (roleAvailable) {
                // 整行可点 = 和开关同一个动作：只让那枚小开关可点的话，用户点文字
                // 会"没反应"（用户点名的现象）
                fun requestDefaultBrowser(want: Boolean) {
                    if (want) {
                        // 交给系统弹它自己的确认框（这是唯一的授予途径）。
                        // 拉不起来（个别系统没有这个界面 / 被裁剪）时退回系统设置页 ——
                        // 至少让用户看到"去了某个地方"，而不是点了毫无动静
                        val launched = runCatching {
                            roleLauncher.launch(
                                roleManager!!.createRequestRoleIntent(
                                    android.app.role.RoleManager.ROLE_BROWSER
                                )
                            )
                        }.isSuccess
                        if (!launched) openDefaultAppsSettings(context)
                    } else {
                        // 角色只能由系统收回：把用户送到"默认应用"页面自己改
                        openDefaultAppsSettings(context)
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { requestDefaultBrowser(!isDefaultBrowser) }
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            stringResource(R.string.default_browser_title),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            stringResource(R.string.default_browser_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = isDefaultBrowser,
                        onCheckedChange = { want -> requestDefaultBrowser(want) },
                        colors = lerxuSwitchColors()
                    )
                }

                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = colorScheme.outlineVariant,
                    thickness = 0.5.dp
                )
            }
            // 更新渠道：切换后立即按新渠道重新检查（与桌面端一致）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showChannelDialog = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.update_channel),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        channelLabel(updateChannel),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )

            // 手动检查更新
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !checkingUpdate) { checkingUpdate = true }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.check_update_now),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        if (checkingUpdate) stringResource(R.string.update_checking)
                        else stringResource(R.string.check_update_now_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )
            SettingsInfoRow(
                stringResource(R.string.about_engine),
                engineVersion?.let { "${it.name} v${it.version}" } ?: "—"
            )
        }

        Spacer(Modifier.height(24.dp))
    }

    // 清除任务记录：二次确认
    if (showPurgeConfirm) {
        SimpleConfirmDialog(
            title = stringResource(R.string.purge_confirm_title),
            message = stringResource(R.string.purge_confirm_msg),
            confirmLabel = stringResource(R.string.purge_confirm_label),
            onConfirm = {
                showPurgeConfirm = false
                viewModel.purgeResults()
                Toast.makeText(context, context.getString(R.string.purge_done), Toast.LENGTH_SHORT).show()
            },
            onDismiss = { showPurgeConfirm = false }
        )
    }

    // 移除订阅源：二次确认
    pendingRemoveSub?.let { sub ->
        SimpleConfirmDialog(
            title = stringResource(R.string.remove_sub_confirm_title),
            message = stringResource(R.string.remove_sub_confirm_msg, sub.name.ifBlank { stringResource(R.string.subscription_default_name) }),
            confirmLabel = stringResource(R.string.remove_subscription),
            onConfirm = {
                pendingRemoveSub = null
                subscriptions = subscriptions.filterNot { it.id == sub.id }
                scope.launch { viewModel.removeSubscription(sub.id) }
            },
            onDismiss = { pendingRemoveSub = null }
        )
    }

    // 语言切换：保存偏好后 recreate 重建 Activity（引擎服务不受影响）
    if (showLanguageDialog) {
        LanguageDialog(
            current = languagePref,
            onSelect = { tag ->
                showLanguageDialog = false
                if (tag != languagePref) {
                    MainActivity.updateLanguage(context, tag)
                }
            },
            onDismiss = { showLanguageDialog = false }
        )
    }

    // 自定义下载限速：确认后如命中预设则回到预设档，否则停在自定义档
    if (showDlLimitDialog) {
        LimitInputDialog(
            initialBytes = dlCustomBytes ?: DL_LIMIT_BYTES.getOrElse(dlLimitIndex) { 0L },
            onConfirm = { bytes ->
                showDlLimitDialog = false
                val preset = DL_LIMIT_BYTES.indexOf(bytes)
                if (preset >= 0) {
                    dlLimitIndex = preset
                    dlCustomBytes = null
                } else {
                    dlLimitIndex = DL_LIMIT_BYTES.size
                    dlCustomBytes = bytes
                }
                viewModel.setOverallDownloadLimit(bytes)
            },
            onDismiss = { showDlLimitDialog = false }
        )
    }

    // 自定义上传限速
    if (showUlLimitDialog) {
        LimitInputDialog(
            initialBytes = ulCustomBytes ?: DL_LIMIT_BYTES.getOrElse(ulLimitIndex) { 0L },
            onConfirm = { bytes ->
                showUlLimitDialog = false
                val preset = DL_LIMIT_BYTES.indexOf(bytes)
                if (preset >= 0) {
                    ulLimitIndex = preset
                    ulCustomBytes = null
                } else {
                    ulLimitIndex = DL_LIMIT_BYTES.size
                    ulCustomBytes = bytes
                }
                viewModel.setOverallUploadLimit(bytes)
            },
            onDismiss = { showUlLimitDialog = false }
        )
    }

    // BT/DHT 监听端口输入
    if (showBtPortDialog) {
        PortInputDialog(
            title = stringResource(R.string.bt_listen_port),
            initialPort = btListenPort,
            onConfirm = {
                showBtPortDialog = false
                btListenPort = it
                viewModel.setBtListenPort(it)
            },
            onDismiss = { showBtPortDialog = false }
        )
    }
    if (showDhtPortDialog) {
        PortInputDialog(
            title = stringResource(R.string.dht_listen_port),
            initialPort = dhtListenPort,
            onConfirm = {
                showDhtPortDialog = false
                dhtListenPort = it
                viewModel.setDhtListenPort(it)
            },
            onDismiss = { showDhtPortDialog = false }
        )
    }

    // 主题切换：Compose 状态驱动，立即生效无需重建
    if (showSearchEngineDialog) {
        SearchEngineDialog(
            currentKey = searchEngineKey,
            autoActive = !enginePinned,
            onPickEngine = { key ->
                SearchEngineDetector.setEngine(context, key, pinned = true)
                enginePinned = true
                onSearchEngineChange(key)
                showSearchEngineDialog = false
            },
            onPickAuto = {
                // 跟随网络自动选择：清掉手动标记并立刻按当前网络重选一次
                SearchEngineDetector.clearPinned(context)
                showSearchEngineDialog = false
                engineScope.launch {
                    val picked = SearchEngineDetector.ensureInitialized(context)
                    enginePinned = false
                    onSearchEngineChange(picked)
                }
            },
            onDismiss = { showSearchEngineDialog = false }
        )
    }

    if (showStartPageDialog) {
        StartPageDialog(
            current = startPage,
            onSelect = { picked ->
                showStartPageDialog = false
                startPage = picked
                StartPagePrefs.write(context, picked)
            },
            onDismiss = { showStartPageDialog = false }
        )
    }

    if (showThemeDialog) {
        ThemeDialog(
            current = themePref,
            onSelect = { pref ->
                showThemeDialog = false
                onThemeChange(pref)
            },
            onDismiss = { showThemeDialog = false }
        )
    }

    // 更新渠道切换：落盘 → 清掉旧渠道的更新卡片 → 立即按新渠道检查
    if (showChannelDialog) {
        UpdateChannelDialog(
            current = updateChannel,
            onSelect = { channel ->
                showChannelDialog = false
                if (channel != updateChannel) {
                    updateChannel = channel
                    UpdateManager.setChannel(context, channel)
                }
            },
            onDismiss = { showChannelDialog = false }
        )
    }

    // 添加订阅源
    if (showAddSubscription) {
        AddSubscriptionDialog(
            onConfirm = { name, url ->
                showAddSubscription = false
                scope.launch {
                    val sub = viewModel.addSubscription(name, url)
                    reloadSubscriptions()
                    Toast.makeText(
                        context,
                        when {
                            sub == null -> context.getString(R.string.add_sub_failed)
                            sub.lastError.isNotEmpty() -> context.getString(R.string.add_sub_partial, sub.lastError)
                            else -> context.getString(R.string.add_sub_success, sub.lastCount)
                        },
                        Toast.LENGTH_LONG
                    ).show()
                }
            },
            onDismiss = { showAddSubscription = false }
        )
    }
}

// ─── 单个订阅源行 ───

@Composable
private fun SubscriptionRow(
    sub: BtSubscription,
    onToggle: () -> Unit,
    onRefresh: () -> Unit,
    onRemove: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                sub.name.ifBlank { stringResource(R.string.subscription_default_name) },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                sub.url,
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = when {
                    sub.lastError.isNotEmpty() -> stringResource(R.string.subscription_last_error, sub.lastError)
                    sub.lastUpdated > 0 -> stringResource(R.string.subscription_tracker_count, sub.lastCount, formatSubTime(context, sub.lastUpdated))
                    else -> stringResource(R.string.subscription_not_fetched)
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (sub.lastError.isNotEmpty()) colorScheme.error else colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        IconButton(onClick = onRefresh, modifier = Modifier.size(34.dp)) {
            Icon(
                Icons.Default.Refresh,
                contentDescription = stringResource(R.string.refresh_subscription),
                modifier = Modifier.size(16.dp),
                tint = colorScheme.onSurfaceVariant
            )
        }
        IconButton(onClick = onRemove, modifier = Modifier.size(34.dp)) {
            Icon(
                Icons.Default.Close,
                contentDescription = stringResource(R.string.remove_subscription),
                modifier = Modifier.size(16.dp),
                tint = colorScheme.onSurfaceVariant
            )
        }
        Switch(
            checked = sub.enabled,
            onCheckedChange = { onToggle() },
            colors = lerxuSwitchColors()
        )
    }
}

/**
 * 我们现在是不是系统默认浏览器。
 *
 * 走 API 29+ 的「浏览器角色」；更低的系统没有这套机制，一律 false（设置里那行也不出现）。
 */
private fun isDefaultBrowserApp(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.getSystemService(android.app.role.RoleManager::class.java)
            ?.isRoleHeld(android.app.role.RoleManager.ROLE_BROWSER) == true
    } else {
        false
    }

/** 送到系统的「默认应用」页面 —— 浏览器角色只能由系统收回，应用内撤不掉。 */
private fun openDefaultAppsSettings(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
    } else {
        Intent(android.provider.Settings.ACTION_SETTINGS)
    }
    runCatching { context.startActivity(intent) }
}

/**
 * 开关（Switch）的统一配色 —— **必须显式给，不能用 Material3 默认**。
 *
 * 默认未选中态是拿 `outline` 画圆点与描边、`surfaceContainerHighest` 画轨道的，
 * 而本应用的色板里这两个**在深色下就是同一个颜色**（都是 #3D424D）：关闭时圆点
 * 完全糊进轨道，整条开关看起来是一块实心色板；浅色下两者也只差一档（#D3DDE6 /
 * #E8EEF5），圆点几乎看不见（用户点名：「关闭后代表选项的圆点直接跟背景融为一体」）。
 *
 * 这里按"三档都要分得开"重给：
 *  · 轨道用 `surfaceVariant` —— 比它所在的卡片底**深一档**，读作一条凹槽；
 *  · 圆点用 `onSurfaceVariant` —— 轨道上的一枚明确色点，关闭时也看得清；
 *  · 描边保留 `outline`（只作收边，不承担辨识）。
 * 打开态沿用主色 + onPrimary，与其他控件一致。
 */
@Composable
fun lerxuSwitchColors(): SwitchColors = SwitchDefaults.colors(
    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
    checkedTrackColor = MaterialTheme.colorScheme.primary,
    uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
    uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
    uncheckedBorderColor = MaterialTheme.colorScheme.outline
)

/** 订阅更新时间的简短展示：今天 HH:mm，否则 M月d日 */
private fun formatSubTime(context: Context, unixSeconds: Long): String {
    if (unixSeconds <= 0) return ""
    val cal = java.util.Calendar.getInstance().apply { timeInMillis = unixSeconds * 1000 }
    val now = java.util.Calendar.getInstance()
    val hm = "%02d:%02d".format(cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE))
    return if (now.get(java.util.Calendar.DAY_OF_YEAR) == cal.get(java.util.Calendar.DAY_OF_YEAR) &&
        now.get(java.util.Calendar.YEAR) == cal.get(java.util.Calendar.YEAR)
    ) {
        context.getString(R.string.today, hm)
    } else {
        context.getString(R.string.month_day, cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH), hm)
    }
}

// ─── 添加订阅源对话框（通用底部弹窗样式） ───

@Composable
private fun AddSubscriptionDialog(
    onConfirm: (name: String, url: String) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    val urlValid = url.startsWith("http://") || url.startsWith("https://")

    BottomConfirmDialog(
        title = stringResource(R.string.add_subscription_dialog_title),
        subtitle = stringResource(R.string.add_subscription_dialog_desc),
        confirmLabel = stringResource(R.string.add),
        confirmEnabled = urlValid,
        confirmContainerColor = colorScheme.primary,
        confirmContentColor = colorScheme.onPrimary,
        onConfirm = { onConfirm(name.trim(), url.trim()) },
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.subscription_name_optional)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text(stringResource(R.string.subscription_url)) },
                singleLine = true,
                isError = url.isNotEmpty() && !urlValid,
                supportingText = if (url.isNotEmpty() && !urlValid) {
                    { Text(stringResource(R.string.subscription_url_hint)) }
                } else null,
                modifier = Modifier.fillMaxWidth()
            )
        }
    )
}

// ─── 分区卡片 ───

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(
            title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 6.dp, bottom = 6.dp)
        )
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(content = content)
        }
    }
    Spacer(Modifier.height(14.dp))
}

@Composable
private fun SettingsInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ─── 步进器：− 数值 + ───

@Composable
private fun Stepper(
    value: Int,
    onValueChange: (Int) -> Unit,
    range: IntRange = 1..10,
    step: Int = 1
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = colorScheme.surfaceContainerHigh
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = { onValueChange((value - step).coerceAtLeast(range.first)) },
                enabled = value - step >= range.first,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.Default.Remove,
                    contentDescription = stringResource(R.string.decrease),
                    modifier = Modifier.size(15.dp)
                )
            }
            Text(
                "$value",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                color = colorScheme.onSurface,
                modifier = Modifier.widthIn(min = 26.dp)
            )
            IconButton(
                onClick = { onValueChange((value + step).coerceAtMost(range.last)) },
                enabled = value + step <= range.last,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = stringResource(R.string.increase),
                    modifier = Modifier.size(15.dp)
                )
            }
        }
    }
}

// ─── 预设档位切换：‹ 档位 › ───

@Composable
private fun PresetCycler(
    index: Int,
    labels: List<String>,
    onChange: (Int) -> Unit,
    onEdit: (() -> Unit)? = null
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = colorScheme.surfaceContainerHigh
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = { if (index > 0) onChange(index - 1) },
                enabled = index > 0,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = stringResource(R.string.prev_preset),
                    modifier = Modifier.size(16.dp)
                )
            }
            // 档位数值：传入 onEdit 时可点击弹出自定义输入
            Text(
                labels.getOrElse(index) { "—" },
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                color = if (onEdit != null) colorScheme.primary else colorScheme.onSurface,
                modifier = Modifier
                    .widthIn(min = 64.dp)
                    .then(
                        if (onEdit != null) Modifier.clickable { onEdit() } else Modifier
                    )
            )
            IconButton(
                onClick = { if (index < labels.lastIndex) onChange(index + 1) },
                enabled = index < labels.lastIndex,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = stringResource(R.string.next_preset),
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

// ─── 自定义限速输入弹窗（底部悬浮样式） ───

@Composable
private fun LimitInputDialog(
    initialBytes: Long,
    onConfirm: (Long) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var text by remember { mutableStateOf(formatLimitPreset(initialBytes)) }
    var invalid by remember { mutableStateOf(false) }

    BottomConfirmDialog(
        title = stringResource(R.string.custom_limit_title),
        subtitle = stringResource(R.string.custom_limit_desc),
        confirmLabel = stringResource(R.string.confirm),
        confirmContainerColor = colorScheme.primary,
        confirmContentColor = colorScheme.onPrimary,
        onConfirm = {
            val bytes = parseLimitInput(text)
            if (bytes == null) {
                invalid = true
            } else {
                onConfirm(bytes)
            }
        },
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = text,
                onValueChange = {
                    text = it
                    invalid = false
                },
                label = { Text(stringResource(R.string.custom_limit_hint)) },
                isError = invalid,
                supportingText = if (invalid) {
                    { Text(stringResource(R.string.custom_limit_invalid)) }
                } else null,
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }
    )
}

/** 端口输入对话框：0–65535，0 = 随机分配（通用底部弹窗样式） */
@Composable
private fun PortInputDialog(
    title: String,
    initialPort: Int,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var text by remember { mutableStateOf(if (initialPort in 1..65535) initialPort.toString() else "0") }
    var invalid by remember { mutableStateOf(false) }

    BottomConfirmDialog(
        title = title,
        subtitle = stringResource(R.string.port_dialog_desc),
        confirmLabel = stringResource(R.string.confirm),
        confirmContainerColor = colorScheme.primary,
        confirmContentColor = colorScheme.onPrimary,
        onConfirm = {
            val port = text.toIntOrNull()
            if (port == null || port !in 0..65535) {
                invalid = true
            } else {
                onConfirm(port)
            }
        },
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = text,
                onValueChange = {
                    text = it.filter { ch -> ch.isDigit() }.take(5)
                    invalid = false
                },
                label = { Text(stringResource(R.string.port_dialog_hint)) },
                isError = invalid,
                supportingText = if (invalid) {
                    { Text(stringResource(R.string.port_dialog_invalid)) }
                } else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }
    )
}

/** 把字节值格式化成输入框预填文本（优先 K/M，整除才显示） */
private fun formatLimitPreset(bytes: Long): String = when {
    bytes <= 0L -> "0"
    bytes % 1_048_576L == 0L -> "${bytes / 1_048_576L}m"
    bytes % 1_024L == 0L -> "${bytes / 1_024L}k"
    else -> String.format("%.0fk", bytes / 1024.0)
}

// ─── 语言切换弹窗 ───

/** 语言选项：tag 为存储值，name 用各语言的自称展示 */
private data class LanguageOption(val tag: String, val name: String)

private val LANGUAGE_OPTIONS = listOf(
    LanguageOption("system", "Auto"),
    LanguageOption("en", "English"),
    LanguageOption("zh-CN", "简体中文"),
    LanguageOption("zh-TW", "繁體中文")
)

@Composable
private fun languageLabel(tag: String): String = when (tag) {
    "" , "system" -> stringResource(R.string.language_follow_system)
    "en" -> "English"
    "zh-CN" -> "简体中文"
    "zh-TW" -> "繁體中文"
    else -> stringResource(R.string.language_follow_system)
}

@Composable
private fun LanguageDialog(
    current: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    BottomConfirmDialog(
        title = stringResource(R.string.language),
        confirmLabel = null,
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(10.dp))
            LANGUAGE_OPTIONS.forEachIndexed { index, option ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp
                    )
                }
                val selected = option.tag == current || (current.isEmpty() && option.tag == "system")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            onSelect(if (option.tag == "system") "" else option.tag)
                        }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (option.tag == "system") stringResource(R.string.language_follow_system) else option.name,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                            color = if (selected) colorScheme.primary else colorScheme.onSurface
                        )
                    }
                    if (selected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    )
}

// ─── 搜索引擎（内置浏览器） ───

/**
 * 设置项副标题：手动选过就只显示引擎名；仍跟随网络时补上
 * 「为什么是它」（可直连 / 按区域 / 未联网 / 通用回退）。
 */
@Composable
private fun engineSubtitle(context: Context, key: String, pinned: Boolean): String {
    val name = SearchEngines.byKey(key).name
    if (pinned) return name
    val reason = SearchEngineDetector.lastReason(context) ?: return name
    val label = stringResource(
        when (reason) {
            SearchEnginePick.Reason.REACHABLE -> R.string.browser_engine_reason_reachable
            SearchEnginePick.Reason.REGION -> R.string.browser_engine_reason_region
            SearchEnginePick.Reason.OFFLINE -> R.string.browser_engine_reason_offline
            SearchEnginePick.Reason.FALLBACK -> R.string.browser_engine_reason_fallback
        }
    )
    return "$name · $label"
}

@Composable
private fun SearchEngineDialog(
    currentKey: String,
    autoActive: Boolean,
    onPickEngine: (String) -> Unit,
    onPickAuto: () -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    BottomConfirmDialog(
        title = stringResource(R.string.browser_engine_title),
        confirmLabel = null,
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(10.dp))
            // 「跟随网络自动选择」是一个可选项：选它即清掉手动标记并立刻重选
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onPickAuto() }
                    .padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.browser_engine_auto),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (autoActive) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (autoActive) colorScheme.primary else colorScheme.onSurface
                    )
                    if (autoActive) {
                        Text(
                            stringResource(
                                R.string.browser_engine_auto_on,
                                SearchEngines.byKey(currentKey).name
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (autoActive) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 4.dp),
                color = colorScheme.outlineVariant,
                thickness = 0.5.dp
            )
            SearchEngines.all.forEachIndexed { index, engine ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp
                    )
                }
                val selected = !autoActive && engine.key == currentKey
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPickEngine(engine.key) }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        engine.name,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (selected) colorScheme.primary else colorScheme.onSurface
                    )
                    if (selected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    )
}

// ─── 主题切换弹窗 ───

private data class ThemeOption(val key: String)

private val THEME_OPTIONS = listOf(ThemeOption("system"), ThemeOption("light"), ThemeOption("dark"))

@Composable
private fun themeLabel(key: String): String = when (key) {
    "light" -> stringResource(R.string.theme_light)
    "dark" -> stringResource(R.string.theme_dark)
    else -> stringResource(R.string.theme_follow_system)
}

// ─── 默认入口（下载器 / 浏览器） ───

@Composable
private fun startPageLabel(page: StartPage): String = stringResource(
    if (page == StartPage.Browser) R.string.start_page_browser else R.string.start_page_downloader
)

@Composable
private fun StartPageDialog(
    current: StartPage,
    onSelect: (StartPage) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val options = listOf(
        Triple(StartPage.Downloader, Icons.Default.CloudDownload, R.string.start_page_downloader),
        Triple(StartPage.Browser, Icons.Default.Language, R.string.start_page_browser)
    )
    BottomConfirmDialog(
        title = stringResource(R.string.settings_start_page),
        confirmLabel = null,
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.settings_start_page_note),
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(6.dp))
            options.forEachIndexed { index, (page, icon, labelRes) ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp
                    )
                }
                val selected = page == current
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(page) }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = if (selected) colorScheme.primary else colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(labelRes),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) colorScheme.primary else colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    if (selected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    )
}

@Composable
private fun ThemeDialog(
    current: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    BottomConfirmDialog(
        title = stringResource(R.string.theme),
        confirmLabel = null,
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(10.dp))
            THEME_OPTIONS.forEachIndexed { index, option ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp
                    )
                }
                val selected = option.key == current
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(option.key) }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        when (option.key) {
                            "light" -> Icons.Default.LightMode
                            "dark" -> Icons.Default.DarkMode
                            else -> Icons.Default.BrightnessAuto
                        },
                        contentDescription = null,
                        tint = if (selected) colorScheme.primary else colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        themeLabel(option.key),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) colorScheme.primary else colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    if (selected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    )
}

// ─── 更新渠道切换弹窗 ───

/** 渠道展示名（与桌面端 preferences.update-channel-* 文案一致） */
@Composable
private fun channelLabel(channel: ReleaseChannel): String = when (channel) {
    ReleaseChannel.STABLE -> stringResource(R.string.update_channel_stable)
    ReleaseChannel.BETA -> stringResource(R.string.update_channel_beta)
    ReleaseChannel.ALL -> stringResource(R.string.update_channel_all)
}

/**
 * 更新渠道选择：稳定版 / 测试版 / 全部版本。
 * 三档语义与桌面端严格一致 —— 稳定版只看正式版，测试版只看预发布，
 * 全部版本取版本最高者（含预发布）。
 */
@Composable
private fun UpdateChannelDialog(
    current: ReleaseChannel,
    onSelect: (ReleaseChannel) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    BottomConfirmDialog(
        title = stringResource(R.string.update_channel),
        subtitle = stringResource(R.string.update_channel_desc),
        confirmLabel = null,
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(10.dp))
            ReleaseChannel.entries.forEachIndexed { index, option ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp
                    )
                }
                val selected = option == current
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(option) }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        channelLabel(option),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) colorScheme.primary else colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    if (selected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    )
}
