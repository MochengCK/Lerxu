package com.lerxu.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 引擎二进制完整性测试。
 *
 * 安卓端不编译引擎（XferRust 是独立仓库），引擎以两个副本随仓库分发：
 * - `jniLibs/arm64-v8a/libxferrust.so`（安装时被系统提取到 nativeLibraryDir，取得执行权限）
 * - `assets/xferrust`（兜底提取，EngineManager 优先 jniLibs）
 *
 * 这两份必须同字节：EngineManager 以「文件大小」作版本指纹
 * （`size-<bytes>`），两处不一致会导致每次启动都重复提取。
 * 同时校验 ELF 头与关键能力字符串，防止回填了错误架构或旧版本引擎。
 */
class EngineBinaryTest {

    /** 从 Gradle 单元测试的工作目录向上定位仓库内的 app 模块。 */
    private fun locate(relative: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.exists()) return candidate
            dir = dir.parentFile
        }
        throw AssertionError(
            "找不到 $relative（工作目录：${System.getProperty("user.dir")}）"
        )
    }

    private val assetEngine: File by lazy { locate("app/src/main/assets/xferrust") }
    private val jniEngine: File by lazy {
        locate("app/src/main/jniLibs/arm64-v8a/libxferrust.so")
    }

    @Test
    fun `engine binaries exist and are non-trivial`() {
        assertTrue("assets/xferrust 缺失", assetEngine.isFile)
        assertTrue("jniLibs/libxferrust.so 缺失", jniEngine.isFile)
        // 真实引擎 5MB 左右；明显偏小说明是占位文件或被截断
        assertTrue("assets 引擎体积异常：${assetEngine.length()}", assetEngine.length() > 1_000_000)
        assertTrue("jniLibs 引擎体积异常：${jniEngine.length()}", jniEngine.length() > 1_000_000)
    }

    @Test
    fun `engine copies are byte-identical`() {
        // 版本指纹按文件大小判定，两份必须完全一致
        assertEquals(
            "assets 与 jniLibs 引擎大小不一致（会导致每次启动重复提取）",
            assetEngine.length(),
            jniEngine.length()
        )
        assertEquals(
            "assets 与 jniLibs 引擎内容不一致",
            assetEngine.readBytes().toList(),
            jniEngine.readBytes().toList()
        )
    }

    @Test
    fun `engine is aarch64 elf shared object`() {
        val header = ByteArray(20)
        assetEngine.inputStream().use { it.read(header) }
        // ELF magic: 0x7F 'E' 'L' 'F'
        assertEquals(0x7F, header[0].toInt() and 0xFF)
        assertEquals('E'.code, header[1].toInt() and 0xFF)
        assertEquals('L'.code, header[2].toInt() and 0xFF)
        assertEquals('F'.code, header[3].toInt() and 0xFF)
        // EI_CLASS = 2 → 64 位；EI_DATA = 1 → 小端
        assertEquals("引擎不是 64 位 ELF", 2, header[4].toInt())
        assertEquals("引擎不是小端 ELF", 1, header[5].toInt())
        // e_machine（offset 18，小端 2 字节）：0xB7 = EM_AARCH64
        val machine = (header[18].toInt() and 0xFF) or ((header[19].toInt() and 0xFF) shl 8)
        assertEquals("引擎架构不是 AArch64（e_machine=$machine）", 0xB7, machine)
    }

    @Test
    fun `engine advertises the new global options`() {
        // 防止回填旧引擎：这些是本轮新增的全局选项字面量
        val text = assetEngine.readBytes().toString(Charsets.ISO_8859_1)
        val required = listOf(
            "enable-dht",           // DHT 开关
            "enable-dht6",          // DHT over IPv6（BEP 32）
            "enable-peer-exchange", // PEX（BEP 11）
            "disk-cache",           // 片级写回缓冲
            "bt-save-metadata",     // 磁力保存为种子
            "bt-load-saved-metadata",
            "bt-seed-time",         // 做种时长
            "continue"              // HTTP 续传开关
        )
        for (opt in required) {
            assertTrue("引擎缺少全局选项字符串：$opt（疑似旧引擎）", text.contains(opt))
        }
    }

    @Test
    fun `engine advertises its identity and features`() {
        val text = assetEngine.readBytes().toString(Charsets.ISO_8859_1)
        // 引擎名（engine.getVersion 的返回字段）
        assertTrue("引擎缺少名称标识 xferrust", text.contains("xferrust"))
        // engine.getVersion 的 features 能力声明（客户端据此决定是否启用对应功能）。
        // 注意：RPC 方法名字符串会被 Rust 编译器优化掉，不能作为校验依据；
        // 这里改用稳定的 feature 名与选项名。
        for (feature in listOf("wanted-bitfield", "verify-files")) {
            assertTrue("引擎缺少能力声明：$feature", text.contains(feature))
        }
    }
}
