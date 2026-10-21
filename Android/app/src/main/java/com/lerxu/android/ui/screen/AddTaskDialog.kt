package com.lerxu.android.ui.screen

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lerxu.android.R
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.model.LanPeer
import com.lerxu.android.model.TaskFile
import com.lerxu.android.ui.LerxuAdd
import com.lerxu.android.ui.LerxuCheckCircle
import com.lerxu.android.ui.LerxuChevronRight
import com.lerxu.android.ui.LerxuCircle
import com.lerxu.android.ui.LerxuClose
import com.lerxu.android.ui.LerxuComputer
import com.lerxu.android.ui.LerxuDevices
import com.lerxu.android.ui.LerxuDownload
import com.lerxu.android.ui.LerxuFolder
import com.lerxu.android.ui.LerxuPaste
import com.lerxu.android.ui.LerxuPhone
import com.lerxu.android.ui.LerxuPlay
import com.lerxu.android.ui.LerxuSend
import com.lerxu.android.ui.LerxuUpload
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.theme.lerxuExtraColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** 输入区的三种模式（滑块那三档）。 */
private enum class AddMode { Link, Local, Transfer }

/** 文件传输面板里已选中的本地文件（保留显示名，免得发送时再查一遍）。 */
private data class PickedFile(val uri: Uri, val name: String)

/**
 * 添加任务 —— 底部**悬浮卡片**。
 *
 * 形态（2026-10-18 重做，用户点名）：一张四周不贴边的圆角卡片从底部浮起
 * （左右 14dp、底部 = 导航条 + 12dp，软键盘弹出时整体抬到键盘之上）。
 * **整张卡片就是那个输入框**：输入区与功能条共用同一个底色，没有任何色块差异、
 * 分隔线或横杠；输入框里只有文字本身（左侧无图标、两侧都不显示链接类型）。
 * 输入卡片**上方悬浮**一枚「链接 / 本地播放 / 文件传输」滑块（独立组件、圆角、
 * 左右不贴边、无阴影）；切到本地播放后，卡片里只留一个「选择文件」入口，选完直接起播；
 * 切到文件传输后，卡片里是同局域网设备、已选文件与传输进度。
 * 功能条一行三段：左「📁 目录」、中「选种子文件」、右「＋ 添加」—— 元素只有图标
 * 与文字，不带任何底色/描边；目录这一行点按也不出现背景高亮。目录 / 种子文件 /
 * 本地播放的文件选择都走系统选择器。
 *
 * 链接类型由内部自动判断（磁力 → 元数据解析流程；其余直链直接建任务），
 * 不在界面上显示。剪贴板里有可用链接时，输入框右侧会出现一枚「粘贴」图标。
 *
 * 三阶段流程不变：
 * 0 输入：链接 / 磁力 / 种子文件 / 本地播放；
 * 1 解析：磁力/种子以 bt-file-selection 添加，轮询元数据（就绪后引擎自动暂停）；
 * 2 勾选：文件表格（默认全选），确认后 select-file + 恢复下载；
 *   未确认即退出则任务保留，状态"待选择文件"，点击任务可重开选择。
 * 直链（http/https/ftp）不经勾选流程，直接添加。
 */
