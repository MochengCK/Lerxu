package com.lerxu.android.browser

/** 嗅探到的资源类型。 */
enum class SniffKind { VIDEO, AUDIO, FILE }

/** 嗅探到的资源条目（UI 列表与转交引擎共用）。 */
data class SniffedResource(
    val url: String,
    val kind: SniffKind,
    val extension: String = "",
    val mime: String = "",
    /** 字节数；0 = 未知（响应头里没有 Content-Length 是常态）。 */
    val size: Long = 0,
    val quality: String? = null,
    val pageUrl: String = "",
    val title: String = ""
) {
    /** 去重键（同一条资源的不同写法归一）。 */
    val dedupKey: String get() = VideoSniffer.normalizeForDedup(url)
}

/**
 * 资源嗅探规则（与桌面端浏览器扩展同一套口径）。
 *
 * 全部是纯函数 + 常量，便于单测；采集通道（[INJECT_JS] 与
 * WebView 的请求回调）只负责把原始 url/mime/size 丢进来。
 *
 * 判定顺序与桌面端一致：先排除明显不是媒体的（图片/脚本/样式/埋点），
 * 再按扩展名、MIME、URL 里的 `mime_type=` 线索、已知分发域名 +
 * 路径关键词逐级放宽——逐级放宽是必需的，很多地址不带扩展名。
 */
object VideoSniffer {

    /** 可嗅探的媒体格式（视频 + 音频）。 */
    val mediaFormats: List<String> = listOf(
        "m4s", "mp4", "flv", "m3u8", "ts", "webm", "mkv", "mov", "avi", "wmv",
        "mpd", "ogv", "3gp", "m4v", "mpeg", "mp3", "m4a", "aac", "ogg", "wav",
        "flac", "opus"
    )

    /** 明确排除（绝不当媒体）。 */
    val excludeFormats: List<String> = listOf(
        "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico",
        "css", "js", "json", "xml", "html", "htm", "woff", "woff2", "ttf",
        "otf", "pdf", "txt"
    )

    /** 音频后缀：用于把媒体分成音/视频两栏。 */
    val audioFormats: List<String> = listOf(
        "mp3", "m4a", "aac", "ogg", "oga", "wav", "flac", "opus", "wma"
    )

    /** MIME → 扩展名（响应头给了 MIME 但没有扩展名时的兜底）。 */
    val mimeToExtension: Map<String, String> = mapOf(
        "video/mp4" to "mp4", "video/webm" to "webm", "video/ogg" to "ogv",
        "video/quicktime" to "mov", "video/x-msvideo" to "avi",
        "video/x-flv" to "flv", "video/x-matroska" to "mkv",
        "video/3gpp" to "3gp", "video/3gpp2" to "3g2", "video/mp2t" to "ts",
        "video/x-m4v" to "m4v", "video/x-mpeg" to "mpeg",
        "video/x-ms-wmv" to "wmv", "audio/mpeg" to "mp3", "audio/mp4" to "m4a",
        "audio/x-m4a" to "m4a", "audio/mp3" to "mp3", "audio/webm" to "webm",
        "audio/ogg" to "oga", "audio/wav" to "wav", "audio/x-wav" to "wav",
        "audio/x-ms-wma" to "wma", "audio/x-aac" to "aac", "audio/aac" to "aac",
        "audio/flac" to "flac", "audio/x-flac" to "flac", "audio/opus" to "opus",
        "audio/vorbis" to "ogg", "audio/x-vorbis" to "ogg",
        "application/x-mpegurl" to "m3u8", "application/vnd.apple.mpegurl" to "m3u8",
        "application/dash+xml" to "mpd"
    )

