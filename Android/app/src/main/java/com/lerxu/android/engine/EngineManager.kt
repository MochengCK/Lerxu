package com.lerxu.android.engine

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket
import kotlinx.coroutines.delay
import com.lerxu.android.R

/**
 * 引擎管理器 —— 负责 xferrust 二进制的提取、权限设置、启动与停止。
 */
object EngineManager {
    private const val TAG = "EngineManager"

    private const val ENGINE_ASSET_NAME = "xferrust"
    private const val ENGINE_LIB_NAME = "libxferrust.so"
    private const val CA_CERT_ASSET_NAME = "cacert.pem"
    private const val CA_CERT_FILE_NAME = "cacert.pem"

    const val DEFAULT_RPC_PORT = 16800
    const val DEFAULT_RPC_HOST = "127.0.0.1"
    const val DEFAULT_MAX_CONCURRENT = 5

    private lateinit var appContext: Context

    enum class EngineState {
        IDLE, STARTING, RUNNING, STOPPING, ERROR
    }

    @Volatile
    private var state: EngineState = EngineState.IDLE

    @Volatile
    private var engineProcess: Process? = null

    @Volatile
    private var rpcSecret: String = ""

    @Volatile
    private var rpcPort: Int = DEFAULT_RPC_PORT

    @Volatile
    private var lastError: String = ""

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun getState(): EngineState = state
    fun getRpcHost(): String = DEFAULT_RPC_HOST
    fun getRpcPort(): Int = rpcPort
    fun getRpcSecret(): String = rpcSecret
    fun getLastError(): String = lastError

    fun getEngineBinPath(): String {
        return File(appContext.filesDir, ENGINE_LIB_NAME).absolutePath
    }

    /**
     * 获取 nativeLibraryDir —— Android 允许从此目录执行 ELF 二进制。
     * 我们将引擎二进制伪装成 .so 文件放到这里。
     */
    private fun getNativeLibDir(): File {
        return File(appContext.applicationInfo.nativeLibraryDir)
    }

    /**
     * 下载目录：优先公共下载目录 /storage/emulated/0/Download/Lerxu，
     * 用户在任意文件管理器都能直接找到（需存储权限，见 [hasPublicStorageAccess]）；
     * 无权限时回退到应用专属外部目录 Android/data/<pkg>/files/Download/Lerxu。
     */
    fun getDownloadDir(): String {
        if (hasPublicStorageAccess()) {
            val publicDownloads = android.os.Environment.getExternalStoragePublicDirectory(
                android.os.Environment.DIRECTORY_DOWNLOADS
            )
            val target = File(publicDownloads, "Lerxu")
            if (!target.exists()) target.mkdirs()
            if (target.isDirectory && target.canWrite()) return target.absolutePath
        }
        val dir = appContext.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
            ?: File(appContext.filesDir, "downloads")
        return File(dir, "Lerxu").apply { if (!exists()) mkdirs() }.absolutePath
    }

