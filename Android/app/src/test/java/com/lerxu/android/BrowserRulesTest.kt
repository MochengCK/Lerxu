package com.lerxu.android

import com.lerxu.android.browser.BrowserUrl
import com.lerxu.android.browser.SearchEnginePick
import com.lerxu.android.browser.SearchEngines
import com.lerxu.android.browser.SniffKind
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.browser.PullRefreshGlyph
import com.lerxu.android.browser.TabNaming
import com.lerxu.android.browser.VideoSniffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 内置浏览器的纯逻辑：地址栏解析、搜索引擎首启判定、嗅探规则、
 * 下载链接识别、文件名推导。
 *
 * 这些都抽成了纯函数，就是为了能在 JVM 上钉死行为——规则一旦回退，
 * 用户侧的体感是「地址栏搜出来的东西不对」「资源列表空空如也」或
 * 「点下载没反应」，很难从现象反推。
 */
class BrowserRulesTest {

    private val bing = SearchEngines.byKey(SearchEngines.KEY_BING)
    private val google = SearchEngines.byKey(SearchEngines.KEY_GOOGLE)

    // ─── 地址栏：像地址就打开，否则搜索 ───

    @Test
    fun `plain words become a search query`() {
        assertEquals(
            "https://www.bing.com/search?q=%E7%8C%AB",
            BrowserUrl.toUrl("猫", bing)
        )
    }

    @Test
    fun `spaces in a query are percent encoded not plus signed`() {
        val url = BrowserUrl.toUrl("how to code", bing)!!
        assertTrue(url, url.contains("q=how%20to%20code"))
        assertFalse(url, url.contains("+"))
    }

    @Test
    fun `bare domain gets https prefix`() {
        assertEquals("https://example.com", BrowserUrl.toUrl("example.com", bing))
    }

    @Test
    fun `full url is passed through untouched`() {
        val raw = "https://example.com/a/b?c=1&d=2#frag"
        assertEquals(raw, BrowserUrl.toUrl(raw, bing))
    }

    @Test
    fun `domain looking strings are urls and phrases are not`() {
        assertTrue(BrowserUrl.looksLikeUrl("example.com"))
        assertTrue(BrowserUrl.looksLikeUrl("www.example.co.uk/path"))
        assertTrue(BrowserUrl.looksLikeUrl("192.168.1.1:8080"))
        assertTrue(BrowserUrl.looksLikeUrl("localhost:3000"))
        assertTrue(BrowserUrl.looksLikeUrl("magnet:?xt=urn:btih:abc"))
        assertFalse(BrowserUrl.looksLikeUrl("hello world"))
        assertFalse(BrowserUrl.looksLikeUrl("猫 视频"))
        assertFalse(BrowserUrl.looksLikeUrl("what is 1.5 plus 2"))
        assertFalse(BrowserUrl.looksLikeUrl(""))
    }

    @Test
    fun `blank input yields no url`() {
        assertNull(BrowserUrl.toUrl("   ", bing))
    }

    @Test
    fun `search goes through the selected engine`() {
        assertEquals(
            "https://www.google.com/search?q=cat",
            BrowserUrl.toUrl("cat", google)
        )
    }

    // ─── 首启按网络自动选择 ───

    @Test
    fun `region engine wins when google is unreachable`() {
        val choice = SearchEnginePick.pick("CN", googleReachable = false, hasNetwork = true)
        assertEquals(SearchEngines.KEY_BING, choice.key)
        assertEquals(SearchEnginePick.Reason.REGION, choice.reason)
    }

    @Test
    fun `reachable google is preferred regardless of region`() {
        val choice = SearchEnginePick.pick("CN", googleReachable = true, hasNetwork = true)
        assertEquals(SearchEngines.KEY_GOOGLE, choice.key)
        assertEquals(SearchEnginePick.Reason.REACHABLE, choice.reason)
    }

    @Test
    fun `offline falls back to the region engine`() {
        val cn = SearchEnginePick.pick("CN", googleReachable = false, hasNetwork = false)
        assertEquals(SearchEngines.KEY_BING, cn.key)
        assertEquals(SearchEnginePick.Reason.OFFLINE, cn.reason)
    }

