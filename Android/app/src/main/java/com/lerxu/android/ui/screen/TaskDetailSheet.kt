package com.lerxu.android.ui.screen

import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lerxu.android.model.Peer
import com.lerxu.android.model.TaskFile
import com.lerxu.android.model.TaskInfo
import com.lerxu.android.model.Tracker
import com.lerxu.android.R
import com.lerxu.android.ui.RoundedProgressBar
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.formatDuration
import com.lerxu.android.ui.formatSpeed
import com.lerxu.android.ui.statusColor
import com.lerxu.android.ui.statusText
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * 任务详情 —— 底部弹窗，分类 tab 布局：
 * 概览（信息/单任务限速）、分片（BT/HTTP 位图）、
 * 节点（BT）、Tracker（BT）、文件（全类型，BT 可随时改选）。
 *
 * 进度条 + 控制按钮固定在底部，所有 tab 共享。
 */
private enum class DetailTab { OVERVIEW, PIECES, PEERS, TRACKERS, FILES }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailSheet(
    task: TaskInfo,
    viewModel: TaskViewModel,
    onDismiss: () -> Unit,
    onDeleteRequest: () -> Unit = {}
) {
    val colorScheme = MaterialTheme.colorScheme
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val statusColor = Color(statusColor(task.status))

    // ── 轮询数据：分片/节点/Tracker/文件选择需要比 1Hz 进度事件更全的快照 ──
    var polled by remember(task.gid) { mutableStateOf(task) }
    var peers by remember(task.gid) { mutableStateOf<List<Peer>>(emptyList()) }
    var trackers by remember(task.gid) { mutableStateOf<List<Tracker>>(emptyList()) }

    // 使用轮询的 polled 作为显示数据（进度更实时）
    val displayTask = polled

    // ── tab 集合：分片对 BT 和 HTTP 均显示；节点/Tracker 仅 BT ──
    // HTTP 任务下载开始后引擎才挂接 http_pieces，在此之前 numPieces=0，
    // 但分片 tab 始终可见（内容显示占位提示）。
    val showBtTabs = displayTask.isBT || displayTask.infoHash != null
    val tabs = remember(showBtTabs) {
        buildList {
            add(DetailTab.OVERVIEW)
            add(DetailTab.PIECES)
            if (showBtTabs) add(DetailTab.PEERS)
            if (showBtTabs) add(DetailTab.TRACKERS)
            add(DetailTab.FILES)
        }
    }
    var selectedTab by rememberSaveable(task.gid) { mutableIntStateOf(0) }

    LaunchedEffect(task.gid, selectedTab, tabs) {
        while (isActive) {
            viewModel.fetchTaskDetail(task.gid)?.let { polled = it }
            val tab = tabs.getOrNull(selectedTab)
            when (tab) {
                DetailTab.PIECES -> {}
                DetailTab.PEERS -> if (showBtTabs) peers = viewModel.fetchPeers(task.gid)
                DetailTab.TRACKERS -> if (showBtTabs) trackers = viewModel.fetchTrackers(task.gid)
                else -> {}
            }
            if (tab == DetailTab.PEERS || tab == DetailTab.TRACKERS) {
                delay(2000)
            } else {
                delay(1500)
            }
        }
    }

    // ── 单任务限速（概览行展示 + 点击弹出通用底部弹窗编辑） ──
    // HTTP/HTTPS 无上传，不显示上传限速
    val isHttpTask = !displayTask.isBT && displayTask.infoHash == null
    var limits by remember(task.gid) { mutableStateOf<Pair<String, String>?>(null) }
    var showLimitDialog by remember { mutableStateOf(false) }
    LaunchedEffect(task.gid, showLimitDialog) {
        if (limits == null || showLimitDialog) {
            val opt = viewModel.fetchTaskOption(task.gid)
            limits = (opt["max-download-limit"] ?: "0") to (opt["max-upload-limit"] ?: "0")
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp)
                // 贴边全宽形态下，内容底部避让手势条/导航栏
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
        ) {
            // ── 标题 ──
            Column(Modifier.padding(bottom = 10.dp)) {
                Text(
                    text = displayTask.fileName,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = statusText(context, displayTask.status),
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor
                )
            }

            // ── Tab 行 ──
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.Transparent,
                contentColor = colorScheme.primary,
                indicator = { positions ->
                    if (selectedTab < positions.size) {
                        TabRowDefaults.SecondaryIndicator(
                            modifier = Modifier.tabIndicatorOffset(positions[selectedTab]),
                            height = 2.5.dp
                        )
                    }
                },
                divider = {}
            ) {
                tabs.forEachIndexed { index, tab ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                text = stringResource(tabLabel(tab)),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal
                            )
                        },
                        selectedContentColor = colorScheme.primary,
                        unselectedContentColor = colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // ── Tab 内容（带高度动画） ──
            AnimatedContent(
                targetState = tabs.getOrNull(selectedTab),
                transitionSpec = {
                    (fadeIn(animationSpec = tween(200)) + expandVertically(animationSpec = tween(200)))
                        .togetherWith(fadeOut(animationSpec = tween(200)) + shrinkVertically(animationSpec = tween(200)))
                        .using(SizeTransform(clip = false))
                },
                label = "tabContent"
            ) { tab ->
                when (tab) {
                    DetailTab.PIECES -> PiecesTab(colorScheme, displayTask)
                    DetailTab.PEERS -> PeersTab(colorScheme, task.gid, peers, viewModel, scope, context)
                    DetailTab.TRACKERS -> TrackersTab(colorScheme, trackers)
                    DetailTab.FILES -> FilesTab(colorScheme, task, displayTask, viewModel, scope, context)
                    else -> OverviewTab(
                        colorScheme = colorScheme,
                        context = context,
                        task = displayTask,
                        statusColor = statusColor,
                        limits = limits,
                        isHttpTask = isHttpTask,
                        onEditLimits = { showLimitDialog = true }
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // ── 进度条（裸，不带卡片，固定在控制按钮正上方） ──
            RoundedProgressBar(
                progress = displayTask.progress,
                color = statusColor,
                trackColor = statusColor.copy(alpha = 0.18f),
                height = 6.dp,
                indeterminate = displayTask.status == "active" &&
                    displayTask.downloadSpeed <= 0L && displayTask.completedLength <= 0L
            )

            Spacer(Modifier.height(10.dp))

            // ── 固定底部控制按钮（所有 tab 都显示） ──
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                when (displayTask.status) {
                    "active", "waiting", "seeding" -> {
                        OutlinedButton(
                            onClick = { viewModel.pauseTask(task.gid) },
                            modifier = Modifier.weight(1f).height(46.dp),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Icon(Icons.Default.Pause, contentDescription = null, modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.pause))
                        }
                    }
                    "paused" -> {
                        Button(
                            onClick = { viewModel.resumeTask(task.gid) },
                            modifier = Modifier.weight(1f).height(46.dp),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.resume))
                        }
                    }
                }
                OutlinedButton(
                    onClick = onDeleteRequest,
                    modifier = Modifier.weight(1f).height(46.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = colorScheme.error)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.delete))
                }
            }
        }
    }

    // ── 单任务限速编辑：通用居下弹窗（与设置页自定义限速同款样式） ──
    if (showLimitDialog) {
        TaskLimitDialog(
            current = limits,
            isHttpTask = isHttpTask,
            onSave = { dl, ul ->
                showLimitDialog = false
                scope.launch {
                    val ok = viewModel.changeTaskOption(
                        task.gid,
                        mapOf(
                            "max-download-limit" to JsonPrimitive(dl),
                            "max-upload-limit" to JsonPrimitive(ul)
                        )
                    )
                    Toast.makeText(
                        context,
                        context.getString(if (ok) R.string.speed_limit_saved else R.string.speed_limit_failed),
                        Toast.LENGTH_SHORT
                    ).show()
                    if (ok) {
                        val opt = viewModel.fetchTaskOption(task.gid)
                        limits = (opt["max-download-limit"] ?: "0") to (opt["max-upload-limit"] ?: "0")
                    }
                }
            },
            onDismiss = { showLimitDialog = false }
        )
    }
}

