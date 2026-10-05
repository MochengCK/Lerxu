package com.lerxu.android.ui.screen

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import com.lerxu.android.R
import com.lerxu.android.browser.BrowseHistory
import com.lerxu.android.browser.FaviconStore
import com.lerxu.android.browser.HistoryDay
import com.lerxu.android.browser.HistoryEntry
import com.lerxu.android.browser.HistoryFilter
import com.lerxu.android.browser.HistoryRow
import com.lerxu.android.browser.SearchEngines
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.roundToInt
import kotlinx.coroutines.launch



/**
 * 分组标题右侧那条**横杠**距离右缘还留多少（连上标题行自带的 16dp 右边距，一共
 * `16 + 4 = 20dp`）。
 *
 * 早前是 12dp（合计 28dp），用户点名"横杠右间距应该减少一点" —— 横杠本来就是这条时间轴上
 * 的分隔线，离内容区右缘太远会像没画完。想让它与正文右缘齐平就把它改成 0.dp。
 */
private val DayRuleEndGap = 4.dp

/**
 * **历史记录**弹窗（用户点名："从更多设置进入的历史记录面板要跟现在的设置面板一样由底部
 * 弹出"）—— 与设置同一套壳：同一个 [ModalBottomSheet]、同一个 52dp 头部（左返回 + 中标题）、
 * `dragHandle = null`、`contentWindowInsets` 只留导航条。
 *
 * 它与**首页搜索面板里那一层"历史"**（WebView 里的 `homeHistoryView`）是两件东西，别搞混：
 * - 那一层是搜索页里的一屏，跟着输入框走，列的是"最近访问 / 搜索历史"两组；
 * - 这一张是从「更多功能」直接点开的**独立弹窗**，盖在当前页面之上，关掉就回到原处。
 *
 * 口径（用户点名的四条 + 后续订正）：
 * - **按时间排一条时间轴**（不是分成两组）：搜索与访问混在一起，谁新谁在上；
 * - **按自然日分组**，组标题带**完整日期**（今天 / 昨天 / 其余走本地化长日期）——
 *   早先那版"最近一周 / 更早"被否掉："应该始终显示完整的时间，不应该出现最近一周更早这类
 *   没有准确时间的"；
 * - **顶部三个筛选**：全部（默认）/ 最近访问 / 搜索历史；
 * - **左边是真实的网站图标**，拿不到就是**通用图标**（不是首字母 —— "获取不到图标的网站
 *   应该显示通用图标，而不是显示首字母"）；
 * - 行里**不显示时间**（用户点名："每个历史记录选项右侧不应该显示时间"）：日期在组标题上，
 *   一行右边再挂一个时刻读起来是多余的 —— 早前那版是"只给时刻"，现在整条撤掉。
 *
 * 时间轴与分组的规则全在 [BrowseHistory.timeline]（纯函数），这里只负责画与本地化。
 * （[BrowseHistory.clockLabel] 现在没有界面在用，留着是因为它被单测钉着 —— 要把时刻加回来
 * 就是在行里多一行 Text 的事。）
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BrowserHistorySheet(
    entries: List<HistoryEntry>,
    /** 点某一行：去这个地址（由调用方负责关弹窗 + 切到浏览器页）。 */
    onOpen: (String) -> Unit,
    /** 移除模式里按下「删除」：把这些地址从记录里删掉（见 BrowserController.removeHistory）。 */
    onDelete: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // 「往下拽 = 关掉弹窗」照旧开着（用户点名：要能"通过向下滑动弹窗来关闭"，但"不会轻易的
    // 被误触"），两档阈值抬高的细节与设置弹窗**同一处出处**（见 [rememberSheetStateFirmDismiss]）
    val sheetState = rememberSheetStateFirmDismiss()
    // 先收起再回调关闭：直接置 false 会让弹窗"啪"地消失，没有下滑动画（与设置弹窗同一处理）
    val dismissAnimated: () -> Unit = {
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
    }
    // 每次打开都从"全部"开始（用户口径："默认全部"）—— 弹窗关掉即离开组合，这里自然复位
    var filter by remember { mutableStateOf(HistoryFilter.All) }
    // 顶部搜索（用户点名："在历史记录界面，顶部分类切换的左侧添加一个搜索按钮，默认只显示
    // 图标，就跟下载器界面的左上角的搜索按钮一样，可以搜索历史"）—— 收起时是一枚 28dp
    // 圆钮，点开向右铺成整行输入框；搜索与分类**同时生效**（先分类再按关键词过一遍）
    var searchOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val searchFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    // 左滑"复制"那一下要用的剪贴板（与设置页同一套）
    val clipboard = LocalClipboardManager.current
    val locale = LocalConfiguration.current.locales[0]
    // 组标题里的"完整日期"交给本地化格式（中文 = 2026年10月3日，英文 = October 3, 2026），
    // 不自己拼字符串 —— 拼出来的在别的语言下一定别扭
    val dateFormat = remember(locale) {
        DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale)
    }
    val today = remember { LocalDate.now() }
    // ── 移除模式（长按一行进入，用户点名："长按历史记录应该进入移除模式，底部弹出移除控制栏，
    // 就跟下载器页面的移除控制栏一样"）──
    // 选中的是**地址**不是下标：列表排过序、还按自然日分过组，下标对不上存储（见 removeHistory）
    var selectionMode by remember { mutableStateOf(false) }
    val selected = remember { mutableStateListOf<String>() }
    val groups = remember(entries, filter, query) {
        BrowseHistory.timeline(entries, SearchEngines.all, filter, query)
    }
    // 这一份是"此刻屏幕上真的列出来的那些行"：全选按它来，删完也照它核对
    val visibleUrls = remember(groups) { groups.flatMap { it.rows }.map { it.url } }
    fun exitSelection() {
        selectionMode = false
        selected.clear()
    }
    // 删掉的条目一旦从记录里消失，"已选"里那些失效的地址要一并清掉 —— 否则计数会停在
    // 一个已经没有对应行的数上（删除后我们自己会退出移除模式，这一条是给"外部把记录改小"兜底）
    LaunchedEffect(entries) {
        val alive = entries.mapTo(HashSet()) { it.url }
        selected.retainAll(alive)
    }
    // 展开就把光标送进输入框（与下载器那枚同一手感）；收起时顺手放下键盘
    LaunchedEffect(searchOpen) {
        if (searchOpen) searchFocus.requestFocus() else keyboard?.hide()
    }
    // 图标仓库要一个缓存目录才能把图标落盘（见 FaviconStore.install）：只装一次
    LaunchedEffect(Unit) { FaviconStore.install(context) }

    ModalBottomSheet(
        // 移除模式里，返回键 / 点遮罩 / 下滑关闭**先退出移除模式**，而不是把整张弹窗关掉
        //（用户划过一条就整张关掉会让人把选的东西一起丢掉）。三条路都得走这里 ——
        // 系统返回与下滑本来就是 `onDismissRequest` 的调用方，所以一处就够，
        // **不要另挂 `BackHandler`**：它要 `LocalOnBackPressedDispatcherOwner`，
        // 而这个弹窗里那份由谁提供并不在我们手里（拿不到就是当场抛异常）。
        onDismissRequest = { if (selectionMode) exitSelection() else onDismiss() },
        sheetState = sheetState,
        // 与设置弹窗一致：不画顶部那条把手（标题行自带返回键，视觉更整）
        dragHandle = null,
        // **只让开顶部，底部不让**（与设置弹窗同一处出处，见 [sheetContentInsets]）：
        // 默认的 `safeDrawing` 会把手势条那一整条当内容的 padding 加在 Surface 内部，
        // 于是列表永远差一截画不到底（用户点名"内容无法显示到底部小横条区域"）。
        contentWindowInsets = { sheetContentInsets() }
    ) {
        // 外面这层 Box 只为了一件事：让移除控制栏**浮在列表之上**、贴在弹窗底部 ——
        // 与下载器那条一样（它也是浮在任务列表上的，不占列表的布局高度）
        Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
        ) {
            SettingsSheetHeader(stringResource(R.string.browser_dock_more_history), dismissAnimated)
            HistoryFilterRow(
                filter = filter,
                onPick = { filter = it },
                searchOpen = searchOpen,
                query = query,
                onQueryChange = { query = it },
                onOpenSearch = { searchOpen = true },
                onCloseSearch = {
                    searchOpen = false
                    query = ""
                },
                focusRequester = searchFocus
            )
            Spacer(Modifier.height(4.dp))
            if (groups.isEmpty()) {
                HistoryEmptyHint(
                    text = when {
                        // 搜索没结果与"这一档本来就没记录"是两件事，提示分开说
                        query.isNotBlank() -> stringResource(R.string.history_empty_search)
                        entries.isEmpty() -> stringResource(R.string.history_empty)
                        else -> stringResource(R.string.history_empty_filtered)
                    }
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    // 移除模式里那条控制栏浮在列表下沿，最后几行得**让开它**才点得到
                    //（它是浮层、不占布局 —— 不给这段内边距就会被压在栏底下）
                    // 底部让开的一条交给**内容自己**（insets 那边已经不让了）：
                    // 手势条 + 24dp 呼吸；移除模式里还要再加上那条浮层控制栏的高度
                    contentPadding = PaddingValues(
                        bottom = sheetBottomGap(
                            if (selectionMode) 24.dp + HistoryBarReserve else 24.dp
                        )
                    )
                ) {
                    groups.forEach { group ->
                        item(key = "day-${group.date}") {
                            HistoryDayHeader(date = group.date, today = today, format = dateFormat)
                        }
                        items(group.rows, key = { it.url }) { row ->
                            HistoryEntryRow(
                                row = row,
                                selected = row.url in selected,
                                swipeEnabled = !selectionMode,
                                onClick = {
                                    if (selectionMode) {
                                        if (!selected.remove(row.url)) selected.add(row.url)
                                    } else {
                                        onOpen(row.url)
                                    }
                                },
                                onLongClick = {
                                    // 长按进入移除模式并选中这一行；已经在移除模式里长按 = 反选
                                    //（与任务卡片同一套手感，见 AppScreen 的 TaskCard）
                                    if (selectionMode) {
                                        if (!selected.remove(row.url)) selected.add(row.url)
                                    } else {
                                        selectionMode = true
                                        selected.add(row.url)
                                    }
                                },
                                // 复制：与设置页那枚同一个来源（`R.string.copied_to_clipboard`
                                // 的 Toast 反馈也是同一个）
                                onCopy = {
                                    clipboard.setText(AnnotatedString(row.url))
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.copied_to_clipboard),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                },
                                // 快捷移除：就是"移除模式里按删除"的最小版（一条）
                                onRemove = { onDelete(listOf(row.url)) }
                            )
                        }
                    }
                }
            }
        }
            // 移除控制栏：贴在弹窗底部、浮在列表之上（与下载器那条同一套观感与动画）
            HistorySelectionBar(
                visible = selectionMode,
                count = selected.size,
                allSelected = visibleUrls.isNotEmpty() && selected.size >= visibleUrls.size,
                onClose = { exitSelection() },
                onToggleSelectAll = {
                    if (visibleUrls.isNotEmpty() && selected.size >= visibleUrls.size) {
                        selected.clear()
                    } else {
                        selected.clear()
                        selected.addAll(visibleUrls)
                    }
                },
                onDelete = {
                    if (selected.isNotEmpty()) onDelete(selected.toList())
                    exitSelection()
                },
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }
    }
}

