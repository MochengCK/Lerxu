package com.lerxu.android.ui.screen

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import kotlin.math.roundToInt
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.graphics.SolidColor
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.zIndex
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lerxu.android.R
import com.lerxu.android.data.EngineRepository
import com.lerxu.android.model.TaskInfo
import com.lerxu.android.ui.RoundedProgressBar
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.formatDuration
import com.lerxu.android.ui.formatFinishedTime
import com.lerxu.android.ui.formatSpeed
import com.lerxu.android.ui.statusColor
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScreen(
    viewModel: TaskViewModel,
    initialIntentData: String? = null,
    themePref: String = "system",
    onThemeChange: (String) -> Unit = {}
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showAddTask by remember { mutableStateOf(false) }
    var selectedTaskGid by remember { mutableStateOf<String?>(null) }
    // "待选择文件"任务点击 → 重开文件选择弹窗（区别于普通详情）
    var selectionTaskGid by remember { mutableStateOf<String?>(null) }
    var currentScope by remember { mutableStateOf("all") }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedGids = remember { mutableStateListOf<String>() }
    // 控制栏删除确认态：栏内向上扩展为确认内容，不另弹窗
    var deleteConfirming by remember { mutableStateOf(false) }
    // 任务列表底部预留：普通 0 / 编辑模式 84 / 确认态控制栏更高，平滑过渡
    val listBottomExtra by animateDpAsState(
        targetValue = when {
            deleteConfirming -> 236.dp
            selectionMode -> 84.dp
            else -> 0.dp
        },
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "listBottomExtra"
    )
    var showSettings by remember { mutableStateOf(false) }
    // 排序方式：持久化到偏好，格式 "<字段>_<方向>"，如 "finished_at_desc"；旧版本 key 自动回退默认
    var sortBy by remember {
        val validKeys = listOf("finished_at", "remaining", "speed", "size")
            .flatMap { listOf("${it}_asc", "${it}_desc") }.toSet()
        val stored = context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
            .getString("sort_order", null)
        mutableStateOf(if (stored != null && stored in validKeys) stored else "finished_at_desc")
    }
    var pendingDeleteGids by remember { mutableStateOf<List<String>?>(null) }
    var searchQuery by remember { mutableStateOf("") }

    // 列表按所选方式排序；完成时间未知（0）的任务始终沉底
    val displayTasks = remember(state.tasks, sortBy, searchQuery) {
        val (field, ascending) = sortBy.split("_asc", "_desc").let { parts ->
            parts[0] to sortBy.endsWith("_asc")
        }
        val key: (TaskInfo) -> Long = when (field) {
            "finished_at" -> { t -> t.finishedAt }
            "remaining" -> { t -> t.remainingSeconds.let { if (it < 0) Long.MAX_VALUE else it } }
            "speed" -> { t -> t.downloadSpeed }
            "size" -> { t -> t.totalLength }
            else -> { t -> t.finishedAt }
        }
        val sorted = if (ascending) {
            state.tasks.sortedBy(key)
        } else {
            state.tasks.sortedByDescending(key)
        }
        // 实时搜索：每输入一个字符即按任务名过滤（不区分大小写）
        val searched = if (searchQuery.isBlank()) sorted
        else sorted.filter { it.fileName.contains(searchQuery.trim(), ignoreCase = true) }
        if (field == "finished_at") {
            // finishedAt == 0 表示未知完成时间，无论升降序都排到最后
            searched.partition { it.finishedAt > 0 }.let { (known, unknown) -> known + unknown }
        } else searched
    }

    // 处理外部 Intent 带来的 URL
    LaunchedEffect(initialIntentData) {
        if (!initialIntentData.isNullOrBlank() && state.connected) {
            showAddTask = true
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            LerxuTopBar(
                state = state,
                connected = state.connected,
                showSettings = showSettings,
                onToggleSettings = {
                    if (showSettings) {
                        showSettings = false
                    } else {
                        // 进入设置时退出编辑模式，避免残留选中状态
                        selectionMode = false
                        selectedGids.clear()
                        showSettings = true
                    }
                },
                sortBy = sortBy,
                onSelectSort = { key ->
                    sortBy = key
                    context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
                        .edit().putString("sort_order", key).apply()
                },
                onAddTask = { showAddTask = true }
            )
        }
    ) { padding ->
        AnimatedContent(
            targetState = showSettings,
            modifier = Modifier.padding(padding),
            transitionSpec = {
                if (targetState) {
                    // 进入设置：设置页从右缘整幅滑入，主页向左轻微退让
                    (slideInHorizontally(tween(340, easing = FastOutSlowInEasing)) { it } +
                        fadeIn(tween(280))) togetherWith
                        (slideOutHorizontally(tween(340, easing = FastOutSlowInEasing)) { -it / 6 } +
                        fadeOut(tween(300)))
                } else {
                    // 返回主页：设置页向右整幅滑出，主页从左侧轻微滑回
                    (slideInHorizontally(tween(340, easing = FastOutSlowInEasing)) { -it / 6 } +
                        fadeIn(tween(300))) togetherWith
                        (slideOutHorizontally(tween(300, easing = FastOutSlowInEasing)) { it } +
                        fadeOut(tween(260)))
                }
            },
            label = "mainSettingsSwitch"
        ) { settings ->
            if (settings) {
                SwipeBackBox(onBack = {
                    // 与点击返回按钮一致：退出设置时清理编辑模式
                    selectionMode = false
                    selectedGids.clear()
                    showSettings = false
                }) {
                    SettingsScreen(
                        viewModel = viewModel,
                        engineVersion = state.engineVersion,
                        themePref = themePref,
                        onThemeChange = onThemeChange
                    )
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                // 搜索展开状态：用于"点击任意处收起"遮罩与返回键处理
                var searchExpanded by remember { mutableStateOf(false) }
                // 搜索框焦点状态：决定点空白是收键盘还是收搜索框、✕ 是清空还是关闭
                var searchFocused by remember { mutableStateOf(false) }
                val searchFocusManager = androidx.compose.ui.platform.LocalFocusManager.current
            if (state.connected) {
                ScopeFilterRow(
                    currentScope = currentScope,
                    counts = state.scopeCounts,
                    searchQuery = searchQuery,
                    onSearchQueryChange = { searchQuery = it },
                    onSelect = {
                        currentScope = it
                        viewModel.setScope(it)
                    },
                    expanded = searchExpanded,
                    onExpand = { searchExpanded = true },
                    onCollapse = {
                        searchExpanded = false
                        searchQuery = ""
                    },
                    searchFocused = searchFocused,
                    onSearchFocusChange = { searchFocused = it }
                )
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.error != null && !state.connected -> {
                        EngineErrorScreen(
                            error = state.error!!,
                            onRetry = { viewModel.clearErrorAndRetry() }
                        )
                    }
                    state.tasks.isEmpty() && !state.loading -> {
                        EmptyState()
                    }
                    else -> {
                        val navBottom = WindowInsets.navigationBars.asPaddingValues()
                        TaskList(
                            tasks = displayTasks,
                            selectionMode = selectionMode,
                            selectedGids = selectedGids,
                            onTaskClick = { gid ->
                                val t = state.tasks.find { it.gid == gid }
                                if (t?.awaitingSelection == true) selectionTaskGid = gid
                                else selectedTaskGid = gid
                            },
                            onToggleStatus = { gid ->
                                state.tasks.find { it.gid == gid }?.let { task ->
                                    when (task.status) {
                                        "complete", "seeding" -> openTaskFile(context, task)
                                        "active", "waiting", "seeding" -> viewModel.pauseTask(gid)
                                        "paused" -> viewModel.resumeTask(gid)
                                    }
                                }
                            },
                            onToggleSelect = { gid ->
                                if (selectedGids.contains(gid)) selectedGids.remove(gid)
                                else selectedGids.add(gid)
                            },
                            onDeleteTask = { gid -> pendingDeleteGids = listOf(gid) },
                            onEnterSelection = { gid ->
                                selectionMode = true
                                selectedGids.add(gid)
                            },
                            bottomPadding = navBottom.calculateBottomPadding() + 12.dp +
                                listBottomExtra
                        )
                    }
                }

                // 编辑模式：底部向上滑入的圆角悬浮控制栏
                Box(modifier = Modifier.align(Alignment.BottomCenter)) {
                    SelectionBarOverlay(
                        visible = selectionMode,
                        count = selectedGids.size,
                        allSelected = state.tasks.isNotEmpty() && selectedGids.size >= state.tasks.size,
                        confirming = deleteConfirming,
                        onClose = {
                            selectionMode = false
                            selectedGids.clear()
                            deleteConfirming = false
                        },
                        onToggleSelectAll = {
                            if (state.tasks.isNotEmpty() && selectedGids.size >= state.tasks.size) {
                                selectedGids.clear()
                            } else {
                                selectedGids.clear()
                                selectedGids.addAll(state.tasks.map { it.gid })
                            }
                        },
                        // 删除：不弹窗，控制栏自身向上扩展为确认内容
                        onRequestConfirm = {
                            if (selectedGids.isNotEmpty()) deleteConfirming = true
                        },
                        onCancelConfirm = { deleteConfirming = false },
                        onConfirmDelete = { deleteFiles ->
                            selectedGids.toList().forEach { viewModel.removeTask(it, deleteFiles) }
                            deleteConfirming = false
                            selectionMode = false
                            selectedGids.clear()
                        }
                    )
                }

                // 搜索展开时的内容区拦截层：
                // - 无内容：点击任意处收起搜索框
                // - 有内容且焦点在搜索框（键盘开着）：点击空白只收起键盘，保留搜索
                // - 有内容且焦点已移开：不拦截，正常点击任务列表
                if (searchExpanded && (searchQuery.isEmpty() || searchFocused)) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .zIndex(3f)
                            .pointerInput(Unit) {
                                detectTapGestures {
                                    if (searchQuery.isEmpty()) {
                                        searchExpanded = false
                                        searchQuery = ""
                                    } else {
                                        searchFocusManager.clearFocus()
                                    }
                                }
                            }
                    )
                }
            }
                }
            }
        }
    }

    // 添加任务对话框
    if (showAddTask) {
        AddTaskDialog(
            viewModel = viewModel,
            initialUrl = initialIntentData,
            onDismiss = { showAddTask = false }
        )
    }

    // "待选择文件"任务：点击重开文件选择弹窗
    if (selectionTaskGid != null) {
        TaskFileSelectionSheet(
            gid = selectionTaskGid!!,
            viewModel = viewModel,
            onDismiss = { selectionTaskGid = null }
        )
    }

    // 任务详情：从实时状态取任务，进度随引擎刷新
    if (selectedTaskGid != null && !selectionMode) {
        val task = state.tasks.find { it.gid == selectedTaskGid }
            ?: viewModel.getTaskByGid(selectedTaskGid!!)
        if (task != null) {
            TaskDetailSheet(
                task = task,
                viewModel = viewModel,
                onDismiss = { selectedTaskGid = null },
                onDeleteRequest = {
                    pendingDeleteGids = listOf(task.gid)
                    selectedTaskGid = null
                }
            )
        } else {
            // 任务已被删除，自动关闭详情
            selectedTaskGid = null
        }
    }

    // 删除任务二次确认（单个/批量共用）
    val deleteTargets = pendingDeleteGids
    if (deleteTargets != null) {
        DeleteConfirmDialog(
            count = deleteTargets.size,
            onConfirm = { deleteFiles ->
                deleteTargets.forEach { viewModel.removeTask(it, deleteFiles) }
                pendingDeleteGids = null
            },
            onDismiss = { pendingDeleteGids = null }
        )
    }
}