private fun tabLabel(tab: DetailTab): Int = when (tab) {
    DetailTab.OVERVIEW -> R.string.detail_tab_overview
    DetailTab.PIECES -> R.string.detail_tab_pieces
    DetailTab.PEERS -> R.string.detail_tab_peers
    DetailTab.TRACKERS -> R.string.detail_tab_trackers
    DetailTab.FILES -> R.string.detail_tab_files
}

// ─── 概览 ───

@Composable
private fun OverviewTab(
    colorScheme: androidx.compose.material3.ColorScheme,
    context: android.content.Context,
    task: TaskInfo,
    statusColor: Color,
    limits: Pair<String, String>?,
    isHttpTask: Boolean,
    onEditLimits: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .heightIn(max = 320.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 详细信息卡
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = colorScheme.surfaceContainerLow,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(Modifier.padding(vertical = 4.dp)) {
                if (task.errorCode != 0) {
                    Text(
                        stringResource(R.string.error_code_msg, task.errorCode, task.errorMessage),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.error,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                    HorizontalDivider(
                        color = colorScheme.outlineVariant,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )
                }
                CopyableInfoRow(stringResource(R.string.detail_gid), task.gid)
                if (task.dir.isNotEmpty()) InfoRow(stringResource(R.string.save_dir), task.dir)
                InfoRow(stringResource(R.string.connections), "${task.connections}")
                if (task.isBT) InfoRow(stringResource(R.string.seeders), "${task.numSeeders}")
                if (task.isBT && task.seedRatio > 0) {
                    InfoRow(stringResource(R.string.detail_seed_ratio), String.format("%.2f", task.seedRatio))
                }
                if (task.averageSpeed > 0) {
                    InfoRow(stringResource(R.string.detail_avg_speed), formatSpeed(task.averageSpeed))
                }
                // 单任务限速行（点击编辑）—— HTTP/HTTPS 只显示下载限速
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onEditLimits() }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        stringResource(R.string.speed_limit),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(76.dp)
                    )
                    Text(
                        limitsText(limits, isHttpTask),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = colorScheme.primary,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Icon(
                        Icons.Default.Speed,
                        contentDescription = stringResource(R.string.speed_limit_edit),
                        modifier = Modifier.size(14.dp),
                        tint = colorScheme.onSurfaceVariant
                    )
                }
                InfoRow(stringResource(R.string.elapsed), formatDuration(task.elapsedMs / 1000))
            }
        }
    }
}

