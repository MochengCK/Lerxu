package com.lerxu.android.ui.screen

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Button
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lerxu.android.R
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * 引导界面 —— 首次启动时展示。
 *
 * 版式：一条**整宽步骤条**（替代原来那排小圆点）+ 一屏一件事 + 底部一枚主按钮，
 * 翻页时内容按位移**淡出 + 轻微升降 + 缩放**（不是硬切），每页内部再按顺序错开浮现。
 * 页面顺序：欢迎 → 能力 → **默认入口** → 权限 → 完成。
 *
 * 「默认入口」是这一版新加的：用户在这里选启动 App 先落在下载器还是浏览器
 *（写 [StartPagePrefs]，之后可在设置里改）。
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalAnimationApi::class)
@Composable
fun OnboardingScreen(
    onFinished: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colorScheme = MaterialTheme.colorScheme

    val pagerState = rememberPagerState(pageCount = { ONBOARDING_PAGES.size })
    val page = pagerState.currentPage

    // 默认入口：进来时读当前的（全新安装 = 下载器），选中就落盘 ——
    // 跳过引导也不会丢（跳过 = 保持默认）
    var startPage by remember { mutableStateOf(StartPagePrefs.read(context)) }

    val hasStoragePermission = remember { mutableStateOf(storageGranted(context)) }
    val hasNotificationPermission = remember { mutableStateOf(notificationsGranted(context)) }

    /** 回到前台就重读一遍（授权页是我们自己 startActivity 打开的，没有回调）。 */
    fun refreshPermissions() {
        hasStoragePermission.value = storageGranted(context)
        hasNotificationPermission.value = notificationsGranted(context)
    }

    val lifecycleOwner = context as? androidx.lifecycle.LifecycleOwner
    DisposableEffect(lifecycleOwner) {
        if (lifecycleOwner == null) return@DisposableEffect onDispose { }
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) refreshPermissions()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // 通知权限（API 33+）：这是标准运行时权限，走 launcher 拿结果。
    // **拒绝两次之后系统就不再弹框了**（静默拒绝）：那一下点击看起来完全没反应
    //（用户点名）。所以拒绝回来时再问一句"还能不能弹" —— 不能就退到系统通知
    // 设置页，让这次点击有去处。
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasNotificationPermission.value = granted
        if (!granted) {
            val activity = context.findHostActivity()
            val canAskAgain = activity != null &&
                androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
                    activity, Manifest.permission.POST_NOTIFICATIONS
                )
            if (!canAskAgain) openNotificationSettingsPage(context)
        }
    }

    // API < R 的存储权限也是运行时权限（老设备才走这条；R+ 走"所有文件访问"页）
    val legacyStorageLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasStoragePermission.value = granted }

    var finishing by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize().background(colorScheme.background)) {
        // 背景光晕跟着翻页进度**连续形变**：位置、宽窄、色调都是化过去的 ——
        // 切步时背景不是一张静止的底（用户：切到下一步时背景没有无缝丝滑的变化）。
        // 传的是取值函数而不是当前值：状态在**绘制**阶段才被读到，滑动时逐帧重绘，
        // 不会带着整棵界面每帧重组
        HeroGlow(colorScheme = colorScheme) {
            pagerState.currentPage + pagerState.currentPageOffsetFraction
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
        ) {
            // ── 顶栏：跳过（最后一页与收尾动画期间消失）──
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                androidx.compose.animation.AnimatedVisibility(
                    visible = page < ONBOARDING_PAGES.lastIndex && !finishing,
                    enter = fadeIn(tween(200)),
                    exit = fadeOut(tween(160))
                ) {
                    TextButton(onClick = onFinished) {
                        Text(
                            stringResource(R.string.onboarding_skip),
                            color = colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }

            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxWidth().weight(1f)
            ) { index ->
                // 翻页途中：正在离开的那一页淡出并轻微下沉/缩小，进来的那页反向
                val delta = (pagerState.currentPage - index) + pagerState.currentPageOffsetFraction
                val away = abs(delta).coerceIn(0f, 1f)
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            alpha = (1f - 1.15f * away).coerceIn(0f, 1f)
                            translationY = delta * 26.dp.toPx()
                            val s = 1f - 0.05f * away
                            scaleX = s
                            scaleY = s
                        }
                ) {
                    val active = page == index
                    when (index) {
                        0 -> FeaturesPage(colorScheme, active)
                        1 -> EntryPage(
                            colorScheme = colorScheme,
                            active = active,
                            selected = startPage,
                            onSelect = { picked ->
                                startPage = picked
                                StartPagePrefs.write(context, picked)
                            }
                        )
                        2 -> PermissionPage(
                            colorScheme = colorScheme,
                            active = active,
                            hasStoragePermission = hasStoragePermission.value,
                            hasNotificationPermission = hasNotificationPermission.value,
                            onRequestStorage = {
                                // 整段包起来：任何平台异常（找不到授权页 / launcher 被回收）
                                // 都只让这一下没反应，绝不让 App 退出去
                                runCatching {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                        openAllFilesAccessPage(context)
                                    } else {
                                        legacyStorageLauncher.launch(
                                            Manifest.permission.WRITE_EXTERNAL_STORAGE
                                        )
                                    }
                                }
                            },
                            onRequestNotification = {
                                // 整段包起来：任何平台异常都只让这一下没反应，
                                // 绝不让 App 退出去。但**不能静默** —— launcher
                                // 起不来就退到系统通知设置页（见上面 launcher 的说明）
                                val launched = runCatching {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                        notificationLauncher.launch(
                                            Manifest.permission.POST_NOTIFICATIONS
                                        )
                                        true
                                    } else {
                                        false
                                    }
                                }.getOrDefault(false)
                                if (!launched &&
                                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                                ) {
                                    openNotificationSettingsPage(context)
                                }
                            }
                        )
                        else -> FinishPage(
                            colorScheme = colorScheme,
                            active = active,
                            finishing = finishing,
                            entryLabel = startPageLabel(startPage)
                        )
                    }
                }
            }

            // ── 底部：整宽步骤条 + 主按钮 ──
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 28.dp, end = 28.dp, top = 18.dp, bottom = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                StepBar(
                    progress = (page + 1).toFloat() / ONBOARDING_PAGES.size,
                    colorScheme = colorScheme
                )
                Spacer(Modifier.height(20.dp))
                val isLast = page >= ONBOARDING_PAGES.lastIndex
                Button(
                    onClick = {
                        if (isLast) {
                            // 收尾：让完成页那一下动画走完再交棒（引擎随后启动）
                            finishing = true
                            scope.launch {
                                kotlinx.coroutines.delay(820)
                                onFinished()
                            }
                        } else {
                            scope.launch { pagerState.animateScrollToPage(page + 1) }
                        }
                    },
                    enabled = !finishing,
                    shape = RoundedCornerShape(18.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    modifier = Modifier.fillMaxWidth().height(54.dp)
                ) {
                    AnimatedContent(
                        targetState = isLast,
                        transitionSpec = {
                            if (targetState) {
                                (fadeIn(tween(220, delayMillis = 60)) +
                                    slideInVertically(tween(260)) { it / 2 }) togetherWith
                                    (fadeOut(tween(140)) + slideOutVertically(tween(180)) { -it / 2 })
                            } else {
                                (fadeIn(tween(220, delayMillis = 60)) +
                                    slideInVertically(tween(260)) { -it / 2 }) togetherWith
                                    (fadeOut(tween(140)) + slideOutVertically(tween(180)) { it / 2 })
                            }
                        },
                        label = "onboardingCta"
                    ) { last ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (last) {
                                Icon(
                                    Icons.Default.Check,
                                    contentDescription = null,
                                    modifier = Modifier.size(17.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    stringResource(R.string.onboarding_start),
                                    fontWeight = FontWeight.Medium
                                )
                            } else {
                                Text(
                                    stringResource(R.string.onboarding_next),
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(Modifier.width(8.dp))
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = null,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 步骤条：整宽、3dp、圆头，填充段跟着页数长（比那排小圆点干净得多）。 */
@Composable
private fun StepBar(progress: Float, colorScheme: ColorScheme) {
    val animated by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = tween(420, easing = FastOutSlowInEasing),
        label = "onboardingStep"
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(3.dp)
            .clip(CircleShape)
            .background(colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animated)
                .height(3.dp)
                .clip(CircleShape)
                .background(colorScheme.primary)
        )
    }
}

/**
 * 每一步的氛围：光晕中心（相对宽 / 高的比例）、半径系数、强度与色调。
 *
 * 背景**跟着步骤连续形变**（不是每页一张静止的底）：光晕随翻页进度在屏幕上缓慢
 * 移动、换色、变宽窄，叠加呼吸的明暗 —— 切步时背景是"化"过去的，不是硬切。
 */
private data class GlowSpec(
    val cx: Float,
    val cy: Float,
    val radius: Float,
    val alpha: Float,
    /** 0 = 主色，1 = 第三色。 */
    val tint: Int
)

private val GLOW_SPECS = listOf(
    GlowSpec(0.26f, 0.12f, 1.05f, 0.17f, 0), // 能力：偏左上的一片
    GlowSpec(0.74f, 0.16f, 0.95f, 0.15f, 0), // 入口：偏右上
    GlowSpec(0.32f, 0.24f, 0.92f, 0.14f, 1), // 权限：左下，换第三色
    GlowSpec(0.50f, 0.14f, 1.18f, 0.20f, 1)  // 完成：居中、更亮更宽
)

/**
 * 背景氛围：一片跟着主题色走的光晕，位置 / 半径 / 强度 / 色调沿 [position]
 *（当前页 + 翻页偏移）**连续插值**。
 *
 * [position] 是取值函数、在绘制阶段才调用：翻页时是逐帧重绘而不是整页重组。
 * 半径按**容器尺寸**算（老写法写死 480f，跟屏幕尺寸对不上，糊出来就是一块脏印）。
 */
@Composable
private fun HeroGlow(colorScheme: ColorScheme, position: () -> Float) {
    val breathe by rememberInfiniteTransition(label = "glow")
        .animateFloat(
            initialValue = 0.72f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                tween(7200, easing = FastOutSlowInEasing),
                RepeatMode.Reverse
            ),
            label = "glowBreathe"
        )
    val last = GLOW_SPECS.lastIndex
    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawBehind {
                val p = position().coerceIn(0f, last.toFloat())
                val i = p.toInt().coerceIn(0, last - 1)
                val f = (p - i).coerceIn(0f, 1f)
                val a = GLOW_SPECS[i]
                val b = GLOW_SPECS[i + 1]
                fun mix(x: Float, y: Float) = x + (y - x) * f
                val tint = lerp(
                    if (a.tint == 0) colorScheme.primary else colorScheme.tertiary,
                    if (b.tint == 0) colorScheme.primary else colorScheme.tertiary,
                    f
                )
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(
                            tint.copy(alpha = mix(a.alpha, b.alpha) * breathe),
                            Color.Transparent
                        ),
                        center = Offset(
                            size.width * mix(a.cx, b.cx),
                            size.height * mix(a.cy, b.cy)
                        ),
                        radius = size.width * mix(a.radius, b.radius)
                    )
                )
            }
    )
}