/**
 * 顶部那一行：**左边一枚搜索按钮 + 右边三个分类**。
 *
 * 分类按用户点名（"只显示最近访问、只显示搜索历史、默认全部"）用 Material 的 [FilterChip]：
 * 所选状态自带底色与描边，一行三枚正好放下；顺序固定为 全部 → 最近访问 → 搜索历史
 * （默认那个在最左，用户一眼看到自己现在在哪一档）。
 *
 * 搜索按钮是**后加的**（用户点名："在顶部分类切换的左侧添加一个搜索按钮，默认只显示图标，
 * 就跟下载器界面的左上角的搜索按钮一样，可以搜索历史"），随后又订正了一条**风格口径**：
 * "搜索按钮应该有边框，而且它的大小位置都应该跟右侧的分类按钮对齐，不然就会风格不统一"。
 * 于是它的每一项都**直接取自库**、不再自己定数：
 * - 高 = `FilterChipDefaults.Height`（32dp，就是分类 chip 的高度）；
 * - 形 = `FilterChipDefaults.shape`（分类 chip 的那个圆角）；
 * - 边框 = `FilterChipDefaults.filterChipBorder(enabled = true, selected = false)`
 *   —— 与"未选中的分类"**同一个** `BorderStroke`（颜色与线宽都是 token，跟着主题走）；
 * - 位置 = 与分类同一行、同一条顶边（`padding(top = 2.dp)` 提到外层容器上，两边共用）；
 * - 图标 = `FilterChipDefaults.IconSize`，与 chip 里那枚 leading icon 同档。
 *
 * 点开之后圆钮**向右铺成整行输入框**（宽度做补间，与下载器那套展开同一手感），
 * 三个分类同时淡出让位 —— 它们**不失效**，只是被盖住，收起后照旧。
 *
 * 为什么分类行要留出左边那一段（[SearchButtonSize] + 8dp）：搜索收起时按钮就停在那儿，
 * 分类不能从它底下开始排 —— 那样第一枚芯片会被压掉一截。
 */