    @Test
    fun `unknown region with no google reachability uses the neutral fallback`() {
        val choice = SearchEnginePick.pick("FR", googleReachable = false, hasNetwork = true)
        assertEquals(SearchEngines.FALLBACK_KEY, choice.key)
        assertEquals(SearchEnginePick.Reason.FALLBACK, choice.reason)
    }

    @Test
    fun `region hints cover the engines that declare them`() {
        // 内置目录只有两个引擎：必应声明 CN，其余地区码没有区域引擎
        assertEquals(SearchEngines.KEY_BING, SearchEngines.regionEngineKey("cn"))
        assertNull(SearchEngines.regionEngineKey("RU"))
        assertNull(SearchEngines.regionEngineKey("FR"))
        assertNull(SearchEngines.regionEngineKey(null))
    }

    @Test
    fun `unknown key resolves to the fallback engine`() {
        assertEquals(SearchEngines.FALLBACK_KEY, SearchEngines.byKey("nope").key)
        assertEquals(SearchEngines.FALLBACK_KEY, SearchEngines.byKey(null).key)
    }

    /**
     * 引擎选择已从本地首页挪进底部坞的引擎选择框：选择框直接遍历
     * SearchEngines 目录（单一来源，不存在清单漂移）。首页里再自带一份
     * 引擎清单就是第二处真相，改目录时必然忘同步 —— 这条测试盯住它。
     */
    @Test
    fun `home page keeps no engine catalog of its own`() {
        val candidates = listOf(
            "src/main/assets/browser-home.html",
            "app/src/main/assets/browser-home.html"
        )
        val file = candidates.map { File(it) }.firstOrNull { it.exists() }
            ?: error("找不到 browser-home.html（工作目录：${File(".").absolutePath}）")
        val html = file.readText()
        assertFalse("首页不该再自带引擎清单", html.contains("key: '"))
        assertFalse("首页不该再有引擎标签 DOM", html.contains("id=\"chips\""))
    }

    @Test
    fun `every engine template has exactly one placeholder`() {
        SearchEngines.all.forEach { engine ->
            assertEquals(engine.key, 1, engine.searchUrl.split("%s").size - 1)
        }
        // key 是持久化标识，重复会导致用户选择指向不确定的引擎
        assertEquals(SearchEngines.all.size, SearchEngines.all.map { it.key }.toSet().size)
    }

    // ─── 嗅探规则 ───

    @Test
    fun `media extensions are sniffed`() {
        assertTrue(VideoSniffer.isMedia("https://a.com/v.mp4"))
        assertTrue(VideoSniffer.isMedia("https://a.com/stream/index.m3u8?token=1"))
        assertTrue(VideoSniffer.isMedia("https://a.com/a/b.MP4"))
        assertTrue(VideoSniffer.isMedia("https://a.com/sound.mp3"))
    }

    @Test
    fun `non media assets are rejected`() {
        assertFalse(VideoSniffer.isMedia("https://a.com/logo.png"))
        assertFalse(VideoSniffer.isMedia("https://a.com/app.js"))
        assertFalse(VideoSniffer.isMedia("https://a.com/style.css"))
        assertFalse(VideoSniffer.isMedia("https://a.com/data.json"))
        assertFalse(VideoSniffer.isMedia("https://a.com/page.html"))
    }

    @Test
    fun `temporary browser urls are dropped`() {
        assertFalse(VideoSniffer.isMedia("blob:https://a.com/1234-5678"))
        assertFalse(VideoSniffer.isMedia("data:video/mp4;base64,AAAA"))
    }

    @Test
    fun `tracking and thumbnail paths are dropped`() {
        assertFalse(VideoSniffer.isMedia("https://a.com/api/stat?v=1"))
        assertFalse(VideoSniffer.isMedia("https://a.com/analytics/pixel.mp4"))
        assertFalse(VideoSniffer.isMedia("https://a.com/thumb/1"))
    }

    @Test
    fun `mime type from the response header is trusted`() {
        assertTrue(VideoSniffer.isMedia("https://a.com/no-extension", "video/mp4"))
        assertTrue(VideoSniffer.isMedia("https://a.com/play", "application/x-mpegURL"))
        assertTrue(VideoSniffer.isMedia("https://a.com/audio", "audio/mpeg"))
        // 页面与接口的 MIME 不能把地址带进列表
        assertFalse(VideoSniffer.isMedia("https://a.com/video/123", "text/html"))
        assertFalse(VideoSniffer.isMedia("https://a.com/video/123", "application/json"))
    }

