package com.lerxu.android

import com.lerxu.android.browser.HlsManifestFixer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 加密 HLS 清单的合规化改写。
 *
 * 这些规则直接决定"加密流能不能播"：media3 的 `HlsPlaylistParser` 对 `#EXT-X-KEY` 认得很死，
 * 写法稍不合规**不是报错而是把整条 KEY 静默忽略**，加密分片于是被当明文解，最后摔出来的是
 * "容器/清单不支持" —— 用户看到的就是"碰到加密的就播不了"（用户点名）。都抽成了纯函数，
 * 所以在 JVM 上钉死。
 */
class HlsManifestFixerTest {

    private fun media(
        fmp4: Boolean,
        keyTag: String,
        seq: Int = 0,
        /** KEY 那一行**之前**先出多少个分片（IV 取"所辖第一个分片"的序号，所以这决定它）。 */
        segsBeforeKey: Int = 0
    ): String {
        val sb = StringBuilder()
        sb.append("#EXTM3U\n#EXT-X-VERSION:7\n")
        if (seq != 0) sb.append("#EXT-X-MEDIA-SEQUENCE:$seq\n")
        if (fmp4) sb.append("#EXT-X-MAP:URI=\"init.mp4\"\n")
        repeat(segsBeforeKey) { sb.append("#EXTINF:6.0,\npre$it.ts\n") }
        sb.append(keyTag).append('\n')
        sb.append("#EXTINF:6.0,\nseg.ts\n#EXT-X-ENDLIST\n")
        return sb.toString()
    }

    /** ① 没加双引号的 `URI=`：media3 的正则只认 `URI="…"`，裸值会被读成"没有密钥地址"。 */
    @Test
    fun `quotes a bare key uri`() {
        val out = HlsManifestFixer.fix(media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=key.bin"))
        assertTrue(out.contains("URI=\"key.bin\""))
    }

    /** 单引号同理 —— 站上两种写法都见过。 */
    @Test
    fun `converts single quotes to double quotes`() {
        val out = HlsManifestFixer.fix(media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI='key.bin'"))
        assertTrue(out.contains("URI=\"key.bin\""))
    }

    /** ② `METHOD=` 大小写/空格不规范：正则大小写敏感、`=` 两侧不许有空格。 */
    @Test
    fun `normalizes method case and spacing`() {
        val lower = HlsManifestFixer.fix(media(fmp4 = false, keyTag = "#EXT-X-KEY:method=aes-128,URI=\"k\""))
        assertTrue(lower.contains("METHOD=AES-128"))

        val spaced = HlsManifestFixer.fix(media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD = AES-128,URI=\"k\""))
        assertTrue(spaced.contains("METHOD=AES-128"))
    }

    /**
     * ③ fMP4 的 AES-128 缺 `IV=`：media3 唯一为加密流设的硬门槛就是这一条
     * （"The encryption IV attribute must be present when an initialization segment is
     * encrypted with METHOD=AES-128."）。按 RFC 8216 §5.2 补 = 所辖第一个分片的媒体序号。
     */
    @Test
    fun `adds the missing iv for fmp4 aes-128`() {
        val out = HlsManifestFixer.fix(
            media(fmp4 = true, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\"", seq = 0)
        )
        assertTrue(out.contains("IV=0x" + "0".repeat(32)))
    }

    /** 序号从 `#EXT-X-MEDIA-SEQUENCE` + 已经出过的分片数算 —— 这是规范里的规则。 */
    @Test
    fun `derives the iv from the media sequence number of the first covered segment`() {
        val out = HlsManifestFixer.fix(
            media(
                fmp4 = true,
                keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\"",
                seq = 10,
                segsBeforeKey = 2
            )
        )
        // 10 + 2 = 12 → 0x…0c（下面那条注释里的"第一个所辖分片"就是它）
        assertTrue(out.contains("IV=0x" + "0".repeat(31) + "c"))

        // KEY 在第一个分片之前：序号就是 MEDIA-SEQUENCE 本身（10 → 0x…0a）
        val first = HlsManifestFixer.fix(
            media(fmp4 = true, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\"", seq = 10)
        )
        assertTrue(first.contains("IV=0x" + "0".repeat(31) + "a"))
    }

    /**
     * **TS 分片不补 IV**：TS 允许省（序号自己推），硬补一个反而可能把本来能播的弄坏。
     * 这条是"不该动就别动"的界线，改动这个函数时先看它。
     */
    @Test
    fun `leaves a ts playlist without iv untouched`() {
        val src = media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\"")
        assertEquals(src, HlsManifestFixer.fix(src))
    }

    /** `METHOD=NONE` 不需要 IV（那是"到这里不加密了"的标记）。 */
    @Test
    fun `never adds an iv for method none`() {
        val src = media(fmp4 = true, keyTag = "#EXT-X-KEY:METHOD=NONE")
        assertEquals(src, HlsManifestFixer.fix(src))
    }