@Composable
private fun HistoryFilterRow(
    filter: HistoryFilter,
    onPick: (HistoryFilter) -> Unit,
    searchOpen: Boolean,
    query: String,
    onQueryChange: (String) -> Unit,
    onOpenSearch: () -> Unit,
    onCloseSearch: () -> Unit,
    focusRequester: FocusRequester
) {
    val items = listOf(
        HistoryFilter.All to stringResource(R.string.history_filter_all),
        HistoryFilter.Visits to stringResource(R.string.history_filter_visits),
        HistoryFilter.Searches to stringResource(R.string.history_filter_searches)
    )
    val colorScheme = MaterialTheme.colorScheme
    val chipShape = FilterChipDefaults.shape
    // 与"未选中的分类"同一个描边 —— 颜色/线宽都不是我们定的数
    val chipBorder = FilterChipDefaults.filterChipBorder(enabled = true, selected = false)
    // 收起 → 展开的进度：分类的淡出与搜索框的宽度都跟着它，两边永远同步
    val expand by animateFloatAsState(
        targetValue = if (searchOpen) 1f else 0f,
        animationSpec = tween(200),
        label = "historySearch"
    )
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            // 与分类同一条顶边：这一条提到容器上，两个子项共用
            .padding(top = 2.dp)
    ) {
        // 分类行：左边让开那枚按钮；搜索铺开时整体淡出。
        //
        // 注意这一行的**布局高度不等于 32dp**：`FilterChip` 走的是 `Surface(onClick = …)`，
        // 而 M3 会给可点击组件套一层"最小交互尺寸"（`minimumInteractiveComponentSize`，
        // 默认 48dp）—— 32dp 的可见胶囊在其中**垂直居中**，上下各留 8dp 的命中区。
        // 所以这一行实测是 48dp 高。
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = 16.dp + SearchButtonSize + SearchButtonGap,
                    end = 16.dp
                )
                .graphicsLayer { alpha = (1f - expand * 2f).coerceIn(0f, 1f) },
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items.forEach { (value, label) ->
                FilterChip(
                    selected = filter == value,
                    onClick = { onPick(value) },
                    label = { Text(label, style = MaterialTheme.typography.labelLarge) }
                )
            }
        }
        // 搜索层：宽度从 32dp（= chip 高，一个方形）补间到整行（左右各留 16dp）。
        //
        // **垂直居中而不是贴顶**（用户点名："为什么历史记录里的搜索按钮向上偏移了？
        // 没有跟右侧的分类切换按钮对齐"）：贴顶的 32dp 就比那颗"居中在 48dp 槽里"的 chip
        // 高了 8dp。这里交给容器居中 —— 容器的高度本来就是被分类行撑出来的（48dp），
        // 于是两边自动同一条中线，**不用写 48dp 这个数**（写了就又是一个会漂的魔数）。
        val searchWidth = lerp(SearchButtonSize, maxWidth - 32.dp, expand)
        Row(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 16.dp)
                .width(searchWidth)
                .height(FilterChipDefaults.Height)
                .clip(chipShape)
                .background(colorScheme.surfaceContainerLow)
                .border(chipBorder, chipShape)
                // 收起时才接这一下（展开了就别再抢了，那时候点在框上是要落光标）
                .clickable(enabled = !searchOpen, onClick = onOpenSearch),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = stringResource(R.string.history_search),
                tint = colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(start = SearchIconInset)
                    .size(FilterChipDefaults.IconSize)
            )
            if (searchOpen) {
                Spacer(Modifier.width(6.dp))
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = colorScheme.onSurface
                    ),
                    cursorBrush = SolidColor(colorScheme.primary),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester),
                    decorationBox = { inner ->
                        Box {
                            if (query.isEmpty()) {
                                Text(
                                    stringResource(R.string.history_search_hint),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            inner()
                        }
                    }
                )
                // 与下载器那枚同一套语义：有内容先清空，空了再收起
                IconButton(
                    onClick = { if (query.isNotEmpty()) onQueryChange("") else onCloseSearch() },
                    modifier = Modifier
                        .size(SearchButtonSize)
                        .padding(end = 2.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.close),
                        tint = colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(15.dp)
                    )
                }
            }
        }
    }
}

