package com.lerxu.android.ui.screen

import android.graphics.Bitmap
import android.graphics.RectF
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lerxu.android.R
import com.lerxu.android.browser.CoverImageLoader
import com.lerxu.android.browser.MoviePageExtractor
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.ui.formatBytes

/**
 * 影视模式的那一屏：**用我们自己的 UI 重新呈现**这一页的影视内容。
 *
 * 版式（自上而下）：
 * 1. **我们的顶栏**：默认只有"打开导航 / 当前分类 / 刷新 / 退出影视"这几样，
 *    站点分类**默认收起**，点左边那枚按钮才向下展开一层面板（浮层，不推动播放区）；
 * 2. 16:9 播放区：原生播放器就落在这一块上（落点由这一块**量出来**喂给覆盖层，见下）；
 * 3. 内容区：**每个板块左上角先写板块名**（一道强调色小竖条 + 标题），再排它的内容 ——
 *    主内容墙（封面卡：名称压在封面左下角、清晰度在名称下方）、站点的推荐区、
 *    以及**站点的评论区**（只借它的内容，样式全是我们自己的，含每条评论下的回复）。
 *
 * 它是"替代网页"的整屏，不是浮层，所以：
 * - 自己铺深色底（网页在它下面被完全盖住，不该透出任何网页配色）；
 * - 颜色全部写死、不跟随应用主题 —— 影视页本来就该是暗的（看片时一整屏亮底很刺眼），
 *   跟随主题会在浅色主题下变成一整屏白；
 * - 内容区**要让出底部功能栏**（[bottomInset]）：功能栏是浮在网页之上的，不让出来的话
 *   最后一排卡片会被压在栏里（用户点名）。
 *
 * 播放区那块的**位置与高度以"量到的真实矩形"为准**（[onStageRect]）：原生播放器是按我们
 * 推进覆盖层的矩形摆的，两边一旦对不上，播放器要么压住我们的顶栏、要么在它和内容之间
 * 裂出一条空白（用户点名过这两个）。量真东西比两处各算一遍可靠。
 */