@Composable
fun AddTaskDialog(
    viewModel: TaskViewModel,
    initialUrl: String? = null,
    onPlayLocal: (Uri, String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = MaterialTheme.colorScheme
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val urlFocus = remember { FocusRequester() }

    // ── 入场/退场动画 ──
    // 退出时先播滑出动画再真正拆掉这扇 Dialog（与 BottomConfirmDialog 同一套路），
    // 否则点遮罩会"啪"地消失。
    var visible by remember { mutableStateOf(false) }
    var exiting by remember { mutableStateOf(false) }
    // 退场动画结束后再执行的动作（本地播放要等弹窗完全收起后再开播放器，
    // 否则覆盖层会被 Dialog 窗口压住 / 方向先转了、弹窗还挂在那儿）
    var afterExit by remember { mutableStateOf<(() -> Unit)?>(null) }
    LaunchedEffect(Unit) { visible = true }
    LaunchedEffect(exiting) {
        if (exiting) {
            delay(220)
            val action = afterExit
            afterExit = null
            action?.invoke()
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
    // 链接 / 本地播放 / 文件传输
    var mode by remember { mutableStateOf(AddMode.Link) }
    // 自动聚焦只发生在**刚打开这一下**：从目录 / 种子 / 本地播放选择器回来时不再抢焦点
    var autoFocusPending by remember { mutableStateOf(true) }

    // ── 文件传输（设备与任务都来自引擎 lan.*，安卓端不再自己跑发现） ──
    val peers by viewModel.lanPeers.collectAsState()
    var selectedPeerId by remember { mutableStateOf<String?>(null) }
    var pickedFiles by remember { mutableStateOf<List<PickedFile>>(emptyList()) }
    // 总开关关闭时，传输面板只显示提示，不拉起设备/文件选择
    var lanEnabled by remember { mutableStateOf(true) }
    val selectedPeer = peers.firstOrNull { it.id == selectedPeerId }

    // 选中的设备离线后清掉选择，避免"发给一台已经看不见的机器"
    LaunchedEffect(peers) {
        val current = selectedPeerId
        if (current != null && peers.none { it.id == current }) selectedPeerId = null
    }

    var pendingGid by remember { mutableStateOf<String?>(null) }
    var pendingName by remember { mutableStateOf("") }
    var pendingFiles by remember { mutableStateOf<List<TaskFile>>(emptyList()) }
    var selection by remember { mutableStateOf<Set<Int>>(emptySet()) }

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

    /**
     * 提交。输入是**一行一个链接**：
     * - 只有一行：磁力走元数据→勾选流程，其余直链直接建任务（原行为）；
     * - 多行：逐行建任务。磁力以「待选择文件」状态挂起（**不自动全选下载**），
     *   关窗后在任务列表点它再挑文件 —— 批量粘贴时不该替用户把所有文件都勾上。
     */
    val submit: () -> Unit = {
        val lines = url.split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.isNotEmpty()) {
            keyboard?.hide()
            if (lines.size == 1) {
                val target = lines.first()
                if (target.startsWith("magnet:")) {
                    startSelectionFlow {
                        viewModel.getRpcClient().addMagnet(target, downloadDir, awaitSelection = true)
                    }
                } else {
                    viewModel.addUriTask(target, downloadDir, "")
                    dismissAnimated()
                }
            } else {
                lines.forEach { line ->
                    if (line.startsWith("magnet:")) {
                        viewModel.addMagnetTask(line, downloadDir, awaitSelection = true)
                    } else {
                        viewModel.addUriTask(line, downloadDir, "")
                    }
                }
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

    /**
     * 拉起系统选择器前统一收键盘、清焦点。
     *
     * 用户点名：从「选择目录 / 选择文件」退出来时输入框会**重新聚焦**。根子就是
     * 离开应用时输入框一直拿着焦点、窗口回来又把它顶出来。这里在跳出去之前显式
     * 放掉焦点；回来时也不会再自动要一次（自动聚焦只在弹窗刚打开时）。
     */
    val closeInputFocus: () -> Unit = {
        // 顺手取消还没执行的自动聚焦：否则刚打开就点选择器时，
        // 那一拍仍可能把键盘拉起来
        autoFocusPending = false
        focusManager.clearFocus()
        keyboard?.hide()
        error = null
    }

    // ── 种子文件：系统文件选择器 ──
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
                    val base64 = withContext(Dispatchers.IO) {
                        android.util.Base64.encodeToString(dest.readBytes(), android.util.Base64.NO_WRAP)
                    }
                    viewModel.getRpcClient().addTorrent(base64, downloadDir, awaitSelection = true)
                }
            } catch (e: Exception) {
                error = context.getString(R.string.read_torrent_failed, e.message ?: "")
            }
        }
    }

    val pickTorrent: () -> Unit = {
        closeInputFocus()
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

    // ── 保存目录：系统文件夹选择器（SAF 树 URI → 真实路径） ──
    val dirPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri: Uri? ->
        if (uri != null) {
            val path = treeUriToPath(uri)
            when {
                path == null -> Toast.makeText(
                    context,
                    context.getString(R.string.select_local_directory),
                    Toast.LENGTH_SHORT
                ).show()
                !File(path).canWrite() -> Toast.makeText(
                    context,
                    context.getString(R.string.directory_not_writable),
                    Toast.LENGTH_SHORT
                ).show()
                else -> downloadDir = path
            }
        }
    }

    val pickDirectory: () -> Unit = {
        closeInputFocus()
        val failure = tryLaunch { dirPicker.launch(downloadDirTreeUri(downloadDir)) }
        if (failure != null) {
            error = context.getString(
                R.string.file_picker_failed,
                failure.message ?: failure.javaClass.simpleName
            )
        }
    }

    // ── 本地播放：系统文件选择器（视频 / 音频） ──
    val localPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            val title = queryFileName(context, uri) ?: context.getString(R.string.local_playback)
            // 等弹窗退场动画走完再开播放器（否则覆盖层会被 Dialog 窗口压住）
            afterExit = { onPlayLocal(uri, title) }
            dismissAnimated()
        }
    }

    val pickLocalMedia: () -> Unit = {
        closeInputFocus()
        val failure = tryLaunch { localPicker.launch(arrayOf("video/*", "audio/*")) }
        if (failure != null) {
            error = context.getString(
                R.string.file_picker_failed,
                failure.message ?: failure.javaClass.simpleName
            )
        }
    }

    // ── 文件传输：系统选择器（多选） ──
    val transferPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            scope.launch {
                val added = withContext(Dispatchers.IO) {
                    uris.map { uri ->
                        val fallback = uri.lastPathSegment.orEmpty().substringAfterLast('/')
                        PickedFile(uri, queryFileName(context, uri) ?: fallback.ifEmpty { "file" })
                    }
                }
                // 同一个文件重复选不叠加
                pickedFiles = (pickedFiles + added).distinctBy { it.uri }
            }
        }
    }

    val pickTransferFiles: () -> Unit = {
        closeInputFocus()
        val failure = tryLaunch { transferPicker.launch(arrayOf("*/*")) }
        if (failure != null) {
            error = context.getString(
                R.string.file_picker_failed,
                failure.message ?: failure.javaClass.simpleName
            )
        }
    }

    // 入队成功就收起弹窗：进度回主页任务列表里看；失败留在弹窗里让用户重试
    val sendTransfer: () -> Unit = {
        val peer = selectedPeer
        val files = pickedFiles
        if (peer != null && files.isNotEmpty()) {
            error = null
            scope.launch {
                // content:// → cacheDir 拷贝 + lan.send 都在 Repository 里做
                val failure = viewModel.sendLanFiles(peer.id, files.map { it.uri })
                if (failure == null) {
                    pickedFiles = emptyList()
                    dismissAnimated()
                } else {
                    error = failure
                }
            }
        }
    }

    val selectMode: (AddMode) -> Unit = { next ->
        if (next != mode) {
            // 切回「链接」要**自动聚焦并拉起键盘**（用户点名）；切到本地/传输则清焦点
            autoFocusPending = next == AddMode.Link
            focusManager.clearFocus()
            keyboard?.hide()
            mode = next
            if (next == AddMode.Transfer) {
                // 不用等 2.5s 的轮询，进面板先拉一次设备与互传开关
                viewModel.refreshLan()
                scope.launch {
                    viewModel.getLanConfig()?.let { lanEnabled = it.enabled }
                }
            }
        }
    }

    // 键盘 pop 出来时 inset 是**跳变量** —— 直接吃进去卡片会"啪"地跳上去。
    // 这里把「IME / 导航条取较大者」换算成 dp 再补一段 tween，
    // 让卡片跟键盘一起滑上来（键盘动画约 250ms，取 240ms 基本同步）。
    val density = LocalDensity.current
    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val navBottomPx = WindowInsets.navigationBars.getBottom(density)
    val targetBottom = with(density) { maxOf(imeBottomPx, navBottomPx).toDp() }
    val animatedBottom by animateDpAsState(
        targetValue = targetBottom,
        animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        label = "bottomInset"
    )

    Dialog(
        // 返回键按层级退：先退本地播放，最后才关整扇弹窗 ——
        // 一按返回就把用户挑了一半的东西全丢掉不是好手感
        onDismissRequest = {
            when {
                phase != 0 -> {
                    abortPending(false)
                    dismissAnimated()
                }
                mode != AddMode.Link -> mode = AddMode.Link
                else -> dismissAnimated()
            }
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
                        // 软键盘 / 导航条取较大者（上面已算好并做了动画）
                        .padding(bottom = animatedBottom)
                        .padding(horizontal = 14.dp)
                        .padding(bottom = 12.dp)
                ) {
                    // 「链接 / 本地播放 / 文件传输」是**独立的一枚滑块**，悬浮在输入卡片上方，
                    // 不裹在卡片里；只有输入阶段（phase 0）出现
                    AnimatedVisibility(
                        visible = phase == 0,
                        enter = fadeIn(tween(160)),
                        exit = fadeOut(tween(120))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 10.dp),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            AddModeSwitch(
                                mode = mode,
                                onSelect = selectMode
                            )
                        }
                    }

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            // 吞掉卡片内的点击，避免穿透到遮罩上误关
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) { },
                        shape = RoundedCornerShape(18.dp),
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
                                                LerxuClose,
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
                                                        if (checked) LerxuCheckCircle
                                                        else LerxuCircle,
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
                                        Icon(LerxuDownload, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(stringResource(R.string.start_download), fontWeight = FontWeight.SemiBold)
                                    }
                                }

                                // ── 阶段 0：链接 / 本地播放 ──
                                // 上方那枚滑块是独立组件；这张卡片只承载链接输入，
                                // 或本地播放的「选择文件」入口（文件选择走系统选择器）。
                                else -> {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 8.dp, vertical = 6.dp)
                                    ) {
                                        AnimatedContent(
                                            targetState = mode,
                                            transitionSpec = {
                                                (fadeIn(tween(180)) + slideInVertically(tween(180)) { it / 14 }) togetherWith
                                                    (fadeOut(tween(120)) + slideOutVertically(tween(140)) { -it / 14 })
                                            },
                                            label = "inputMode"
                                        ) { m ->
                                            if (m == AddMode.Local) {
                                                LocalPlayPane(onPick = pickLocalMedia)
                                            } else if (m == AddMode.Transfer) {
                                                TransferPane(
                                                    enabled = lanEnabled,
                                                    peers = peers,
                                                    selectedPeer = selectedPeer,
                                                    onSelectPeer = { selectedPeerId = it },
                                                    files = pickedFiles,
                                                    onRemoveFile = { pickedFiles = pickedFiles - it },
                                                    error = error,
                                                    onPickFiles = pickTransferFiles,
                                                    onSend = sendTransfer,
                                                    sendEnabled = selectedPeer != null && pickedFiles.isNotEmpty()
                                                )
                                            } else {
                                                Column(Modifier.fillMaxWidth()) {
                                                    // 输入框里只有文字本身：**不显示链接类型、也没有左侧图标**
                                                    // （类型判断仍在内部做 —— 磁力走元数据→勾选，其余直接建任务）。
                                                    AddUrlField(
                                                        value = url,
                                                        // 允许手动换行：一行一个链接（多行时逐行建任务）
                                                        onValueChange = { url = it; error = null },
                                                        placeholder = stringResource(R.string.url_placeholder),
                                                        focusRequester = urlFocus,
                                                        autoFocus = autoFocusPending,
                                                        onAutoFocused = { autoFocusPending = false },
                                                        trailing = {
                                                            if (clipboardSuggestion != null && url.isEmpty()) {
                                                                Box(
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
                                                                        LerxuPaste,
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

                                                    // 功能条：左「目录」…… 中「选种子文件」│ 最右「＋ 添加」。
                                                    // 只有文字和图标（无底色、无描边），与上面输入区同色、中间零分隔。
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(start = 12.dp, end = 2.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        // 左：当前保存目录（点一下打开自研文件夹浏览器）
                                                        Row(
                                                            modifier = Modifier
                                                                .weight(1f)
                                                                .heightIn(min = 40.dp)
                                                                // 只做跳转，不画水波纹（用户点名：不要背景高亮）
                                                                .clickable(
                                                                    interactionSource = remember { MutableInteractionSource() },
                                                                    indication = null,
                                                                    onClick = pickDirectory
                                                                )
                                                                .padding(vertical = 10.dp),
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Icon(
                                                                LerxuFolder,
                                                                contentDescription = null,
                                                                modifier = Modifier.size(13.dp),
                                                                tint = colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                                            )
                                                            Spacer(Modifier.width(6.dp))
                                                            Text(
                                                                text = shortDir(downloadDir),
                                                                style = MaterialTheme.typography.labelSmall,
                                                                color = colorScheme.onSurfaceVariant,
                                                                maxLines = 1,
                                                                overflow = TextOverflow.StartEllipsis,
                                                                modifier = Modifier.weight(1f)
                                                            )
                                                        }

                                                        // 选种子文件：图标，落在「添加」左侧
                                                        ActionIcon(
                                                            icon = LerxuTorrentFile,
                                                            contentDescription = stringResource(R.string.select_torrent_file),
                                                            tint = colorScheme.onSurfaceVariant,
                                                            onClick = pickTorrent
                                                        )

                                                        // 竖杠：把「选种子文件」与「添加」两片区隔开
                                                        Box(
                                                            Modifier
                                                                .padding(horizontal = 4.dp)
                                                                .width(1.dp)
                                                                .height(18.dp)
                                                                .background(lerxuExtraColors.dialogDivider)
                                                        )

                                                        // 最右：添加（图标 + 文字）
                                                        Row(
                                                            modifier = Modifier
                                                                .clip(RoundedCornerShape(10.dp))
                                                                .clickable(enabled = url.isNotBlank(), onClick = submit)
                                                                .padding(horizontal = 8.dp, vertical = 8.dp),
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Icon(
                                                                LerxuAdd,
                                                                contentDescription = null,
                                                                modifier = Modifier.size(17.dp),
                                                                tint = if (url.isNotBlank()) colorScheme.primary
                                                                else colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                                            )
                                                            Spacer(Modifier.width(4.dp))
                                                            Text(
                                                                stringResource(R.string.add),
                                                                style = MaterialTheme.typography.titleSmall,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = if (url.isNotBlank()) colorScheme.primary
                                                                else colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
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
                    }
                }
            }
        }
    }
}

// ─── 文件传输面板 ───

/**
 * 「文件传输」面板。
 *
 * 自上而下只有三块，没有任何小标题：
 * 1. 大块可点的**文件选择框**（图标 + 文案，点击拉起系统多选）；
 * 2. 「附近设备」选择行（左侧当前设备名称 / 平台，右侧在线点 + 箭头，点开选择面板）；
 * 3. 发送。
 * 传输进度不在这里重复展示 —— 主任务列表已经把它们并进去了。
 */
@Composable
private fun TransferPane(
    enabled: Boolean,
    peers: List<LanPeer>,
    selectedPeer: LanPeer?,
    onSelectPeer: (String) -> Unit,
    files: List<PickedFile>,
    onRemoveFile: (PickedFile) -> Unit,
    error: String?,
    onPickFiles: () -> Unit,
    onSend: () -> Unit,
    sendEnabled: Boolean
) {
    val colorScheme = MaterialTheme.colorScheme
    var devicePickerOpen by remember { mutableStateOf(false) }

    if (!enabled) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                LerxuDevices,
                contentDescription = null,
                modifier = Modifier.size(30.dp),
                tint = colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
            )
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.transfer_disabled_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(5.dp))
            Text(
                stringResource(R.string.transfer_disabled_sub),
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // ── 文件选择框（大块可点区域，左上角不放任何标题）──
        // 已选文件挂在同一个框的下半部分，保证第一项就是"选文件"。
        PickFileCard(
            icon = LerxuUpload,
            title = stringResource(R.string.transfer_pick_files),
            hint = if (files.isEmpty()) {
                stringResource(R.string.transfer_pick_hint)
            } else {
                stringResource(R.string.transfer_selected_count, files.size)
            },
            onClick = onPickFiles
        ) {
            if (files.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 88.dp)
                        .padding(horizontal = 12.dp)
                ) {
                    items(files.size) { index ->
                        val file = files[index]
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                file.name,
                                style = MaterialTheme.typography.labelSmall,
                                color = colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .clickable { onRemoveFile(file) },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    LerxuClose,
                                    contentDescription = stringResource(R.string.close),
                                    modifier = Modifier.size(13.dp),
                                    tint = colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        error?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.error,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }

        // ── 底部一行：附近设备选择框（占剩余宽度）+ 发送（最右）──
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { devicePickerOpen = true }
                    .padding(start = 10.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    LerxuDevices,
                    contentDescription = null,
                    modifier = Modifier.size(17.dp),
                    tint = colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.width(8.dp))
                // 未选设备时只留「附近设备」一个主标题；设备名选中后再占位
                Text(
                    text = selectedPeer?.name ?: stringResource(R.string.transfer_nearby_devices),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (selectedPeer != null) FontWeight.SemiBold else FontWeight.Normal,
                    color = colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    LerxuChevronRight,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = colorScheme.onSurfaceVariant
                )
            }

            Spacer(Modifier.width(4.dp))

            // 发送 —— 主色文字，位置与「添加」一致（最右）
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = sendEnabled, onClick = onSend)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val tint = if (sendEnabled) colorScheme.primary
                else colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                Icon(
                    LerxuSend,
                    contentDescription = null,
                    modifier = Modifier.size(17.dp),
                    tint = tint
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    stringResource(R.string.transfer_send),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = tint
                )
            }
        }
    }

    // 设备选择面板：一行一台（名称 + 平台/IP + 在线点）
    if (devicePickerOpen) {
        Dialog(onDismissRequest = { devicePickerOpen = false }) {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = colorScheme.surface
            ) {
                Column(modifier = Modifier.padding(vertical = 12.dp)) {
                    Text(
                        stringResource(R.string.transfer_nearby_devices),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                    if (peers.isEmpty()) {
                        Text(
                            stringResource(R.string.transfer_no_devices),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 320.dp)
                                .padding(horizontal = 6.dp)
                        ) {
                            items(peers.size) { index ->
                                val peer = peers[index]
                                PeerRow(
                                    peer = peer,
                                    selected = peer.id == selectedPeer?.id,
                                    onClick = {
                                        onSelectPeer(peer.id)
                                        devicePickerOpen = false
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 一行一台设备：名称 + 平台/IP + 在线点；选中时只有一层浅色高亮。 */
@Composable
private fun PeerRow(
    peer: LanPeer,
    selected: Boolean,
    onClick: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (selected) colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            if (peer.platform.equals("android", ignoreCase = true)) LerxuPhone else LerxuComputer,
            contentDescription = null,
            modifier = Modifier.size(17.dp),
            tint = if (selected) colorScheme.primary else colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(
                peer.name,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (selected) colorScheme.primary else colorScheme.onSurface
            )
            Text(
                "${platformLabel(peer.platform)} · ${peer.address}",
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/** 平台名只是设备类型的展示，不随语言翻译。 */
private fun platformLabel(platform: String): String = when (platform.lowercase()) {
    "macos" -> "macOS"
    "windows" -> "Windows"
    "linux" -> "Linux"
    "android" -> "Android"
    else -> platform.ifBlank { "unknown" }
}

// ─── 本地播放入口 ───

/**
 * 文件选择的通用大卡片：图标 + 主标题 + 一句提示。
 *
 * 「文件传输」和「本地播放」共用同一块，保证两个入口的尺寸、圆角、
 * 图标笔法与点击热区完全一致；下方内容由调用方追加（如已选文件列表）。
 */
@Composable
private fun PickFileCard(
    icon: ImageVector,
    title: String,
    hint: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit = {}
) {
    val colorScheme = MaterialTheme.colorScheme
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colorScheme.surfaceContainerHigh)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 108.dp)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(26.dp),
                    tint = colorScheme.primary
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = colorScheme.onSurface
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    hint,
                    style = MaterialTheme.typography.labelSmall,
                    color = colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
        content()
    }
}

/**
 * 「本地播放」面板：与文件传输同一块选择文件卡片。
 * 文件选择交回**系统选择器**（见 localPicker）；选完直接起播，选取消就停在这里。
 */
@Composable
private fun LocalPlayPane(onPick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp)
    ) {
        PickFileCard(
            icon = LerxuPlay,
            title = stringResource(R.string.select_file),
            hint = stringResource(R.string.local_play_hint),
            onClick = onPick
        )
    }
}

// ─── 输入框 ───

/**
 * 输入行：只有文字本身 —— **没有左侧图标、也不在两侧显示链接类型**
 * （卡片本身就是输入框，底色与下方功能条一致）。
 * [autoFocus] 只在弹窗刚打开时为真：第一帧就把光标送进来（用户点名"不要延迟一会"）；
 * 从系统选择器 / 本地播放回来时不再抢焦点。
 * `trailing` 只用于「剪贴板里有链接」时那枚粘贴图标。
 */
@Composable
private fun AddUrlField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    focusRequester: FocusRequester,
    autoFocus: Boolean,
    onAutoFocused: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    val colorScheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }
    val keyboard = LocalSoftwareKeyboardController.current
    // 等这一帧的工夫里用户可能已经切走了：执行前再读一次最新值，
    // 不在输入框已经被替换掉时还把键盘拉起来
    val autoFocusNow by rememberUpdatedState(autoFocus)

    LaunchedEffect(Unit) {
        if (autoFocusNow) {
            withFrameNanos { }
            if (!autoFocusNow) return@LaunchedEffect
            runCatching { focusRequester.requestFocus() }
            withFrameNanos { }
            if (!autoFocusNow) return@LaunchedEffect
            keyboard?.show()
            onAutoFocused()
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .padding(start = 12.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                // 一行一个链接：回车手动换行，最多 6 行（再多就内部滚动，避免卡片顶到屏幕外）
                singleLine = false,
                maxLines = 6,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = colorScheme.onSurface),
                cursorBrush = SolidColor(colorScheme.primary),
                interactionSource = interactionSource,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
            )
        }
        trailing?.invoke()
    }
}

/**
 * 「链接 / 本地播放 / 文件传输」滑块：一枚**独立**的圆角胶囊，悬浮在输入卡片上方。
 *
 * 不裹进输入卡片里、也不带投影；只有文字（没有图标），高亮块 240ms 滑动。
 * 三档时胶囊整体加宽到 0.88（每档宽度与两档时基本一致），位移按档位序号算。
 * 选中文字用 onPrimary，在弹窗的白底/深色底上都是同一套读法。
 */
@Composable
private fun AddModeSwitch(
    mode: AddMode,
    onSelect: (AddMode) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val modes = remember { AddMode.values().toList() }
    val slide by animateFloatAsState(
        targetValue = mode.ordinal.toFloat(),
        animationSpec = tween(240, easing = FastOutSlowInEasing),
        label = "addModeSlide"
    )
    val onAccent = colorScheme.onPrimary
    val inset = 4.dp

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = colorScheme.surfaceContainerHigh
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .height(34.dp)
                .fillMaxWidth(0.88f)
        ) {
            val segment = (maxWidth - inset * 2) / modes.size
            Box(
                modifier = Modifier
                    .padding(horizontal = inset, vertical = 3.dp)
                    .width(segment)
                    .fillMaxHeight()
                    .offset(x = segment * slide)
                    .clip(RoundedCornerShape(15.dp))
                    .background(colorScheme.primary)
            )
            Row(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = inset)
            ) {
                modes.forEach { entry ->
                    AddModeSegment(
                        label = stringResource(
                            when (entry) {
                                AddMode.Link -> R.string.link_mode
                                AddMode.Local -> R.string.local_playback
                                AddMode.Transfer -> R.string.transfer_mode
                            }
                        ),
                        selected = entry == mode,
                        selectedColor = if (entry == mode) onAccent else colorScheme.onSurfaceVariant,
                        onClick = { onSelect(entry) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun AddModeSegment(
    label: String,
    selected: Boolean,
    selectedColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(15.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (selected) selectedColor else MaterialTheme.colorScheme.onSurfaceVariant
        )
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
 * 「选种子文件」图标：一张折角文稿 + 一枚下行箭头。
 *
 * 原来这里用的是 Material 的 `Description`（带两道正文线）—— 它读作"一份文档"，
 * 而这一枚要读作"把一个 .torrent 文件交给下载器"。折角文稿沿用播放器
 * `LerxuFile` 的轮廓；笔法与整机其它自绘图标一致（圆头、1.9 描边、24 视口）。
 */
private val LerxuTorrentFile: ImageVector by lazy {
    ImageVector.Builder(
        name = "LerxuTorrentFile",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = 1.9f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 外轮廓：右上角被折角斜切（close 就是那条切线）
            moveTo(13.8f, 3.0f)
            horizontalLineTo(7.6f)
            curveTo(6.27f, 3.0f, 5.2f, 4.07f, 5.2f, 5.4f)
            verticalLineTo(18.6f)
            curveTo(5.2f, 19.93f, 6.27f, 21.0f, 7.6f, 21.0f)
            horizontalLineTo(16.4f)
            curveTo(17.73f, 21.0f, 18.8f, 19.93f, 18.8f, 18.6f)
            verticalLineTo(8.0f)
            close()
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = 1.9f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 折角：竖边 + 横边，与切线合成那枚小三角
            moveTo(13.8f, 3.0f)
            verticalLineTo(8.0f)
            horizontalLineTo(18.8f)
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = 1.9f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 下行箭头：杆 + 圆头箭羽
            moveTo(12.0f, 10.2f)
            verticalLineTo(15.8f)
            moveTo(9.6f, 13.4f)
            lineTo(12.0f, 15.8f)
            lineTo(14.4f, 13.4f)
        }
    }.build()
}

/** 目录只显示末尾两段（`/storage/emulated/0/Download/Lerxu` → `Download/Lerxu`）；完整路径在设置页可见 */
private fun shortDir(path: String): String {
    val parts = path.trimEnd('/').split('/').filter { it.isNotEmpty() }
    return parts.takeLast(2).joinToString("/").ifEmpty { path }
}

private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"

/**
 * 系统文件夹选择器返回的 SAF 树 URI → 真实文件系统路径。
 *
 * 引擎只认 `/storage/...` 这种真实路径（SAF URI 交给它没有意义），所以这里把
 * ExternalStorageProvider 的卷标还原出来：
 * - `primary:Download/Lerxu` → `/storage/emulated/0/Download/Lerxu`；
 * - `1A2B-3C4D:Movies` → `/storage/1A2B-3C4D/Movies`（可移动存储）。
 * 网盘、媒体库等没有真实路径的提供方返回 null，交给调用方提示用户。
 */
internal fun treeUriToPath(uri: Uri): String? = try {
    when (uri.authority) {
        EXTERNAL_STORAGE_AUTHORITY -> {
            val docId = DocumentsContract.getTreeDocumentId(uri)
            val volume = docId.substringBefore(':', missingDelimiterValue = "")
            val relative = docId.substringAfter(':', missingDelimiterValue = "").trim('/')
            val root = when {
                volume.equals("primary", ignoreCase = true) -> Environment.getExternalStorageDirectory()
                volume.isEmpty() -> null
                else -> File("/storage/$volume")
            }
            root?.let { if (relative.isEmpty()) it.absolutePath else File(it, relative).absolutePath }
        }
        // 系统「下载」提供方：要么是逻辑上的 downloads，要么是 raw:/storage/... 真实路径
        "com.android.providers.downloads.documents" -> {
            val docId = DocumentsContract.getTreeDocumentId(uri)
            when {
                docId == "downloads" -> Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS
                ).absolutePath
                docId.startsWith("raw:") -> docId.removePrefix("raw:")
                else -> null
            }
        }
        else -> null
    }
} catch (_: Exception) {
    null
}

/**
 * 当前保存目录 → 文件夹选择器的初始位置（打开时就停在这儿）。
 *
 * 只对主存储里的目录有意义：`Android/data`、`Android/obb` 在系统选择器里
 * 本来就不显示，给初始位置反而会让选择器跳错地方，所以直接不给。
 */
private fun downloadDirTreeUri(path: String): Uri? {
    val root = Environment.getExternalStorageDirectory().absolutePath.trimEnd('/')
    val normalized = path.trim().trimEnd('/')
    if (normalized != root && !normalized.startsWith("$root/")) return null
    val relative = normalized.removePrefix(root).trimStart('/')
    if (relative.startsWith("Android/data") || relative.startsWith("Android/obb")) return null
    val docId = if (relative.isEmpty()) "primary:" else "primary:$relative"
    return DocumentsContract.buildDocumentUri(EXTERNAL_STORAGE_AUTHORITY, docId)
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