    /** URL 里 `?mime_type=` 之类的取值 → 扩展名（部分播放器接口只带这个线索）。 */
    val urlMimeTypes: Map<String, String> = mapOf(
        "video_mp4" to "mp4", "video_webm" to "webm", "video_ogg" to "ogv",
        "video_mov" to "mov", "video_avi" to "avi", "video_flv" to "flv",
        "video_mkv" to "mkv", "video_3gp" to "3gp", "video_3g2" to "3g2",
        "video_ts" to "ts", "video_m4v" to "m4v", "video_mpeg" to "mpeg",
        "video_wmv" to "wmv", "audio_mp3" to "mp3", "audio_m4a" to "m4a",
        "audio_aac" to "aac", "audio_ogg" to "ogg", "audio_wav" to "wav",
        "audio_wma" to "wma", "audio_webm" to "webm"
    )

    /**
     * 已知媒体分发域名（仅用于「没有扩展名也没有 MIME」时判断该不该收，
     * 是判定数据不是展示内容）。
     */
    val knownMediaHosts: List<String> = listOf(
        "bilivideo", "biliapi", "douyinvod", "douyinpic", "byteimg", "ixigua",
        "v.qq.com", "vv.video.qq.com", "qpic", "youku", "ykimg", "iqiyi",
        "qiyi", "mgtv", "kuaishou", "weibocdn", "sinaimg",
        "googlevideo", "ytimg", "akamaihd", "akamaized", "cloudfront",
        "fastly", "hwcdn", "ourdvsss", "wscloudcdn", "myqcloud", "aliyuncs"
    )

    /** 路径关键词（无扩展名时的启发式）。 */
    val pathKeywords: List<String> = listOf(
        "/video/", "/media/", "/stream/", "/vod/", "/play/", "/content/",
        "/clip/", "/movie/", "/audio/", "/sound/", "/music/"
    )

    /** 查询参数键（值是媒体类型线索，如 `?mime_type=video_mp4`）。 */
    val mimeQueryKeys: List<String> = listOf(
        "mime_type", "content_type", "media_type", "video_type", "format"
    )

    /** 噪音路径：埋点/统计/缩略图/头像等，命中直接丢。 */
    val noiseTokens: List<String> = listOf(
        "/log/", "/logs/", "/api/", "/stat", "analytics", "tracking",
        "beacon", "metric", "/thumb", "/poster/", "/avatar/", "/sprite/",
        "/captcha/", "/favicon"
    )

    /** 明确可下载（点链接即交给下载引擎）的扩展名。 */
    val downloadFormats: List<String> = listOf(
        "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst",
        "apk", "apks", "xapk", "exe", "msi", "dmg", "pkg", "deb", "rpm",
        "iso", "img", "bin", "pdf", "epub", "mobi", "azw3", "torrent"
    )

    // ─── 纯函数判定 ───

    /** 只取**路径**部分的扩展名（避免把域名里的点当扩展名）。 */
    fun extensionOf(url: String): String {
        val withoutQuery = url.substringBefore('#').substringBefore('?')
        val path = withoutQuery.substringAfter("://", withoutQuery).substringAfter('/')
        val last = path.substringAfterLast('/')
        val dot = last.lastIndexOf('.')
        if (dot <= 0 || dot == last.length - 1) return ""
        val ext = last.substring(dot + 1).lowercase()
        return if (ext.length in 1..5 && ext.all { it.isLetterOrDigit() }) ext else ""
    }

    fun extensionFromMime(mime: String?): String? {
        val m = mime?.substringBefore(';')?.trim()?.lowercase().orEmpty()
        return mimeToExtension[m]
    }

    /** URL 查询串里的媒体类型线索。 */
    fun extensionFromUrlHint(url: String): String? {
        val query = url.substringAfter('?', "")
        if (query.isEmpty()) return null
        for (pair in query.split('&')) {
            val key = pair.substringBefore('=', "").substringAfterLast('.').lowercase()
            if (key !in mimeQueryKeys) continue
            val value = pair.substringAfter('=', "").lowercase()
            if (value.isEmpty()) continue
            urlMimeTypes[value]?.let { return it }
            // 值本身就是扩展名的情况：mime_type=mp4
            if (value in mediaFormats) return value
        }
        return null
    }

    private fun isNoise(url: String): Boolean {
        val lower = url.lowercase()
        return noiseTokens.any { lower.contains(it) }
    }

