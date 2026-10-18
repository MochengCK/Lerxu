package com.lerxu.android.ui.screen

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lerxu.android.R
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.model.TaskFile
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.theme.lerxuExtraColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * 添加任务 —— 底部**悬浮卡片**。
 *
 * 形态（2026-10-18 重做，用户点名）：一张四周不贴边的圆角卡片从底部浮起
 * （左右 14dp、底部 = 导航条 + 12dp，软键盘弹出时整体抬到键盘之上）；
 * 卡片上半是圆角输入框，下半是「＋ │ 种子文件 …… 添加」功能条 ——
 * **两块同处一张卡、中间不画任何分隔线**，功能条里的元素只有图标与文字，
 * 不带任何底色/描边（原「粘贴链接 / 选择种子文件」两段式切换已取消，
 * 选种子文件降级为一枚图标）。
 *
 * 三阶段流程不变：
 * 0 输入：链接 / 磁力 / 种子文件，自动检测剪贴板链接（有可用链接时输入框右侧
 *   出现「粘贴」图标，点了直接填入）；
 * 1 解析：磁力/种子以 bt-file-selection 添加，轮询元数据（就绪后引擎自动暂停）；
 * 2 勾选：文件表格（默认全选），确认后 select-file + 恢复下载；
 *   未确认即退出则任务保留，状态"待选择文件"，点击任务可重开选择。
 * 直链（http/https/ftp）不经勾选流程，直接添加。
 *
 * 底部那行灰字是**当前保存目录**（点击可改）。它放在卡片最下沿而不是单独一栏，
 * 是为了不打断"输入框 + 功能条"这一整块。
 */