/**
 * 搜索按钮**可见**的高度 / 收起时的宽度 = **分类 chip 的胶囊高度**（32dp）。
 *
 * 取库里的 `FilterChipDefaults.Height` 而不是写 32dp：分类 chip 那颗胶囊的高度就是它，
 * 库改了版本这里跟着变，不会出现"某天 chip 高了 2dp、旁边这枚还是个矮的"。
 *
 * **但它不是"这一行的高度"**：chip 外面还套着 M3 的最小交互尺寸（48dp），
 * 搜索槽靠 `Alignment.CenterStart` 跟它共用同一条中线（见 `HistoryFilterRow` 里的说明）。
 */
private val SearchButtonSize = FilterChipDefaults.Height

/** 圆钮与第一枚分类芯片之间留的空。 */
private val SearchButtonGap = 8.dp

/**
 * 收起态那枚图标左边的留白。
 *
 * 32dp 的方钮里放一枚 18dp 的图标，两侧各 7dp 正好居中 —— 展开后它就成了输入框的
 * 左内边距（与右侧那枚 ✕ 的位置对称）。
 */
private val SearchIconInset = 7.dp

/**
 * 分组标题 = **那个自然日的完整日期**（今天 / 昨天 / 其余走本地化长日期），右侧拉一条
 * **横杠**把这一档与下一档分开（用户点名："每个时间分组标题右侧应该有个横杠分隔区域，
 * 横杠右边应该留一点空间"）。
 *
 * 为什么只剩"今天/昨天"这两种口语念法：它们本身没有歧义；再往上（"最近一周""更早"）
 * 就是没有准确时间的模糊说法，用户点名否掉了。
 */