    private fun hostOf(url: String): String =
        url.substringAfter("://", "").substringBefore('/').substringBefore(':').lowercase()

    private fun isKnownMediaHost(url: String): Boolean {
        val host = hostOf(url)
        return host.isNotEmpty() && knownMediaHosts.any { host.contains(it) }
    }

    fun isExcluded(url: String): Boolean = extensionOf(url) in excludeFormats

    /**
     * 是否把该地址当作嗅探结果收下。
     *
     * [mime] 来自响应头（可能为空）、[size] 来自 Content-Length（0 = 未知）。
     * `blob:` / `data:` 一律丢弃——它们是页面内部生成的临时地址，
     * 拿不到真实资源也无法交给引擎（与桌面端同口径）。
     */
    fun isMedia(url: String, mime: String? = null, size: Long = 0): Boolean {
        if (url.isBlank()) return false
        val lower = url.lowercase()
        if (lower.startsWith("blob:") || lower.startsWith("data:")) return false
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false
        if (isNoise(url)) return false

        // 明确的非媒体响应类型：页面、接口、脚本、样式。放在扩展名判定之前，
        // 否则形如 /video/123 的页面地址会被路径关键词误收进列表。
        // 注意不排除 text/plain —— 有些服务器就这么发 m3u8。
        val mimeLower = mime?.substringBefore(';')?.trim()?.lowercase().orEmpty()
        if (mimeLower.startsWith("text/html") || mimeLower.contains("json") ||
            mimeLower.contains("javascript") || mimeLower.startsWith("text/css")
        ) {
            return false
        }

        val ext = extensionOf(url)
        if (ext.isNotEmpty() && ext in excludeFormats) return false

        val mimeExt = extensionFromMime(mimeLower)

        if (ext.isNotEmpty() && ext in mediaFormats) return true
        if (mimeExt != null && mimeExt !in excludeFormats) return true
        // MIME 直通：即便不在白名单里，只要是媒体大类就收
        if (mimeLower.startsWith("video/") || mimeLower.startsWith("audio/")) return true
        if (mimeLower.contains("mpegurl") || mimeLower.contains("dash+xml") ||
            mimeLower.contains("mp2t") || mimeLower.contains("matroska") ||
            mimeLower.contains("webm") || mimeLower.contains("flv")
        ) {
            return true
        }
        if (extensionFromUrlHint(url) != null) return true
        if (isKnownMediaHost(url)) {
            // 已知分发域名：路径关键词或带尺寸线索时才收，避免把站点接口全收进来
            val path = url.substringAfter("://", "").lowercase()
            if (pathKeywords.any { path.contains(it) }) return true
            if (size > 0 && size >= MIN_TRUSTED_SIZE) return true
            return false
        }
        val pathLower = url.substringAfter("://", "").substringBefore('?').lowercase()
        return pathKeywords.any { pathLower.contains(it) }
    }

    /**
     * 已知分发域名下「凭体积也认」的下限：太小的一律不是媒体本体，
     * 只是接口返回或占位片段。
     */
    const val MIN_TRUSTED_SIZE: Long = 64 * 1024

    /** 分类：媒体按音/视频，其余算普通文件。 */
    fun classify(url: String, mime: String? = null): SniffKind {
        val ext = extensionOf(url).ifEmpty { extensionFromMime(mime) ?: extensionFromUrlHint(url).orEmpty() }
        if (ext in audioFormats) return SniffKind.AUDIO
        val mimeLower = mime?.lowercase().orEmpty()
        if (mimeLower.startsWith("audio/")) return SniffKind.AUDIO
        if (ext in mediaFormats || mimeLower.startsWith("video/")) return SniffKind.VIDEO
        return SniffKind.FILE
    }