// ─── 顶栏：左上角速度信息，右上角添加 ───

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LerxuTopBar(
    state: EngineRepository.UiState,
    connected: Boolean,
    showSettings: Boolean,
    onToggleSettings: () -> Unit,
    sortBy: String,
    onSelectSort: (String) -> Unit,
    onAddTask: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    TopAppBar(
        title = {
            // 标题随页面切换交叉滑动：速度信息 ↔ "设置"，无跳变
            AnimatedContent(
                targetState = showSettings,
                transitionSpec = {
                    val dir = if (targetState) 1 else -1
                    (slideInHorizontally(tween(280, easing = FastOutSlowInEasing)) { dir * it / 3 } +
                        fadeIn(tween(280))) togetherWith
                        (slideOutHorizontally(tween(200, easing = FastOutSlowInEasing)) { -dir * it / 3 } +
                        fadeOut(tween(180)))
                },
                label = "topBarTitle"
            ) { inSettings ->
                when {
                    inSettings -> {
                        Text(stringResource(R.string.settings))
                    }
                    connected -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.ArrowDownward,
                                    contentDescription = stringResource(R.string.download_speed),
                                    modifier = Modifier.size(15.dp),
                                    tint = colorScheme.primary
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    formatSpeed(state.globalStat.downloadSpeed),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colorScheme.onSurface
                                )
                            }
                            Spacer(Modifier.width(16.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.ArrowUpward,
                                    contentDescription = stringResource(R.string.upload_speed),
                                    modifier = Modifier.size(15.dp),
                                    tint = colorScheme.tertiary
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    formatSpeed(state.globalStat.uploadSpeed),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        },
        actions = {
            // 单一进度驱动整条按钮带右移两格（排序+添加的槽位宽度）：
            // 返回按钮终点与旧布局右对齐后的位置一致，但全程连续插值无跳变；
            // 排序/添加按钮同带速跟随右移并淡出。
            val actionsProgress by animateFloatAsState(
                targetValue = if (showSettings) 1f else 0f,
                animationSpec = tween(240, easing = FastOutSlowInEasing),
                label = "topBarActionsProgress"
            )
            // 设置入口；进入设置页后变为返回按钮。
            // 连续滑轨切换：齿轮与箭头同属一条"滑动带"，由同一个进度值驱动联动平移——
            // 进入设置时齿轮向右滑出一格、箭头从左滑入就位；返回时整条带子滑回去。
            // 全程连续插值，不存在瞬移。
            IconButton(
                onClick = onToggleSettings,
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                }
            ) {
                val iconProgress by animateFloatAsState(
                    targetValue = if (showSettings) 1f else 0f,
                    animationSpec = tween(320, easing = FastOutSlowInEasing),
                    label = "settingsIconProgress"
                )
                val backDesc = stringResource(R.string.back)
                val settingsDesc = stringResource(R.string.settings)
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clipToBounds()
                        .semantics {
                            contentDescription = if (showSettings) backDesc else settingsDesc
                        }
                ) {
                    // 齿轮：进度 0 → 1 时向右滑出一格（超出部分被裁剪出视野）
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = null,
                        modifier = Modifier.graphicsLayer {
                            translationX = size.width * iconProgress
                        }
                    )
                    // 返回箭头：进度 0 → 1 时从左侧一格滑入到按钮位置
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                        modifier = Modifier.graphicsLayer {
                            translationX = size.width * (iconProgress - 1f)
                        }
                    )
                }
            }
            // 排序/添加按钮：槽位固定不移除，随按钮带同速右移并淡出，
            // 全程 graphicsLayer 连续插值；淡出后禁用点击。
            // 排序按钮：仅主页显示；进设置时随带右移淡出。
            // 点击弹出锚定在按钮右下方的局部菜单（与桌面端同源：点同项切方向，点新字段默认升序）
            Box(
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                    alpha = 1f - actionsProgress
                }
            ) {
                var sortMenuExpanded by remember { mutableStateOf(false) }
                Box {
                    IconButton(
                        onClick = { sortMenuExpanded = true },
                        enabled = connected && !showSettings
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = stringResource(R.string.sort))
                    }
                    DropdownMenu(
                        expanded = sortMenuExpanded,
                        onDismissRequest = { sortMenuExpanded = false },
                        offset = DpOffset(0.dp, 2.dp),
                        shape = RoundedCornerShape(16.dp),
                        containerColor = colorScheme.surfaceContainerHigh,
                        shadowElevation = 8.dp
                    ) {
                        sortOptions().forEach { option ->
                            val fieldSelected = sortBy.startsWith("${option.key}_")
                            val ascending = sortBy == "${option.key}_asc"
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        stringResource(option.label),
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (fieldSelected) FontWeight.SemiBold else FontWeight.Normal,
                                        color = if (fieldSelected) colorScheme.primary else colorScheme.onSurface
                                    )
                                },
                                trailingIcon = {
                                    // 与桌面端一致：仅选中项右侧显示方向三角
                                    if (fieldSelected) {
                                        Icon(
                                            if (ascending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                                            contentDescription = null,
                                            tint = colorScheme.primary,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                },
                                onClick = {
                                    // 点同一项 → 切换方向；点新字段 → 默认升序（与桌面端交互一致）
                                    onSelectSort(if (fieldSelected) "${option.key}_${if (ascending) "desc" else "asc"}" else "${option.key}_asc")
                                    sortMenuExpanded = false
                                }
                            )
                        }
                    }
                }
            }
            // 添加按钮：仅主页显示；进设置时向右淡出。
            Box(
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                    alpha = 1f - actionsProgress
                }
            ) {
                IconButton(onClick = onAddTask, enabled = connected && !showSettings) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.add_task))
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.background
        )
    )
}