@Composable
fun MovieScreen(
    title: String,
    nav: List<MoviePageExtractor.MovieNavItem>,
    blockTitle: String,
    cards: List<MoviePageExtractor.MovieCard>,
    sections: List<MoviePageExtractor.MovieSection>,
    comments: List<MoviePageExtractor.MovieComment>,
    commentTitle: String,
    items: List<SniffedResource>,
    loading: Boolean,
    empty: Boolean,
    referer: String,
    userAgent: String,
    bottomInset: Dp,
    /** 站内搜索能不能用（站点有可用的搜索表单才显示顶栏那个框，见 `movieSearchReady`）。 */
    searchReady: Boolean,
    /** 搜索框的提示语：优先用站点搜索框自己的占位文字。 */
    searchHint: String,
    onStageRect: (RectF?) -> Unit,
    onNavigate: (String) -> Unit,
    onSearch: (String) -> Unit,
    onPlay: (SniffedResource) -> Unit,
    onPlayInPage: () -> Unit,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val widthDp = LocalConfiguration.current.screenWidthDp.toFloat()
    val stageHeight = movieStageHeightDp(widthDp).dp
    // 封面按目标显示宽降采样（网格卡 / 推荐卡 / 评论头像各一档），别把原图整张解进内存
    val gridCardWidthPx = with(density) { ((widthDp - 28f - 16f) / 3f).dp.roundToPx() }
    val rowCardWidthPx = with(density) { MovieRowCardWidthDp.dp.roundToPx() }
    val avatarPx = with(density) { MovieAvatarSizeDp.dp.roundToPx() }
    // 当前这一档分类（顶栏显示它的名字，下拉面板里它高亮）：拿页面地址去对导航项
    val here = pathOf(referer)
    val hereName = nav.firstOrNull { here.isNotEmpty() && pathOf(it.url) == here }?.text.orEmpty()
    // 站点分类默认**收起**（用户口径）：顶栏平时只留一行，点左边那枚按钮才展开
    var navOpen by remember { mutableStateOf(false) }
    // 上一次喂出去的矩形：一样就不再喂（onGloballyPositioned 每帧都可能回调，
    // 无条件写状态会把重组顶成死循环）
    var lastStage by remember { mutableStateOf<RectF?>(null) }

    // 这一屏走了就把落点清掉：不清的话播放器会照着上一页的矩形摆（换页/退出时会闪一下）
    DisposableEffect(Unit) {
        onDispose { onStageRect(null) }
    }

    Column(modifier = modifier.fillMaxSize().background(MovieBg)) {
        // ── ① 顶栏：浏览分类 + 站内搜索 + 退出影视（纯色底，分类面板是浮层，见下） ──
        Box(Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(MovieNavBarHeightDp.dp)
                    .background(MovieBgTop)
                    .padding(start = 6.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 打开 / 收起站点分类：**不带背景**的图标按钮（用户口径）
                MoviePlainIconButton(
                    icon = Icons.Rounded.Menu,
                    desc = stringResource(R.string.movie_mode_nav_open)
                ) { navOpen = !navOpen }
                if (searchReady) {
                    MovieSearchField(
                        hint = searchHint.ifBlank { stringResource(R.string.movie_mode_search_hint) },
                        onSearch = onSearch,
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 6.dp)
                    )
                } else {
                    // 站点没有可用的搜索表单时，这一条退回"当前分类名"（不然顶栏会空一截）
                    Text(
                        hereName.ifBlank { title.ifBlank { stringResource(R.string.movie_mode) } },
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MovieText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 6.dp)
                    )
                }
                // 右侧**没有退出按钮**（用户口径）：进和出都走坞里输入框右侧那枚影视模式入口
            }

            // 站点分类：从顶栏下沿**向下展开**的一层浮层（不推动播放区，播放器就不会跟着跳）
            MovieNavDropdown(
                visible = navOpen,
                nav = nav,
                here = here,
                onPick = { url ->
                    navOpen = false
                    onNavigate(url)
                },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = MovieNavBarHeightDp.dp)
            )
        }

        // ── ② 16:9 播放区：整宽、贴顶栏之下 —— 原生播放器就落在这一块上 ──
        Box(
            modifier = Modifier
                .fillMaxWidth()
                // **有流才占 16:9 并铺黑**（那一块就是原生播放器的落点）；没流时这一块收成
                // 一条细提示 —— 搜索结果页那种页面不该出现一个"播放器"（用户口径）
                .then(
                    if (items.isEmpty()) {
                        Modifier
                    } else {
                        Modifier.height(stageHeight).background(Color.Black)
                    }
                )
                .onGloballyPositioned { coords ->
                    // 覆盖层在 decorView 上，用的是**窗口坐标**；它内部按密度把 dp 乘回 px，
                    // 所以这里反过来除一次密度，喂出去的是 dp
                    val b = coords.boundsInWindow()
                    val d = density.density
                    val r = RectF(b.left / d, b.top / d, b.right / d, b.bottom / d)
                    val prev = lastStage
                    if (prev == null || prev != r) {
                        lastStage = r
                        onStageRect(r)
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            if (items.isEmpty()) {
                // 没有可播的流就**不画播放区**（用户口径："搜索结果页就不应该显示一个播放器"）：
                // 只留一条细提示 + 回网页起播的出口，版面让给内容
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        stringResource(R.string.movie_mode_empty),
                        fontSize = 12.sp,
                        color = MovieTextDim,
                        maxLines = 2,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(12.dp))
                    MovieOutlineButton(
                        text = stringResource(R.string.movie_mode_play_in_page),
                        onClick = onPlayInPage
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(stageHeight)
                        .background(Color.Black)
                        .onGloballyPositioned { coords ->
                            // 覆盖层在 decorView 上，用的是**窗口坐标**；它内部按密度把 dp 乘回 px，
                            // 所以这里反过来除一次密度，喂出去的是 dp
                            val b = coords.boundsInWindow()
                            val d = density.density
                            val r = RectF(b.left / d, b.top / d, b.right / d, b.bottom / d)
                            val prev = lastStage
                            if (prev == null || prev != r) {
                                lastStage = r
                                onStageRect(r)
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            stringResource(R.string.movie_mode_lines).uppercase(),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = 1.5.sp,
                            color = MovieTextDim
                        )
                        Spacer(Modifier.height(10.dp))
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp)
                        ) {
                            items(items, key = { it.dedupKey }) { item ->
                                MoviePlayChip(
                                    label = movieChipLabel(item),
                                    primary = item == items.first()
                                ) { onPlay(item) }
                            }
                        }
                    }
                }
            }
        }

        // ── ③ 内容区：每个板块左上角先写板块名，再排它的内容 ──
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            // 底部让出功能栏：不让的话最后一排卡片会被压在栏里（用户点名）
            contentPadding = PaddingValues(bottom = bottomInset + 16.dp)
        ) {
            // 主内容墙自己的板块名（站点给的名字 → 当前分类名，见 movieBlockTitle）。
            // 名字拿不到就**不画这一行** —— 拿页面标题顶上去，读起来就是"标题变成了别的文字"
            if (cards.isNotEmpty() && blockTitle.isNotBlank()) {
                item(key = "main-head") {
                    MovieBlockHeader(blockTitle)
                }
            }

            items(cards.chunked(3), key = { row -> row.joinToString("|") { it.url } }) { row ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 14.dp, top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    row.forEach { card ->
                        MovieCoverCard(
                            card = card,
                            referer = referer,
                            userAgent = userAgent,
                            targetWidthPx = gridCardWidthPx,
                            modifier = Modifier.weight(1f),
                            onClick = { onNavigate(card.url) }
                        )
                    }
                    // 最后一行不满 3 张时补空位，卡片就不会被拉宽
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }

            sections.forEach { section ->
                item(key = "head-" + section.cards.firstOrNull()?.url) {
                    MovieBlockHeader(
                        section.title.ifBlank { stringResource(R.string.movie_mode_recommend) }
                    )
                }
                item(key = "row-" + section.cards.firstOrNull()?.url) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp)
                    ) {
                        items(section.cards, key = { it.url }) { card ->
                            MovieCoverCard(
                                card = card,
                                referer = referer,
                                userAgent = userAgent,
                                targetWidthPx = rowCardWidthPx,
                                modifier = Modifier.width(MovieRowCardWidthDp.dp),
                                onClick = { onNavigate(card.url) }
                            )
                        }
                    }
                }
            }

            // ── ④ 评论区：内容来自站点，样式是我们的（用户口径），含每条评论下的回复。
            // 每条评论**不带底、不带框**，只用一条两侧留白的横线分隔（用户口径）。
            if (comments.isNotEmpty()) {
                item(key = "cmt-head") {
                    MovieBlockHeader(
                        text = commentTitle.ifBlank { stringResource(R.string.movie_mode_comments) },
                        count = comments.size
                    )
                }
                itemsIndexed(
                    comments,
                    key = { _, c -> c.name + "|" + c.time + "|" + c.text.take(24) }
                ) { index, c ->
                    Column(Modifier.fillMaxWidth()) {
                        if (index > 0) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp)
                                    .height(1.dp)
                                    .background(MovieHairline)
                            )
                        }
                        MovieCommentRow(
                            comment = c,
                            referer = referer,
                            userAgent = userAgent,
                            avatarPx = avatarPx
                        )
                    }
                }
            }

            if (cards.isEmpty() && sections.isEmpty() && comments.isEmpty()) {
                item(key = "state") {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 36.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(22.dp),
                                color = MovieAccent,
                                strokeWidth = 2.dp
                            )
                            Spacer(Modifier.height(14.dp))
                            Text(
                                stringResource(R.string.movie_mode_loading),
                                fontSize = 13.sp,
                                color = MovieTextDim
                            )
                        } else if (empty) {
                            Text(
                                stringResource(R.string.movie_mode_no_content),
                                fontSize = 13.sp,
                                color = MovieTextDim
                            )
                            Spacer(Modifier.height(14.dp))
                            // 空态也是**出路**：回网页去（不拉黑这一站，起播后还能自动回来）
                            MovieOutlineButton(
                                text = stringResource(R.string.movie_mode_view_page),
                                onClick = onPlayInPage
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 分类面板的展开 / 收起动画。
 *
 * 单独抽一个函数是为了**避开 `ColumnScope` 那个同名重载**：直接在 Column 里调
 * `AnimatedVisibility` 会被解析成 `ColumnScope.AnimatedVisibility`，而这里要的是
 * "自己指定落点、不占布局高度"的那一个（顶栏下沿的浮层）。
 */
@Composable
private fun MovieNavDropdown(
    visible: Boolean,
    nav: List<MoviePageExtractor.MovieNavItem>,
    here: String,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible && nav.isNotEmpty(),
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
        modifier = modifier
    ) {
        MovieNavPanel(nav = nav, here = here, onPick = onPick)
    }
}

/**
 * 站点分类面板：顶栏下沿**向下展开**的一层浮层，分类按"**每行三格的表格**"排布 ——
 * 只显示文字、不带底色（用户口径），格与格之间用发丝线划出区域，当前这一档用强调色文字标出。
 */
@Composable
private fun MovieNavPanel(
    nav: List<MoviePageExtractor.MovieNavItem>,
    here: String,
    onPick: (String) -> Unit
) {
    val rows = nav.chunked(3)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            // 背景与顶栏**同色**（用户口径）：展开出来的这一层读起来就是顶栏自己长出来的
            .background(MovieBgTop)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 236.dp)
        ) {
            itemsIndexed(rows, key = { _, row -> row.joinToString("|") { it.url } }) { rowIndex, row ->
                if (rowIndex > 0) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(MovieHairline))
                }
                // 行高**写死**：格与格之间那道竖线要 `fillMaxHeight()` 撑满整行，
                // 靠内容撑高度的话竖线会比行矮一截、下方留出一小段空档（用户点名过）
                Row(modifier = Modifier.fillMaxWidth().height(MovieNavCellHeightDp.dp)) {
                    row.forEachIndexed { colIndex, item ->
                        if (colIndex > 0) {
                            Box(Modifier.width(1.dp).fillMaxHeight().background(MovieHairline))
                        }
                        val active = here.isNotEmpty() && pathOf(item.url) == here
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clickable { onPick(item.url) },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                item.text,
                                fontSize = 13.sp,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (active) MovieAccent else MovieTextBody,
                                textAlign = TextAlign.Center,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(horizontal = 6.dp)
                            )
                        }
                    }
                    // 最后一行不满三格时补空位：格子宽度才不会跟别的行不一样
                    repeat(3 - row.size) {
                        Box(Modifier.width(1.dp).fillMaxHeight().background(MovieHairline))
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** 顶栏上一枚**不带背景**的图标按钮（打开导航）。 */
@Composable
private fun MoviePlainIconButton(icon: ImageVector, desc: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = desc, tint = MovieText, modifier = Modifier.size(21.dp))
    }
}

