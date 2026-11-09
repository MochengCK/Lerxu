package com.lerxu.android.browser

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/**
 * 把**分离的一路画面 + 一路声音**合成一个 MP4（不重编码，纯搬运样本）。
 *
 * 为什么需要它（2026-11-09 用户点名）：电脑版站点走 DASH，画面（`.m4s`）与声音
 * （另一条 `.m4s`）是两个文件。只下画面那一份，用户拿到的是个**没声音的视频**。
 *
 * 实现用系统的 [MediaExtractor] + [MediaMuxer]：两路各自读样本、原样写进同一个 MP4 ——
 * H.264/HEVC 与 AAC 都不解码也不重编码，速度只受磁盘限制。
 *
 * 三条约束（踩过就知道，别改）：
 * - 写样本**同一轨内必须时间递增**（MediaMuxer 会拒），所以顺序读、顺序写；
 * - 视频轨的 `KEY_ROTATION` 不会随 `addTrack` 带过去，要自己 `setOrientationHint`；
 * - 输出文件不能已存在（[MediaMuxer] 会抛），调用方给一个临时路径、成功后再替换。
 */
object DashMux {

    /** 单次读样本的缓冲：关键帧可能上百 KB，给 4MB 足够（小了会直接抛）。 */
    private const val SAMPLE_BUFFER = 4 * 1024 * 1024

    /**
     * [videoPath] + [audioPath] → [outPath]。
     *
     * 返回 true = 合成成功；false = 任一步失败（文件不可解析 / 没有视频轨 / 没有音轨 /
     * 写盘失败）。失败时**不留半成品**：调用方给的那个临时文件会被删掉。
     */
    fun mux(videoPath: String, audioPath: String, outPath: String): Boolean {
        val videoFile = File(videoPath)
        val audioFile = File(audioPath)
        if (!videoFile.isFile || !audioFile.isFile) return false
        val out = File(outPath)
        out.parentFile?.mkdirs()
        out.delete()

        var videoEx: MediaExtractor? = null
        var audioEx: MediaExtractor? = null
        var muxer: MediaMuxer? = null
        return try {
            videoEx = MediaExtractor().apply { setDataSource(videoPath) }
            audioEx = MediaExtractor().apply { setDataSource(audioPath) }
            val vIndex = firstTrackOf(videoEx, "video/") ?: return false
            val aIndex = firstTrackOf(audioEx, "audio/") ?: return false
            val vFormat = videoEx.getTrackFormat(vIndex)
            val aFormat = audioEx.getTrackFormat(aIndex)

            muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            // 竖屏视频靠它：样本本身不带方向，MP4 的方向写在容器头里
            if (vFormat.containsKey(MediaFormat.KEY_ROTATION)) {
                runCatching { muxer.setOrientationHint(vFormat.getInteger(MediaFormat.KEY_ROTATION)) }
            }
            val vTrack = muxer.addTrack(vFormat)
            val aTrack = muxer.addTrack(aFormat)
            muxer.start()
            val buffer = ByteBuffer.allocateDirect(SAMPLE_BUFFER)
            val info = MediaCodec.BufferInfo()
            copyTrack(videoEx, vIndex, muxer, vTrack, buffer, info)
            copyTrack(audioEx, aIndex, muxer, aTrack, buffer, info)
            muxer.stop()
            true
        } catch (t: Throwable) {
            out.delete()
            false
        } finally {
            runCatching { muxer?.release() }
            runCatching { videoEx?.release() }
            runCatching { audioEx?.release() }
        }
    }

    /** 第一条 `video/` 或 `audio/` 轨的下标；没有就 null。 */
    private fun firstTrackOf(ex: MediaExtractor, prefix: String): Int? {
        for (i in 0 until ex.trackCount) {
            val mime = runCatching { ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME) }
                .getOrNull().orEmpty()
            if (mime.startsWith(prefix)) return i
        }
        return null
    }

    /** 把一条轨的样本按序搬进 muxer。 */
    private fun copyTrack(
        ex: MediaExtractor,
        index: Int,
        muxer: MediaMuxer,
        outTrack: Int,
        buffer: ByteBuffer,
        info: MediaCodec.BufferInfo
    ) {
        ex.selectTrack(index)
        while (true) {
            val size = ex.readSampleData(buffer, 0)
            if (size < 0) break
            info.offset = 0
            info.size = size
            info.presentationTimeUs = ex.sampleTime
            info.flags = if (ex.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
                MediaCodec.BUFFER_FLAG_KEY_FRAME
            } else {
                0
            }
            muxer.writeSampleData(outTrack, buffer, info)
            ex.advance()
        }
        ex.unselectTrack(index)
    }
}