// ─── 编辑模式：底部悬浮控制栏 ───

@Composable
private fun SelectionBarOverlay(
    visible: Boolean,
    count: Int,
    allSelected: Boolean,
    confirming: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onRequestConfirm: () -> Unit,
    onCancelConfirm: () -> Unit,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(
            initialOffsetY = { it },
            animationSpec = tween(260, easing = FastOutSlowInEasing)
        ) + fadeIn(),
        exit = slideOutVertically(
            targetOffsetY = { it },
            animationSpec = tween(220, easing = FastOutSlowInEasing)
        ) + fadeOut()
    ) {
        SelectionBar(
            count = count,
            allSelected = allSelected,
            confirming = confirming,
            onClose = onClose,
            onToggleSelectAll = onToggleSelectAll,
            onRequestConfirm = onRequestConfirm,
            onCancelConfirm = onCancelConfirm,
            onConfirmDelete = onConfirmDelete
        )
    }
}

@Composable
private fun SelectionBar(
    count: Int,
    allSelected: Boolean,
    confirming: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onRequestConfirm: () -> Unit,
    onCancelConfirm: () -> Unit,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        color = colorScheme.surfaceContainerHigh,
        contentColor = colorScheme.onSurface,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 10.dp,
        tonalElevation = 2.dp,
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .fillMaxWidth()
    ) {
        // 双态内容交叉切换：普通态 ⇄ 删除确认态（面板高度平滑扩展/收缩）
        AnimatedContent(
            targetState = confirming,
            transitionSpec = {
                (fadeIn(animationSpec = tween(220, easing = FastOutSlowInEasing)) togetherWith
                    fadeOut(animationSpec = tween(160)))
                    .using(SizeTransform(clip = false))
            },
            label = "selectionBarState"
        ) { confirm ->
            if (confirm) {
                ConfirmDeleteContent(count, onConfirmDelete, onCancelConfirm)
            } else {
                SelectionBarNormalContent(
                    count = count,
                    allSelected = allSelected,
                    onClose = onClose,
                    onToggleSelectAll = onToggleSelectAll,
                    onDelete = onRequestConfirm
                )
            }
        }
    }
}