private fun limitsText(limits: Pair<String, String>?, isHttpTask: Boolean): String {
    if (limits == null) return "—"
    val dl = limits.first.trim().removePrefix("0")
    val result = "↓ " + dl.ifEmpty { "∞" }
    if (isHttpTask) return result
    val ul = limits.second.trim().removePrefix("0")
    return result + "   ↑ " + ul.ifEmpty { "∞" }
}

// ─── 分片 ───

@Composable
private fun PiecesTab(
    colorScheme: androidx.compose.material3.ColorScheme,
    task: TaskInfo
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .heightIn(max = 320.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (task.numPieces <= 0) {
            // 分片数据尚未就绪：HTTP 任务未开始下载 / 未知总长 / 不支持 Range
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.piece_progress, 0, 0),
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onSurfaceVariant
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val done = donePieceCount(task.bitfield, task.numPieces)
                // 部分选择文件时，未勾选文件的分片永远不下载：分母改用
                // 「需下载片数」，否则任务完成后仍显示 2/4 片，像是没下完
                val wanted = if (task.wantedBitfield.isNotEmpty()) {
                    donePieceCount(task.wantedBitfield, task.numPieces).coerceAtLeast(1)
                } else {
                    task.numPieces
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        stringResource(R.string.piece_progress, done.coerceAtMost(wanted), wanted),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        stringResource(
                            R.string.piece_length_label,
                            formatBytes(task.pieceLength)
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                PieceGridView(
                    bitfieldHex = task.bitfield,
                    partialBitfieldHex = task.partialBitfield,
                    wantedBitfieldHex = task.wantedBitfield,
                    numPieces = task.numPieces,
                    color = Color(0xFF4CAF50),
                    emptyColor = colorScheme.surfaceContainerHighest,
                    unwantedColor = Color(0xFF90A4AE)
                )
            }
        }
    }
}

/** aria2 兼容 hex 位图 → 每片完成与否（MSB first） */
internal fun decodeBitfield(hex: String, numPieces: Int): BooleanArray {
    val done = BooleanArray(numPieces)
    if (hex.isEmpty()) return done
    val bytes = try {
        hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    } catch (_: Exception) {
        return done
    }
    for (p in 0 until numPieces) {
        val byteIdx = p / 8
        if (byteIdx >= bytes.size) break
        val bit = 7 - (p % 8)
        done[p] = ((bytes[byteIdx].toInt() shr bit) and 1) == 1
    }
    return done
}

