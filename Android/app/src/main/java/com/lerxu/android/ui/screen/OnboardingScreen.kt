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
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lerxu.android.R
import kotlinx.coroutines.launch

/**
 * 引导界面 —— 首次启动时展示。
 *
 * 风格与主界面统一：Material 3 surface 背景，primary 色点缀。
 * 流程：欢迎页 → 功能介绍 → 权限请求 → 完成
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onFinished: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colorScheme = MaterialTheme.colorScheme

    val pageCount = 4
    val pagerState = rememberPagerState(pageCount = { pageCount })

    // 存储权限
    val hasStoragePermission = remember {
        mutableStateOf(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        })
    }

    // 通知权限
    val hasNotificationPermission = remember {
        mutableStateOf(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            } else true
        )
    }

    val storageLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { _ ->
        hasStoragePermission.value = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        }
    }

    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasNotificationPermission.value = granted
    }

    var showFinishAnim by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colorScheme.background)
    ) {
        // 背景氛围：两个缓慢漂移的柔光斑
        AmbientOrb(
            color = colorScheme.primary,
            size = 320.dp,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-40).dp, y = (-60).dp),
            durationMs = 9000
        )
        AmbientOrb(
            color = colorScheme.tertiary,
            size = 260.dp,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = 30.dp, y = 80.dp),
            durationMs = 11000
        )

        // 跳过：右上角（最后一页无意义，隐藏）
        if (pagerState.currentPage < pageCount - 1) {
            TextButton(
                onClick = onFinished,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .safeDrawingPadding()
                    .padding(top = 12.dp, end = 12.dp)
            ) {
                Text(stringResource(R.string.onboarding_skip), color = colorScheme.onSurfaceVariant)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) { page ->
                when (page) {
                    0 -> WelcomePage(colorScheme)
                    1 -> FeaturesPage(colorScheme)
                    2 -> PermissionPage(
                        colorScheme = colorScheme,
                        hasStoragePermission = hasStoragePermission.value,
                        hasNotificationPermission = hasNotificationPermission.value,
                        onRequestStorage = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                storageLauncher.launch(
                                    Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                                        data = Uri.parse("package:${context.packageName}")
                                    }
                                )
                            } else {
                                @Suppress("DEPRECATION")
                                (context as Activity).requestPermissions(
                                    arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 100
                                )
                            }
                        },
                        onRequestNotification = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                        }
                    )
                    3 -> FinishPage(colorScheme, showFinishAnim)
                }
            }

            // 底部：居中指示器 + 全宽主按钮（与主界面按钮同风格）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 指示器
                Row(
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    repeat(pageCount) { index ->
                        val selected = pagerState.currentPage == index
                        val width by animateDpAsState(
                            targetValue = if (selected) 24.dp else 6.dp,
                            animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
                            label = "dotWidth"
                        )
                        Box(
                            modifier = Modifier
                                .height(6.dp)
                                .width(width)
                                .clip(CircleShape)
                                .background(
                                    if (selected) colorScheme.primary
                                    else colorScheme.outline.copy(alpha = 0.45f)
                                )
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
                val isLast = pagerState.currentPage >= pageCount - 1
                Button(
                    onClick = {
                        if (isLast) {
                            showFinishAnim = true
                            scope.launch {
                                kotlinx.coroutines.delay(700)
                                onFinished()
                            }
                        } else {
                            scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(vertical = 14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .animateContentSize()
                ) {
                    if (isLast) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(17.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.onboarding_start), fontWeight = FontWeight.SemiBold)
                    } else {
                        Text(stringResource(R.string.onboarding_next), fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(17.dp))
                    }
                }
            }
        }
    }
}

/** 柔光氛围斑 —— 缓慢呼吸漂移的径向渐变圆 */
@Composable
private fun AmbientOrb(color: Color, size: Dp, modifier: Modifier = Modifier, durationMs: Int) {
    val transition = rememberInfiniteTransition(label = "orb")
    val breathe by transition.animateFloat(
        initialValue = 0.7f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMs, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breathe"
    )
    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer(alpha = 0.16f * breathe)
            .background(
                Brush.radialGradient(
                    colors = listOf(color, Color.Transparent),
                    center = Offset.Unspecified,
                    radius = 480f
                ),
                shape = CircleShape
            )
    )
}

