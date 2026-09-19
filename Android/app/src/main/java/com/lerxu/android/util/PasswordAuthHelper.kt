package com.lerxu.android.util

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.KeyGenerator

/**
 * 密码验证助手
 * 支持生物识别（指纹/面部）和密码输入两种方式
 */
object PasswordAuthHelper {
    
    private const val KEY_STORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "lerxu_incognito_key"

    /**
     * 允许的验证方式：**生物识别（含人脸等的弱生物）+ 设备密码 / PIN / 图案**。
     *
     * 注意 `canAuthenticate` 只接受这几种组合：BIOMETRIC_STRONG、
     * BIOMETRIC_WEAK、DEVICE_CREDENTIAL、或它们与 DEVICE_CREDENTIAL 的或 ——
     * 传 `STRONG or WEAK or CREDENTIAL` 会直接抛 IllegalArgumentException。
     * 这里用最宽的合法组合：WEAK（已包含强生物识别）+ 设备密码。
     */
    private const val AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
    
    /**
     * 是否支持生物识别
     */
    fun isBiometricSupported(context: Context): Boolean {
        return BiometricManager.from(context).canAuthenticate(AUTHENTICATORS) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }
    
    /**
     * 初始化密钥（首次使用时调用）
     */
    fun initializeKey(context: Context): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(KEY_STORE).apply {
                load(null)
            }
            
            if (keyStore.containsAlias(KEY_ALIAS)) {
                return true
            }
            
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEY_STORE
            )
            
            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
                .setUserAuthenticationRequired(true)
                // Android 14+ 移除了 setRandomizedEncryptionRequirement，使用 build() 直接构建
                .build()
            
            keyGenerator.init(keyGenParameterSpec)
            keyGenerator.generateKey()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    /**
     * 显示生物识别或密码验证对话框
     * 
     * @param activity 活动实例
     * @param onSuccess 验证成功回调
     * @param onError 验证失败回调
     * @param onCanceled 取消验证回调
     */
    fun showPasswordDialog(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
        onCanceled: () -> Unit
    ) {
        // 生物识别 或 设备密码（PIN / 图案 / 密码）任一可用即可
        if (isBiometricSupported(activity)) {
            showBiometricPrompt(activity, onSuccess, onError, onCanceled)
        } else {
            onError("这台设备还没设置指纹 / 面容，也没有锁屏密码")
        }
    }
    
    /**
     * 显示生物识别提示框
     */
    private fun showBiometricPrompt(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
        onCanceled: () -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    // 用户取消 / 点负按钮：**不能当成验证通过**（原来这样写等于取消就放行），
                    // 也不弹错误提示，安静地留在原状态即可。
                    if (errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                        errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        errorCode == BiometricPrompt.ERROR_CANCELED
                    ) {
                        onCanceled()
                    } else {
                        onError(errString.toString())
                    }
                }
                
                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    onError("身份验证失败")
                }
            }
        )
        
        // 允许设备密码时必须**不设**负按钮文字（否则 BiometricPrompt 抛
        // IllegalArgumentException：设备密码界面自带取消）。
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("无痕模式")
            .setSubtitle("请验证身份以继续")
            .setDescription("用指纹 / 面容或锁屏密码解锁无痕浏览")
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build()

        runCatching { biometricPrompt.authenticate(promptInfo) }
            .onFailure { onError(it.message ?: "无法启动验证") }
    }
}