// ─── 控制栏普通态：全选 + 已选数量 + 删除入口 + 退出编辑 ───

@Composable
private fun SelectionBarNormalContent(
    count: Int,
    allSelected: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onDelete: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.padding(start = 18.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 勾选图标 = 全选/取消全选切换按钮
        Icon(
            if (allSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
            contentDescription = stringResource(if (allSelected) R.string.select_none else R.string.select_all),
            modifier = Modifier
                .size(22.dp)
                .clickable { onToggleSelectAll() },
            tint = if (allSelected) colorScheme.primary else colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(R.string.selected_count, count),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f)
        )
        TextButton(
            onClick = onDelete,
            enabled = count > 0,
            colors = ButtonDefaults.textButtonColors(
                contentColor = colorScheme.error,
                disabledContentColor = colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            )
        ) {
            Text(stringResource(R.string.delete), fontWeight = FontWeight.SemiBold)
        }
        IconButton(onClick = onClose) {
            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.exit_edit_mode))
        }
    }
}

// ─── 控制栏删除确认态：栏内展开确认内容，不另弹窗 ───

@Composable
private fun ConfirmDeleteContent(
    count: Int,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit,
    onCancel: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var deleteFiles by remember { mutableStateOf(false) }

    Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 14.dp)) {
        Text(
            text = if (count > 1) stringResource(R.string.delete_multiple_tasks, count)
            else stringResource(R.string.delete_one_task),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (deleteFiles) stringResource(R.string.delete_with_files_msg)
            else stringResource(R.string.delete_record_only_msg),
            style = MaterialTheme.typography.bodySmall,
            color = colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { deleteFiles = !deleteFiles },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = deleteFiles,
                onCheckedChange = { deleteFiles = it },
                colors = CheckboxDefaults.colors(checkedColor = colorScheme.primary)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                stringResource(R.string.delete_local_files),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            Button(
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colorScheme.surfaceContainerHighest,
                    contentColor = colorScheme.onSurface
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text(stringResource(R.string.cancel), fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.width(10.dp))
            Button(
                onClick = { onConfirmDelete(deleteFiles) },
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colorScheme.error,
                    contentColor = colorScheme.onError
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text(stringResource(R.string.delete), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ─── 设置页右滑返回：跟手位移，松手过阈值滑出、否则弹回 ───

@Composable
private fun SwipeBackBox(onBack: () -> Unit, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { translationX = offsetX.value }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val w = size.width.toFloat()
                        scope.launch {
                            if (offsetX.value > w * 0.3f) {
                                // 越过阈值：滑出屏幕后返回（滑出态保留到退出动画结束，页面不回跳）
                                offsetX.animateTo(w, tween(240, easing = FastOutSlowInEasing))
                                onBack()
                            } else {
                                offsetX.animateTo(0f, tween(260, easing = FastOutSlowInEasing))
                            }
                        }
                    },
                    onDragCancel = {
                        scope.launch {
                            offsetX.animateTo(0f, tween(260, easing = FastOutSlowInEasing))
                        }
                    }
                ) { change, dragAmount ->
                    change.consume()
                    scope.launch {
                        offsetX.snapTo((offsetX.value + dragAmount).coerceAtLeast(0f))
                    }
                }
            }
    ) {
        content()
    }
}

// ─── 状态筛选 ───

private data class Scope(val key: String, val label: String)

/**
 * 分类行 + 搜索入口（同一组件）。
 * progress: 0 = 收起（仅圆形搜索图标，分类占满其余空间），
 * 1 = 完全展开（搜索框占满整行，分类淡出并被覆盖）。
 * 点击图标 → tween 丝滑展开至整行。
 */
@Composable
private fun ScopeFilterRow(
    currentScope: String,
    counts: Map<String, Int>,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
    expanded: Boolean,
    onExpand: () -> Unit,
    onCollapse: () -> Unit,
    searchFocused: Boolean,
    onSearchFocusChange: (Boolean) -> Unit
) {
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val progress = remember { Animatable(0f) }
    val focusRequester = remember { FocusRequester() }

    // 外部展开状态驱动动画：展开后自动聚焦输入框
    LaunchedEffect(expanded) {
        if (expanded) {
            progress.animateTo(1f, tween(300, easing = FastOutSlowInEasing))
            focusRequester.requestFocus()
        } else {
            focusManager.clearFocus()
            progress.animateTo(0f, tween(280, easing = FastOutSlowInEasing))
        }
    }

    // 键盘返回键：搜索展开时先收起搜索
    BackHandler(enabled = expanded) { onCollapse() }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(32.dp)
    ) {
        val fullWidth = maxWidth
        // 搜索框宽度：28dp(圆形图标，与分类 chip 实际渲染高度一致) ↔ 整行宽度（完全展开）
        val searchWidth = 28.dp + (fullWidth - 28.dp) * progress.value

        val scopes = listOf(
            Scope("all", stringResource(R.string.scope_all)),
            Scope("active", stringResource(R.string.scope_active)),
            Scope("seeding", stringResource(R.string.scope_seeding)),
            Scope("waiting", stringResource(R.string.scope_waiting)),
            Scope("paused", stringResource(R.string.scope_paused)),
            Scope("stopped", stringResource(R.string.scope_stopped))
        )

        // 分类列表：与搜索同处一个组件，随展开淡出、位置让行
        LazyRow(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = (1f - progress.value * 1.6f).coerceIn(0f, 1f) }
                .padding(start = searchWidth + 8.dp)
                .pointerInput(progress.value) {
                    // 展开后分类已被覆盖，拦截误触
                    if (progress.value > 0.5f) detectTapGestures { }
                },
            contentPadding = PaddingValues(horizontal = 0.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(scopes) { scope ->
                val selected = currentScope == scope.key
                FilterChip(
                    selected = selected,
                    onClick = { onSelect(scope.key) },
                    label = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(scope.label, style = MaterialTheme.typography.labelMedium)
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "${counts[scope.key] ?: 0}",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) {
                                    MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.65f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        }
                    },
                    shape = CircleShape,
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                    ),
                    border = null
                )
            }
        }

        // 搜索框（上层）：宽度随 progress 从圆形图标过渡到整行。
        // 高度 28dp 与分类 chip 一致（chip 因行内 2dp 纵向留白实际渲染 28dp），居中对齐
        Box(
            modifier = Modifier
                .width(searchWidth)
                .height(28.dp)
                .align(Alignment.CenterStart)
                .zIndex(1f)
        ) {
            SearchField(
                progress = progress.value,
                query = searchQuery,
                onQueryChange = onSearchQueryChange,
                // 唯一按钮：有内容时清空，无内容时收起
                onClear = { onSearchQueryChange("") },
                onClose = onCollapse,
                onExpand = onExpand,
                focusRequester = focusRequester,
                onFocusChange = onSearchFocusChange
            )
        }
    }
}

