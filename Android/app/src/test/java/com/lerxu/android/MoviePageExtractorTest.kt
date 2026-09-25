package com.lerxu.android

import com.lerxu.android.browser.MoviePageExtractor
import com.lerxu.android.browser.MoviePageExtractor.MAX_BADGE
import com.lerxu.android.browser.MoviePageExtractor.MAX_CARDS
import com.lerxu.android.browser.MoviePageExtractor.MAX_NAV
import com.lerxu.android.browser.MoviePageExtractor.MAX_NAV_TEXT
import com.lerxu.android.browser.MoviePageExtractor.MAX_SECTIONS
import com.lerxu.android.browser.MoviePageExtractor.MAX_TITLE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 影视模式页面提取的**清洗规则**（[MoviePageExtractor]）。
 *
 * 页面侧的 JS 抓不到就抓不到（最多重建出来是空的，用户点一下刷新），真正会"错"的是
 * Kotlin 这一侧：放进来一条 `javascript:` 地址、一条指向本页的导航、一段和主列表完全
 * 重合的"猜你喜欢"，用户侧看到的都是坏 UI（点了没反应 / 原地刷新 / 同一排片子出现两次）。
 * 所以这里把每条剔除规则都钉死。
 *
 * 识别判据那一套在 [MovieModeTest]，两者口径不同、互不影响。
 */
class MoviePageExtractorTest {

    private val page = "https://movie.example.com/vod/detail/123.html"

    private fun card(title: String, url: String, cover: String = "https://img.example.com/a.jpg", badge: String = ""): String =
        """{"title":"$title","url":"$url","cover":"$cover","badge":"$badge"}"""

    private fun nav(text: String, url: String): String = """{"text":"$text","url":"$url"}"""

    private fun page(
        nav: String = "",
        cards: String = "",
        sections: String = "",
        url: String = "https://movie.example.com/vod/detail/123.html",
        mainTitle: String = ""
    ): String =
        """{"url":"$url","pageTitle":"标题","mainTitle":"$mainTitle","nav":[$nav],"cards":[$cards],"sections":[$sections]}"""

    // ────────────────────────── 坏输入 ──────────────────────────

    @Test
    fun `broken json never throws and yields null`() {
        assertNull(MoviePageExtractor.parse(null, page))
        assertNull(MoviePageExtractor.parse("", page))
        assertNull(MoviePageExtractor.parse("   ", page))
        assertNull(MoviePageExtractor.parse("null", page))
        assertNull(MoviePageExtractor.parse("not json at all", page))
        assertNull(MoviePageExtractor.parse("{\"cards\": \"oops\"}", page))
    }

    @Test
    fun `empty object parses into empty data not null`() {
        // "页面确实没有可重建的内容"与"这一拍没读到"是两件事：前者要留着 url 和当前页比对
        val data = MoviePageExtractor.parse("{}", page)
        assertNotNull(data)
        assertTrue(data!!.cards.isEmpty())
        assertTrue(data.nav.isEmpty())
        assertTrue(data.sections.isEmpty())
    }

    @Test
    fun `unknown fields are ignored`() {
        val withExtra = MoviePageExtractor.parse(
            """{"url":"$page","cards":[{"title":"片名","url":"/vod/1.html","something":"new"}],"extra":1}""",
            page
        )
        assertNotNull(withExtra)
        assertEquals(1, withExtra!!.cards.size)
    }

    // ────────────────────────── 卡片 ──────────────────────────

    @Test
    fun `cards without title or url are dropped`() {
        val data = MoviePageExtractor.parse(
            page(cards = listOf(card("", "/vod/1.html"), card("有名字", ""), card("好的", "/vod/2.html")).joinToString(",")),
            page
        )
        assertEquals(listOf("好的"), data!!.cards.map { it.title })
    }

    @Test
    fun `javascript and data urls are dropped`() {
        val data = MoviePageExtractor.parse(
            page(cards = listOf(card("A", "javascript:void(0)"), card("B", "data:text/html,x")).joinToString(",")),
            page
        )
        assertTrue(data!!.cards.isEmpty())
    }

    @Test
    fun `relative hrefs are resolved against the page`() {
        val data = MoviePageExtractor.parse(page(cards = card("片名", "/vod/9.html")), page)
        assertEquals("https://movie.example.com/vod/9.html", data!!.cards.single().url)
    }

    @Test
    fun `cover may be missing but the card stays`() {
        val data = MoviePageExtractor.parse(
            page(cards = """{"title":"片名","url":"/vod/9.html","cover":"javascript:void(0)"}"""),
            page
        )
        val card = data!!.cards.single()
        assertEquals("", card.cover)
        assertEquals("https://movie.example.com/vod/9.html", card.url)
    }