// ─── 欢迎页 ───

@Composable
private fun WelcomePage(colorScheme: ColorScheme) {
    val scale = remember { Animatable(0.3f) }
    val alpha = remember { Animatable(0f) }

    // 呼吸漂浮
    val transition = rememberInfiniteTransition(label = "float")
    val floatY by transition.animateFloat(
        initialValue = -5f,
        targetValue = 5f,
        animationSpec = infiniteRepeatable(tween(2400, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "floatY"
    )

    LaunchedEffect(Unit) {
        scale.animateTo(1f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy))
        alpha.animateTo(1f, animationSpec = tween(500))
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(116.dp)
                .graphicsLayer(
                    scaleX = scale.value, scaleY = scale.value, alpha = alpha.value,
                    translationY = floatY
                ),
            contentAlignment = Alignment.Center
        ) {
            // 外圈装饰环
            Box(
                Modifier
                    .fillMaxSize()
                    .border(2.dp, colorScheme.primary.copy(alpha = 0.25f), CircleShape)
            )
            Box(
                Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Download,
                    contentDescription = null,
                    modifier = Modifier.size(44.dp),
                    tint = colorScheme.primary
                )
            }
        }
        Spacer(Modifier.height(28.dp))
        Text(
            "Lerxu",
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            color = colorScheme.onSurface,
            letterSpacing = 1.sp,
            modifier = Modifier.graphicsLayer(alpha = alpha.value)
        )
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.onboarding_welcome_tagline),
            fontSize = 15.sp,
            color = colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.graphicsLayer(alpha = alpha.value)
        )
    }
}

// ─── 功能介绍页 ───