// ─── 搜索框：progress 0 = 圆形图标，1 = 完整搜索框 ───

@Composable
private fun SearchField(
    progress: Float,
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
    onExpand: () -> Unit,
    focusRequester: FocusRequester,
    onFocusChange: (Boolean) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val searchInteraction = remember { MutableInteractionSource() }
    val isFocused by searchInteraction.collectIsFocusedAsState()

    // 焦点变化上报给上层：决定遮罩行为与 ✕ 按钮行为
    LaunchedEffect(isFocused) { onFocusChange(isFocused) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
            .background(colorScheme.surfaceContainerLow)
    ) {
        // 展开态：搜索框内容随进度渐显
        Row(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = ((progress - 0.5f) / 0.5f).coerceIn(0f, 1f) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                modifier = Modifier
                    .padding(start = 10.dp)
                    .size(15.dp),
                tint = colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(6.dp))
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = colorScheme.onSurface),
                cursorBrush = SolidColor(colorScheme.primary),
                interactionSource = searchInteraction,
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester),
                decorationBox = { inner ->
                    Box {
                        if (query.isEmpty()) {
                            Text(
                                stringResource(R.string.search_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = colorScheme.onSurfaceVariant
                            )
                        }
                        inner()
                    }
                }
            )
            // 移除文本按钮：仅有内容时显示，点击清空搜索词
            if (query.isNotEmpty()) {
                IconButton(
                    onClick = { if (isFocused) onClear() else onClose() },
                    modifier = Modifier.size(28.dp).padding(end = 2.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.close),
                        modifier = Modifier.size(16.dp),
                        tint = colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        // 收起态：与分类 chip 同尺寸的圆形搜索按钮，点击向右展开
        Box(
            modifier = Modifier
                .size(28.dp)
                .align(Alignment.CenterStart)
                .graphicsLayer { alpha = (1f - progress * 2f).coerceIn(0f, 1f) }
                .clip(CircleShape)
                .background(colorScheme.surfaceContainerLow)
                .clickable(enabled = progress < 0.3f, onClick = onExpand),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = stringResource(R.string.search),
                tint = colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

// ─── 任务列表 ───

@Composable
private fun TaskList(
    tasks: List<TaskInfo>,
    selectionMode: Boolean,
    selectedGids: List<String>,
    onTaskClick: (String) -> Unit,
    onToggleStatus: (String) -> Unit,
    onToggleSelect: (String) -> Unit,
    onEnterSelection: (String) -> Unit,
    onDeleteTask: (String) -> Unit,
    bottomPadding: Dp
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 0.dp, end = 0.dp, top = 4.dp, bottom = bottomPadding
        )
    ) {
        itemsIndexed(tasks, key = { _, it -> it.gid }) { index, task ->
            SwipeActionCard(
                task = task,
                enabled = !selectionMode,
                onToggleStatus = { onToggleStatus(task.gid) },
                onDelete = { onDeleteTask(task.gid) },
                modifier = Modifier.animateItem()
            ) {
                TaskCard(
                    task = task,
                    selectionMode = selectionMode,
                    selected = selectedGids.contains(task.gid),
                    onClick = { onTaskClick(task.gid) },
                    onToggleStatus = { onToggleStatus(task.gid) },
                    onToggleSelect = { onToggleSelect(task.gid) },
                    onEnterSelection = { onEnterSelection(task.gid) }
                )
            }
            // 任务之间的划分横杠，左右留空间
            if (index < tasks.lastIndex) {
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                    thickness = 0.5.dp
                )
            }
        }
    }
}