    @Test
    fun `mime_type query hint is honored`() {
        assertTrue(VideoSniffer.isMedia("https://a.com/play?id=1&mime_type=video_mp4"))
    }

    @Test
    fun `known distribution hosts need a path or size hint`() {
        assertTrue(VideoSniffer.isMedia("https://xxx.bilivideo.com/video/1"))
        // 已知域名但既无路径线索也无体积：只当接口，不收
        assertFalse(VideoSniffer.isMedia("https://xxx.bilivideo.com/getconf?id=1"))
        assertTrue(
            VideoSniffer.isMedia(
                "https://xxx.bilivideo.com/getconf?id=1", size = 512 * 1024
            )
        )
    }

    @Test
    fun `path keywords catch extensionless media urls`() {
        assertTrue(VideoSniffer.isMedia("https://a.com/stream/abcdef"))
    }

    @Test
    fun `extension is read from the path only`() {
        assertEquals("mp4", VideoSniffer.extensionOf("https://a.com/a/b.mp4?x=1"))
        assertEquals("m3u8", VideoSniffer.extensionOf("https://a.com/x/index.m3u8#t=3"))
        // 域名里的点不算扩展名
        assertEquals("", VideoSniffer.extensionOf("https://img.example.com/a.b/logo"))
        assertEquals("", VideoSniffer.extensionOf("https://a.com/dir/"))
    }

    @Test
    fun `kind separates audio from video`() {
        assertEquals(SniffKind.VIDEO, VideoSniffer.classify("https://a.com/v.mp4"))
        assertEquals(SniffKind.AUDIO, VideoSniffer.classify("https://a.com/s.mp3"))
        assertEquals(SniffKind.AUDIO, VideoSniffer.classify("https://a.com/x", "audio/mpeg"))
        assertEquals(SniffKind.VIDEO, VideoSniffer.classify("https://a.com/x", "video/mp4"))
    }

    @Test
    fun `dedup key ignores volatile query parameters`() {
        assertEquals(
            VideoSniffer.normalizeForDedup("https://a.com/v.mp4?t=1"),
            VideoSniffer.normalizeForDedup("https://a.com/v.mp4?t=2")
        )
        assertEquals(
            VideoSniffer.normalizeForDedup("https://a.com/v.mp4"),
            VideoSniffer.normalizeForDedup("https://a.com/v.mp4#frag")
        )
    }

    @Test
    fun `dedupe keeps the entry with the larger known size`() {
        val small = SniffedResource("https://a.com/v.mp4?t=1", SniffKind.VIDEO, "mp4", size = 0)
        val big = SniffedResource("https://a.com/v.mp4?t=2", SniffKind.VIDEO, "mp4", size = 1024)
        val out = VideoSniffer.dedupe(listOf(small, big))
        assertEquals(1, out.size)
        assertEquals(1024L, out[0].size)
    }

    @Test
    fun `quality hint is derived from the path`() {
        assertEquals("1080P", VideoSniffer.qualityHint("https://a.com/v_1080p.mp4"))
        assertEquals("720P", VideoSniffer.qualityHint("https://a.com/hd/720/x.mp4"))
        assertNull(VideoSniffer.qualityHint("https://a.com/v.mp4"))
    }

    // ─── 下载链接与文件名 ───

    @Test
    fun `download links are recognised`() {
        assertTrue(VideoSniffer.isDownloadLink("https://a.com/pack.zip"))
        assertTrue(VideoSniffer.isDownloadLink("https://a.com/setup.exe"))
        assertTrue(VideoSniffer.isDownloadLink("https://a.com/app-release.apk"))
        assertTrue(VideoSniffer.isDownloadLink("magnet:?xt=urn:btih:abc"))
        assertTrue(VideoSniffer.isDownloadLink("thunder://QUFo"))
        // 媒体地址走嗅探入口，不算「点链接就下」
        assertFalse(VideoSniffer.isDownloadLink("https://a.com/v.mp4"))
        assertFalse(VideoSniffer.isDownloadLink("https://a.com/page.html"))
    }

    @Test
    fun `file name comes from the url and is decoded`() {
        assertEquals("v.mp4", VideoSniffer.fileNameFromUrl("https://a.com/a/b/v.mp4?sig=1"))
        assertEquals("中文.zip", VideoSniffer.fileNameFromUrl("https://a.com/%E4%B8%AD%E6%96%87.zip"))
        assertEquals("", VideoSniffer.fileNameFromUrl("https://a.com/"))
    }