    /** 已有的 IV 规范化成 `0x` + 32 位小写（media3 按 `0x` 前缀解析）。 */
    @Test
    fun `normalizes an existing iv`() {
        val out = HlsManifestFixer.fix(
            media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\",IV=abc")
        )
        assertTrue(out.contains("IV=0x" + "0".repeat(29) + "abc"))
    }

    /**
     * **认不出来的一律不动**：`AES-256` 之类不是靠改写能救的，硬改只会把清楚的失败换成
     * 看不懂的失败。DRM（Widevine）同理。
     */
    @Test
    fun `leaves unknown methods and drm alone`() {
        val aes256 = HlsManifestFixer.fix(
            media(fmp4 = true, keyTag = "#EXT-X-KEY:METHOD=AES-256,URI=\"k\"")
        )
        assertTrue(aes256.contains("METHOD=AES-256"))
        assertFalse("补了不该补的 IV", aes256.contains("IV="))

        val widevineTag = "#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://x\",KEYFORMAT=\"com.widevine\""
        val widevine = HlsManifestFixer.fix(media(fmp4 = true, keyTag = widevineTag))
        assertEquals(widevineTag, widevine.lines()[3])
    }

    /**
     * **gzip**：不少 CDN 对 `.m3u8` 无条件压（不管有没有 `Accept-Encoding`），而 media3
     * 不会自动解压 ⇒ 解析器拿到二进制，报 "Input does not start with the #EXTM3U header"。
     */
    @Test
    fun `decodes a gzipped playlist`() {
        val src = media(fmp4 = false, keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"k\",IV=0x1")
        val gz = java.io.ByteArrayOutputStream().also { bos ->
            java.util.zip.GZIPOutputStream(bos).use { it.write(src.toByteArray()) }
        }.toByteArray()
        assertEquals(src, HlsManifestFixer.decode(gz))
    }

    /** 不是 gzip 的（含 BOM / 纯文本 / 二进制）按原样当文本，绝不因为"解压"把能播的弄坏。 */
    @Test
    fun `decode passes plain and bom text through`() {
        assertEquals("#EXTM3U\n", HlsManifestFixer.decode("#EXTM3U\n".toByteArray()))
        assertEquals("#EXTM3U\n", HlsManifestFixer.decode("\uFEFF#EXTM3U\n".toByteArray()))
    }

    /**
     * **协议相对地址**（`//cdn/x`）：本身合法，但没有 scheme 的 URI 落进 media3 的
     * DefaultDataSource 分派时既不是 http 也不是 file，直接 `Malformed URL`。
     * 按清单自己的协议补全 —— 这一条对 `#EXT-X-KEY` 的 URI、`#EXT-X-MAP` 的 URI、
     * 以及**分片那一行的裸地址**都要成立。
     */
    @Test
    fun `makes protocol relative uris absolute`() {
        val src = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"//cdn/key.bin\"\n" +
            "#EXTINF:6.0,\n//cdn/seg.ts\n#EXT-X-ENDLIST\n"
        val out = HlsManifestFixer.fix(src, "https://cdn/a/index.m3u8")
        assertTrue(out.contains("URI=\"https://cdn/key.bin\""))
        assertTrue(out.contains("\nhttps://cdn/seg.ts"))

        // 清单自己是 http 就补 http（别一律补成 https）
        val httpOut = HlsManifestFixer.fix(src, "http://cdn/a/index.m3u8")
        assertTrue(httpOut.contains("URI=\"http://cdn/key.bin\""))
    }

    /** 普通地址（已经有 scheme、或本来就是相对路径）一个字节都不该动。 */
    @Test
    fun `leaves normal uris alone`() {
        // IV 写成**已经规范化**的 32 位（`IV=0x1` 那种会被补零，那是另一条用例的事）
        val src = media(
            fmp4 = false,
            keyTag = "#EXT-X-KEY:METHOD=AES-128,URI=\"https://x/k\",IV=0x" + "0".repeat(31) + "1"
        )
        assertEquals(src, HlsManifestFixer.fix(src, "https://cdn/a/index.m3u8"))

        val relative = "#EXTM3U\n#EXTINF:6.0,\nseg.ts\n#EXT-X-ENDLIST\n"
        assertEquals(relative, HlsManifestFixer.fix(relative, "https://cdn/a/index.m3u8"))
    }

    /** 不是 HLS 的东西（探错时的网页等）原样返回，绝不往里塞字。 */
    @Test
    fun `ignores non-playlist input`() {
        val html = "<!doctype html><html><body>403</body></html>"
        assertEquals(html, HlsManifestFixer.fix(html))
    }
}