/** 每片进度级别：0=未开始, 1=部分下载, 2=已完成（全满）, 3=未选择（无需下载） */
internal fun pieceLevels(
    doneHex: String,
    partialHex: String,
    wantedHex: String,
    numPieces: Int
): IntArray {
    val done = decodeBitfield(doneHex, numPieces)
    val partial = decodeBitfield(partialHex, numPieces)
    val wanted = if (wantedHex.isNotEmpty()) decodeBitfield(wantedHex, numPieces) else null
    return IntArray(numPieces) { i ->
        when {
            done[i] -> 2
            partial[i] -> 1
            // 未下载且该片不属于任何勾选文件 → 未选择（不会下载）
            wanted != null && !wanted[i] -> 3
            else -> 0
        }
    }
}

internal fun donePieceCount(hex: String, numPieces: Int): Int =
    decodeBitfield(hex, numPieces).count { it }

/** 分片网格：片多时聚合到固定格子数，格子亮度 = 聚合区内进度占比
 *  与桌面端对齐的 5 级渐变色：灰→浅绿→中绿→深绿→全绿；
 *  「未选择」（未勾选文件的分片）单独用中性蓝灰，不计入聚合占比 */
@Composable
private fun PieceGridView(
    bitfieldHex: String,
    partialBitfieldHex: String,
    wantedBitfieldHex: String,
    numPieces: Int,
    color: Color,
    emptyColor: Color,
    unwantedColor: Color
) {
    BoxWithMaxWidth { maxWidth ->
        val gap = 2.dp
        val cell = 11.dp
        val columns = ((maxWidth + gap) / (cell + gap)).toInt().coerceIn(8, 64)
        val maxRows = 16
        val cells = columns * maxRows
        val total = numPieces.coerceAtLeast(1)
        val perCell = ((total + cells - 1) / cells).coerceAtLeast(1)
        val usedCells = ((total + perCell - 1) / perCell).coerceAtLeast(1)
        val rows = ((usedCells + columns - 1) / columns).coerceAtLeast(1)
        val levels = pieceLevels(bitfieldHex, partialBitfieldHex, wantedBitfieldHex, numPieces)

        val density = androidx.compose.ui.platform.LocalDensity.current
        val cellPx = with(density) { cell.toPx() }
        val gapPx = with(density) { gap.toPx() }
        val radius = androidx.compose.ui.geometry.CornerRadius(cellPx * 0.28f)
        // 5 级颜色：灰(0) → 浅绿(0.25) → 中绿(0.5) → 深绿(0.75) → 全绿(1.0)
        fun cellColor(frac: Float): Color {
            if (frac <= 0f) return emptyColor
            return color.copy(alpha = 0.2f + 0.8f * frac)
        }
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(cell * rows + gap * (rows - 1))
        ) {
            for (i in 0 until usedCells) {
                val start = i * perCell
                val end = minOf(start + perCell, total)
                if (start >= total) break
                // 聚合进度：已完成=1.0，部分=0.5，未开始=0，取均值；
                // 「未选择」的片不参与（分母剔除），整格均未选择时单独染色
                var progressSum = 0f
                var counted = 0
                var unwanted = 0
                for (p in start until end) {
                    when (levels[p]) {
                        2 -> { progressSum += 1.0f; counted++ }
                        1 -> { progressSum += 0.5f; counted++ }
                        3 -> unwanted++
                        else -> counted++
                    }
                }
                val col = i % columns
                val row = i / columns
                val x = col * (cellPx + gapPx)
                val y = row * (cellPx + gapPx)
                val fill = when {
                    counted == 0 && unwanted > 0 -> unwantedColor
                    else -> cellColor(if (counted == 0) 0f else progressSum / counted)
                }
                drawRoundRect(color = fill, topLeft = androidx.compose.ui.geometry.Offset(x, y), size = androidx.compose.ui.geometry.Size(cellPx, cellPx), cornerRadius = radius)
            }
        }
    }
}

/** BoxWithConstraints 的轻量包装（避免调用点样板） */
@Composable
private fun BoxWithMaxWidth(content: @Composable (androidx.compose.ui.unit.Dp) -> Unit) {
    androidx.compose.foundation.layout.BoxWithConstraints(
        modifier = Modifier.fillMaxWidth()
    ) {
        content(maxWidth)
    }
}

