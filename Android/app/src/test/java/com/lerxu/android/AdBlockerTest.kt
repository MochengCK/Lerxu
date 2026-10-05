package com.lerxu.android

import com.lerxu.android.browser.AdBlocker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 广告拦截的判据：拦得准比拦得多重要。
 *
 * 漏一条广告只是少拦一次，**误杀一条却是页面缺内容**（图裂、组件不显示、
 * 甚至主文档白屏），所以这里两侧都要钉：该拦的必须拦，像广告但不是广告的
 * 必须放行（`/ad/` 这类短片段、analytics、内联协议）。
 */
class AdBlockerTest {

    @Test
    fun blocksKnownAdHosts() {
        assertTrue(AdBlocker.isAdUrl("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"))
        assertTrue(AdBlocker.isAdUrl("https://googleads.g.doubleclick.net/pagead/id"))
        assertTrue(AdBlocker.isAdUrl("http://cpro.baidu.com/cpro/ui/c.js"))
        assertTrue(AdBlocker.isAdUrl("https://pos.baidu.com/pos/abc"))
        assertTrue(AdBlocker.isAdUrl("https://cm.bilibili.com/ad/report"))
        assertTrue(AdBlocker.isAdUrl("https://static.criteo.net/js/ld/publishertag.js"))
    }

    @Test
    fun blocksSubdomainsOfAdHosts() {
        assertTrue(AdBlocker.isAdUrl("https://sub.deep.doubleclick.net/x.js"))
        assertTrue(AdBlocker.isAdUrl("https://ads.criteo.com/delivery/rta"))
    }

    @Test
    fun blocksAdSlotPathsOnAnyHost() {
        assertTrue(AdBlocker.isAdUrl("https://example.com/pagead/slot.js"))
        assertTrue(AdBlocker.isAdUrl("https://news.site.com/adserver/www/delivery/x"))
        assertTrue(AdBlocker.isAdUrl("https://a.com/x?adunit=12345"))
        assertTrue(AdBlocker.isAdUrl("https://a.com/x?ad_slot=top"))
        assertTrue(AdBlocker.isAdUrl("https://a.com/js/adsbygoogle.js"))
    }

    @Test
    fun keepsNormalPagesAndMedia() {
        // 主文档、普通资源：一律放行
        assertFalse(AdBlocker.isAdUrl("https://www.bing.com/search?q=test"))
        assertFalse(AdBlocker.isAdUrl("https://example.com/load-more.json"))
        assertFalse(AdBlocker.isAdUrl("https://example.com/shadow.css"))
        assertFalse(AdBlocker.isAdUrl("https://cdn.site.com/advertisement-of-service.png"))
        assertFalse(AdBlocker.isAdUrl("https://i0.hdslb.com/bfs/archive/a.jpg"))
    }

    @Test
    fun keepsShortAdLikePaths() {
        // `/ad/` 太短、太像普通缩写（add / address 的前缀），仍然不收
        assertFalse(AdBlocker.isAdUrl("https://example.com/ad/"))
        assertFalse(AdBlocker.isAdUrl("https://example.com/address/list"))
    }

    @Test
    fun blocksAdsDirectoryAsSubresource() {
        // `/ads/`、`/adv/`、`/gg/` 这一档**改判为拦**（原先是"宁漏勿杀"）。
        // 关键前提：主框架永不拦（见 BrowserController.shouldInterceptRequest），
        // 所以这里拦的只可能是**子资源** ——
        // 站点自己的 `/ads/pricing` 作为一个**页面**照样打得开，只有它去取
        // `/ads/xxx.js`、`/ads/xxx.png` 这类素材时才拦。真正的广告目录远比
        // "正常内容恰好放在 /ads/ 下"常见，权衡下来这一档该收
        assertTrue(AdBlocker.isAdUrl("https://example.com/ads/banner.js"))
        assertTrue(AdBlocker.isAdUrl("https://example.com/adv/img.gif"))
        assertTrue(AdBlocker.isAdUrl("https://example.com/gg/1.png"))
    }

    @Test
    fun blocksAdScriptNames() {
        // 广告脚本的固定文件名（正文脚本不会这么叫）
        assertTrue(AdBlocker.isAdUrl("https://site.com/js/ads.js"))
        assertTrue(AdBlocker.isAdUrl("https://site.com/static/advert.js"))
        assertTrue(AdBlocker.isAdUrl("https://site.com/gpt.js"))
        assertTrue(AdBlocker.isAdUrl("https://site.com/prebid.js"))
        // 百度联盟的广告 iframe 固定名
        assertTrue(AdBlocker.isAdUrl("https://site.com/x?cproIframe=1"))
    }

