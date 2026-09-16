package com.lerxu.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ─── 颜色方案 ───

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF0B57D0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E3FD),
    onPrimaryContainer = Color(0xFF041E49),
    secondary = Color(0xFF3B82F6),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDBEAFE),
    onSecondaryContainer = Color(0xFF172554),
    tertiary = Color(0xFF10B981),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFD1FAE5),
    onTertiaryContainer = Color(0xFF064E3B),
    background = Color(0xFFF7F9FC),
    onBackground = Color(0xFF1A1C1E),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1A1C1E),
    surfaceVariant = Color(0xFFEDF1F7),
    onSurfaceVariant = Color(0xFF5F6368),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF3F6FA),
    surfaceContainer = Color(0xFFEEF2F8),
    surfaceContainerHigh = Color(0xFFE9EEF5),
    surfaceContainerHighest = Color(0xFFE3E9F1),
    error = Color(0xFFE53935),
    onError = Color.White,
    errorContainer = Color(0xFFFDECEA),
    onErrorContainer = Color(0xFF8C1D18),
    outline = Color(0xFFD5DBE3),
    outlineVariant = Color(0xFFE4E9F0)
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFFA8C7FA),
    onPrimary = Color(0xFF062E6F),
    primaryContainer = Color(0xFF0842A0),
    onPrimaryContainer = Color(0xFFD3E3FD),
    secondary = Color(0xFF93C5FD),
    onSecondary = Color(0xFF0A2A5E),
    secondaryContainer = Color(0xFF1E3A5F),
    onSecondaryContainer = Color(0xFFDBEAFE),
    tertiary = Color(0xFF6EE7B7),
    onTertiary = Color(0xFF04543A),
    tertiaryContainer = Color(0xFF065F46),
    onTertiaryContainer = Color(0xFFD1FAE5),
    background = Color(0xFF0E1116),
    onBackground = Color(0xFFE2E6EC),
    surface = Color(0xFF151920),
    onSurface = Color(0xFFE2E6EC),
    surfaceVariant = Color(0xFF1E242E),
    onSurfaceVariant = Color(0xFF9AA4B2),
    surfaceContainerLowest = Color(0xFF0E1116),
    surfaceContainerLow = Color(0xFF181C23),
    surfaceContainer = Color(0xFF1C212A),
    surfaceContainerHigh = Color(0xFF262C36),
    surfaceContainerHighest = Color(0xFF313742),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    outline = Color(0xFF3A414D),
    outlineVariant = Color(0xFF2A3140)
)

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
    MaterialTheme(
        colorScheme = colorScheme,
        typography = LerxuTypography,
        shapes = LerxuShapes,
        content = content
    )
}
