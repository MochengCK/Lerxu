package com.lerxu.android.browser

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.hls.playlist.HlsMediaPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsMultivariantPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsPlaylistParser
import androidx.media3.exoplayer.hls.playlist.HlsPlaylistParserFactory
import androidx.media3.exoplayer.upstream.ParsingLoadable
import java.io.InputStream

/**
 * 在 media3 自己的 HLS 清单解析器**前面**垫一层：先把清单过一遍 [HlsManifestFixer]，
 * 再交给它解析。
 *
 * 为什么走这一层而不是改数据源：`setPlaylistParserFactory` 拿到的就是"url + 输入流"，
 * 改写只需要把流读成字符串、改完再塞回去（几十行）；而要在数据源那一层改，得自己实现
 * 一整套 `DataSource`（嗅探 / 半截缓冲 / 字节数语义），成本与出错面都大得多。
 *
 * 注意：**只改清单**。分片与密钥的请求原样走数据源 —— 这里碰不到它们。
 */
@UnstableApi
class FixedHlsPlaylistParserFactory : HlsPlaylistParserFactory {

    override fun createPlaylistParser(): ParsingLoadable.Parser<HlsPlaylist> =
        FixingParser(HlsPlaylistParser())

    override fun createPlaylistParser(
        multivariantPlaylist: HlsMultivariantPlaylist,
        previousMediaPlaylist: HlsMediaPlaylist?
    ): ParsingLoadable.Parser<HlsPlaylist> =
        FixingParser(HlsPlaylistParser(multivariantPlaylist, previousMediaPlaylist))
}

/** 读全 → 改写 → 交回原本那个解析器。 */
@UnstableApi
private class FixingParser(
    private val delegate: ParsingLoadable.Parser<HlsPlaylist>
) : ParsingLoadable.Parser<HlsPlaylist> {

    override fun parse(uri: Uri, inputStream: InputStream): HlsPlaylist {
        val raw = inputStream.readBytes()
        // 字节 → 文本先做两件"市面上真会碰到"的事（gzip / BOM），见 HlsManifestFixer.decode
        val text = HlsManifestFixer.decode(raw)
        // 改写**失败了也必须照常往下走**：拿原样的清单去解析，最坏就是原来那个错误，
        // 总好过在这里抛一个用户完全看不懂的异常。
        // baseUri 传进去是为了补"协议相对地址"（`//cdn/...` 没有 scheme 会被解析失败）
        val fixed = runCatching { HlsManifestFixer.fix(text, uri.toString()) }.getOrDefault(text)
        return delegate.parse(uri, fixed.toByteArray(Charsets.UTF_8).inputStream())
    }
}
