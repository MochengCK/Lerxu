package com.lerxu.android.ui.screen

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.R
import com.lerxu.android.model.TaskFile
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * 添加任务 —— 底部弹窗。
 *
 * 三阶段流程：
 * 0 输入：链接 / 种子文件两种模式，自动检测剪贴板链接；
 * 1 解析：磁力/种子以 bt-file-selection 添加，轮询元数据（就绪后引擎自动暂停）；
 * 2 勾选：文件表格（默认全选），确认后 select-file + 恢复下载；
 *   未确认即退出则任务保留，状态"待选择文件"，点击任务可重开选择。
 * 直链（http/https/ftp）不经勾选流程，直接添加。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTaskDialog(
    viewModel: TaskViewModel,
    initialUrl: String? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = MaterialTheme.colorScheme
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val dismissAnimated: () -> Unit = {
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
        Unit
    }

    var phase by remember { mutableIntStateOf(0) }
    var mode by remember { mutableIntStateOf(0) }
    var url by remember { mutableStateOf(initialUrl ?: "") }
    var fileName by remember { mutableStateOf("") }
    var downloadDir by remember { mutableStateOf(EngineManager.getDownloadDirSafe()) }
    var torrentName by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var clipboardSuggestion by remember { mutableStateOf<String?>(null) }

    var pendingGid by remember { mutableStateOf<String?>(null) }
    var pendingName by remember { mutableStateOf("") }
    var pendingFiles by remember { mutableStateOf<List<TaskFile>>(emptyList()) }
    var selection by remember { mutableStateOf<Set<Int>>(emptySet()) }

    val isMagnet = url.startsWith("magnet:")
    val isHttp = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("ftp://")

    val abortPending: (backToInput: Boolean) -> Unit = { back ->
        pendingGid?.let { gid ->
            scope.launch {
                try { viewModel.getRpcClient().removeTask(gid) } catch (_: Exception) {}
            }
        }
        pendingGid = null
        pendingFiles = emptyList()
        if (back) {
            phase = 0
            torrentName = ""
        }
    }

    val startSelectionFlow: (add: suspend () -> String) -> Unit = { add ->
        scope.launch {
            val gid = try {
                add()
            } catch (e: Exception) {
                error = context.getString(R.string.add_task_failed, e.message ?: "")
                return@launch
            }
            pendingGid = gid
            phase = 1
            error = null
            val deadline = System.currentTimeMillis() + 120_000L
            while (isActive && System.currentTimeMillis() < deadline) {
                delay(1000)
                val t = try {
                    viewModel.getRpcClient().tellStatus(gid)
                } catch (_: Exception) {
                    continue
                }
                if (t.files.isNotEmpty()) {
                    pendingName = t.fileName
                    pendingFiles = t.files
                    selection = (0 until t.files.size).toSet()
                    phase = 2
                    return@launch
                }
                if (t.status == "error") {
                    error = context.getString(R.string.metadata_parse_failed)
                    abortPending(true)
                    return@launch
                }
            }
            pendingGid = null
            error = context.getString(R.string.metadata_parse_failed)
            phase = 0
            torrentName = ""
        }
    }

    val confirmSelection: () -> Unit = {
        scope.launch {
            val gid = pendingGid ?: return@launch
            val sel = selection.map { it + 1 }
            if (sel.isEmpty()) {
                Toast.makeText(context, context.getString(R.string.select_at_least_one), Toast.LENGTH_SHORT).show()
                return@launch
            }
            val ok = try {
                viewModel.getRpcClient().changeTaskOption(
                    gid, mapOf("select-file" to kotlinx.serialization.json.JsonPrimitive(sel.joinToString(",")))
                )
            } catch (_: Exception) { false }
            if (ok) {
                try { viewModel.getRpcClient().resumeTask(gid) } catch (_: Exception) {}
                pendingGid = null
                dismissAnimated()
            } else {
                Toast.makeText(context, context.getString(R.string.selection_failed), Toast.LENGTH_SHORT).show()
            }
        }
    }

    LaunchedEffect(Unit) {
        if (initialUrl == null && url.isEmpty()) {
            try {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val text = cm?.primaryClip?.getItemAt(0)?.text?.toString()
                if (!text.isNullOrBlank() &&
                    (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("magnet:") || text.startsWith("ftp://"))
                ) {
                    clipboardSuggestion = text
                }
            } catch (_: Exception) {
            }
        }
    }

    val torrentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val name = queryFileName(context, uri) ?: "task.torrent"
                val dest = File(context.cacheDir, "torrent_$name")
                context.contentResolver.openInputStream(uri)?.use { input ->
                    dest.outputStream().use { input.copyTo(it) }
                }
                torrentName = name
                error = null
                startSelectionFlow {
                    viewModel.getRpcClient().addTorrent(
                        android.util.Base64.encodeToString(dest.readBytes(), android.util.Base64.NO_WRAP),
                        downloadDir, awaitSelection = true
                    )
                }
            } catch (e: Exception) {
                error = context.getString(R.string.read_torrent_failed, e.message ?: "")
            }
        }
    }

    /**
     * 拉起种子选择器。
     *
     * 先按种子类型找，找不到退回通配类型（第三方文件管理器多半只认通配）；
     * 两条都不行才报错，而且**把真实原因带出来** —— 系统都自带文件选择器，
     * 一句"设备上没有选择器"只会误导（用户点名）。
     */
    val pickTorrent: () -> Unit = {
        val first = tryLaunch { torrentPicker.launch("application/x-bittorrent") }
        if (first != null) {
            val second = tryLaunch { torrentPicker.launch("*/*") }
            if (second != null) {
                error = context.getString(
                    R.string.file_picker_failed,
                    second.message ?: second.javaClass.simpleName
                )
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = {
            if (phase != 0) abortPending(false)
            onDismiss()
        },
        sheetState = sheetState,
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
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // ── 标题栏 ──
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    stringResource(R.string.add_download_task),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                IconButton(
                    onClick = {
                        when {
                            phase == 0 -> dismissAnimated()
                            // 解析中：取消并移除任务，回输入页
                            phase == 1 -> abortPending(true)
                            // 勾选中：保留任务为"待选择文件"，直接关闭弹窗
                            else -> {
                                pendingGid = null
                                pendingFiles = emptyList()
                                dismissAnimated()
                            }
                        }
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.close),
                        modifier = Modifier.size(20.dp),
                        tint = colorScheme.onSurfaceVariant
                    )
                }
            }

            // ── 阶段内容（带切换动画）──
            AnimatedContent(
                targetState = phase,
                transitionSpec = {
                    (fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 4 }) togetherWith
                        (fadeOut(tween(200)) + slideOutVertically(tween(200)) { -it / 4 })
                },
                label = "phaseTransition"
            ) { p ->
                when (p) {
                    // ── 阶段 1：解析中 ──
                    1 -> Column(
                        modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(34.dp),
                            strokeWidth = 3.dp,
                            color = colorScheme.primary
                        )
                        Spacer(Modifier.height(14.dp))
                        Text(
                            stringResource(R.string.magnet_parsing),
                            style = MaterialTheme.typography.bodyMedium,
                            color = colorScheme.onSurfaceVariant
                        )
                        if (torrentName.isNotEmpty()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                torrentName,
                                style = MaterialTheme.typography.labelSmall,
                                color = colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        TextButton(onClick = { abortPending(true) }) {
                            Text(stringResource(R.string.cancel))
                        }
                    }

                    // ── 阶段 2：文件勾选 ──
                    2 -> Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            stringResource(R.string.select_files_hint),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (pendingName.isNotEmpty()) {
                            Text(
                                pendingName,
                                style = MaterialTheme.typography.labelSmall,
                                color = colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = colorScheme.surfaceContainerLow,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            LazyColumn(
                                modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 4.dp)
                            ) {
                                items(pendingFiles.size) { i ->
                                    val file = pendingFiles[i]
                                    val checked = i in selection
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                selection = if (checked) selection - i else selection + i
                                            }
                                            .padding(horizontal = 14.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            if (checked) Icons.Default.CheckCircle
                                            else Icons.Default.RadioButtonUnchecked,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                            tint = if (checked) colorScheme.primary else colorScheme.outline
                                        )
                                        Spacer(Modifier.width(10.dp))
                                        Text(
                                            file.path.substringAfterLast('/').substringAfterLast('\\')
                                                .ifEmpty { stringResource(R.string.file_index, file.index) },
                                            style = MaterialTheme.typography.bodySmall,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f)
                                        )
                                        Text(
                                            formatBytes(file.length),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "${selection.size}/${pendingFiles.size}",
                                style = MaterialTheme.typography.labelMedium,
                                color = colorScheme.onSurfaceVariant
                            )
                            TextButton(
                                onClick = {
                                    selection = if (selection.size == pendingFiles.size) emptySet()
                                    else (0 until pendingFiles.size).toSet()
                                }
                            ) {
                                Text(
                                    stringResource(
                                        if (selection.size == pendingFiles.size) R.string.select_none
                                        else R.string.select_all
                                    )
                                )
                            }
                        }
                        Button(
                            onClick = confirmSelection,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().height(50.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.start_download), fontWeight = FontWeight.SemiBold)
                        }
                    }

                    // ── 阶段 0：输入 ──
                    else -> Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            SegmentedButton(
                                selected = mode == 0,
                                onClick = { mode = 0 },
                                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                            ) {
                                Text(stringResource(R.string.paste_link))
                            }
                            SegmentedButton(
                                selected = mode == 1,
                                onClick = { mode = 1 },
                                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                            ) {
                                Text(stringResource(R.string.select_torrent_file))
                            }
                        }

                        if (mode == 0) {
                            CompactField(
                                value = url,
                                onValueChange = { url = it; error = null },
                                placeholder = stringResource(R.string.url_placeholder),
                                modifier = Modifier.fillMaxWidth(),
                                leadingIcon = if (isMagnet) Icons.Default.Hub else Icons.Default.Link,
                                suffix = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        if (url.isNotBlank()) {
                                            Box(
                                                modifier = Modifier
                                                    .width(1.dp)
                                                    .height(24.dp)
                                                    .background(colorScheme.outlineVariant)
                                            )
                                            Spacer(Modifier.width(10.dp))
                                            Text(
                                                text = when {
                                                    isMagnet -> stringResource(R.string.magnet)
                                                    isHttp -> stringResource(R.string.direct_link)
                                                    else -> stringResource(R.string.unknown)
                                                },
                                                style = MaterialTheme.typography.labelMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (isMagnet || isHttp) {
                                                    colorScheme.primary
                                                } else {
                                                    colorScheme.error
                                                },
                                                modifier = Modifier.padding(end = 2.dp)
                                            )
                                        }
                                    }
                                }
                            )

                            if (clipboardSuggestion != null && url.isEmpty()) {
                                AssistChip(
                                    onClick = { url = clipboardSuggestion!!; clipboardSuggestion = null },
                                    label = {
                                        Text(
                                            clipboardSuggestion!!,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.ContentPaste,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    },
                                    colors = AssistChipDefaults.assistChipColors(
                                        containerColor = colorScheme.primaryContainer.copy(alpha = 0.5f),
                                        labelColor = colorScheme.onPrimaryContainer
                                    ),
                                    shape = CircleShape
                                )
                            }

                            if (isHttp) {
                                CompactField(
                                    value = fileName,
                                    onValueChange = { fileName = it },
                                    placeholder = stringResource(R.string.filename_optional),
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        } else {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = colorScheme.surfaceContainerLow,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        pickTorrent()
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(42.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(colorScheme.primaryContainer),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            Icons.Default.Description,
                                            contentDescription = null,
                                            modifier = Modifier.size(22.dp),
                                            tint = colorScheme.onPrimaryContainer
                                        )
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            torrentName.ifEmpty { stringResource(R.string.click_select_torrent) },
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = if (torrentName.isEmpty()) FontWeight.Normal else FontWeight.SemiBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        if (torrentName.isEmpty()) {
                                            Text(
                                                stringResource(R.string.support_local_bt),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        CompactField(
                            value = downloadDir,
                            onValueChange = { downloadDir = it },
                            placeholder = stringResource(R.string.save_to),
                            modifier = Modifier.fillMaxWidth(),
                            leadingIcon = Icons.Default.Folder
                        )

                        error?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodySmall,
                                color = colorScheme.error
                            )
                        }

                        Button(
                            onClick = {
                                if (isMagnet) {
                                    startSelectionFlow {
                                        viewModel.getRpcClient().addMagnet(url, downloadDir, awaitSelection = true)
                                    }
                                } else {
                                    viewModel.addUriTask(url, downloadDir, fileName)
                                    dismissAnimated()
                                }
                            },
                            enabled = mode == 0 && url.isNotBlank(),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                        ) {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                stringResource(if (isMagnet) R.string.confirm else R.string.start_download),
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 拉起一个外部选择器，**不让异常逃出去**（从点击回调里逃出去会直接终止进程）。
 * 返回 null 表示拉起来了；否则返回那个异常，交给调用方决定怎么处理 / 怎么报。
 */
private fun tryLaunch(launch: () -> Unit): Exception? = try {
    launch()
    null
} catch (e: Exception) {
    e
}

private fun queryFileName(context: Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
        }
    } catch (_: Exception) {
        null
    }
}

// ─── 紧凑输入框：固定 52dp、12dp 圆角，内容始终完整可见 ───

@Composable
private fun CompactField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    suffix: (@Composable RowScope.() -> Unit)? = null
) {
    val colorScheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()

    Row(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(colorScheme.surfaceContainerLowest)
            .border(
                width = 1.dp,
                color = if (focused) colorScheme.primary else colorScheme.outlineVariant,
                shape = RoundedCornerShape(12.dp)
            )
            .padding(start = 14.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (leadingIcon != null) {
            Icon(
                leadingIcon,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = if (focused) colorScheme.primary else colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(10.dp))
        }
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = colorScheme.onSurface),
                cursorBrush = SolidColor(colorScheme.primary),
                interactionSource = interactionSource,
                modifier = Modifier.fillMaxWidth()
            )
        }
        suffix?.let { it() }
    }
}