@Composable
private fun HistoryDayHeader(date: LocalDate, today: LocalDate, format: DateTimeFormatter) {
    val text = when (BrowseHistory.dayKind(date, today)) {
        HistoryDay.Today -> stringResource(R.string.history_bucket_today)
        HistoryDay.Yesterday -> stringResource(R.string.history_bucket_yesterday)
        HistoryDay.Dated -> format.format(date)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(10.dp))
        // 横杠：吃掉标题右侧剩下的宽度（`weight(1f)`），所以它随日期长短自己伸缩
        HorizontalDivider(
            modifier = Modifier.weight(1f),
            thickness = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant
        )
        // 右边那一点空间：横杠不到边，读起来才是"分隔"而不是"划线到底"
        Spacer(Modifier.width(DayRuleEndGap))
    }
}

/**
 * 一行记录：**左图标 + 中标题/副标题**，右边**什么都不挂**（用户点名："每个历史记录选项
 * 右侧不应该显示时间"）—— 哪些时刻发生的已经由组标题（那一天）说清了，行里再来一个时分
 * 只是每隔一行就撞一下视线。
 *
 * 搜索行（[HistoryRow.isSearch]）的标题已经是关键词（见 [BrowseHistory.timeline]），
 * 左边那枚则是引擎的图标 —— 于是"这次是搜的"这件事靠**内容**就看得出，不用再加一枚角标。
 *
 * 手势（用户点名"长按历史记录应该进入移除模式"）与任务卡片**同一套**（见 AppScreen 的
 * [TaskCard]）：长按进入移除模式并选中这一行；已经在移除模式里，点与长按都只是**反选**。
 * 选中态只用**背景淡染**表达、布局零变化 —— 高度恒定，进出移除模式时列表不跳动。
 */