    @Test
    fun `card counts titles and badges are truncated`() {
        val many = (1..MAX_CARDS + 1).joinToString(",") { card("片$it", "/vod/$it.html") }
        val data = MoviePageExtractor.parse(page(cards = many), page)
        assertEquals(MAX_CARDS, data!!.cards.size)

        val long = "名".repeat(MAX_TITLE + 20)
        val longBadge = "1080P超清国语中字加长版"
        val one = MoviePageExtractor.parse(
            page(cards = """{"title":"$long","url":"/vod/1.html","badge":"$longBadge"}"""),
            page
        )
        assertEquals(MAX_TITLE, one!!.cards.single().title.length)
        assertEquals(MAX_BADGE, one.cards.single().badge.length)
    }

    @Test
    fun `zero width characters and messy whitespace are folded`() {
        val title = "片\u200B名  第 一 \uFEFF季"
        val data = MoviePageExtractor.parse(
            page(cards = """{"title":"$title","url":"/vod/1.html"}"""),
            page
        )
        assertEquals("片名 第 一 季", data!!.cards.single().title)
    }

    @Test
    fun `duplicate cards are collapsed by url`() {
        val data = MoviePageExtractor.parse(
            page(cards = listOf(card("A", "/vod/1.html"), card("A 换个名字", "/vod/1.html")).joinToString(",")),
            page
        )
        assertEquals(1, data!!.cards.size)
    }

    // ────────────────────────── 导航 ──────────────────────────

    @Test
    fun `nav items pointing at the current page are dropped`() {
        val data = MoviePageExtractor.parse(
            page(nav = listOf(nav("首页", "/"), nav("本页", "/vod/detail/123.html?x=1"), nav("电影", "/vod/type/1.html")).joinToString(",")),
            page
        )
        assertEquals(listOf("首页", "电影"), data!!.nav.map { it.text })
    }

    @Test
    fun `nav text is truncated and count capped`() {
        val long = "很长的分类名字号".repeat(4)
        val many = (1..MAX_NAV + 3).joinToString(",") { nav("分类$it", "/type/$it.html") }
        // 长的放最前面：截断是按"先来先留"取的，放末尾会被 MAX_NAV 截掉、断言就没意义了
        val data = MoviePageExtractor.parse(
            page(nav = listOf(nav(long, "/type/x.html"), many).joinToString(",")),
            page
        )
        assertEquals(MAX_NAV, data!!.nav.size)
        assertEquals(MAX_NAV_TEXT, data.nav.first { it.url.endsWith("/type/x.html") }.text.length)
    }

    // ────────────────────────── 推荐区块 ──────────────────────────

    @Test
    fun `sections fully contained in the main list are dropped`() {
        val mainCards = (1..4).joinToString(",") { card("片$it", "/vod/$it.html") }
        // 卡片**全在主内容墙里** → 那是主内容墙被再抄一遍（实测"推荐阅读"就是这种）
        val sameWall =
            """{"title":"推荐阅读","cards":[${card("片1", "/vod/1.html")},${card("片2", "/vod/2.html")},${card("片3", "/vod/3.html")},${card("片4", "/vod/4.html")}]}"""
        // 只是有重叠 → 留着（站点本来就常把同一批片子既放主列表又放"猜你喜欢"）
        val overlap =
            """{"title":"猜你喜欢","cards":[${card("片1", "/vod/1.html")},${card("新片", "/vod/9.html")}]}"""
        val data = MoviePageExtractor.parse(
            page(cards = mainCards, sections = "$sameWall,$overlap"),
            page
        )
        assertEquals(listOf("猜你喜欢"), data!!.sections.map { it.title })
    }

    @Test
    fun `cards pointing to other sites are dropped`() {
        // 影视站的广告位（第三方域名）遍地都是：不挡就会混进内容墙与推荐区
        val data = MoviePageExtractor.parse(
            page(
                cards = listOf(
                    card("真片", "/vod/1.html"),
                    card("广告位", "https://59168.wang/x.html")
                ).joinToString(",")
            ),
            page
        )
        assertEquals(listOf("真片"), data!!.cards.map { it.title })
    }

    @Test
    fun `nav items whose text is icon font junk are dropped`() {
        // 图标字体那种链接的文本是私用区码点：读出来一片空白、点了却会跳页（用户看到的"空白选项"）
        val junk = nav("\uE600\uE601", "/type/junk.html")
        val data = MoviePageExtractor.parse(
            page(nav = listOf(junk, nav("电影", "/type/1.html"), nav("连续剧", "/type/2.html")).joinToString(",")),
            page
        )
        assertEquals(listOf("电影", "连续剧"), data!!.nav.map { it.text })
    }