/**
 * 任务卡片左滑操作容器：
 * 向左滑动卡片，右侧操作按钮（暂停/恢复、删除）随滑动进度渐显；
 * 中途松手未过阈值自动弹回；点击按钮执行动作并自动归位。
 */
@Composable
private fun SwipeActionCard(
    task: TaskInfo,
    enabled: Boolean,
    onToggleStatus: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    // 打开位：两个操作按钮的宽度（暂停/恢复 46 + 间距 8 + 删除 46 + 右缘 14）
    val openWidthPx = with(density) { 114.dp.toPx() }
    val canPause = task.status == "active" || task.status == "waiting" || task.status == "seeding"
    val isPaused = task.status == "paused"

    // 拖动被禁用（进入编辑模式）时，打开中的卡片自动归位
    LaunchedEffect(enabled) {
        if (!enabled && offsetX.value != 0f) {
            offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
        }
    }

    Box(modifier = modifier.fillMaxWidth()) {
        // 背景操作按钮层（右对齐）：随滑动进度渐显 + 轻微右移入场
        val progress = (-offsetX.value / openWidthPx).coerceIn(0f, 1f)
        Row(
            modifier = Modifier
                .matchParentSize()
                .graphicsLayer {
                    alpha = progress
                    translationX = (1f - progress) * 36f
                },
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 暂停 / 恢复
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(if (canPause) colorScheme.primary else colorScheme.surfaceContainerHighest)
                    .clickable(enabled = canPause || isPaused) {
                        if (canPause || isPaused) {
                            onToggleStatus()
                            scope.launch {
                                offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing))
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (canPause) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = stringResource(if (canPause) R.string.pause else R.string.resume),
                    tint = if (canPause) colorScheme.onPrimary else colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(Modifier.width(8.dp))
            // 删除（点击后卡片归位并弹出删除确认）
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(colorScheme.error)
                    .clickable {
                        onDelete()
                        scope.launch {
                            offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing))
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.delete),
                    tint = colorScheme.onError,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(Modifier.width(14.dp))
        }

        // 前景卡片：跟随手指水平位移
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragStart = { scope.launch { offsetX.stop() } },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            val target = (offsetX.value + dragAmount).coerceIn(-openWidthPx, 0f)
                            scope.launch { offsetX.snapTo(target) }
                        },
                        onDragEnd = {
                            scope.launch {
                                if (offsetX.value < -openWidthPx * 0.5f) {
                                    offsetX.animateTo(-openWidthPx, tween(220, easing = FastOutSlowInEasing))
                                } else {
                                    offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
                                }
                            }
                        },
                        onDragCancel = {
                            scope.launch {
                                offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
                            }
                        }
                    )
                }
        ) {
            content()
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskCard(
    task: TaskInfo,
    selectionMode: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
    onToggleStatus: () -> Unit,
    onToggleSelect: () -> Unit,
    onEnterSelection: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val statusColor = Color(statusColor(task.status))
    val colorScheme = MaterialTheme.colorScheme
    val isActive = task.status == "active"
    val isError = task.status == "error"
    val interactionSource = remember { MutableInteractionSource() }

    // 选中态仅用卡片背景表达，布局零变化（高度恒定）
    val selectionBackground by animateColorAsState(
        targetValue = if (selected) colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent,
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "selectionBackground"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(selectionBackground)
            .combinedClickable(
                interactionSource = interactionSource,
                indication = LocalIndication.current,
                onClick = {
                    if (selectionMode) onToggleSelect() else onClick()
                },
                onDoubleClick = {
                    if (!selectionMode) onToggleStatus()
                },
                onLongClick = {
                    if (selectionMode) onToggleSelect() else onEnterSelection()
                }
            )
            .padding(horizontal = 16.dp, vertical = 9.dp)
    ) {
        // 标题行（编辑模式不插入任何元素，卡片高度不变）
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = task.fileName,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(7.dp))

        // 连接中（active 但尚无速度、无进度）：滑动小段加载动画；
        // 与服务器建立连接后（速度>0 或有进度）自动消失，显示真实进度。
        // 磁力解析中（总大小未知）同样播放该动画。
        val indeterminate = task.status == "active" && task.downloadSpeed <= 0L &&
            task.completedLength <= 0L &&
            task.status != "complete" && task.status != "error"
        RoundedProgressBar(
            progress = task.progress,
            color = statusColor,
            // 轨道与任务详情页一致：状态色 18% 淡底（错误=淡红）；0% 时靠 fillMaxWidth 完整显示
            trackColor = statusColor.copy(alpha = 0.18f),
            height = 5.dp,
            indeterminate = indeterminate
        )

        Spacer(Modifier.height(6.dp))

        // 底部信息行：左下角「已下载/总大小 ｜ 百分比」，右下角速度与剩余/完成/错误时间
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}",
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            Spacer(Modifier.width(7.dp))
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(13.dp)
                    .background(colorScheme.outlineVariant)
            )
            Spacer(Modifier.width(7.dp))
            Text(
                text = "${task.percent}%",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = when {
                    isError -> colorScheme.error
                    isActive -> colorScheme.primary
                    else -> colorScheme.onSurfaceVariant
                }
            )
            Spacer(Modifier.weight(1f))
            when {
                task.status == "active" -> {
                    if (task.downloadSpeed > 0) {
                        Text(
                            formatSpeed(task.downloadSpeed),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.primary
                        )
                        if (task.remainingSeconds > 0) Spacer(Modifier.width(8.dp))
                    } else {
                        // 尚未与服务器建立连接：明确提示连接中，而非空白
                        Text(
                            stringResource(R.string.connecting),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                    if (task.remainingSeconds > 0) {
                        Text(
                            formatDuration(task.remainingSeconds),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                }
                task.status == "seeding" -> {
                    Text(
                        stringResource(R.string.status_seeding),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "paused" -> {
                    Text(
                        stringResource(R.string.status_paused),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "complete" && task.finishedAt > 0 -> {
                    Text(
                        stringResource(R.string.completed_at, formatFinishedTime(context, task.finishedAt)),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "error" && task.finishedAt > 0 -> {
                    Text(
                        stringResource(R.string.error_at, formatFinishedTime(context, task.finishedAt)),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// ─── 错误 ───

@Composable
private fun EngineErrorScreen(error: String, onRetry: () -> Unit) {
    var retrying by remember { mutableStateOf(false) }
    val colorScheme = MaterialTheme.colorScheme

    Box(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(colorScheme.errorContainer.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ErrorOutline,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = colorScheme.error
                )
            }
            Spacer(Modifier.height(18.dp))
            Text(
                stringResource(R.string.engine_start_failed),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(10.dp))
            Surface(
                color = colorScheme.errorContainer.copy(alpha = 0.4f),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onErrorContainer,
                    modifier = Modifier.padding(14.dp),
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.height(22.dp))
            Button(
                onClick = {
                    retrying = true
                    onRetry()
                },
                enabled = !retrying,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                if (retrying) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.retry), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ─── 空状态：复用桌面端图片 ───

@Composable
private fun EmptyState() {
    val colorScheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.no_task),
                contentDescription = null,
                modifier = Modifier.size(190.dp)
            )
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.no_tasks),
                style = MaterialTheme.typography.titleSmall,
                color = colorScheme.onSurfaceVariant
            )
        }
    }
}

// ─── 打开已下载的文件 ───

private fun openTaskFile(context: android.content.Context, task: com.lerxu.android.model.TaskInfo) {
    try {
        // 路径解析：优先 files[0]（引擎会话新任务均有）；
        // 回退「目录 + 任务名」——旧版本引擎会话恢复的任务 files 可能为空。
        // 回退结果是目录（多文件 BT 种子名 = 数据目录）时，取目录内最大的
        // 常规文件打开，避免只会弹"无法确定位置"。
        var filePath = task.filePath
        if (filePath.isEmpty() && task.fileName.isNotBlank() && task.dir.isNotBlank()) {
            filePath = java.io.File(task.dir, task.fileName).absolutePath
        }
        if (filePath.isEmpty()) {
            android.widget.Toast.makeText(context, context.getString(R.string.toast_file_location_unknown), android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        var file = java.io.File(filePath)
        if (file.isDirectory) {
            val inner = file.listFiles()
                ?.filter { it.isFile }
                ?.maxByOrNull { it.length() }
            if (inner != null && inner.exists()) {
                file = inner
            } else {
                android.widget.Toast.makeText(context, context.getString(R.string.toast_is_directory), android.widget.Toast.LENGTH_SHORT).show()
                return
            }
        }
        if (!file.exists()) {
            android.widget.Toast.makeText(context, context.getString(R.string.toast_file_not_exist), android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        val uri = androidx.core.content.FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", file
        )
        val mime = context.contentResolver.getType(uri)
            ?: android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase())
            ?: "application/octet-stream"
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        android.widget.Toast.makeText(
            context, context.getString(R.string.toast_no_app_to_open), android.widget.Toast.LENGTH_SHORT
        ).show()
    } catch (e: Exception) {
        android.widget.Toast.makeText(
            context, context.getString(R.string.toast_open_failed, e.message ?: ""), android.widget.Toast.LENGTH_SHORT
        ).show()
    }
}