@Composable
private fun HistoryEntryRow(
    row: HistoryRow,
    selected: Boolean,
    /** 移除模式里不许再滑（与下载器同一条：那一档的横向手势归"选择"，不归"操作"）。 */
    swipeEnabled: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onCopy: () -> Unit,
    onRemove: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    // 前景的水平位移：0 = 合上，-openWidthPx = 完全露出右侧两个操作
    val offsetX = remember { Animatable(0f) }
    val openWidthPx = with(density) { HistorySwipeOpenWidth.toPx() }
    // 进移除模式时先归位：不然卡片会带着"露出两个按钮"的姿态去当选中行，读起来很乱
    LaunchedEffect(swipeEnabled) {
        if (!swipeEnabled && offsetX.value != 0f) {
            offsetX.animateTo(0f, tween(200, easing = FastOutSlowInEasing))
        }
    }
    // 与任务卡片同一个色值（primary 12%），两处的"选中"读起来是同一种
    val selectionBackground by animateColorAsState(
        targetValue = if (selected) {
            colorScheme.primary.copy(alpha = 0.12f)
        } else {
            Color.Transparent
        },
        animationSpec = tween(180),
        label = "historySelection"
    )
    Box(modifier = Modifier.fillMaxWidth()) {
        // 背景操作层（右对齐）：随滑动进度渐显 + 轻微右移入场 —— 版式照抄下载器那条
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
            // 复制：把这一条的地址拷走，卡片随即归位
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(colorScheme.primary)
                    .clickable {
                        onCopy()
                        scope.launch { offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing)) }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ContentCopy,
                    contentDescription = stringResource(R.string.copy),
                    tint = colorScheme.onPrimary,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(Modifier.width(8.dp))
            // 快捷移除：直接按地址删掉这一条（不弹确认 —— 与"移除模式里按删除"同一件事）
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(colorScheme.error)
                    .clickable {
                        onRemove()
                        scope.launch { offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing)) }
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

        // 前景：跟随手指水平位移
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .background(selectionBackground)
                .pointerInput(swipeEnabled) {
                    if (!swipeEnabled) return@pointerInput
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
                                    offsetX.animateTo(
                                        -openWidthPx,
                                        tween(220, easing = FastOutSlowInEasing)
                                    )
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
            HistoryEntryContent(row = row, onClick = onClick, onLongClick = onLongClick)
        }
    }
}

/**
 * 左滑露出的那两个操作按钮占多宽：46 + 8 + 46 + 14（与下载器那条**同一个版式**，
 * 两处的滑动手感因此一致）。改这里的数就等于改"要滑多远"，别只改一半。
 */
private val HistorySwipeOpenWidth = 114.dp

/**
 * 行的正面内容（左图标 + 中标题/副标题）。从 [HistoryEntryRow] 里分出来，是为了让
 * "滑动外壳"与"内容本身"各管一件事 —— 外壳管位移与两个操作，内容只管长相与手势。
 */
