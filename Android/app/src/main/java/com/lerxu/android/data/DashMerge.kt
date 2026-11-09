package com.lerxu.android.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.lerxu.android.R
import com.lerxu.android.browser.DashMux
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * **分离流下载的收尾**：画面下完以后，把配套的音轨取下来合进同一个文件。
 *
 * 背景（2026-11-09 用户点名）：电脑版站点（B 站这类）的画面与声音是**两条地址**。
 * 下载走的是下载引擎，一次只认一个地址 —— 只下画面那一份，用户拿到的是个没声音的
 * 视频。所以这里分两步：
 *
 * 1. 画面交给引擎（照旧出现在任务列表里、有进度、可暂停 —— 用户看得见）；
 * 2. 提交时顺手把**音轨**在后台取到缓存（多几 MB，不占任务列表）；
 * 3. 引擎报"写完盘"那一刻（[EngineRepository.addCompleteHook]），用 [DashMux] 把两路
 *    合成一个 MP4，**原地替换**画面那份 —— 任务里的那个文件因此就是最终成品，
 *    名字与路径都不变（用户在列表里点开就是能出声的那一份）。
 *
 * 失败不抛给用户看堆栈，只给一句人话（Toast）：合成失败时画面那份还在，只是没声音。
 */
object DashMerge {

    private data class Pending(
        val audioUrl: String,
        val headers: Map<String, String>
    )

    /** gid → 待合成的那条音轨。 */
    private val pending = ConcurrentHashMap<String, Pending>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var installed = false

    /**
     * 记下"这个任务下完还要合并音轨"。
     *
     * [headers] 是 `"Name: value"` 行（与交给引擎的那份同一套）：音轨在 CDN 上同样
     * 校验 Referer / Cookie，少一个就是 403。
     */
    fun attach(
        context: Context,
        repository: EngineRepository,
        gid: String,
        audioUrl: String,
        headers: List<String>
    ) {
        if (gid.isBlank() || audioUrl.isBlank()) return
        appContext = context.applicationContext
        pending[gid] = Pending(audioUrl, parseHeaders(headers))
        if (!installed) {
            installed = true
            repository.addCompleteHook(::onTaskComplete)
        }
    }

    private fun parseHeaders(lines: List<String>): Map<String, String> =
        lines.mapNotNull { line ->
            val i = line.indexOf(':')
            if (i <= 0) null else line.substring(0, i).trim() to line.substring(i + 1).trim()
        }.toMap()

    /** 引擎报完成：只有登记过音轨的那几个 gid 才继续。 */
    private fun onTaskComplete(gid: String, filePath: String) {
        val job = pending.remove(gid) ?: return
        val context = appContext ?: return
        scope.launch { merge(context, job, filePath) }
    }

    private fun merge(context: Context, job: Pending, videoPath: String) {
        val video = File(videoPath)
        if (videoPath.isBlank() || !video.isFile) {
            toast(context, R.string.dash_merge_missing)
            return
        }
        val cacheDir = File(context.cacheDir, "dash-audio").apply { mkdirs() }
        val audio = File(cacheDir, "${video.name.hashCode()}-${video.length()}.m4s")
        if (!fetch(job, audio)) {
            toast(context, R.string.dash_audio_failed)
            return
        }
        // 先写临时文件再替换：合成中途失败时，原来那份画面还在（不能被清掉）
        val temp = File(video.parentFile, video.name + ".merge")
        if (!DashMux.mux(video.absolutePath, audio.absolutePath, temp.absolutePath)) {
            temp.delete()
            audio.delete()
            toast(context, R.string.dash_merge_failed)
            return
        }
        val replaced = video.delete() && temp.renameTo(video)
        if (!replaced) {
            // 极少数机上 rename 会失败（跨挂载点 / 文件被占用）：退回复制
            val copied = runCatching {
                temp.copyTo(video, overwrite = true)
                temp.delete()
                true
            }.getOrDefault(false)
            if (!copied) {
                temp.delete()
                audio.delete()
                toast(context, R.string.dash_merge_failed)
                return
            }
        }
        audio.delete()
        toast(context, R.string.dash_merged)
    }

    /** 取音轨到 [out]；失败（非 2xx / 空文件 / 网络异常）返回 false。 */
    private fun fetch(job: Pending, out: File): Boolean = try {
        val builder = Request.Builder().url(job.audioUrl)
        job.headers.forEach { (k, v) -> builder.header(k, v) }
        client.newCall(builder.build()).execute().use { response ->
            val body = response.body
            if (!response.isSuccessful || body == null) {
                false
            } else {
                out.outputStream().use { sink -> body.byteStream().copyTo(sink) }
                out.length() > 0
            }
        }
    } catch (t: Throwable) {
        out.delete()
        false
    }

    private fun toast(context: Context, res: Int) {
        main.post {
            runCatching {
                Toast.makeText(context, context.getString(res), Toast.LENGTH_LONG).show()
            }
        }
    }
}