    /** 从 URL 猜画质标签（纯粹给列表显示用，猜不出返回 null）。 */
    /**
     * B 站 DASH 分片名里的清晰度码。
     *
     * 它的地址末尾长这样：`.../xxx-1-30080.m4s` —— 那 5 位数就是 `30000 + qn`
     * （80 = 1080P、64 = 720P、32 = 480P…），音频流是 `-2-30280.m4s`（280 = 192K）。
     * 不认这个码，用户在一串 m4s 里根本分不清哪条是哪个清晰度（用户点名）。
     */
    private val bilivideoQuality: Map<String, String> = mapOf(
        "30127" to "8K", "30126" to "杜比视界", "30125" to "HDR", "30120" to "4K",
        "30116" to "1080P60", "30112" to "1080P+", "30080" to "1080P",
        "30074" to "720P60", "30064" to "720P", "30032" to "480P",
        "30016" to "360P", "30006" to "240P",
        "30280" to "192K", "30251" to "无损", "30250" to "杜比全景声",
        "30232" to "132K", "30216" to "64K"
    )

    /** B 站单文件地址上的 `qn=` 参数（DASH 分片没这个参数）。 */
    private val bilivideoQn: Map<Int, String> = mapOf(
        127 to "8K", 126 to "杜比视界", 125 to "HDR", 120 to "4K",
        116 to "1080P60", 112 to "1080P+", 80 to "1080P",
        74 to "720P60", 64 to "720P", 32 to "480P",
        16 to "360P", 6 to "240P"
    )

    fun qualityHint(url: String): String? {
        val lower = url.lowercase()
        // ── B 站：两种地址形状都要认，只认一种的话另一半地址一条都标不出来 ──
        // ① 单文件（flv/mp4）把清晰度放在查询串：`&qn=80`
        Regex("[?&]qn=(\\d+)").find(lower)?.groupValues?.get(1)?.toIntOrNull()
            ?.let { qn -> bilivideoQn[qn]?.let { return it } }
        // ② DASH 分片把清晰度码写进**文件名**：`-1-30080.m4s`。
        // 只在路径里找（查询串里是签名哈希，不碰它），命中的都是 B 站的清晰度码，
        // 别的站点几乎不可能撞上这几个五位数
        val path = lower.substringBefore('?')
        bilivideoQuality.entries.firstOrNull { path.contains(it.key) }?.let { return it.value }
        val table = listOf(
            "2160" to "2160P", "1440" to "1440P", "1080" to "1080P",
            "720" to "720P", "480" to "480P", "360" to "360P"
        )
        table.firstOrNull { lower.contains(it.first) }?.let { return it.second }
        return when {
            Regex("[_\\-.]hd[_.\\-/]").containsMatchIn(lower) -> "HD"
            Regex("[_\\-.]sd[_.\\-/]").containsMatchIn(lower) -> "SD"
            else -> null
        }
    }

    /**
     * 去重键：`协议//主机/路径`（丢查询串）。
     *
     * 同一资源常带一堆易变参数（时间戳 / 令牌 / 分片序号），
     * 不丢查询串会在列表里出现十几条重复项。
     */
    fun normalizeForDedup(url: String): String {
        val noFragment = url.substringBefore('#')
        val schemeEnd = noFragment.indexOf("://")
        if (schemeEnd < 0) return noFragment.substringBefore('?')
        val scheme = noFragment.substring(0, schemeEnd + 3)
        val rest = noFragment.substring(schemeEnd + 3).substringBefore('?')
        return scheme + rest
    }

    /** 去重 + 保留信息更全的一条（大小更大 / 画质更明确者优先）。 */
    fun dedupe(items: List<SniffedResource>): List<SniffedResource> {
        val best = LinkedHashMap<String, SniffedResource>()
        for (item in items) {
            val key = item.dedupKey
            val old = best[key]
            best[key] = when {
                old == null -> item
                item.size > old.size -> item
                item.size == old.size && item.quality != null && old.quality == null -> item
                else -> old
            }
        }
        return best.values.toList()
    }

    /** 明确的下载链接 → 交给引擎（扩展名白名单）。 */
    fun isDownloadLink(url: String): Boolean {
        val lower = url.lowercase()
        if (lower.startsWith("magnet:") || lower.startsWith("ed2k://") ||
            lower.startsWith("thunder://")
        ) {
            return true
        }
        val ext = extensionOf(url)
        return ext.isNotEmpty() && ext in downloadFormats
    }