    /** 公共下载目录写入权限：Android 11+ 看是否授予「所有文件访问」，旧版本看 WRITE_EXTERNAL_STORAGE */
    private fun hasPublicStorageAccess(): Boolean = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.os.Environment.isExternalStorageManager()
        } else {
            androidx.core.content.ContextCompat.checkSelfPermission(
                appContext, android.Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
    } catch (e: Exception) {
        false
    }

    /**
     * 提取内置的 Mozilla CA 根证书包到 filesDir。
     * 返回证书文件路径；提取失败返回 null。
     */
    private fun ensureCaCertBundle(): String? {
        val target = File(appContext.filesDir, CA_CERT_FILE_NAME)
        if (target.exists() && target.length() > 0) return target.absolutePath
        return try {
            appContext.assets.open(CA_CERT_ASSET_NAME).use { input ->
                FileOutputStream(target).use { output ->
                    input.copyTo(output)
                }
            }
            Log.i(TAG, "CA cert bundle extracted: ${target.absolutePath} (${target.length()} bytes)")
            target.absolutePath
        } catch (e: Exception) {
            Log.w(TAG, "Failed to extract CA cert bundle", e)
            null
        }
    }

    /**
     * 获取引擎二进制路径。
     *
     * Android 10+ 的 SELinux untrusted_app 域禁止从 filesDir 执行 ELF。
     * 解决方案：将二进制作为 jniLibs 打包（libxferrust.so），
     * Android 安装时自动提取到 nativeLibraryDir，该目录有 execute 权限。
     *
     * 如果 nativeLibraryDir 中的文件不存在或不可执行（极端情况），
     * fallback 到 filesDir + /system/bin/sh -c 间接执行。
     */
    private fun extractEngineBinary(): String {
        // 优先检查 nativeLibraryDir（jniLibs 安装的 .so 文件）
        val nativeLibDir = getNativeLibDir()
        val nativeTarget = File(nativeLibDir, ENGINE_LIB_NAME)

        Log.i(TAG, "Checking nativeLibraryDir: ${nativeTarget.absolutePath}")
        Log.i(TAG, "  exists=${nativeTarget.exists()}, canExecute=${nativeTarget.canExecute()}, len=${nativeTarget.length()}")

        if (nativeTarget.exists() && nativeTarget.canExecute() && nativeTarget.length() > 0) {
            Log.i(TAG, "Using engine binary from nativeLibraryDir (jniLibs)")
            return nativeTarget.absolutePath
        }

        // nativeLibraryDir 中没有或不可执行，尝试从 assets 复制到 nativeLibraryDir
        Log.w(TAG, "Engine binary not in nativeLibraryDir or not executable, trying to copy from assets...")
        try {
            nativeLibDir.mkdirs()
            appContext.assets.open(ENGINE_ASSET_NAME).use { input ->
                FileOutputStream(nativeTarget).use { output ->
                    input.copyTo(output)
                }
            }
            nativeTarget.setExecutable(true, false)
            nativeTarget.setReadable(true, false)
            if (nativeTarget.canExecute()) {
                Log.i(TAG, "Engine binary copied to nativeLibraryDir: ${nativeTarget.absolutePath}")
                return nativeTarget.absolutePath
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to copy to nativeLibraryDir", e)
        }

        // Fallback: 复制到 filesDir，通过 /system/bin/sh -c 间接执行
        Log.w(TAG, "Falling back to filesDir + sh -c")
        val fallbackTarget = File(appContext.filesDir, ENGINE_LIB_NAME)
        try {
            appContext.assets.open(ENGINE_ASSET_NAME).use { input ->
                FileOutputStream(fallbackTarget).use { output ->
                    input.copyTo(output)
                }
            }
            setExecutable(fallbackTarget)
            Log.i(TAG, "Engine binary copied to filesDir: ${fallbackTarget.absolutePath}")
            Log.i(TAG, "  canExecute=${fallbackTarget.canExecute()}")
            return fallbackTarget.absolutePath
        } catch (e2: Exception) {
            Log.e(TAG, "Failed to extract engine binary (all methods failed)", e2)
            state = EngineState.ERROR
            lastError = appContext.getString(R.string.error_extract_binary_failed, e2.message ?: "")
            throw e2
        }
    }

    private fun getAssetVersion(): String {
        return try {
            val asset = appContext.assets.open(ENGINE_ASSET_NAME)
            val size = asset.available()
            asset.close()
            "size-$size"
        } catch (e: Exception) {
            "unknown"
        }
    }

    private fun getInstalledVersion(file: File): String {
        val versionFile = File(appContext.filesDir, "xferrust.version")
        return if (versionFile.exists()) {
            versionFile.readText().trim()
        } else {
            ""
        }
    }

    private fun saveInstalledVersion(file: File, version: String) {
        File(appContext.filesDir, "xferrust.version").writeText(version)
    }

    private fun setExecutable(file: File): Boolean {
        // 方法1：Java API setExecutable
        val apiResult = file.setExecutable(true, false)
        Log.i(TAG, "setExecutable(API) -> $apiResult, canExecute=${file.canExecute()}")

        if (!file.canExecute()) {
            // 方法2：通过 /system/bin/chmod 设置权限
            try {
                val proc = Runtime.getRuntime().exec(
                    arrayOf("/system/bin/chmod", "755", file.absolutePath)
                )
                val code = proc.waitFor()
                Log.i(TAG, "chmod exit code: $code, canExecute=${file.canExecute()}")
            } catch (e: Exception) {
                Log.w(TAG, "chmod via /system/bin failed", e)
            }
        }

        if (!file.canExecute()) {
            // 方法3：通过 /system/bin/sh -c 执行
            try {
                val proc = Runtime.getRuntime().exec(
                    arrayOf("/system/bin/sh", "-c", "chmod 755 ${file.absolutePath}")
                )
                val code = proc.waitFor()
                Log.i(TAG, "sh -c chmod exit code: $code, canExecute=${file.canExecute()}")
            } catch (e: Exception) {
                Log.w(TAG, "sh -c chmod failed", e)
            }
        }

        return file.canExecute()
    }

    /**
     * 启动 xferrust 守护进程。
     * 等待 RPC 端口就绪后返回。
     */
    suspend fun start(
        port: Int = DEFAULT_RPC_PORT,
        secret: String = "",
        downloadDir: String = getDownloadDir(),
        maxConcurrent: Int = DEFAULT_MAX_CONCURRENT
    ): Boolean {
        if (state == EngineState.RUNNING || state == EngineState.STARTING) {
            Log.w(TAG, "Engine already running or starting")
            return true
        }

        state = EngineState.STARTING
        rpcPort = port
        rpcSecret = secret
        lastError = ""

        try {
            val binPath = extractEngineBinary()
            val binFile = File(binPath)

            // 强制设置可执行权限
            if (!binFile.canExecute()) {
                Log.w(TAG, "Engine binary not executable, attempting to fix...")
                setExecutable(binFile)
            }

            // 最终检查
            if (!binFile.canExecute()) {
                Log.e(TAG, "Engine binary STILL not executable after all attempts")
                lastError = appContext.getString(R.string.error_no_exec_permission)
                state = EngineState.ERROR
                return false
            }
            Log.i(TAG, "Engine binary: $binPath (exists=${binFile.exists()}, exec=${binFile.canExecute()}, len=${binFile.length()})")

            // 连接/节点默认值：用户在设置页改过则用持久化偏好，
            // 否则用移动端新默认（split/单服务器 32、BT 节点 100）。
            // 显式传值会覆盖引擎会话里的旧值（见引擎 set_initial_options），
            // 因此必须与设置页的修改保持同一来源，否则用户改动会被打回。
            val prefs = appContext.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
            val engineArgs = mutableListOf(
                binPath,
                "--rpc-listen-port=$port",
                "--dir=$downloadDir",
                "--max-concurrent-downloads=$maxConcurrent",
                "--split=${prefs.getInt("engine_split", 32)}",
                "--max-connection-per-server=${prefs.getInt("engine_max_conn_per_server", 32)}",
                "--bt-max-peers=${prefs.getInt("engine_bt_max_peers", 100)}",
                // 会话持久化：任务列表落盘，应用重启后由引擎恢复（终态任务进历史）
                "--save-session=${File(appContext.filesDir, ".xfer/session.json").absolutePath}"
            )
            if (secret.isNotEmpty()) {
                engineArgs.add("--rpc-secret=$secret")
            }

            Log.i(TAG, "Starting engine: ${engineArgs.joinToString(" ")}")
            Log.i(TAG, "Download dir: $downloadDir")
            Log.i(TAG, "Binary path: $binPath")
            Log.i(TAG, "  inNativeLibDir=${binPath.startsWith(appContext.applicationInfo.nativeLibraryDir)}")

            // 统一通过 /system/bin/sh -c 执行引擎
            // 直接 ProcessBuilder 执行 ELF 在 Android 上可能被 SELinux 拦截
            // （即使文件在 nativeLibraryDir 中，execve 系统调用仍可能被拒绝）
            // sh -c 方式通过 shell 间接执行，绕过部分 SELinux 限制
            val cmdString = engineArgs.joinToString(" ") { arg ->
                if (arg.contains(" ")) "\"$arg\"" else arg
            }
            Log.i(TAG, "Executing via sh -c: $cmdString")

            val pb = ProcessBuilder(listOf("/system/bin/sh", "-c", cmdString)).apply {
                redirectErrorStream(false)
                directory(binFile.parentFile)
            }

            // 设置环境变量
            val env = pb.environment()
            env["HOME"] = appContext.filesDir.absolutePath
            env["TMPDIR"] = appContext.cacheDir.absolutePath
            env["RUST_LOG"] = "info"
            env["PATH"] = "/system/bin:/system/xbin:${env["PATH"] ?: ""}"
            // 引擎的 rustls-native-certs 在 Android 上找不到系统证书目录，
            // 会以 "zero valid certificates found in native root store" 失败，
            // 通过 SSL_CERT_FILE 指向应用内置的 Mozilla 根证书包来修复。
            ensureCaCertBundle()?.let { caPath ->
                env["SSL_CERT_FILE"] = caPath
                Log.i(TAG, "SSL_CERT_FILE=$caPath")
            }

            engineProcess = pb.start()
            val process = engineProcess!!

            // 读取 stdout（防止管道阻塞）
            Thread {
                try {
                    val reader = process.inputStream.bufferedReader()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        Log.i(TAG, "[xferrust:out] $line")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Engine stdout reader stopped", e)
                }
            }.apply {
                isDaemon = true
                name = "xferrust-stdout"
            }.start()

            // 读取 stderr（用于错误诊断）
            Thread {
                try {
                    val reader = process.errorStream.bufferedReader()
                    var line: String?
                    val errorLines = StringBuilder()
                    while (reader.readLine().also { line = it } != null) {
                        Log.e(TAG, "[xferrust:err] $line")
                        errorLines.append(line).append('\n')
                    }
                    if (errorLines.isNotEmpty()) {
                        lastError = errorLines.toString().trim()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Engine stderr reader stopped", e)
                }
            }.apply {
                isDaemon = true
                name = "xferrust-stderr"
            }.start()

            // 等待 RPC 端口就绪
            val maxWaitMs = 15_000L
            val pollIntervalMs = 200L
            val startTime = System.currentTimeMillis()
            var portReady = false

            while (System.currentTimeMillis() - startTime < maxWaitMs) {
                if (!process.isAlive) {
                    // 进程已退出 —— 读取退出码和 stderr
                    val exitCode = process.exitValue()
                    state = EngineState.ERROR
                    Log.e(TAG, "Engine process exited, code: $exitCode")

                    // 等待 stderr 读取线程完成
                    Thread.sleep(200)
                    Log.e(TAG, "Engine stderr: $lastError")

                    if (lastError.isEmpty()) {
                        lastError = appContext.getString(R.string.error_engine_exit_code, exitCode)
                    }
                    engineProcess = null
                    return false
                }
                if (isPortOpen(port)) {
                    portReady = true
                    break
                }
                delay(pollIntervalMs)
            }

            if (portReady) {
                state = EngineState.RUNNING
                Log.i(TAG, "Engine started successfully, RPC port $port is ready")
                return true
            } else {
                state = EngineState.ERROR
                Log.e(TAG, "Engine process alive but RPC port not ready after ${maxWaitMs}ms")
                lastError = appContext.getString(R.string.error_engine_timeout)
                process.destroyForcibly()
                engineProcess = null
                return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start engine", e)
            state = EngineState.ERROR
            lastError = appContext.getString(R.string.error_engine_start_exception, e.message ?: "")
            engineProcess = null
            return false
        }
    }

    private fun isPortOpen(port: Int): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(java.net.InetSocketAddress("127.0.0.1", port), 500)
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    @Synchronized
    fun stop() {
        val proc = engineProcess ?: run {
            state = EngineState.IDLE
            return
        }

        state = EngineState.STOPPING
        Log.i(TAG, "Stopping engine...")

        try {
            proc.destroy()
            val timeoutMs = 3000
            val start = System.currentTimeMillis()
            while (proc.isAlive && System.currentTimeMillis() - start < timeoutMs) {
                Thread.sleep(100)
            }
            if (proc.isAlive) {
                Log.w(TAG, "Engine did not exit gracefully, force killing")
                proc.destroyForcibly()
                proc.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping engine", e)
        }

        engineProcess = null
        state = EngineState.IDLE
        Log.i(TAG, "Engine stopped")
    }

    suspend fun restart(
        port: Int = DEFAULT_RPC_PORT,
        secret: String = "",
        downloadDir: String = getDownloadDir(),
        maxConcurrent: Int = DEFAULT_MAX_CONCURRENT
    ): Boolean {
        stop()
        return start(port, secret, downloadDir, maxConcurrent)
    }

    fun isRunning(): Boolean = state == EngineState.RUNNING

    fun isProcessAlive(): Boolean {
        val proc = engineProcess ?: return false
        return proc.isAlive
    }

    fun getDownloadDirSafe(): String = try {
        if (::appContext.isInitialized) getDownloadDir()
        else java.io.File(System.getProperty("java.io.tmpdir", "/tmp"), "Lerxu").apply { mkdirs() }.absolutePath
    } catch (e: Exception) {
        java.io.File(System.getProperty("java.io.tmpdir", "/tmp"), "Lerxu").apply { mkdirs() }.absolutePath
    }
}