    @Test
    fun keepsNonHttpSchemes() {
        // 页面自己造出来的内联资源：拦了就是白屏或缺图
        assertFalse(AdBlocker.isAdUrl("data:image/png;base64,AAAA"))
        assertFalse(AdBlocker.isAdUrl("blob:https://example.com/6f2c"))
        assertFalse(AdBlocker.isAdUrl("file:///android_asset/browser-home.html"))
        assertFalse(AdBlocker.isAdUrl(""))
    }

    @Test
    fun cssHidesAdSlotsButNotLookalikes() {
        val css = AdBlocker.HIDE_CSS
        // 广告位标识必须命中
        assertTrue(css.contains("ins.adsbygoogle"))
        assertTrue(css.contains("[data-ad-slot]"))
        assertTrue(css.contains("[id^=\"div-gpt-ad\"]"))
        assertTrue(css.contains("[src*=\"doubleclick.net\"]"))
        // 模糊匹配必须不在：`[class*=ad]` 会把 load-more / shadow 一起藏掉
        assertFalse(css.contains("[class*=\"ad\"]"))
        assertFalse(css.contains("[class*=\"ad-\"]"))
        // **`:has()` 绝不能落在 div 上**：`div:has(.adtip)` 会命中所有祖先 div，
        // 广告标签埋得深时连页面根容器一起藏掉 —— 整页空白就是这么来的（用户点名），
        // 已用真实站点 HTML 复现过，这里钉住别再写回去
        assertFalse(css.contains("div:has("))
        assertTrue(css.contains("a:has(.adtip)"))
    }

    @Test
    fun imageRequestsGetABlankPixel() {
        assertTrue(AdBlocker.looksLikeImage("https://cpro.baidu.com/x/ad.png"))
        assertTrue(AdBlocker.looksLikeImage("https://a.com/adserver/banner.JPG?w=1"))
        assertTrue(AdBlocker.looksLikeImage("https://a.com/ad.webp#frag"))
        assertFalse(AdBlocker.looksLikeImage("https://a.com/adserver/x.js"))
        assertFalse(AdBlocker.looksLikeImage("https://a.com/image.php"))
        // 1×1 透明 GIF 的魔数：GIF89a
        assertEquals(0x47.toByte(), AdBlocker.BLANK_GIF[0])
        assertEquals(0x49.toByte(), AdBlocker.BLANK_GIF[1])
        assertEquals(0x46.toByte(), AdBlocker.BLANK_GIF[2])
        assertEquals(43, AdBlocker.BLANK_GIF.size)
    }

    @Test
    fun injectJsTogglesTheSameStyleNode() {
        val on = AdBlocker.injectJs(true)
        val off = AdBlocker.injectJs(false)
        assertEquals(-1, on.indexOf('\n'))
        assertEquals(-1, off.indexOf('\n'))
        // 开：建 / 复用 style 节点并写入规则；关：只把这个节点摘掉
        assertTrue(on.contains("lerxu-adblock"))
        assertTrue(on.contains("display:none!important"))
        assertTrue(off.contains("lerxu-adblock"))
        assertFalse(off.contains("display:none!important"))
    }

    @Test
    fun blocksVideoAdSdksButKeepsTheVideoSitesThemselves() {
        // 贴片广告的投放端 / 取广告接口
        assertTrue(AdBlocker.isAdUrl("https://imasdk.googleapis.com/js/sdkloader/ima3.js"))
        assertTrue(AdBlocker.isAdUrl("https://atm.youku.com/v?x=1"))
        assertTrue(AdBlocker.isAdUrl("https://ad.iqiyi.com/v?id=1"))
        assertTrue(AdBlocker.isAdUrl("https://s1.exosrv.com/ads.js"))
        // **正片域名一概放行**：拦广告域不能连播放一起拦
        assertFalse(AdBlocker.isAdUrl("https://v.youku.com/v_show/id_x.html"))
        assertFalse(AdBlocker.isAdUrl("https://www.iqiyi.com/v_abc.html"))
        assertFalse(AdBlocker.isAdUrl("https://www.mgtv.com/b/123/456.html"))
    }

    @Test
    fun blocksVastAndImaPathsOnAnyHost() {
        assertTrue(AdBlocker.isAdUrl("https://cdn.site.com/vast/preroll.xml"))
        assertTrue(AdBlocker.isAdUrl("https://a.com/x?ad_unit=12"))
        assertTrue(AdBlocker.isAdUrl("https://a.com/imasdk/loader.js"))
    }

