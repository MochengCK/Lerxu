package com.lerxu.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ─── 颜色方案 ───
//
// 取值与桌面端**同一套 token**（桌面单一来源：src/renderer/components/Theme/Tokens.scss
// 的 :root / .theme-dark）。桌面 token 名写在每个槽位后面，改桌面配色时照着同步即可。
// 转换规则：桌面里以 rgba 表达的分层（primary-light、border-light 等）在 Compose 里
// 换算成「该色叠加在对应底色上」的等效实色。

private val LightColorScheme = lightColorScheme(
    // 品牌色 = --lc-color-primary
    primary = Color(0xFF1A7FE0),
    onPrimary = Color(0xFFFFFFFF),
    // --lc-color-primary-lighter = rgba(26,127,224,0.1) 叠在白底上的等效色
    primaryContainer = Color(0xFFE8F2FC),
    onPrimaryContainer = Color(0xFF14406E),
    // 桌面没有 secondary 语义，取文字层级色（--lc-text-regular）
    secondary = Color(0xFF3D4D5C),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEEF2F7),
    onSecondaryContainer = Color(0xFF2C3E50),
    // 功能色 = --lc-color-success
    tertiary = Color(0xFF67C23A),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFEDF8E6),
    onTertiaryContainer = Color(0xFF2F5A18),
    // 层级：页面底 = --lc-bg-main，卡片/面板 = --lc-bg-panel（纯白），与桌面同关系
    background = Color(0xFFF0F4F8),
    onBackground = Color(0xFF2C3E50),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF2C3E50),
    // --lc-bg-subnav-three-column
    surfaceVariant = Color(0xFFE3EAF2),
    onSurfaceVariant = Color(0xFF5A6C7D),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    // --lc-bg-dialog-footer
    surfaceContainer = Color(0xFFF7F9FC),
    // --lc-preference-card
    surfaceContainerHigh = Color(0xFFF2F5F9),
    // --lc-preference-inset
    surfaceContainerHighest = Color(0xFFE8EEF5),
    error = Color(0xFFF56C6C),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFDECEA),
    onErrorContainer = Color(0xFF8C1D18),
    // --lc-border-base / --lc-border-light
    outline = Color(0xFFD3DDE6),
    outlineVariant = Color(0xFFE2E8F0)
)

private val DarkColorScheme = darkColorScheme(
    // 品牌色 = .theme-dark 的 --lc-color-primary
    primary = Color(0xFF4A9EFF),
    onPrimary = Color(0xFFFFFFFF),
    // --lc-color-primary-light = rgba(74,158,255,0.12) 叠在面板底上的等效色
    primaryContainer = Color(0xFF2A3849),
    onPrimaryContainer = Color(0xFFD6E8FF),
    secondary = Color(0xFFC4CAD3),
    onSecondary = Color(0xFF1E2228),
    secondaryContainer = Color(0xFF363B44),
    onSecondaryContainer = Color(0xFFDFE3E8),
    // 功能色在暗色下与桌面一致（不另做一套）
    tertiary = Color(0xFF67C23A),
    onTertiary = Color(0xFF14290A),
    tertiaryContainer = Color(0xFF304233),
    onTertiaryContainer = Color(0xFFD7F0C9),
    // 层级：--lc-bg-main / --lc-bg-panel / --lc-bg-dropdown / --lc-bg-button
    background = Color(0xFF1E2228),
    onBackground = Color(0xFFDFE3E8),
    surface = Color(0xFF262A31),
    onSurface = Color(0xFFDFE3E8),
    // --lc-bg-input
    surfaceVariant = Color(0xFF2A2E35),
    onSurfaceVariant = Color(0xFF8B95A3),
    surfaceContainerLowest = Color(0xFF1E2228),
    surfaceContainerLow = Color(0xFF262A31),
    // --lc-bg-dropdown
    surfaceContainer = Color(0xFF2E333B),
    // --lc-bg-button / --lc-bg-hover
    surfaceContainerHigh = Color(0xFF363B44),
    // --lc-border-base（标签/输入等最深一档）
    surfaceContainerHighest = Color(0xFF3D424D),
    error = Color(0xFFF56C6C),
    onError = Color(0xFF2E0F0F),
    errorContainer = Color(0xFF4B363C),
    onErrorContainer = Color(0xFFFFD9D6),
    // --lc-border-base / --lc-border-light（rgba(255,255,255,0.06) 的等效实色）
    outline = Color(0xFF3D424D),
    outlineVariant = Color(0xFF33363D)
)

// ─── 额外语义色（Material 槽位装不下的桌面 token） ───
//
// 分片网格与追踪器状态点用的是桌面 --lc-graphic-atom-* 与功能色，
// Material3 的槽位里没有对应位置，用 CompositionLocal 按主题注入——
// 在这些组件里写死颜色会导致深色模式与桌面不同步。

data class LerxuExtraColors(
    /** --lc-graphic-atom-4：已完成分片 */
    val pieceDone: Color,
    /** --lc-graphic-atom-0：未下载分片（比面板更深一档，呈凹陷感） */
    val pieceEmpty: Color,
    /** --lc-graphic-atom-5：未选择（不参与下载）的分片 */
    val pieceUnwanted: Color,
    /** --lc-color-success / -warning / -danger（暗色下取值同桌面，不另做一套） */
    val success: Color,
    val warning: Color,
    val danger: Color
)

private val LightExtraColors = LerxuExtraColors(
    pieceDone = Color(0xFF39D353),
    pieceEmpty = Color(0xFFEBEDF0),
    pieceUnwanted = Color(0xFFB9C4D2),
    success = Color(0xFF67C23A),
    warning = Color(0xFFE6A23C),
    danger = Color(0xFFF56C6C)
)

private val DarkExtraColors = LerxuExtraColors(
    pieceDone = Color(0xFF39D353),
    pieceEmpty = Color(0xFF161B22),
    pieceUnwanted = Color(0xFF4A5766),
    success = Color(0xFF67C23A),
    warning = Color(0xFFE6A23C),
    danger = Color(0xFFF56C6C)
)

val LocalLerxuExtraColors = staticCompositionLocalOf { LightExtraColors }

/** 当前主题的额外语义色（分片网格 / 追踪器状态点用）。 */
val lerxuExtraColors: LerxuExtraColors
    @Composable get() = LocalLerxuExtraColors.current

// ─── 字体 ───

val LerxuTypography = Typography(
    headlineSmall = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 28.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, lineHeight = 16.sp),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 14.sp)
)

// ─── 形状 ───

val LerxuShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun LerxuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    CompositionLocalProvider(
        LocalLerxuExtraColors provides if (darkTheme) DarkExtraColors else LightExtraColors
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = LerxuTypography,
            shapes = LerxuShapes,
            content = content
        )
    }
}