/**
 * 顶栏的**站内搜索**框：用站点自己的搜索表单提交（见 `BrowserController.searchInMovieMode`）。
 *
 * 提示语优先用站点搜索框自己的占位文字 —— 用户看到的就是站点那句"搜索影片"，
 * 比自己另写一句更贴站点。站点没有可用的搜索表单时这个框根本不显示（调用处判断）。
 */
@Composable
private fun MovieSearchField(
    hint: String,
    onSearch: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var text by remember { mutableStateOf("") }
    val keyboard = LocalSoftwareKeyboardController.current
    BasicTextField(
        value = text,
        onValueChange = { text = it },
        singleLine = true,
        textStyle = TextStyle(color = MovieText, fontSize = 13.sp),
        cursorBrush = SolidColor(MovieAccent),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = {
            if (text.isNotBlank()) {
                keyboard?.hide()
                onSearch(text)
                // **不清空输入框**（用户口径）：搜完之后框里还留着刚才的词，
                // 想改一个词再搜、或者回头看看搜的是什么，都不必重打
            }
        }),
        modifier = modifier
            // 圆角收小、整体矮一点（用户口径）：它是一个"输入条"，不该比顶栏的按钮还显眼
            .clip(RoundedCornerShape(9.dp))
            .background(MovieChip)
            .padding(horizontal = 11.dp, vertical = 6.dp)
    ) { inner ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            // 左侧一枚搜索图标（用户口径）：一眼看出这是个搜索框，不是分类名
            Icon(
                Icons.Rounded.Search,
                contentDescription = null,
                tint = MovieTextFaint,
                modifier = Modifier.size(14.dp)
            )
            Spacer(Modifier.width(6.dp))
            Box(contentAlignment = Alignment.CenterStart, modifier = Modifier.weight(1f)) {
                if (text.isEmpty()) {
                    Text(
                        hint,
                        fontSize = 12.sp,
                        color = MovieTextFaint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                inner()
            }
        }
    }
}