@Composable
fun AddTaskDialog(
    viewModel: TaskViewModel,
    initialUrl: String? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = MaterialTheme.colorScheme
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current

    // ── 入场/退场动画 ──
    // 退出时先播滑出动画再真正拆掉这扇 Dialog（与 BottomConfirmDialog 同一套路），
    // 否则点遮罩会"啪"地消失。
    var visible by remember { mutableStateOf(false) }
    var exiting by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    LaunchedEffect(exiting) {
        if (exiting) {
            delay(220)
            onDismiss()
        }
    }
    val dismissAnimated: () -> Unit = {
        if (visible && !exiting) {
            exiting = true
            visible = false
        }
    }

    var phase by remember { mutableIntStateOf(0) }
    var url by remember { mutableStateOf(initialUrl ?: "") }
    var downloadDir by remember { mutableStateOf(EngineManager.getDownloadDirSafe()) }
    var torrentName by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var clipboardSuggestion by remember { mutableStateOf<String?>(null) }
    var editingDir by remember { mutableStateOf(false) }

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
        keyboard?.hide()
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

    /** 提交：磁力走元数据→勾选流程；直链直接建任务 */
    val submit: () -> Unit = {
        val target = url.trim()
        if (target.isNotEmpty()) {
            keyboard?.hide()
            if (target.startsWith("magnet:")) {
                startSelectionFlow {
                    viewModel.getRpcClient().addMagnet(target, downloadDir, awaitSelection = true)
                }
            } else {
                viewModel.addUriTask(target, downloadDir, "")
                dismissAnimated()
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
        keyboard?.hide()
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

    val bottomInset = WindowInsets.ime
        .union(WindowInsets.navigationBars)
        .only(WindowInsetsSides.Bottom)

    Dialog(
        onDismissRequest = {
            if (phase != 0) abortPending(false)
            dismissAnimated()
        },
        // 自绘弹窗：窗口铺满整屏（遮罩才盖得住手势条那一带，inset 也才是真的）
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        DialogWindowChrome()
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures {
                        if (phase != 0) abortPending(false)
                        dismissAnimated()
                    }
                },
            contentAlignment = Alignment.BottomCenter
        ) {
            // 遮罩
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(200)),
                exit = fadeOut(tween(200))
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.35f))
                )
            }

            // 悬浮卡片：自底部滑入 / 滑出
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(
                    initialOffsetY = { it },
                    animationSpec = tween(260, easing = FastOutSlowInEasing)
                ) + fadeIn(tween(200)),
                exit = slideOutVertically(
                    targetOffsetY = { it },
                    animationSpec = tween(220, easing = FastOutSlowInEasing)
                ) + fadeOut(tween(160))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        // 软键盘 / 导航条取**较大者**：叠着加会在键盘上方多出一条手势条高的空档
                        .windowInsetsPadding(bottomInset)
                        .padding(horizontal = 14.dp)
                        .padding(bottom = 12.dp)
                ) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            // 吞掉卡片内的点击，避免穿透到遮罩上误关
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) { },
                        shape = RoundedCornerShape(26.dp),
                        color = colorScheme.surface,
                        shadowElevation = 18.dp
                    ) {
                        AnimatedContent(
                            targetState = phase,
                            transitionSpec = {
                                (fadeIn(tween(220)) + slideInVertically(tween(220)) { it / 10 }) togetherWith
                                    (fadeOut(tween(150)) + slideOutVertically(tween(150)) { -it / 10 })
                            },
                            label = "phaseTransition"
                        ) { p ->
                            when (p) {
                                // ── 阶段 1：解析中 ──
                                1 -> Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 150.dp)
                                        .padding(vertical = 24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(32.dp),
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
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.padding(horizontal = 24.dp)
                                        )
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        stringResource(R.string.cancel),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = colorScheme.onSurfaceVariant,
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .clickable { abortPending(true) }
                                            .padding(horizontal = 18.dp, vertical = 8.dp)
                                    )
                                }

                                // ── 阶段 2：文件勾选 ──
                                2 -> Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            stringResource(R.string.select_files_hint),
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.weight(1f)
                                        )
                                        Box(
                                            modifier = Modifier
                                                .size(30.dp)
                                                .clip(CircleShape)
                                                .clickable {
                                                    // 勾选中退出：保留任务为"待选择文件"
                                                    pendingGid = null
                                                    pendingFiles = emptyList()
                                                    dismissAnimated()
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Rounded.Close,
                                                contentDescription = stringResource(R.string.close),
                                                modifier = Modifier.size(18.dp),
                                                tint = colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
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
                                        shape = RoundedCornerShape(16.dp),
                                        color = colorScheme.surfaceContainerHigh,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        LazyColumn(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .heightIn(max = 300.dp),
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
                                                        if (checked) Icons.Rounded.CheckCircle
                                                        else Icons.Rounded.RadioButtonUnchecked,
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
                                        Text(
                                            stringResource(
                                                if (selection.size == pendingFiles.size) R.string.select_none
                                                else R.string.select_all
                                            ),
                                            style = MaterialTheme.typography.labelLarge,
                                            color = colorScheme.primary,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(10.dp))
                                                .clickable {
                                                    selection = if (selection.size == pendingFiles.size) emptySet()
                                                    else (0 until pendingFiles.size).toSet()
                                                }
                                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                        )
                                    }
                                    Button(
                                        onClick = confirmSelection,
                                        shape = RoundedCornerShape(16.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(48.dp)
                                    ) {
                                        Icon(Icons.Rounded.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(stringResource(R.string.start_download), fontWeight = FontWeight.SemiBold)
                                    }
                                }

                                // ── 阶段 0：输入 ──
                                else -> Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(8.dp)
                                ) {
                                    // 输入框：圆角、有底色、无描边（聚焦时补一道主色细边）
                                    AddUrlField(
                                        value = url,
                                        onValueChange = { url = it; error = null },
                                        placeholder = stringResource(R.string.url_placeholder),
                                        leadingIcon = if (isMagnet) Icons.Rounded.Hub else Icons.Rounded.Link,
                                        trailing = {
                                            when {
                                                url.isNotBlank() -> Text(
                                                    text = when {
                                                        isMagnet -> stringResource(R.string.magnet)
                                                        isHttp -> stringResource(R.string.direct_link)
                                                        else -> stringResource(R.string.unknown)
                                                    },
                                                    style = MaterialTheme.typography.labelMedium,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = if (isMagnet || isHttp) colorScheme.primary else colorScheme.error,
                                                    modifier = Modifier.padding(start = 8.dp, end = 8.dp)
                                                )
                                                clipboardSuggestion != null -> Box(
                                                    modifier = Modifier
                                                        .size(34.dp)
                                                        .clip(CircleShape)
                                                        .clickable {
                                                            url = clipboardSuggestion.orEmpty()
                                                            clipboardSuggestion = null
                                                            error = null
                                                        },
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Icon(
                                                        Icons.Rounded.ContentPaste,
                                                        contentDescription = stringResource(R.string.paste_link),
                                                        modifier = Modifier.size(17.dp),
                                                        tint = colorScheme.primary
                                                    )
                                                }
                                            }
                                        }
                                    )

                                    error?.let {
                                        Text(
                                            it,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = colorScheme.error,
                                            modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp)
                                        )
                                    }

                                    // 功能条：只有图标和文字，没有任何底色/描边；
                                    // 与上面输入区同处一张卡，中间不画分隔线
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(start = 8.dp, end = 8.dp, top = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        ActionIcon(
                                            icon = Icons.Rounded.Add,
                                            contentDescription = stringResource(R.string.add),
                                            tint = if (url.isNotBlank()) colorScheme.primary
                                            else colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                            enabled = url.isNotBlank(),
                                            onClick = submit
                                        )
                                        // 竖杠：把「添加」和「选种子」两片区隔开（用户点名要这一条）
                                        Box(
                                            Modifier
                                                .padding(horizontal = 3.dp)
                                                .width(1.dp)
                                                .height(18.dp)
                                                .background(lerxuExtraColors.dialogDivider)
                                        )
                                        ActionIcon(
                                            icon = Icons.Rounded.Description,
                                            contentDescription = stringResource(R.string.select_torrent_file),
                                            tint = colorScheme.onSurfaceVariant,
                                            onClick = pickTorrent
                                        )
                                        Spacer(Modifier.weight(1f))
                                        Text(
                                            stringResource(R.string.add),
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (url.isNotBlank()) colorScheme.primary
                                            else colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(10.dp))
                                                .clickable(enabled = url.isNotBlank(), onClick = submit)
                                                .padding(horizontal = 12.dp, vertical = 8.dp)
                                        )
                                    }

                                    // 保存目录：一行灰字（点一下可改），不单独占一栏
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(12.dp))
                                            .clickable { editingDir = true }
                                            .padding(start = 12.dp, end = 12.dp, top = 2.dp, bottom = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            Icons.Rounded.Folder,
                                            contentDescription = null,
                                            modifier = Modifier.size(13.dp),
                                            tint = colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                        )
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            downloadDir,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 保存目录编辑：借用通用底部确认弹窗，避免再手写一扇窗口
    if (editingDir) {
        var draft by remember { mutableStateOf(downloadDir) }
        BottomConfirmDialog(
            title = stringResource(R.string.save_to),
            confirmLabel = stringResource(R.string.confirm),
            confirmEnabled = draft.isNotBlank(),
            confirmContainerColor = colorScheme.primary,
            confirmContentColor = colorScheme.onPrimary,
            onConfirm = { downloadDir = draft.trim() },
            onDismiss = { editingDir = false },
            content = {
                Spacer(Modifier.height(12.dp))
                BasicTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = colorScheme.onSurface),
                    cursorBrush = SolidColor(colorScheme.primary),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(colorScheme.surfaceContainerLowest)
                        .padding(horizontal = 14.dp, vertical = 13.dp)
                )
            }
        )
    }
}

// ─── 输入框 ───

/**
 * 圆角输入框：54dp 高、18dp 圆角、浅一档底色，聚焦时才补一道主色细边。
 * `trailing` 放右侧的"类型"文字或"粘贴"图标 —— 两者都只有文字/图标，不带底色。
 */
@Composable
private fun AddUrlField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    val colorScheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val shape = RoundedCornerShape(18.dp)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(shape)
            .background(colorScheme.surfaceContainerHigh)
            .then(if (focused) Modifier.border(1.dp, colorScheme.primary, shape) else Modifier)
            .padding(start = 15.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            leadingIcon,
            contentDescription = null,
            modifier = Modifier.size(19.dp),
            tint = if (focused) colorScheme.primary else colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(10.dp))
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
        trailing?.invoke()
    }
}

/** 功能条上的图标按钮：40dp 触摸区、只画图标，没有底色与描边 */
@Composable
private fun ActionIcon(
    icon: ImageVector,
    contentDescription: String,
    tint: Color,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(21.dp),
            tint = tint
        )
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