    // ─── 注入脚本 ───

    @Test
    fun `injected script is idempotent and skips temporary urls`() {
        val js = VideoSniffer.INJECT_JS
        assertTrue(js.contains("__lerxuSnifferInstalled"))
        assertTrue(js.contains("blob:"))
        assertTrue(js.contains("LerxuSniffer.push"))
        // 采集通道齐备：资源计时、XHR、fetch、媒体元素
        assertTrue(js.contains("PerformanceObserver"))
        assertTrue(js.contains("XMLHttpRequest.prototype.open"))
        assertTrue(js.contains("window.fetch"))
        assertTrue(js.contains("querySelectorAll('video, audio, video source, audio source')"))
    }
}

/**
 * 标签页卡片的文案推导（`TabNaming`）。
 *
 * 这几条覆盖的是「卡片上会显示什么」：标题优先用页面标题，没有就退到域名，
 * 本地页没有可读地址时不显示副标题 —— 全都与 Android 组件无关，纯函数可测。
 */
class TabNamingTest {

    @Test
    fun `title prefers page title then host then fallback`() {
        assertEquals("Lerxu", TabNaming.title("Lerxu", "https://a.com/x", "新标签页"))
        assertEquals("a.com", TabNaming.title("   ", "https://a.com/x", "新标签页"))
        assertEquals("新标签页", TabNaming.title("", "", "新标签页"))
        // 自家首页（file://）没有域名可退，落到兜底文案
        assertEquals("新标签页", TabNaming.title("", "file:///android_asset/browser-home.html", "新标签页"))
    }

    @Test
    fun `subtitle drops scheme and leading www`() {
        assertEquals("a.com/b", TabNaming.subtitle("https://www.a.com/b/"))
        assertEquals("a.com", TabNaming.subtitle("http://a.com"))
        // 本地页面 / 空地址没有可读地址
        assertEquals("", TabNaming.subtitle("file:///android_asset/browser-home.html"))
        assertEquals("", TabNaming.subtitle("about:blank"))
        assertEquals("", TabNaming.subtitle(""))
    }

    @Test
    fun `host keeps explicit port and tolerates junk`() {
        assertEquals("a.com", TabNaming.host("https://a.com/x"))
        assertEquals("a.com:8080", TabNaming.host("http://a.com:8080/x"))
        assertEquals("", TabNaming.host("not a url"))
        assertEquals("", TabNaming.host(""))
    }
}


/**
 * 下拉刷新指示器的几何（`PullRefreshGlyph`）。
 *
 * 这里钉的是「看起来是不是一次连续生长」这件事 —— 出问题的现象是
 * 松手前后指示器会**跳一下**、或箭头突然出现，而这类问题在真机上
 * 只能靠眼睛发现、靠肉眼描述，很难定位。把几何定死，就等于把
 * 「弧从尾端长出来、箭头从零展开」这两个不变量定死了。
 */
class PullRefreshGlyphTest {

    private val eps = 0.001f

    private fun norm(p: PullRefreshGlyph.Point) = kotlin.math.sqrt(p.x * p.x + p.y * p.y)

    @Test
    fun `arc grows from nothing and is complete before release`() {
        // 起点：没有弧
        assertEquals(0f, PullRefreshGlyph.arc(0f).sweepDeg, eps)
        // 长满发生在 RING_DONE，此后不再变（最后那段行程留给箭头展开）
        assertEquals(
            PullRefreshGlyph.ARC_SWEEP_DEG,
            PullRefreshGlyph.arc(PullRefreshGlyph.RING_DONE).sweepDeg,
            eps
        )
        assertEquals(
            PullRefreshGlyph.ARC_SWEEP_DEG,
            PullRefreshGlyph.arc(1f).sweepDeg,
            eps
        )
    }

    @Test
    fun `arc tail stays pinned so the ring unrolls instead of sliding`() {
        // 不变量：尾端恒在 -60°。尾端不动才读得出「从右上长出来」，
        // 否则就是一段弧在环上平移。
        for (i in 0..20) {
            val arc = PullRefreshGlyph.arc(i / 20f)
            assertEquals(PullRefreshGlyph.ARC_TIP_DEG, arc.startDeg + arc.sweepDeg, eps)
        }
    }