@Composable
private fun HistoryEntryContent(row: HistoryRow, onClick: () -> Unit, onLongClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SiteIcon(url = row.url)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (row.subtitle.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = row.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

/**
 * 左边那枚图标：**真实的网站图标**优先（[FaviconStore]），拿不到就是**通用图标**。
 *
 * 为什么不是首字母（用户点名："获取不到图标的网站应该显示通用图标，而不是显示首字母"）：
 * 一堆站点各取一个字母、各配一种颜色，扫下来是一片参差的色块，比统一的通用图标更吵。
 *
 * 为什么读一下 `revision`：图标是**异步**到位的（WebView 报的、或按域名抓的），
 * 读那个版本号就等于订阅了"仓库里又有新图标了"，列表会自己刷新 —— 不会出现
 * "同一站点的几行一半有图标一半是通用图标"。
 */
@Composable
private fun SiteIcon(url: String) {
    val host = remember(url) { BrowseHistory.hostOf(url) }
    val version = FaviconStore.revision.intValue
    val icon = remember(host, version) { FaviconStore.cached(host) }
    // 排一次抓取（幂等）：命中缓存 / 已在抓 / 已抓过都不会重复发请求
    LaunchedEffect(host) { FaviconStore.request(url) }

    Box(modifier = Modifier.size(22.dp), contentAlignment = Alignment.Center) {
        if (icon != null) {
            Image(
                bitmap = icon,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(20.dp)
                    .clip(RoundedCornerShape(5.dp))
            )
        } else {
            GenericSiteIcon()
        }
    }
}

/** 拿不到真图标时的兜底：一枚**通用地球**（Material 现成图标，不自己画）。 */
@Composable
private fun GenericSiteIcon() {
    Box(
        modifier = Modifier
            .size(20.dp)
            .clip(RoundedCornerShape(5.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Outlined.Public,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp)
        )
    }
}

/** 空状态：没有任何记录，或这一档筛下来是空的 —— 两种要说清不是一回事。 */
@Composable
private fun ColumnScope.HistoryEmptyHint(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * 移除模式的控制栏（用户点名："长按历史记录应该进入移除模式，底部弹出移除控制栏，
 * 就跟下载器页面的移除控制栏一样"）。
 *
 * 与下载器那条 [SelectionBar] **同一套观感与动画**：`surfaceContainerHigh` 面板、20dp 圆角、
 * 10dp 投影 + 2dp tonal、左右各 16dp 外沿、同样的 260/220ms 滑入滑出。内容也照抄它那一态
 * （见 AppScreen 的 `SelectionBarNormalContent`）：**全选/全不选的那枚圆勾 + 已选数量 +
 * 红色「删除」+ 退出编辑的 ✕**。
 *
 * 两处**故意不一样**：
 * - 外沿的**下边距要自己叠加手势条**（`sheetBottomGap(12.dp)`）—— 弹窗那边现在只让开顶部
 *  （见 [sheetContentInsets]），这条栏是贴屏幕底的浮层，不让开就会压在手势条底下点不着；
 * - **没有下载器那套"删除确认"第二态**：那边要确认是因为还得选"是否连文件一起删"，
 *   而历史只有"删掉记录"一件事，多一步确认只是让用户多按一次。
 */
@Composable
private fun HistorySelectionBar(
    visible: Boolean,
    count: Int,
    allSelected: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = slideInVertically(
            initialOffsetY = { it },
            animationSpec = tween(260, easing = FastOutSlowInEasing)
        ) + fadeIn(),
        exit = slideOutVertically(
            targetOffsetY = { it },
            animationSpec = tween(220, easing = FastOutSlowInEasing)
        ) + fadeOut()
    ) {
        val colorScheme = MaterialTheme.colorScheme
        Surface(
            color = colorScheme.surfaceContainerHigh,
            contentColor = colorScheme.onSurface,
            shape = RoundedCornerShape(20.dp),
            shadowElevation = 10.dp,
            tonalElevation = 2.dp,
            modifier = Modifier
                // 底部**要自己让开手势条**：弹窗那边已经不让开了（见 sheetContentInsets），
                // 而这条栏是贴屏幕底的浮层 —— 不让的话按钮会压在手势条底下点不着
                .padding(
                    start = 16.dp,
                    end = 16.dp,
                    top = 12.dp,
                    bottom = sheetBottomGap(12.dp)
                )
                .fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(start = 18.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 勾选图标 = 全选 / 全不选（与下载器那枚同一个语义、同一个图标对）
                Icon(
                    if (allSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                    contentDescription = stringResource(
                        if (allSelected) R.string.select_none else R.string.select_all
                    ),
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
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.exit_edit_mode)
                    )
                }
            }
        }
    }
}

/**
 * 移除模式里列表底部要**多留出来**的高度。
 *
 * 控制栏是浮层（`AnimatedVisibility` + `align(BottomCenter)`，不占列表的布局），所以最后
 * 几行会被它压住、点不到 —— 给列表加这一段内边距把它们顶上来。数值 = 栏自己的高度
 * （12dp 上 + 4dp 内容浮白 + ~48dp 行 + 4dp + 12dp 下 ≈ 80dp）再宽一点，宁多勿少。
 */
private val HistoryBarReserve = 72.dp