/** 一页里元素按顺序浮现：位移 + 淡入，节奏统一（位移量由 [appearLayer] 给）。 */
@Composable
private fun rememberPageAppear(active: Boolean, order: Int): Float {
    val appear = remember { Animatable(0f) }
    LaunchedEffect(active) {
        if (active) {
            appear.animateTo(
                1f,
                animationSpec = tween(
                    durationMillis = 380,
                    delayMillis = 70 * order,
                    easing = FastOutSlowInEasing
                )
            )
        } else {
            appear.snapTo(0f)
        }
    }
    return appear.value
}

private fun Modifier.appearLayer(value: Float, rise: Float = 18f): Modifier = graphicsLayer {
    alpha = value
    translationY = (1f - value) * rise.dp.toPx()
}

// ─── 第 0 页：能力 ───

@Composable
private fun FeaturesPage(colorScheme: ColorScheme, active: Boolean) {
    val head = rememberPageAppear(active, 0)
    val features = listOf(
        Triple(
            Icons.Default.CloudDownload,
            stringResource(R.string.onboarding_feature_http_title),
            stringResource(R.string.onboarding_feature_http_desc)
        ),
        Triple(
            Icons.Default.Hub,
            stringResource(R.string.onboarding_feature_bt_title),
            stringResource(R.string.onboarding_feature_bt_desc)
        ),
        Triple(
            Icons.Default.Link,
            stringResource(R.string.onboarding_feature_magnet_title),
            stringResource(R.string.onboarding_feature_magnet_desc)
        ),
        Triple(
            Icons.Default.Speed,
            stringResource(R.string.onboarding_feature_smart_title),
            stringResource(R.string.onboarding_feature_smart_desc)
        ),
    )

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Column(modifier = Modifier.appearLayer(head, rise = 14f)) {
            PageHeading(
                title = stringResource(R.string.onboarding_features_title),
                subtitle = stringResource(R.string.onboarding_features_subtitle)
            )
        }
        Spacer(Modifier.height(22.dp))
        // 一张**分组卡片**里排四条（不是四张各自投影的小卡）—— 与设置页同一语言
        Surface(
            modifier = Modifier.fillMaxWidth().appearLayer(rememberPageAppear(active, 1), rise = 24f),
            color = colorScheme.surfaceContainerLow,
            shape = RoundedCornerShape(22.dp)
        ) {
            Column {
                features.forEachIndexed { index, (icon, title, desc) ->
                    if (index > 0) {
                        HorizontalDivider(
                            modifier = Modifier.padding(start = 60.dp, end = 16.dp),
                            color = colorScheme.outlineVariant.copy(alpha = 0.6f),
                            thickness = 0.5.dp
                        )
                    }
                    val row = rememberPageAppear(active, index + 2)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp)
                            .appearLayer(row, rise = 14f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(11.dp))
                                .background(colorScheme.primaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                icon,
                                contentDescription = null,
                                modifier = Modifier.size(19.dp),
                                tint = colorScheme.onPrimaryContainer
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = colorScheme.onSurface
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                desc,
                                style = MaterialTheme.typography.labelSmall,
                                color = colorScheme.onSurfaceVariant,
                                lineHeight = 15.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── 第 1 页：默认入口 ───

@Composable
private fun EntryPage(
    colorScheme: ColorScheme,
    active: Boolean,
    selected: StartPage,
    onSelect: (StartPage) -> Unit
) {
    val head = rememberPageAppear(active, 0)

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Column(modifier = Modifier.appearLayer(head, rise = 14f)) {
            PageHeading(
                title = stringResource(R.string.onboarding_entry_title),
                subtitle = stringResource(R.string.onboarding_entry_subtitle)
            )
        }
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            EntryCard(
                colorScheme = colorScheme,
                icon = Icons.Default.CloudDownload,
                title = stringResource(R.string.start_page_downloader),
                desc = stringResource(R.string.start_page_downloader_desc),
                selected = selected == StartPage.Downloader,
                onClick = { onSelect(StartPage.Downloader) },
                modifier = Modifier
                    .weight(1f)
                    .height(178.dp)
                    .appearLayer(rememberPageAppear(active, 1), rise = 26f)
            )
            EntryCard(
                colorScheme = colorScheme,
                icon = Icons.Default.Language,
                title = stringResource(R.string.start_page_browser),
                desc = stringResource(R.string.start_page_browser_desc),
                selected = selected == StartPage.Browser,
                onClick = { onSelect(StartPage.Browser) },
                modifier = Modifier
                    .weight(1f)
                    .height(178.dp)
                    .appearLayer(rememberPageAppear(active, 2), rise = 26f)
            )
        }
        Spacer(Modifier.height(14.dp))
        Text(
            stringResource(R.string.settings_start_page_note),
            style = MaterialTheme.typography.labelSmall,
            color = colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.appearLayer(rememberPageAppear(active, 3), rise = 12f)
        )
    }
}

/** 入口选项卡：图标 + 名称 + 一句说明；选中 = 描边 + 底色 + 右上角对勾（弹性放大）。 */
@Composable
private fun EntryCard(
    colorScheme: ColorScheme,
    icon: ImageVector,
    title: String,
    desc: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(22.dp)
    val border by animateDpAsState(
        targetValue = if (selected) 1.6.dp else 0.8.dp,
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "entryBorder"
    )
    val checkScale by animateFloatAsState(
        targetValue = if (selected) 1f else 0.4f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "entryCheck"
    )
    val checkAlpha by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = tween(180),
        label = "entryCheckAlpha"
    )

    Column(
        modifier = modifier
            .clip(shape)
            .background(
                if (selected) colorScheme.primaryContainer.copy(alpha = 0.55f)
                else colorScheme.surfaceContainerLow
            )
            .border(
                border,
                if (selected) colorScheme.primary else colorScheme.outlineVariant.copy(alpha = 0.7f),
                shape
            )
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .background(
                        if (selected) colorScheme.primary
                        else colorScheme.surfaceContainerHighest
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = if (selected) colorScheme.onPrimary else colorScheme.onSurfaceVariant
                )
            }
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(22.dp)
                    .graphicsLayer { scaleX = checkScale; scaleY = checkScale; alpha = checkAlpha }
                    .clip(CircleShape)
                    .background(colorScheme.primary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(13.dp),
                    tint = colorScheme.onPrimary
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            color = colorScheme.onSurface
        )
        Spacer(Modifier.height(4.dp))
        Text(
            desc,
            style = MaterialTheme.typography.labelSmall,
            color = colorScheme.onSurfaceVariant,
            lineHeight = 15.sp
        )
    }
}