    @Test
    fun `arc length never decreases while pulling`() {
        var last = -1f
        for (i in 0..40) {
            val sweep = PullRefreshGlyph.arc(i / 40f).sweepDeg
            assertTrue("进度变大时弧不能回缩: $sweep < $last", sweep >= last - eps)
            last = sweep
        }
    }

    @Test
    fun `head does not exist until the ring is nearly done`() {
        assertNull(PullRefreshGlyph.head(0f, 100f))
        assertNull(PullRefreshGlyph.head(PullRefreshGlyph.HEAD_START, 100f))
        assertTrue(PullRefreshGlyph.head(1f, 100f) != null)
    }

    @Test
    fun `head grows out of the arc tip along the direction of rotation`() {
        val radius = 100f
        val tip = PullRefreshGlyph.Point(
            x = (radius * kotlin.math.cos(Math.toRadians(PullRefreshGlyph.ARC_TIP_DEG.toDouble()))).toFloat(),
            y = (radius * kotlin.math.sin(Math.toRadians(PullRefreshGlyph.ARC_TIP_DEG.toDouble()))).toFloat()
        )
        // 顺时针切向单位向量
        val tx = -tip.y / radius
        val ty = tip.x / radius

        var lastApexAhead = -1f
        // 进度**递增**着走：断言的是"只能长大"，循环方向反了就成了在测收缩
        for (i in 0..10) {
            val progress = PullRefreshGlyph.HEAD_START +
                i / 10f * (1f - PullRefreshGlyph.HEAD_START)
            val head = PullRefreshGlyph.head(progress, radius) ?: continue
            // 顶点：在弧尾的**顺时针前方**（指向旋转方向）
            val apexAhead = (head.apex.x - tip.x) * tx + (head.apex.y - tip.y) * ty
            assertTrue("箭头应指向旋转方向: $apexAhead", apexAhead > 0f)
            // 底边：落在弧尾**后方**一点点，与弧接上
            listOf(head.baseA, head.baseB).forEach { base ->
                val behind = (base.x - tip.x) * tx + (base.y - tip.y) * ty
                assertTrue("箭头底边应贴住弧尾: $behind", behind <= eps)
            }
            // 尺寸随进度单调长大（就是「展开」而不是「换图标」）
            assertTrue("箭头只能长大: $apexAhead vs $lastApexAhead", apexAhead >= lastApexAhead - eps)
            lastApexAhead = apexAhead
        }
    }

    @Test
    fun `head stays inside the container circle`() {
        // 画布半径比容器小得多，但底边两角会往外撑 —— 这里给个上界，
        // 免得以后调参数把箭头甩到容器外被裁掉。
        val radius = 100f
        val head = PullRefreshGlyph.head(1f, radius)!!
        val maxNorm = maxOf(norm(head.apex), norm(head.baseA), norm(head.baseB))
        assertTrue("箭头超出容器的安全范围: $maxNorm", maxNorm <= radius * 1.4f)
    }

    @Test
    fun `accent fades in near the end instead of switching on`() {
        assertEquals(0f, PullRefreshGlyph.accent(PullRefreshGlyph.ACCENT_START), eps)
        assertEquals(1f, PullRefreshGlyph.accent(1f), eps)
        var last = -1f
        for (i in 0..20) {
            val a = PullRefreshGlyph.accent(i / 20f)
            assertTrue(a >= last - eps)
            last = a
        }
    }

    @Test
    fun `alpha is fully on well before the release threshold`() {
        // 下拉一点就该看见指示器；同时收尾时 alpha 会先归零，
        // 之后的收形动作看不见 —— 退场不会被看成一段干瘪的收线
        assertEquals(0f, PullRefreshGlyph.alpha(0f), eps)
        assertTrue(PullRefreshGlyph.alpha(0.4f) >= 1f - eps)
        assertEquals(1f, PullRefreshGlyph.alpha(1f), eps)
    }

    @Test
    fun `smoothStep clamps at both ends`() {
        assertEquals(0f, PullRefreshGlyph.smoothStep(0f, 1f, -1f), eps)
        assertEquals(1f, PullRefreshGlyph.smoothStep(0f, 1f, 2f), eps)
        assertEquals(0.5f, PullRefreshGlyph.smoothStep(0f, 1f, 0.5f), eps)
    }
}
