package com.lerxu.android.browser

/**
 * **音视频分离**（DASH / MSE 那种）：把"这一路视频"和"它自己的那条音轨"配起来。
 *
 * 为什么需要它（2026-11-09 用户报"哔哩哔哩这种电脑端音视频是分离的，原生播放器播的音频和
 * 视频不是一个频道"）：电脑版站点普遍走 DASH，画面与声音是**两条独立的地址**。
 * 嗅探把它们各收一条，而原生播放器只拿走 "rank 最高的那一条"（= 视频），于是：
 * - 我们这边只有画面、没有声音；
 * - 页面那边自己那条音轨还在放（站点用独立的 `<audio>` / 另一路 MSE）——
 *   听起来就是"声音和画面对不上"。
 *
 * 配对规则（按可靠度排序，纯函数、可单测）：
 * 1. **B 站 DASH**：文件名 `<stem>-<流序号>-<清晰度码>.m4s`，音频码是 302xx 那一档
 *    （30216 / 30232 / 30250 / 30251 / 30280）。同一个 stem 下取**码最大**的那条
 *    （192K > 132K > 64K）。B 站两个流的**流序号也不一样**（视频 `-1-`、音频 `-2-`），
 *    所以 stem 必须把这两段都切掉，见 [biliParts]。
 * 2. **通用同 stem**：去掉扩展名、再去掉尾部 `-<数字>` / `_<数字>` 之后相同的、且
 *    [SniffKind.AUDIO] 的那条（YouTube 一类 `videoplayback?...&itag=` 用不上这条，
 *    但它们通常是清单，见 [pair] 的第一道门）。
 * 3. **整页唯一音轨**：上面都没命中时，如果这一页**只有一条**音频，就认它 ——
 *    分离播放器几乎都是"一路视频 + 一路音频"，多视频页（信息流）不满足这个前提。
 *
 * 清单（m3u8 / mpd）不配对：音轨本来就在清单里，再拼一条只会重复出声。
 */
object DashPair {

    /** B 站 DASH 里属于**音频**的清晰度码（302xx 那一档）。 */
    private val BILI_AUDIO_IDS = setOf("30216", "30232", "30250", "30251", "30280")

    /**
     * 给 [video] 找它那条音轨；没有就返回 null。
     *
     * [list] 是同一个标签页的嗅探列表（已经是"最新在前"）。
     */
    fun pair(video: SniffedResource, list: List<SniffedResource>): SniffedResource? {
        // 清单里自带音轨：再配一条会两路同时出声
        if (video.extension.lowercase() in VideoSniffer.manifestFormats) return null
        if (video.url.isBlank()) return null
        val page = video.pageUrl
        val candidates = list.filter {
            it.url != video.url && it.url.isNotBlank() && samePage(it.pageUrl, page)
        }
        if (candidates.isEmpty()) return null

        // ① B 站：同 stem + 音频码，多个音频取码最大的那条
        val vParts = biliParts(video.url)
        if (vParts != null) {
            val best = candidates.mapNotNull { c ->
                val parts = biliParts(c.url) ?: return@mapNotNull null
                if (parts.first != vParts.first) return@mapNotNull null
                if (parts.second !in BILI_AUDIO_IDS) return@mapNotNull null
                c to parts.second.toInt()
            }.maxByOrNull { it.second }
            if (best != null) return best.first
            // 认得出是 B 站 DASH：**只信 stem**，不再走下面两条兜底 ——
            // 这一档的名字里带着全站唯一的 id，配不上就是"这条片子的音轨还没嗅到"，
            // 而此时拿"整页唯一的那条音频"顶上，很可能配成**另一条片子**的声音
            return null
        }

        // ② 通用：同 stem 的音频
        val stem = genericStem(video.url)
        candidates.firstOrNull { it.kind == SniffKind.AUDIO && genericStem(it.url) == stem }
            ?.let { return it }

        // ③ 整页只有一条音频
        return candidates.filter { it.kind == SniffKind.AUDIO }.singleOrNull()
    }

    /** 两边的 pageUrl 都非空时必须相等；一边缺了就当成同一页（同一次嗅探本来就来自一页）。 */
    private fun samePage(a: String, b: String): Boolean =
        a.isBlank() || b.isBlank() || a.trim() == b.trim()

    /**
     * 拆 B 站 DASH 文件名：`…/123456-1-30080.m4s` → (`…/123456`, `30080`)。
     *
     * 尾部两段分别是**流序号**（视频 1 / 音频 2）与**清晰度码**，两段都要切掉 ——
     * 只切清晰度码的话视频与音频的 stem 永远对不上（它们的流序号本来就不同）。
     *
     * 不符合这个形状（没有那两段数字、或码不是五位数）时返回 null，交下一条规则。
     */
    private fun biliParts(url: String): Pair<String, String>? {
        val path = url.substringBefore('#').substringBefore('?')
        val base = path.substringAfterLast('/')
        val dot = base.lastIndexOf('.')
        val name = if (dot > 0) base.substring(0, dot) else base
        val parts = name.split('-')
        if (parts.size < 3) return null
        val id = parts.last()
        val index = parts[parts.size - 2]
        if (id.length != 5 || !id.all { it.isDigit() }) return null
        if (index.isEmpty() || index.length > 2 || !index.all { it.isDigit() }) return null
        // 剩下的部分才是"同一个视频"的身份（**只取文件名**，不带目录与主机）：
        // B 站画面与声音经常落在**不同的 CDN 主机**上（换镜像 / 分线路），
        // 把主机算进去就永远配不上；而文件名里那串 id 是全站唯一的
        val stem = parts.dropLast(2).joinToString("-")
        if (stem.isEmpty()) return null
        return stem to id
    }

    /**
     * 通用的"同一路"判据：去掉查询串与扩展名，再去掉尾部一段 `-<数字>` / `_<数字>`。
     *
     * 例：`/a/b/clip-1080.mp4` 与 `/a/b/clip-audio.m4a` → `/a/b/clip` / `/a/b/clip-audio`，
     * 配不上；`/a/b/clip-1.mp4` 与 `/a/b/clip-2.m4a` → `/a/b/clip`，配上。
     */
    internal fun genericStem(url: String): String {
        val raw = url.substringBefore('#').substringBefore('?')
        // 同样是"只比路径、不比主机"：分离流的两条常在不同 CDN 上
        val noScheme = raw.substringAfter("://", raw)
        val slash = noScheme.indexOf('/')
        val path = if (slash >= 0) noScheme.substring(slash) else "/$noScheme"
        val dot = path.lastIndexOf('.')
        val lastSlash = path.lastIndexOf('/')
        val noExt = if (dot > lastSlash) path.substring(0, dot) else path
        return noExt.replace(Regex("""[-_]\d+$"""), "")
    }
}