    @Test
    fun popupLayerGuardsWindowOpenAndRestoresIt() {
        val on = AdBlocker.injectJs(true)
        val off = AdBlocker.injectJs(false)
        assertTrue(on.contains("__lerxuPopupGuard"))
        // 页面侧的域名表与网络层同源：抽一个域名钉住
        assertTrue(on.contains("doubleclick.net"))
        assertTrue(on.contains("window.open=function"))
        // 关掉时把原生 window.open 装回去，别留一个半残的钩子
        assertTrue(off.contains("__lerxuRawOpen"))
    }

    @Test
    fun guardClicksSkipAdButtonsOnPlayingVideo() {
        val on = AdBlocker.injectJs(true)
        assertTrue(on.contains("bySkip"))
        // 文案判据 2026-10-03 从"正好等于"放宽成"包含"（贴片按钮上常带倒计时，
        // 如"5 后跳过广告"）：这里钉住放宽后的两个关键词
        assertTrue(on.contains("跳过"))
        assertTrue(on.contains("skip ad"))
        assertTrue(on.contains("关闭广告"))
    }

    /** 同域广告目录（2026-10-03 补）：小站把广告素材放在自己的 `/uploads/ad/` 下。 */
    @Test
    fun blocksSameOriginAdDirectories() {
        assertTrue(AdBlocker.isAdUrl("https://www.site.com/uploads/ad/2026/1.jpg"))
        assertTrue(AdBlocker.isAdUrl("https://www.site.com/upload/ads/banner.png"))
        // 正常上传目录不许误伤
        assertFalse(AdBlocker.isAdUrl("https://www.site.com/uploads/2026/10/poster.jpg"))
    }

    /** 2026-10-03 补的那批域：移动广告 SDK 与广告落地页。 */
    @Test
    fun blocksMobileAdSdksAndAdLandingPages() {
        assertTrue(AdBlocker.isAdUrl("https://cdn.mintegral.com/x.js"))
        assertTrue(AdBlocker.isAdUrl("https://s.rayjump.com/openapi/ad"))
        assertTrue(AdBlocker.isAdUrl("https://pglstatp-toutiao.com/api/ad"))
        // 巨量引擎的投放落地页：用户不会主动访问，落到那儿基本就是点了假播放按钮
        assertTrue(AdBlocker.isAdUrl("https://a.chengzijianzhan.com/page"))
    }

    /**
     * [AdBlocker.isAdHost] 与 [AdBlocker.isAdUrl] 的分工（2026-10-03）：
     * **带手势**的主框架跳转只按域名表拦（路径判据可能误伤正文，那一档留着手势豁免）。
     */
    @Test
    fun adHostIsStricterThanAdUrlForGesturefulNavigations() {
        // 域名在表里：两种判据都中 —— 这种域不存在"正常目的地"
        assertTrue(AdBlocker.isAdHost("https://s1.exosrv.com/ads.js"))
        assertTrue(AdBlocker.isAdUrl("https://s1.exosrv.com/ads.js"))
        // 只是路径像广告：`isAdUrl` 中、`isAdHost` 不中 —— 用户自己点出来的页面仍放行
        assertTrue(AdBlocker.isAdUrl("https://example.com/ads/pricing"))
        assertFalse(AdBlocker.isAdHost("https://example.com/ads/pricing"))
        assertFalse(AdBlocker.isAdHost("https://www.bing.com/search?q=x"))
        assertFalse(AdBlocker.isAdHost("data:image/png;base64,AAAA"))
    }

    /** ⑭ 懒加载 / 脚本跳转属性（2026-10-03 补）：广告位大半不写在 `src` 上。 */
    @Test
    fun cssAlsoMatchesLazyLoadedAdAttributes() {
        val css = AdBlocker.HIDE_CSS
        assertTrue(css.contains("[data-src*=\"exoclick.com\"]"))
        assertTrue(css.contains("[data-original*=\"popads.net\"]"))
        assertTrue(css.contains("[onclick*=\"adsterra.com\"]"))
        assertTrue(css.contains("[data-lazy*=\"juicyads.com\"]"))
        // 属性那一族只用核心域名表（控制选择器数量，见 CORE_AD_HOSTS 的说明）：
        // 非核心域不该出现在属性选择器里，但 `src` 那一族仍是完整域名表
        assertFalse(css.contains("[onclick*=\"doubleclick.net\"]"))
        assertTrue(css.contains("[src*=\"doubleclick.net\"]"))
    }
}