    /** 从 URL 推导文件名（路径最后一段；空则返回空串）。 */
    fun fileNameFromUrl(url: String): String {
        val cleaned = url.substringBefore('#').substringBefore('?')
        val last = cleaned.substringAfterLast('/')
        if (last.isEmpty()) return ""
        val name = try {
            java.net.URLDecoder.decode(last, "UTF-8")
        } catch (_: Exception) {
            last
        }
        return name.trim()
    }

    // ─── 注入脚本 ───

    /**
     * 采集脚本：PerformanceObserver + patch fetch/XHR + 媒体元素扫描，
     * 把 url/mime/size 回传给 `window.LerxuSniffer.push`。
     *
     * 与桌面扩展同口径：只采地址与元信息，不读取响应体；
     * `blob:` / `data:` 直接丢（临时地址，引擎拿不到）。
     */
    val INJECT_JS: String = """
(function () {
  if (window.__lerxuSnifferInstalled) { return; }
  window.__lerxuSnifferInstalled = true;
  var seen = {};
  function send(url, mime, size) {
    try {
      if (!url || typeof url !== 'string') { return; }
      if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) { return; }
      if (url.indexOf('http') !== 0) { return; }
      if (seen[url]) { return; }
      seen[url] = 1;
      window.LerxuSniffer.push(JSON.stringify({
        url: url,
        mime: mime || '',
        size: size || 0,
        page: location.href,
        title: document.title || ''
      }));
    } catch (e) { }
  }
  function scanResources() {
    try {
      var list = performance.getEntriesByType('resource') || [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        send(e.name, '', e.transferSize || e.encodedBodySize || 0);
      }
    } catch (e) { }
  }
  try {
    scanResources();
    if (window.PerformanceObserver) {
      var po = new PerformanceObserver(function () { scanResources(); });
      po.observe({ entryTypes: ['resource'] });
    }
  } catch (e) { }
  try {
    var rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__lerxuUrl = url; } catch (e) { }
      return rawOpen.apply(this, arguments);
    };
    var rawSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      try {
        xhr.addEventListener('loadend', function () {
          var mime = '', size = 0;
          try { mime = xhr.getResponseHeader('Content-Type') || ''; } catch (e) { }
          try { size = parseInt(xhr.getResponseHeader('Content-Length') || '0', 10) || 0; } catch (e) { }
          send(xhr.__lerxuUrl || xhr.responseURL || '', mime, size);
        });
      } catch (e) { }
      return rawSend.apply(this, arguments);
    };
  } catch (e) { }
  try {
    var rawFetch = window.fetch;
    if (rawFetch) {
      window.fetch = function () {
        var args = arguments;
        var url = '';
        try {
          url = (typeof args[0] === 'string') ? args[0] : ((args[0] && args[0].url) || '');
        } catch (e) { }
        return rawFetch.apply(this, args).then(function (resp) {
          try {
            var mime = (resp.headers && resp.headers.get('Content-Type')) || '';
            var size = parseInt((resp.headers && resp.headers.get('Content-Length')) || '0', 10) || 0;
            send(resp.url || url, mime, size);
          } catch (e) { }
          return resp;
        });
      };
    }
  } catch (e) { }
  function scanTags() {
    try {
      var nodes = document.querySelectorAll('video, audio, video source, audio source');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var isAudio = (n.tagName || '').toLowerCase() === 'audio';
        if (n.currentSrc) { send(n.currentSrc, isAudio ? 'audio/' : 'video/', 0); }
        if (n.src) { send(n.src, isAudio ? 'audio/' : 'video/', 0); }
      }
    } catch (e) { }
  }
  try {
    scanTags();
    setInterval(scanTags, 1500);
    document.addEventListener('loadeddata', scanTags, true);
    document.addEventListener('play', scanTags, true);
  } catch (e) { }
})();
""".trimIndent()
}