/** 描边小胶囊按钮（"在网页里播放" / "查看原网页"）：强调色描边、不填底。 */
@Composable
private fun MovieOutlineButton(text: String, onClick: () -> Unit) {
    Text(
        text,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium,
        color = MovieAccent,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .border(1.dp, MovieAccent.copy(alpha = 0.45f), RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 9.dp)
    )
}

/**
 * 一个内容板块的标题：**左上角那一行**（用户口径：每个板块左上角都要显示板块名）。
 *
 * 只有文字（用户口径：左侧那道强调色竖条删掉），主内容墙、推荐区、评论区都用它。
 */
@Composable
private fun MovieBlockHeader(text: String, count: Int = 0) {
    Row(
        modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 20.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = MovieText,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (count > 0) {
            Spacer(Modifier.width(8.dp))
            Text("$count", fontSize = 11.sp, color = MovieTextDim)
        }
    }
}

/**
 * 一张封面卡片：**名称压在封面左下角、清晰度在名称下方**（用户口径）。
 *
 * 封面走 [CoverImageLoader]（带 Referer / UA / Cookie 的自有请求，见那边的注释）：
 * 没到位时画一块深色占位，**不留白**——一屏白块比没图更糟。
 */
@Composable
private fun MovieCoverCard(
    card: MoviePageExtractor.MovieCard,
    referer: String,
    userAgent: String,
    targetWidthPx: Int,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bitmap by produceState<Bitmap?>(
        initialValue = CoverImageLoader.cached(card.cover),
        key1 = card.cover,
        key2 = referer
    ) {
        value = CoverImageLoader.cached(card.cover)
            ?: if (card.cover.isEmpty()) null
            else CoverImageLoader.load(card.cover, referer, userAgent, targetWidthPx)
    }
    Column(
        modifier = modifier.clickable(onClick = onClick)
    ) {
        // 封面：**只放图和评分**（用户口径：名称与标签挪到封面外的下方）
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp))
                .background(MovieCover)
                .border(1.dp, Color(0x14FFFFFF), RoundedCornerShape(10.dp))
        ) {
            val image = bitmap
            if (image != null) {
                Image(
                    bitmap = image.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            // 评分：压在封面**右上角**（用户口径），站点给了评分才画
            if (card.rating.isNotEmpty()) {
                Text(
                    card.rating,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MovieRating,
                    maxLines = 1,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            card.title,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.Medium,
            color = MovieText,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        // 标签：**纯文字、不带底**（用户口径）
        if (card.badge.isNotEmpty()) {
            Spacer(Modifier.height(2.dp))
            Text(
                card.badge,
                fontSize = 11.sp,
                color = MovieTextDim,
                maxLines = 1
            )
        }
    }
}

/**
 * 一条评论（**含它的回复**）：头像 + 昵称 / 时间 + 正文，回复缩进挂在同一条下面。
 *
 * 用户口径：网页有评论区就显示评论区，只是把它的样式换成我们的；**有回复的评论要把
 * 回复一起渲染出来**（以前只渲染了首条，回复全丢了）。评论本身**不带底色、不带边框**，
 * 条目之间靠一条两侧留白的横线分隔（横线在调用处插）。
 */
@Composable
private fun MovieCommentRow(
    comment: MoviePageExtractor.MovieComment,
    referer: String,
    userAgent: String,
    avatarPx: Int
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            MovieAvatar(comment.avatar, referer, userAgent, avatarPx)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (comment.name.isNotEmpty()) {
                        Text(
                            comment.name,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MovieText,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                    }
                    if (comment.time.isNotEmpty()) {
                        if (comment.name.isNotEmpty()) {
                            Text("·", fontSize = 12.sp, color = MovieTextFaint)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            comment.time,
                            fontSize = 11.sp,
                            color = MovieTextFaint,
                            maxLines = 1
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    comment.text,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    color = MovieTextBody,
                    maxLines = 8,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        if (comment.replies.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            // 回复与正文左对齐（头像宽 + 间距），缩进一层就读得出"这是这条评论下面的回复"
            Column(modifier = Modifier.padding(start = MovieAvatarSizeDp.dp + 10.dp)) {
                comment.replies.forEachIndexed { i, reply ->
                    if (i > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                                .height(1.dp)
                                .background(Color(0x0FFFFFFF))
                        )
                    }
                    MovieReplyRow(reply)
                }
            }
        }
    }
}

/** 一条回复：缩进一层 + "昵称 · 时间" + 正文（用户口径：左边那道强调色细线删掉）。 */
@Composable
private fun MovieReplyRow(reply: MoviePageExtractor.MovieComment) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (reply.name.isNotEmpty()) {
                Text(
                    reply.name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MovieBadgeText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
            }
            if (reply.time.isNotEmpty()) {
                if (reply.name.isNotEmpty()) {
                    Text("·", fontSize = 11.sp, color = MovieTextFaint)
                    Spacer(Modifier.width(5.dp))
                }
                Text(reply.time, fontSize = 11.sp, color = MovieTextFaint, maxLines = 1)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            reply.text,
            fontSize = 12.5.sp,
            lineHeight = 18.sp,
            color = MovieReplyText,
            maxLines = 6,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** 评论头像：圆形、一圈极淡的描边（深色底上把圆形"托"出来）。 */
@Composable
private fun MovieAvatar(url: String, referer: String, userAgent: String, targetPx: Int) {
    val avatar by produceState<Bitmap?>(
        initialValue = CoverImageLoader.cached(url),
        key1 = url,
        key2 = referer
    ) {
        value = CoverImageLoader.cached(url)
            ?: if (url.isEmpty()) null else CoverImageLoader.load(url, referer, userAgent, targetPx)
    }
    Box(
        modifier = Modifier
            .size(MovieAvatarSizeDp.dp)
            .clip(CircleShape)
            .background(MovieSurfaceHi)
            .border(1.dp, Color(0x1FFFFFFF), CircleShape)
    ) {
        val image = avatar
        if (image != null) {
            Image(
                bitmap = image.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

/** 播放区里的一条线路（嗅探到的视频流）：点它交给 App 自己的播放器。第一条是主线路。 */
@Composable
private fun MoviePlayChip(label: String, primary: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 12.sp,
        fontWeight = if (primary) FontWeight.Medium else FontWeight.Normal,
        color = if (primary) Color.White else MovieTextBody,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .widthIn(max = 220.dp)
            .clip(RoundedCornerShape(50))
            .background(if (primary) MovieAccentSoft else MovieChip)
            .border(
                1.dp,
                if (primary) MovieAccent.copy(alpha = 0.55f) else MovieHairline,
                RoundedCornerShape(50)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    )
}

/** 一条线路的名字：**视频名优先**（嗅探那一刻的页面标题），空则退回地址末段；后面缀上大小 / 清晰度。 */
private fun movieChipLabel(item: SniffedResource): String {
    val name = item.title.trim().ifEmpty {
        item.url.substringAfterLast('/').substringBefore('?')
            .ifEmpty { item.url.substringAfter("://").substringBefore('/') }
    }
    val meta = movieMeta(item)
    return if (meta.isEmpty()) name else "$name · $meta"
}

/** 线路右侧那行小字：扩展名 / 清晰度 / 大小，用 ` · ` 串起来（都缺就返回空串）。 */
private fun movieMeta(item: SniffedResource): String {
    val parts = mutableListOf<String>()
    if (item.extension.isNotEmpty()) parts += item.extension.uppercase()
    item.quality?.let { parts += it }
    if (item.size > 0) parts += formatBytes(item.size)
    return parts.joinToString(" · ")
}

/**
 * 地址的"同一页"口径：去掉协议、查询串、片段与结尾斜杠。
 *
 * 顶栏靠它判断"当前在哪一档"（[MovieScreen] 里的 `here`），与控制器 `urlPath` 同一个口径。
 */
private fun pathOf(url: String): String =
    url.substringBefore('#').substringBefore('?').substringAfter("://", url).trimEnd('/')

// ────────────────────── 播放区的落点（由这一屏量出来，见 MovieScreen 的 onStageRect） ──────────────────────

/** 顶栏高度：播放区排在它之下。 */
internal val MovieNavBarHeightDp = 48f

/** 播放区顶边（相对内容区顶部）：顶栏之下。**只在量不到真实矩形时兜底**。 */
internal fun movieStageTopDp(contentTopDp: Float): Float = contentTopDp + MovieNavBarHeightDp

/** 播放区高度：整宽 16:9。 */
internal fun movieStageHeightDp(widthDp: Float): Float = widthDp * 9f / 16f

/** 推荐区里一张卡的宽度（横滑一行的尺寸）。 */
private const val MovieRowCardWidthDp = 112f

/** 评论区头像的直径。 */
private const val MovieAvatarSizeDp = 36f

/** 分类面板里一格的高度（写死，格与格之间的竖线才好撑满整行）。 */
private const val MovieNavCellHeightDp = 46f

// 影视页自己的一套配色（不跟随应用主题，理由见 MovieScreen 的注释）。
private val MovieBgTop = Color(0xFF171A21)
private val MovieBg = Color(0xFF0B0D11)
private val MovieSurface = Color(0xFF14171D)
private val MovieSurfaceHi = Color(0xFF1B1F27)
private val MovieHairline = Color(0xFF262B34)
private val MovieText = Color(0xFFF2F4F7)
private val MovieTextBody = Color(0xFFD7DBE0)
private val MovieTextDim = Color(0xFF8E96A3)
private val MovieTextFaint = Color(0xFF6C7480)
private val MovieChip = Color(0xFF1B1F27)
private val MovieCover = Color(0xFF1B1E24)
private val MovieBadgeText = Color(0xFFB9C2CE)

/** 评分的颜色（封面右上角那枚数字）：暖金色，压在任何封面上都读得清。 */
private val MovieRating = Color(0xFFFFD166)
private val MovieReplyText = Color(0xFFC3C9D2)

/** 强调色（对齐 `Theme.kt` 深色的 primary）：当前分类、板块名竖条、加载与空态出口。 */
private val MovieAccent = Color(0xFF4A9EFF)

/** 强调色的淡底（主线路、当前分类那种"选中"的底）。 */
private val MovieAccentSoft = Color(0x2E4A9EFF)