    @Test
    fun `single card sections and section overflow are dropped`() {
        val one = """{"title":"猜你喜欢","cards":[${card("孤零零", "/vod/x.html")}]}"""
        val many = (1..MAX_SECTIONS + 2).joinToString(",") { i ->
            """{"title":"相关推荐$i","cards":[${card("A$i", "/vod/s$i-a.html")},${card("B$i", "/vod/s$i-b.html")}]}"""
        }
        val data = MoviePageExtractor.parse(page(sections = "$one,$many"), page)
        assertEquals(MAX_SECTIONS, data!!.sections.size)
    }

    @Test
    fun `richness counts main cards plus section cards`() {
        val data = MoviePageExtractor.parse(
            page(
                cards = listOf(card("A", "/vod/1.html"), card("B", "/vod/2.html")).joinToString(","),
                sections = """{"title":"猜你喜欢","cards":[${card("C", "/vod/3.html")},${card("D", "/vod/4.html")}]}"""
            ),
            page
        )
        assertEquals(4, data!!.richness)
    }

    // ────────────────────────── 板块名 / 评论区 ──────────────────────────

    private fun comment(
        text: String,
        name: String = "游客",
        time: String = "2026-09-22 11:03:31",
        avatar: String = "/static/images/touxiang.png"
    ): String = """{"name":"$name","text":"$text","time":"$time","avatar":"$avatar"}"""

    @Test
    fun `block titles are cleaned and truncated`() {
        val data = MoviePageExtractor.parse(
            """{"url":"$page","mainTitle":"  相关推荐\u200B  ","commentTitle":"评论","comments":[]}""",
            page
        )
        // 零宽字符与首尾空白都要洗掉；板块名长度有上限（页面上的"标题"可能是一整段话）
        assertEquals("相关推荐", data!!.mainTitle)
        assertEquals("评论", data.commentTitle)
        val long = MoviePageExtractor.parse(
            """{"url":"$page","mainTitle":"${"板".repeat(60)}","comments":[]}""",
            page
        )
        assertEquals(MoviePageExtractor.MAX_BLOCK_TITLE, long!!.mainTitle.length)
    }

    @Test
    fun `comments without text are dropped and fields are cleaned`() {
        val data = MoviePageExtractor.parse(
            """{"url":"$page","comments":[
                ${comment("")},
                ${comment("   ")},
                ${comment("牛马看完感动哭了")},
                ${comment("${"长".repeat(300)}", name = "${"名".repeat(60)}")}
            ]}""",
            page
        )
        // 空正文的一条不留（站点评论区的骨架节点、纯头像格都会被扫进来）
        assertEquals(2, data!!.comments.size)
        assertEquals("牛马看完感动哭了", data.comments[0].text)
        assertEquals(MoviePageExtractor.MAX_COMMENT_TEXT, data.comments[1].text.length)
        assertEquals(MoviePageExtractor.MAX_COMMENT_NAME, data.comments[1].name.length)
    }

    @Test
    fun `comment avatars resolve against the page and overflow is capped`() {
        val many = (1..MoviePageExtractor.MAX_COMMENTS + 4)
            .joinToString(",") { comment("第 $it 条") }
        val data = MoviePageExtractor.parse("""{"url":"$page","comments":[$many]}""", page)
        assertEquals(MoviePageExtractor.MAX_COMMENTS, data!!.comments.size)
        assertEquals(
            "https://movie.example.com/static/images/touxiang.png",
            data.comments.first().avatar
        )
    }

    @Test
    fun `richness counts comments too`() {
        // 评论区也算"内容"：不算的话，只有评论区的页面会被判成"更空"而丢掉这一份结果
        val data = MoviePageExtractor.parse(
            """{"url":"$page","cards":[${card("A", "/vod/1.html")}],"comments":[${comment("一")},${comment("二")}]}""",
            page
        )
        assertEquals(3, data!!.richness)
    }

    // ────────────────────────── 站内搜索 ──────────────────────────

    @Test
    fun `site search form is cleaned and slogan hints are dropped`() {
        val data = MoviePageExtractor.parse(
            """{"url":"$page","searchAction":"/index.php/vod/search.html","searchParam":"wd","searchHint":"搜索影片"}""",
            page
        )
        // 相对 action 要补成绝对地址（拼搜索地址时直接拿它用）
        assertEquals("https://movie.example.com/index.php/vod/search.html", data!!.searchAction)
        assertEquals("wd", data.searchParam)
        assertEquals("搜索影片", data.searchHint)

        // 站点的占位文字是口号（不是提示语）时丢掉：界面退回我们自己的文案（"搜索站内内容"）
        val slogan = MoviePageExtractor.parse(
            """{"url":"$page","searchAction":"https://movie.example.com/s.html","searchParam":"q","searchHint":"海量影片精彩看不停"}""",
            page
        )
        assertEquals("", slogan!!.searchHint)
    }
}