// ─── 第 2 页：权限 ───

@Composable
private fun PermissionPage(
    colorScheme: ColorScheme,
    active: Boolean,
    hasStoragePermission: Boolean,
    hasNotificationPermission: Boolean,
    onRequestStorage: () -> Unit,
    onRequestNotification: () -> Unit
) {
    val head = rememberPageAppear(active, 0)

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Column(modifier = Modifier.appearLayer(head, rise = 14f)) {
            PageHeading(
                title = stringResource(R.string.onboarding_permission_title),
                subtitle = stringResource(R.string.onboarding_permission_subtitle)
            )
        }
        Spacer(Modifier.height(22.dp))
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .appearLayer(rememberPageAppear(active, 1), rise = 24f),
            color = colorScheme.surfaceContainerLow,
            shape = RoundedCornerShape(22.dp)
        ) {
            Column {
                PermissionCard(
                    colorScheme = colorScheme,
                    icon = Icons.Default.Folder,
                    title = stringResource(R.string.onboarding_permission_storage_title),
                    description = stringResource(R.string.onboarding_permission_storage_desc),
                    granted = hasStoragePermission,
                    onRequest = onRequestStorage,
                    appear = rememberPageAppear(active, 2)
                )
                HorizontalDivider(
                    modifier = Modifier.padding(start = 60.dp, end = 16.dp),
                    color = colorScheme.outlineVariant.copy(alpha = 0.6f),
                    thickness = 0.5.dp
                )
                PermissionCard(
                    colorScheme = colorScheme,
                    icon = Icons.Default.Notifications,
                    title = stringResource(R.string.onboarding_permission_notification_title),
                    description = stringResource(R.string.onboarding_permission_notification_desc),
                    granted = hasNotificationPermission,
                    onRequest = onRequestNotification,
                    appear = rememberPageAppear(active, 3)
                )
            }
        }
        AnimatedVisibility(
            visible = hasStoragePermission && hasNotificationPermission,
            enter = fadeIn(tween(220)) + slideInVertically(tween(260)) { -it / 2 },
            exit = fadeOut(tween(160)) + slideOutVertically(tween(200)) { -it / 2 }
        ) {
            Row(
                modifier = Modifier.padding(top = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = colorScheme.tertiary,
                    modifier = Modifier.size(15.dp)
                )
                Text(
                    stringResource(R.string.onboarding_permission_all_ready),
                    style = MaterialTheme.typography.labelLarge,
                    color = colorScheme.tertiary,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun PermissionCard(
    colorScheme: ColorScheme,
    icon: ImageVector,
    title: String,
    description: String,
    granted: Boolean,
    onRequest: () -> Unit,
    appear: Float
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 13.dp)
            .appearLayer(appear, rise = 14f),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(
                    if (granted) colorScheme.tertiaryContainer else colorScheme.primaryContainer
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (granted) Icons.Default.Check else icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (granted) colorScheme.onTertiaryContainer else colorScheme.onPrimaryContainer
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = colorScheme.onSurface
            )
            Spacer(Modifier.height(2.dp))
            Text(
                description,
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant,
                lineHeight = 15.sp
            )
        }
        Spacer(Modifier.width(10.dp))
        if (granted) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = stringResource(R.string.onboarding_permission_granted),
                tint = colorScheme.tertiary,
                modifier = Modifier.size(22.dp)
            )
        } else {
            Button(
                onClick = onRequest,
                shape = CircleShape,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                modifier = Modifier.height(34.dp)
            ) {
                Text(stringResource(R.string.grant), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

// ─── 第 3 页：完成 ───

@Composable
private fun FinishPage(
    colorScheme: ColorScheme,
    active: Boolean,
    finishing: Boolean,
    entryLabel: String
) {
    val appear = rememberPageAppear(active, 0)
    // 收尾那一下：对勾从 0.7 弹到 1，之后扩散光环转起来
    val checkScale by animateFloatAsState(
        targetValue = if (finishing) 1f else 0.7f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "finishCheck"
    )

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (finishing) {
                val transition = rememberInfiniteTransition(label = "halo")
                val haloScale by transition.animateFloat(
                    initialValue = 1f,
                    targetValue = 1.5f,
                    animationSpec = infiniteRepeatable(
                        tween(1500, easing = FastOutSlowInEasing),
                        RepeatMode.Restart
                    ),
                    label = "haloScale"
                )
                val haloAlpha by transition.animateFloat(
                    initialValue = 0.38f,
                    targetValue = 0f,
                    animationSpec = infiniteRepeatable(
                        tween(1500, easing = FastOutSlowInEasing),
                        RepeatMode.Restart
                    ),
                    label = "haloAlpha"
                )
                Box(
                    modifier = Modifier
                        .size(104.dp)
                        .graphicsLayer { scaleX = haloScale; scaleY = haloScale; alpha = haloAlpha }
                        .border(2.dp, colorScheme.tertiary, CircleShape)
                )
            }
            Box(
                modifier = Modifier
                    .size(104.dp)
                    .graphicsLayer { scaleX = checkScale; scaleY = checkScale }
                    .shadow(
                        elevation = 14.dp,
                        shape = CircleShape,
                        clip = false,
                        ambientColor = colorScheme.tertiary.copy(alpha = 0.28f),
                        spotColor = colorScheme.tertiary.copy(alpha = 0.32f)
                    )
                    .clip(CircleShape)
                    .background(colorScheme.tertiaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (finishing) Icons.Default.Check else Icons.Default.RocketLaunch,
                    contentDescription = null,
                    modifier = Modifier.size(44.dp),
                    tint = colorScheme.onTertiaryContainer
                )
            }
        }
        Spacer(Modifier.height(28.dp))
        Text(
            stringResource(R.string.onboarding_finish_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Medium,
            color = colorScheme.onSurface,
            modifier = Modifier.appearLayer(appear, rise = 14f)
        )
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.onboarding_finish_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.appearLayer(appear, rise = 14f)
        )
        Spacer(Modifier.height(18.dp))
        // 把刚才选的入口回显一下：让"选项真的生效了"可见
        Surface(
            color = colorScheme.surfaceContainerLow,
            shape = CircleShape,
            modifier = Modifier.appearLayer(appear, rise = 12f)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = colorScheme.primary,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    stringResource(R.string.onboarding_finish_entry, entryLabel),
                    style = MaterialTheme.typography.labelMedium,
                    color = colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** 页内标题块：一行大标题 + 一行说明，居中，间距统一。 */
@Composable
private fun PageHeading(title: String, subtitle: String) {
    val colorScheme = MaterialTheme.colorScheme
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Medium,
            color = colorScheme.onSurface,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(10.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            lineHeight = 19.sp
        )
    }
}

/** 「新标签页 / 下载器 / 浏览器」这三个名字在两处（引导 + 设置）共用一套文案。 */
@Composable
private fun startPageLabel(page: StartPage): String =
    stringResource(
        if (page == StartPage.Browser) R.string.start_page_browser
        else R.string.start_page_downloader
    )

/** 引导页清单：页数、以及"这一页是什么"的唯一来源（**没有 logo 欢迎页** —— 直接从能力开始）。 */
private val ONBOARDING_PAGES = listOf("features", "entry", "permission", "finish")

// ─── 权限 ───

/** 存储权限是否已拿到（R+ 看"所有文件访问"，更早看运行时权限）。 */
private fun storageGranted(context: android.content.Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
    } else {
        context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }

/** 通知权限是否已拿到（API < 33 默认就是有）。 */
private fun notificationsGranted(context: android.content.Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    } else true

/**
 * 打开「所有文件访问」授权页。
 *
 * **不能假设那个页面存在**：`ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` 在不少
 * 定制 ROM 上根本没实现，直接 `launch` 会抛 `ActivityNotFoundException`（未捕获 → 整个
 * App 当场退出，用户报的"点授权后应用直接退出"就是这个）。所以逐个候选先
 * `resolveActivity` 问一句"有没有人接"，全都打不开就退到应用详情页；权限状态不靠回调，
 * 而是**每次回到前台重读**（见 OnboardingScreen 里的 ON_RESUME 观察者）。
 */
private fun openAllFilesAccessPage(context: android.content.Context) {
    val pkg = Uri.parse("package:${context.packageName}")
    val candidates = buildList {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            add(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, pkg))
            add(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
        }
        add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
    }
    for (intent in candidates) {
        val opened = runCatching {
            if (intent.resolveActivity(context.packageManager) == null) return@runCatching false
            context.startActivity(intent)
            true
        }.getOrDefault(false)
        if (opened) return
    }
    // 三档都打不开（理论上不会）：什么都不做，至少不要崩
}

/**
 * 打开「通知」设置页。
 *
 * 与 [openAllFilesAccessPage] 同一套路：不假设那个页面存在，逐个候选先
 * `resolveActivity` 问一句，全都打不开就退到应用详情页。
 *
 * 为什么需要它：API 33+ 的通知权限**连续拒绝两次之后系统就不再弹框**（静默拒绝），
 * 再点"授予"看起来就是"点了没反应"（用户点名）。这条路给那次点击一个去处 ——
 * 用户可以在系统设置里直接打开通知开关，回到前台时状态会被重读（见 ON_RESUME）。
 */
private fun openNotificationSettingsPage(context: android.content.Context) {
    val pkg = Uri.parse("package:${context.packageName}")
    val candidates = buildList {
        add(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        )
        add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
    }
    for (intent in candidates) {
        val opened = runCatching {
            if (intent.resolveActivity(context.packageManager) == null) return@runCatching false
            context.startActivity(intent)
            true
        }.getOrDefault(false)
        if (opened) return
    }
}

/** 从 Compose 的 Context 里剥出宿主 Activity（权限 API 要用到它）。 */
private fun android.content.Context.findHostActivity(): Activity? {
    var ctx: android.content.Context? = this
    while (ctx != null) {
        if (ctx is Activity) return ctx
        ctx = (ctx as? android.content.ContextWrapper)?.baseContext
    }
    return null
}

// ─── 引导 → 主界面过渡 ───

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun OnboardingTransition(
    showOnboarding: Boolean,
    onOnboardingFinished: () -> Unit,
    content: @Composable () -> Unit
) {
    AnimatedContent(
        targetState = showOnboarding,
        transitionSpec = {
            if (targetState == false) {
                // 交棒：引导淡出并轻微放大，主界面从略小处淡入 —— 读作"推进去"，
                // 不是两张画面原地交叉
                (fadeIn(tween(460, delayMillis = 200)) +
                    scaleIn(tween(460, delayMillis = 200), initialScale = 0.97f)) togetherWith
                    (fadeOut(tween(320)) + scaleOut(tween(360), targetScale = 1.04f))
            } else {
                fadeIn(tween(300)) togetherWith fadeOut(tween(300))
            }
        },
        contentKey = { it },
        label = "onboardingTransition"
    ) { onboarding ->
        if (onboarding) {
            OnboardingScreen(onFinished = onOnboardingFinished)
        } else {
            content()
        }
    }
}

/** 让 ColorScheme / ColumnScope 的限定名短一点（本文件里用得很多）。 */
private typealias ColorScheme = ColorScheme