@Composable
private fun FeaturesPage(colorScheme: ColorScheme) {
    val features = listOf(
        Triple(Icons.Default.CloudDownload, stringResource(R.string.onboarding_feature_http_title), stringResource(R.string.onboarding_feature_http_desc)),
        Triple(Icons.Default.Hub, stringResource(R.string.onboarding_feature_bt_title), stringResource(R.string.onboarding_feature_bt_desc)),
        Triple(Icons.Default.Link, stringResource(R.string.onboarding_feature_magnet_title), stringResource(R.string.onboarding_feature_magnet_desc)),
        Triple(Icons.Default.Speed, stringResource(R.string.onboarding_feature_smart_title), stringResource(R.string.onboarding_feature_smart_desc)),
    )

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(stringResource(R.string.onboarding_features_title), style = MaterialTheme.typography.headlineSmall, color = colorScheme.onSurface)
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.onboarding_features_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(28.dp))
        features.forEachIndexed { index, (icon, title, desc) ->
            val animOffset = remember { Animatable(50f) }
            val animAlpha = remember { Animatable(0f) }

            LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(index * 100L)
                animOffset.animateTo(0f, animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy))
                animAlpha.animateTo(1f, animationSpec = tween(300))
            }

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .graphicsLayer(translationY = animOffset.value, alpha = animAlpha.value),
                color = colorScheme.surfaceContainerLow,
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier.padding(15.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(icon, contentDescription = null, modifier = Modifier.size(23.dp), tint = colorScheme.onPrimaryContainer)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(title, style = MaterialTheme.typography.titleSmall, color = colorScheme.onSurface)
                        Text(desc, style = MaterialTheme.typography.bodySmall, color = colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ─── 权限请求页 ───

@Composable
private fun PermissionPage(
    colorScheme: ColorScheme,
    hasStoragePermission: Boolean,
    hasNotificationPermission: Boolean,
    onRequestStorage: () -> Unit,
    onRequestNotification: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(stringResource(R.string.onboarding_permission_title), style = MaterialTheme.typography.headlineSmall, color = colorScheme.onSurface)
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.onboarding_permission_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(28.dp))

        PermissionCard(colorScheme, Icons.Default.Folder, stringResource(R.string.onboarding_permission_storage_title), stringResource(R.string.onboarding_permission_storage_desc), hasStoragePermission, onRequestStorage)
        Spacer(Modifier.height(12.dp))
        PermissionCard(colorScheme, Icons.Default.Notifications, stringResource(R.string.onboarding_permission_notification_title), stringResource(R.string.onboarding_permission_notification_desc), hasNotificationPermission, onRequestNotification)

        AnimatedVisibility(
            visible = hasStoragePermission && hasNotificationPermission,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Row(
                modifier = Modifier.padding(top = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = colorScheme.tertiary,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    stringResource(R.string.onboarding_permission_all_ready),
                    style = MaterialTheme.typography.labelLarge,
                    color = colorScheme.tertiary,
                    fontWeight = FontWeight.SemiBold
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
    onRequest: () -> Unit
) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) { alpha.animateTo(1f, animationSpec = tween(400)) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer(alpha = alpha.value),
        color = colorScheme.surfaceContainerLow,
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(15.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(
                        if (granted) colorScheme.tertiaryContainer
                        else colorScheme.primaryContainer
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (granted) Icons.Default.Check else icon,
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                    tint = if (granted) colorScheme.onTertiaryContainer else colorScheme.onPrimaryContainer
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, color = colorScheme.onSurface)
                Text(description, style = MaterialTheme.typography.bodySmall, color = colorScheme.onSurfaceVariant)
            }
            if (granted) {
                Surface(
                    color = colorScheme.tertiaryContainer,
                    shape = CircleShape
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = colorScheme.onTertiaryContainer,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            stringResource(R.string.onboarding_permission_granted),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onTertiaryContainer
                        )
                    }
                }
            } else {
                Button(
                    onClick = onRequest,
                    shape = CircleShape,
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 7.dp)
                ) {
                    Text(stringResource(R.string.grant), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

// ─── 完成页 ───

@Composable
private fun FinishPage(colorScheme: ColorScheme, showAnim: Boolean) {
    val alpha = remember { Animatable(0f) }
    val checkScale = remember { Animatable(0.4f) }

    LaunchedEffect(showAnim) {
        if (showAnim) {
            alpha.animateTo(1f, animationSpec = tween(300))
        }
    }

    LaunchedEffect(Unit) { alpha.animateTo(1f, animationSpec = tween(500)) }

    // 完成时的弹性放大
    LaunchedEffect(showAnim) {
        if (showAnim) {
            checkScale.animateTo(
                1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
            )
        } else {
            checkScale.animateTo(1f, animationSpec = tween(500))
        }
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(contentAlignment = Alignment.Center) {
            // 扩散光环
            if (showAnim) {
                val transition = rememberInfiniteTransition(label = "halo")
                val haloScale by transition.animateFloat(
                    initialValue = 1f,
                    targetValue = 1.45f,
                    animationSpec = infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Restart),
                    label = "haloScale"
                )
                val haloAlpha by transition.animateFloat(
                    initialValue = 0.4f,
                    targetValue = 0f,
                    animationSpec = infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Restart),
                    label = "haloAlpha"
                )
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .graphicsLayer(scaleX = haloScale, scaleY = haloScale, alpha = haloAlpha)
                        .border(2.dp, colorScheme.tertiary, CircleShape)
                )
            }
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .graphicsLayer(alpha = alpha.value, scaleX = checkScale.value, scaleY = checkScale.value)
                    .clip(CircleShape)
                    .background(colorScheme.tertiaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (showAnim) Icons.Default.Check else Icons.Default.RocketLaunch,
                    contentDescription = null,
                    modifier = Modifier.size(44.dp),
                    tint = colorScheme.onTertiaryContainer
                )
            }
        }
        Spacer(Modifier.height(26.dp))
        Text(
            stringResource(R.string.onboarding_finish_title),
            style = MaterialTheme.typography.headlineSmall,
            color = colorScheme.onSurface,
            modifier = Modifier.graphicsLayer(alpha = alpha.value)
        )
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.onboarding_finish_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = colorScheme.onSurfaceVariant,
            modifier = Modifier.graphicsLayer(alpha = alpha.value)
        )
    }
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
                fadeIn(animationSpec = tween(600, delayMillis = 200)) togetherWith
                    fadeOut(animationSpec = tween(400))
            } else {
                fadeIn(animationSpec = tween(300)) togetherWith
                    fadeOut(animationSpec = tween(300))
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