// ─── 节点 ───

@Composable
private fun PeersTab(
    colorScheme: androidx.compose.material3.ColorScheme,
    gid: String,
    peers: List<Peer>,
    viewModel: TaskViewModel,
    scope: kotlinx.coroutines.CoroutineScope,
    context: android.content.Context
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 320.dp)
    ) {
        if (peers.isEmpty()) {
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.peers_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(peers, key = { it.addr }) { peer ->
                    PeerRow(colorScheme, peer) { durationSec ->
                        scope.launch {
                            val ok = viewModel.banPeer(gid, peerIp(peer.addr), durationSec)
                            Toast.makeText(
                                context,
                                context.getString(if (ok) R.string.ban_peer_done else R.string.ban_peer_failed),
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            }
        }
    }
}

/** 从 SocketAddr 文本提取 IP（IPv4 "1.2.3.4:5"，IPv6 "[::1]:5"） */
private fun peerIp(addr: String): String = when {
    addr.startsWith("[") -> addr.substringAfter('[').substringBefore(']')
    addr.count { it == ':' } == 1 -> addr.substringBefore(':')
    else -> addr
}

@Composable
private fun PeerRow(
    colorScheme: androidx.compose.material3.ColorScheme,
    peer: Peer,
    onBan: (Long) -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        peer.client.ifEmpty { stringResource(R.string.peer_unknown_client) },
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (peer.seed) {
                        Spacer(Modifier.width(6.dp))
                        Surface(
                            shape = RoundedCornerShape(5.dp),
                            color = colorScheme.tertiaryContainer
                        ) {
                            Text(
                                stringResource(R.string.peer_seed_badge),
                                style = MaterialTheme.typography.labelSmall,
                                color = colorScheme.onTertiaryContainer,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                            )
                        }
                    }
                    if (!peer.connected) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            stringResource(R.string.peer_disconnected),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    buildString {
                        append(peer.addr)
                        if (peer.protocol.isNotEmpty()) append(" · ").append(peer.protocol.uppercase())
                        if (peer.encrypted) append(" · ").append(stringResource(R.string.peer_encrypted))
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                RoundedProgressBar(
                    progress = (peer.progress ?: 0.0).toDouble().div(100.0).toFloat(),
                    color = colorScheme.primary,
                    trackColor = colorScheme.primary.copy(alpha = 0.15f),
                    height = 3.dp
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    buildString {
                        append("↓ ").append(formatBytes(peer.downloaded))
                        append(" · ↑ ").append(formatBytes(peer.uploaded))
                        if (peer.choked) append(" · ").append(stringResource(R.string.peer_choked))
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(34.dp)) {
                Icon(
                    Icons.Default.Block,
                    contentDescription = stringResource(R.string.ban_peer),
                    modifier = Modifier.size(17.dp),
                    tint = colorScheme.error
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.ban_10min)) },
                    onClick = { menuOpen = false; onBan(600) }
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.ban_1hour)) },
                    onClick = { menuOpen = false; onBan(3600) }
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.ban_permanent), color = colorScheme.error) },
                    onClick = { menuOpen = false; onBan(-1) }
                )
            }
        }
        HorizontalDivider(color = colorScheme.outlineVariant, thickness = 0.5.dp)
    }
}

// ─── Tracker ───

@Composable
private fun TrackersTab(
    colorScheme: androidx.compose.material3.ColorScheme,
    trackers: List<Tracker>
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 320.dp)
    ) {
        if (trackers.isEmpty()) {
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.trackers_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(trackers, key = { it.url }) { tr ->
                    TrackerRow(colorScheme, tr)
                    HorizontalDivider(color = colorScheme.outlineVariant, thickness = 0.5.dp)
                }
            }
        }
    }
}

