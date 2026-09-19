package com.lerxu.android.util

import android.content.Context
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.lerxu.android.browser.BrowserController

/**
 * 无痕模式认证检查器
 * 用于检查是否需要重新认证
 */
object IncognitoAuthChecker {
    
    /**
     * 检查无痕模式是否已过期
     * 
     * @param controller 浏览器控制器
     * @return 如果认证已过期返回 true，否则返回 false
     */
    fun isAuthExpired(controller: BrowserController): Boolean {
        val currentTime = System.currentTimeMillis()
        val lastAuthTime = controller.incognitoLastAuthTime
        
        // 从未认证过 → 需要重新认证
        if (lastAuthTime == 0L) return true

        // 认证已经过去多久。**时长为 0 不再当作"立即过期"** —— 那会让刚认证完的
        // 会话立刻被判过期并退回普通窗口，也就是「认证后进不去无痕」的根因。
        val duration = currentTime - lastAuthTime
        return duration >= BrowserController.INCOCOGNICO_AUTH_DURATION
    }
    
    /**
     * 重置无痕模式状态（用于用户主动退出时无痕模式）
     */
    fun resetIncognitoMode(controller: BrowserController) {
        controller.incognitoMode = false
        controller.incognitoLastAuthTime = 0L
    }
}

/**
 * Composable 形式的无痕模式认证检查
 */
@Composable
fun checkIncognitoAuth(context: Context, controller: BrowserController) {
    if (controller.incognitoMode && IncognitoAuthChecker.isAuthExpired(controller)) {
        // 认证已过期，禁用无痕模式
        IncognitoAuthChecker.resetIncognitoMode(controller)
        
        // 提示用户需要重新认证
        Toast.makeText(
            context,
            "无痕模式会话已过期，请重新认证",
            Toast.LENGTH_SHORT
        ).show()
        
        // 可以显示对话框让用户选择是否重新认证
        showReauthDialog(context, controller)
    }
}

/**
 * 显示重新认证对话框
 */
private fun showReauthDialog(context: Context, controller: BrowserController) {
    // TODO: 实现重新认证对话框
    // 可以使用 Material Dialogs 或其他 UI 框架
}