@Composable
private fun TrackerRow(
    colorScheme: androidx.compose.material3.ColorScheme,
    tr: Tracker
) {
    val statusColor = when (tr.status) {
        "working" -> Color(0xFF4CAF50)
        "not-working" -> Color(0xFFF44336)
        else -> Color(0xFFFF9800)
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(statusColor)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                tr.url,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Text(
                tr.protocol.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                buildString {
                    append(stringResource(trackerStatusText(tr.status)))
                    if (tr.seeders > 0 || tr.leechers > 0) {
                        append(" · ").append(stringResource(R.string.seeders)).append(" ").append(tr.seeders)
                        append(" · ").append(stringResource(R.string.tracker_leechers)).append(" ").append(tr.leechers)
                    }
                },
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant
            )
            if (tr.nextAnnounceTime > 0 && tr.status != "not-working") {
                val secs = (tr.nextAnnounceTime - System.currentTimeMillis()) / 1000
                Text(
                    stringResource(R.string.tracker_next_announce, formatDuration(secs)),
                    style = MaterialTheme.typography.labelSmall,
                    color = colorScheme.onSurfaceVariant
                )
            }
        }
        tr.error?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(3.dp))
            Text(
                it,
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.error,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun trackerStatusText(status: String): Int = when (status) {
    "working" -> R.string.tracker_working
    "not-working" -> R.string.tracker_not_working
    else -> R.string.tracker_waiting
}

// ─── 文件 ───

@Composable
private fun FilesTab(
    colorScheme: androidx.compose.material3.ColorScheme,
    live: TaskInfo,
    polled: TaskInfo,
    viewModel: TaskViewModel,
    scope: kotlinx.coroutines.CoroutineScope,
    context: android.content.Context
) {
    // 待提交的选择（文件 index-1 集合）；null = 未改动
    var pending by remember(polled.gid, polled.files.size) { mutableStateOf<Set<Int>?>(null) }
    val canSelect = polled.isBT && polled.files.size > 1 &&
        polled.status !in listOf("complete", "error", "removed")
    val currentSelection: Set<Int> = pending ?: polled.files
        .mapIndexedNotNull { i, f -> if (f.selected) i else null }
        .toSet()

    // 用于文件移除（取消勾选并应用）
    fun applySelection(sel: Set<Int>) {
        scope.launch {
            val sel1 = sel.map { it + 1 }
            val ok = if (sel1.isEmpty()) {
                Toast.makeText(context, context.getString(R.string.select_at_least_one), Toast.LENGTH_SHORT).show()
                false
            } else {
                viewModel.changeTaskOption(
                    polled.gid,
                    mapOf("select-file" to JsonPrimitive(sel1.joinToString(",")))
                )
            }
            Toast.makeText(
                context,
                context.getString(if (ok) R.string.selection_applied else R.string.selection_failed),
                Toast.LENGTH_SHORT
            ).show()
            if (ok) {
                pending = null
                if (polled.awaitingSelection || polled.status == "paused") {
                    viewModel.resumeTask(polled.gid)
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 320.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                stringResource(R.string.files_count, polled.files.size),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f)
            )
            if (canSelect && pending != null) {
                TextButtonCompat(colorScheme, stringResource(R.string.apply_selection)) {
                    applySelection(pending!!)
                }
            }
        }
        when {
            polled.files.isEmpty() && polled.isBT -> {
                Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.files_waiting_metadata),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
            }
            polled.files.isEmpty() -> {
                Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.files_empty),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    itemsIndexedCompat(polled.files) { _, file ->
                        val idx = file.index - 1
                        FileRowSelectable(
                            colorScheme = colorScheme,
                            file = file,
                            selectable = canSelect,
                            checked = idx in currentSelection,
                            onToggle = { checked ->
                                pending = if (checked) currentSelection + idx else currentSelection - idx
                            },
                            onRemove = if (canSelect) {
                                {
                                    // 移除文件：从选择中移除并立即应用
                                    val newSel = currentSelection - idx
                                    pending = newSel
                                    applySelection(newSel)
                                }
                            } else null
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TextButtonCompat(colorScheme: androidx.compose.material3.ColorScheme, text: CharSequence, onClick: () -> Unit) {
    androidx.compose.material3.TextButton(onClick = onClick) {
        Text(
            text.toString(),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = colorScheme.primary
        )
    }
}

private fun <T> androidx.compose.foundation.lazy.LazyListScope.itemsIndexedCompat(
    items: List<T>,
    itemContent: @Composable (Int, T) -> Unit
) {
    items(items.size) { i -> itemContent(i, items[i]) }
}

@Composable
private fun FileRowSelectable(
    colorScheme: androidx.compose.material3.ColorScheme,
    file: TaskFile,
    selectable: Boolean,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    onRemove: (() -> Unit)? = null
) {
    val fileName = file.path.substringAfterLast('/').substringAfterLast('\\')
        .ifEmpty { stringResource(R.string.file_index, file.index) }
    val fileProgress = if (file.length > 0) {
        (file.completedLength.toFloat() / file.length.toFloat()).coerceIn(0f, 1f)
    } else 0f

    Row(
        modifier = Modifier
            .fillMaxWidth()
            // 整行可点切换勾选（仅图标可点时目标太小，下载中难以命中）
            .then(if (selectable) Modifier.clickable { onToggle(!checked) } else Modifier)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (selectable) {
            Icon(
                if (checked) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = if (checked) {
                    stringResource(R.string.select_none)
                } else {
                    stringResource(R.string.select_all)
                },
                modifier = Modifier.size(20.dp),
                tint = if (checked) colorScheme.primary else colorScheme.outline
            )
            Spacer(Modifier.width(8.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                fileName,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(3.dp))
            RoundedProgressBar(
                progress = fileProgress,
                color = colorScheme.primary,
                trackColor = colorScheme.primary.copy(alpha = 0.18f),
                height = 3.dp
            )
        }
        Spacer(Modifier.width(10.dp))
        Text(
            formatBytes(file.length),
            style = MaterialTheme.typography.labelSmall,
            color = colorScheme.onSurfaceVariant
        )
        if (onRemove != null) {
            Spacer(Modifier.width(6.dp))
            Icon(
                Icons.Default.Delete,
                contentDescription = stringResource(R.string.delete),
                modifier = Modifier
                    .size(16.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { onRemove() },
                tint = colorScheme.onSurfaceVariant
            )
        }
    }
}

// ─── 单任务限速编辑（通用居下弹窗：标题 + 下载/上传输入 + 预设档 + 保存） ───

@Composable
private fun TaskLimitDialog(
    current: Pair<String, String>?,
    isHttpTask: Boolean,
    onSave: (dl: String, ul: String) -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var dl by remember { mutableStateOf(normalizeLimit(current?.first ?: "0")) }
    var ul by remember { mutableStateOf(normalizeLimit(current?.second ?: "0")) }

    BottomConfirmDialog(
        title = stringResource(R.string.speed_limit),
        subtitle = stringResource(R.string.speed_limit_hint),
        confirmLabel = stringResource(R.string.save),
        confirmContainerColor = colorScheme.primary,
        confirmContentColor = colorScheme.onPrimary,
        onConfirm = {
            // 空值 = 跟随全局（提交 0，引擎按不限速处理）
            onSave(dl.trim().ifEmpty { "0" }, ul.trim().ifEmpty { "0" })
        },
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(12.dp))
            LimitField(colorScheme, stringResource(R.string.speed_limit_download), dl) { dl = it }
            if (!isHttpTask) {
                Spacer(Modifier.height(8.dp))
                LimitField(colorScheme, stringResource(R.string.speed_limit_upload), ul) { ul = it }
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("", "1M", "5M", "10M", "20M", "50M").forEach { preset ->
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = colorScheme.surfaceContainerHighest,
                        modifier = Modifier.clickable { dl = preset; if (!isHttpTask) ul = preset }
                    ) {
                        Text(
                            preset.ifEmpty { stringResource(R.string.speed_limit_unlimited) },
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                        )
                    }
                }
            }
        }
    )
}

/** "0"/空 → ""（跟随全局）；其余原样（"5M"/"500K"/字节数） */
private fun normalizeLimit(v: String): String = when (v.trim()) {
    "", "0" -> ""
    else -> v.trim()
}

@Composable
private fun LimitField(
    colorScheme: androidx.compose.material3.ColorScheme,
    label: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        label = { Text(label) },
        placeholder = {
            Text(
                stringResource(R.string.speed_limit_unlimited),
                style = MaterialTheme.typography.bodySmall
            )
        },
        textStyle = MaterialTheme.typography.bodyMedium,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    )
}

// ─── 信息行 ───

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(76.dp)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun CopyableInfoRow(label: String, value: String) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                clipboard.setText(AnnotatedString(value))
                Toast.makeText(context, context.getString(R.string.copied_to_clipboard), Toast.LENGTH_SHORT).show()
            }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(76.dp)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Icon(
            Icons.Default.ContentCopy,
            contentDescription = stringResource(R.string.copy),
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}