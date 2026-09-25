package com.lerxu.android.browser

/**
 * 网页广告拦截：**四层**，按"判据有多硬"从强到弱排。
 *
 * ① **网络层**（[isAdUrl]，配合 `shouldInterceptRequest` 用）：广告网络的请求直接
 *    判死，脚本连响应体都拿不到 —— 这是"让广告不显示"最干净的一条路。判据两类：
 *    - **主机名后缀**：广告平台 / 广告交易平台自己的域名（doubleclick、
 *      googlesyndication、各家 SSP / DSP、移动广告 SDK 的落地域、国内联盟）；
 *    - **路径片段**：同域下的广告位与广告脚本（`/pagead/`、`/ads/`、`/gg/`、
 *      `adunit=`、`/prebid.js` 这类约定俗成的写法）。
 *    主框架请求**永不拦**（见 `shouldInterceptRequest`）：拦错一下就是白屏。
 *
 * ② **元素层**（[HIDE_CSS]）：已经渲染进页面里的广告位（服务端直出、或从缓存来的），
 *    网络层拦不到 —— 用一小段样式把它们藏掉。选择器只认**广告位自己的标识**
 *   （`ins.adsbygoogle`、`[id^=div-gpt-ad]`、`data-ad-slot`、`.ad-container`、
 *    `a[href*=广告域]`、`.sponsored`、`.float-ad` 之类），**不做**"类名里带 ad 就藏"
 *    那种模糊匹配：`load-more`、`shadow` 这类正常类名里都有 ad，一刀切会把正文一起藏了。
 *
 * ③ **清留白**（[GAP_JS]）：广告位藏掉后，**外层容器**上写死的尺寸还在，页面上会留下
 *    一大段空白。从被藏掉的元素往上找，把已经空掉的那层高度收掉。
 *
 * ④ **通用兜底**（[GUARD_JS]）：名字认不出来的广告位，按**版式形状**认 ——
 *    写着"广告 / 赞助 / Sponsored"的标签、IAB 标准尺寸的跨域 iframe、
 *    盖住大半个屏幕且链到别的站的弹窗。这一层是"通用"的落点：不依赖站点怎么命名。
 *
 * 前三层的判据都是纯函数 / 纯选择器，不碰 Android API，单测直接跑（见 AdBlockerTest）；
 * ④ 是页面内启发式，靠"多条件同时成立"压误伤，并把自己藏过的东西记下来，开关一关就还原。
 */
object AdBlocker {

    /**
     * 广告网络域名：命中**主机名后缀**即判广告。
     *
     * 只收"投广告 / 放广告素材"的域，**不收统计与埋点**（用户要的是广告；
     * 统计域拦掉也拦不出什么观感，却多一份误伤风险）。漏几个域名只是少拦几条，
     * 误杀一个域名却会让正常页面缺内容，所以这份表宁短勿长。
     */
    private val HOST_SUFFIXES = listOf(
        // Google / DoubleClick 系
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "googletagservices.com",
        "adservice.google.com",
        // 国内广告联盟
        "cpro.baidu.com",
        "pos.baidu.com",
        "mobads.baidu.com",
        "afd.baidu.com",
        "cm.bilibili.com",
        "gdt.qq.com",
        "tanx.com",
        "alimama.com",
        "adview.cn",
        "adsage.com",
        "adchina.com",
        // 影视站 / 小说站常挂的广告网络（欧乐影院这类站点逐个验证过的那一批：
        // ExoClick 系、JuicyAds、TrafficJunky / TrafficStars、PopAds / PopCash、
        // PropellerAds、Adsterra / Admaven / HilltopAds、Clickadu、Adcash、Yllix…）
        "exoclick.com",
        "exoclick.net",
        "exosrv.com",
        "exdynsrv.com",
        "realsrv.com",
        "pemsrv.com",
        "juicyads.com",
        "trafficjunky.com",
        "trafficjunky.net",
        "trafficstars.com",
        "tsyndicate.com",
        "popads.net",
        "popcash.net",
        "propellerads.com",
        "propellerpops.com",
        "onclickads.net",
        "onclickalgo.com",
        "adsterra.com",
        "admaven.com",
        "hilltopads.net",
        "clickadu.com",
        "adcash.com",
        "yllix.com",
        "mgid.com",
        "revcontent.com",
        "a-ads.com",
        // 国际
        "adnxs.com",
        "adsrvr.org",
        "criteo.com",
        "criteo.net",
        "taboola.com",
        "outbrain.com",
        "pubmatic.com",
        "rubiconproject.com",
        "openx.net",
        "smartadserver.com",
        "advertising.com",
        "amazon-adsystem.com",
        "ads-twitter.com",
        "ads.linkedin.com",
        "ads.pinterest.com",
        // ── 补齐：广告投放 / 交易平台（SSP / DSP / 广告服务器）──
        // 这批是"广告素材与决策"的域，**不是统计埋点**：拦掉它们不会让站点少功能
        "adroll.com",
        "adform.net",
        "adition.com",
        "adsafeprotected.com",
        "adtech.de",
        "adtechus.com",
        "serving-sys.com",
        "sizmek.com",
        "flashtalking.com",
        "innovid.com",
        "yieldmo.com",
        "sharethrough.com",
        "teads.tv",
        "spotxchange.com",
        "spotx.tv",
        "tremorhub.com",
        "telaria.com",
        "freewheel.tv",
        "stickyadstv.com",
        "springserve.com",
        "beachfront.com",
        "indexexchange.com",
        "casalemedia.com",
        "sovrn.com",
        "lijit.com",
        "gumgum.com",
        "zedo.com",
        "undertone.com",
        "sonobi.com",
        "bidswitch.net",
        "improvedigital.com",
        "360yield.com",
        "yieldlab.net",
        "media.net",
        "adnxs-simple.com",
        "33across.com",
        "triplelift.com",
        "seedtag.com",
        "richaudience.com",
        "smartclip.net",
        "ligatus.com",
        "adyoulike.com",
        "adzerk.net",
        "adzerk.com",
        "servedbyadbutler.com",
        "adbutler.com",
        "projectwonderful.com",
        "buysellads.com",
        "carbonads.com",
        "carbonads.net",
        "infolinks.com",
        "kontera.com",
        "vibrantmedia.com",
        "chitika.com",
        "adblade.com",
        "bidvertiser.com",
        "adthrive.com",
        "mediavine.com",
        "monumetric.com",
        "ezoic.net",
        "ezoic.com",
        "adplugg.com",
        "advertserve.com",
        "advertur.ru",
        "an.yandex.ru",
        "ad.mail.ru",
        "adriver.ru",
        "adfox.ru",
        "recreativ.ru",
        "luckyads.pro",
        "adspyglass.com",
        "adnium.com",
        "zeropark.com",
        "trafficfactory.biz",
        "traffichaus.com",
        "clickaine.com",
        "popmyads.com",
        "adplxmd.com",
        "ero-advertising.com",
        "magsrv.com",
        "adsco.re",
        "highperformanceformat.com",
        "profitableratecpm.com",
        "cointraffic.io",
        "coinzilla.io",
        "adf.ly",
        // 影视站播放器**内置广告的投放端**（实测欧乐影院的 Plyr 广告就取这里的
        // VAST 标签：`ads:{tagUrl:"https://www.jiayishops.com/ft.xml"}`）
        "jiayishops.com",
        // 移动端广告 SDK 的落地域（影视站 / 小说站最常挂的那批）
        "adcolony.com",
        "applovin.com",
        "unityads.unity3d.com",
        "vungle.com",
        "chartboost.com",
        "inmobi.com",
        "mopub.com",
        "startapp.com",
        "tapjoy.com",
        "supersonicads.com",
        "ironsrc.com",
        // 国内广告联盟（补齐）
        "admaster.com.cn",
        "miaozhen.com",
        "ipinyou.com",
        "allyes.com",
        "union.baidu.com",
        "union.360.cn",
        "adx.360.cn",
        "show.360.cn",
        "e.qq.com",
        "adsview.qq.com",
        "adkwai.com",
        "adchina.io",
        "adpeng.com"
    )

    /**
     * 路径 / 查询串里出现就算广告位的片段（比对前统一转小写）。
     *
     * 只收"广告位专属"的写法：`/pagead/`（Google 广告位）、`/adserver/`、
     * `adunit=`、`ad_slot=`、`/adx/`。像 `/ad/` 这种太短的不收 —— 站点把 `/ad/`
     * 当"add / 地址"之类的缩写并不罕见，拦了就是缺内容。
     */
    private val PATH_MARKERS = listOf(
        "/pagead/",
        "/adserver/",
        "/adservice/",
        "/adsense/",
        "/adx/",
        "/adunit",
        "adunit=",
        "ad_slot=",
        "adslot=",
        "adtag=",
        "gpt/pubads",
        "show_ads",
        "adsbygoogle",
        // ── 补齐：广告位目录与脚本名 ──
        // 这些是"广告位专属"的目录 / 文件名写法，正文资源不会这样命名。
        // `/ads/`、`/adv/`、`/gg/` 是国内外小站约定俗成的广告目录
        //（`gg` = "广告"的拼音首字母），命中即拦。
        // **刻意不收** `/banner/`：那是"横幅图"的意思，站点自己的首页大图常放这里，
        // 拦了就是缺图（这类误伤比多拦几条广告贵得多）
        "/ads/",
        "/adv/",
        "/advert/",
        "/gg/",
        "/adjs/",
        "/adimg/",
        "/adpic/",
        "/adfile/",
        "/adpage/",
        "/adframe",
        "/popunder",
        "/popup-ad",
        "/prebid",
        "/pubads",
        "/gampad",
        "/ad.js",
        "/ads.js",
        "/advert.js",
        "/gpt.js",
        "/prebid.js",
        "/ad_script",
        "ad_type=",
        "adzone",
        "ad_zone",
        "adposition",
        "adclass=",
        "showad",
        "clickad",
        "adclick",
        "banner_id=",
        // 百度联盟的广告 iframe 固定叫 cproIframe / cproiframe
        "cproiframe"
    )

    /**
     * 这一条请求是不是广告？**只看 URL**（`shouldInterceptRequest` 里也只有 URL）。
     *
     * `http(s)` 之外的协议（`data:` / `blob:` / `file:`）一律不拦 —— 那些是页面
     * 自己造出来的内联资源，拦了就是白屏或缺图。
     */
    fun isAdUrl(url: String): Boolean {
        if (url.isEmpty()) return false
        val lower = url.lowercase()
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false
        val afterScheme = lower.substringAfter("://")
        val hostEnd = afterScheme.indexOfFirst { it == '/' || it == '?' || it == '#' }
        val host = if (hostEnd < 0) afterScheme else afterScheme.substring(0, hostEnd)
        if (host.isEmpty()) return false
        if (HOST_SUFFIXES.any { host == it || host.endsWith(".$it") }) return true
        return PATH_MARKERS.any { lower.contains(it) }
    }

    /**
     * 注入到页面的脚本（幂等）：按 [on] 决定挂上还是撤下那层隐藏样式。
     *
     * 走一个独立的 `<style id="lerxu-adblock">` 节点：开关切换只是加 / 撤这个节点，
     * 不重排页面、也不用重新加载；页面自己清掉它（极少数站点会清 head）时，
     * 下一次注入会再补上（与主题注入同一套重试时序，见 `applyWebTheme`）。
     */
    fun injectJs(on: Boolean): String {
        if (!on) {
            // 关掉时除了撤样式，还要把脚本层藏掉的东西**还回去** ——
            // "清留白"收掉的高度与"通用兜底"藏掉的元素都是行内样式，不还原就永远塌着
            return "(function(){var n=document.getElementById('lerxu-adblock');" +
                "if(n&&n.parentNode)n.parentNode.removeChild(n);" +
                "var a=window.__lerxuAdGapList||[];var i;" +
                "for(i=0;i<a.length;i++){var e=a[i];try{e.style.removeProperty('height');" +
                "e.style.removeProperty('min-height');e.style.removeProperty('overflow');" +
                "}catch(x){}}" +
                "window.__lerxuAdGapList=[];" +
                "var b=window.__lerxuAdGuardList||[];" +
                "for(i=0;i<b.length;i++){var g=b[i];try{g.style.removeProperty('display');" +
                "}catch(x){}}" +
                "window.__lerxuAdGuardList=[];})();"
        }
        return "(function(){var n=document.getElementById('lerxu-adblock');" +
            "if(!n){n=document.createElement('style');n.id='lerxu-adblock';" +
            "(document.head||document.documentElement).appendChild(n);}" +
            "n.textContent=" + jsString(HIDE_CSS) + ";" +
            // 文档起始脚本跑在解析之前（那时 <head> 可能还没成形），个别情况下
            // 这段样式会被后来的解析挤掉：DOM 就绪后再补一次（幂等）
            "try{if(!window.__lerxuAdBlockHook){window.__lerxuAdBlockHook=1;" +
            "var put=function(){var m=document.getElementById('lerxu-adblock');" +
            "if(!m){m=document.createElement('style');m.id='lerxu-adblock';" +
            "(document.head||document.documentElement).appendChild(m);}" +
            "m.textContent=" + jsString(HIDE_CSS) + ";};" +
            "document.addEventListener('DOMContentLoaded',put);" +
            "window.addEventListener('load',put);}}catch(e){}" +
            "})();" + GAP_JS + GUARD_JS
    }

    /**
     * 广告位的隐藏样式。选择器分四类，都是"这个元素就是广告位"的写法：
     * 广告平台约定俗成的 class / id、`data-*` 广告参数、**整词**的广告位类名、
     * 以及 src 指向广告域的 iframe / 图片。
     *
     * `display:none`（而不是 `visibility:hidden`）：广告位在版式里继续占格子的话，
     * 藏起来会留一块空白 —— 用户要的是"不显示"，那就连位置也不该占。
     */
    /** ⑤ 里用的"卡片类元素"（见 [cardHas]）。**必须声明在 [HIDE_CSS] 之前**：
     *  object 的属性按声明顺序初始化，声明在后面的话 [HIDE_CSS] 构建时它还是 null。 */
    private val CARD_ELEMENTS = listOf("a", "li", "figure", "aside", "article")

    /**
     * ⑤ 用到的选择器：`卡片类元素:has(标记)`。
     *
     * `div` 故意不在名单里 —— 页面容器几乎都是 div，`:has()` 又是"只要有这个后代
     * 就算"，把 div 放进去等于"谁包着广告谁就被藏"（一路藏到整页空白，见上）。
     * 标签埋多深都认：链接 / 列表项 / 图注不会是页面容器，藏掉它只是藏掉那个卡片。
     */
    private fun cardHas(marker: String): String =
        CARD_ELEMENTS.joinToString(",") { "$it:has($marker)" } + "{display:none!important;}"

    val HIDE_CSS: String = buildString {
        // ① 广告平台自己的标识
        append("ins.adsbygoogle,.adsbygoogle{display:none!important;}")
        append("[id^=\"div-gpt-ad\"],[id^=\"google_ads_iframe\"],[id^=\"aswift_\"],")
        append("[id^=\"google_ads_\"],[id^=\"gpt-passback\"]{display:none!important;}")
        // ② data-* 广告参数（挂广告位的一方自己写上去的，命中即广告位）
        append("[data-ad-slot],[data-ad-client],[data-adunit],[data-google-query-id],")
        append("[data-ad-placement],[data-advertisement]{display:none!important;}")
        // ③ 广告位类名 / id：**整词**（带连字符），不做"含 ad 即中"的模糊匹配
        append(".ad-container,.ad-wrapper,.ad-slot,.ad-banner,.ad-unit,.ad-box,")
        append(".ads-container,.ads-wrapper,.ads-slot,.ads-banner,.ads-unit,")
        append(".advertisement,.advertising-container,.banner-ad,.sponsor-ad,")
        append(".ad-placeholder,.ad-holder,.ad-area,.ad-region,.ad-zone,")
        append("[id^=\"ad-slot\"],[id^=\"ad_slot\"],[id^=\"ad-banner\"],[id^=\"ad_banner\"],")
        append("[id^=\"ad-unit\"],[id^=\"ad_unit\"],[id^=\"advertisement\"],")
        append("[id^=\"adsense\"],[id^=\"adframe\"],[id^=\"ad_frame\"]{display:none!important;}")
        // ③′ **整词**匹配（`~=` 是"空格分隔的词"语义，`load-more` 这类含 ad 的
        // 复合词一律不命中）：影视站 / 小说站模板里最常见的那几种写法 ——
        // `class="adb"`、`class="ad_top"`、`id="ad"`、`class="ads_box"` 之类
        append("[class~=\"ad\"],[class~=\"ads\"],[class~=\"adb\"],[class~=\"advert\"],")
        append("[class~=\"ad_top\"],[class~=\"ad_bottom\"],[class~=\"ad_box\"],")
        append("[class~=\"ad_pic\"],[class~=\"ad_img\"],[class~=\"ad_show\"],")
        append("[class~=\"ads_box\"],[class~=\"ads_top\"],[class~=\"ads_bottom\"],")
        append("[class~=\"adtip\"],[class~=\"ad_float\"],[class~=\"ad_fixed\"],")
        append("[id=\"ad\"],[id=\"ads\"],[id=\"adb\"],")
        append("[id~=\"ad\"],[id~=\"ads\"],")
        append("[id^=\"ad_top\"],[id^=\"ad_bottom\"],[id^=\"ad_box\"],[id^=\"ad_pic\"],")
        append("[id^=\"ad_img\"],[id^=\"ad_show\"],[id^=\"ads_box\"]{display:none!important;}")
        // ④ 指向广告域的 iframe / 图片（与网络层同一份域名表）
        val byHost = HOST_SUFFIXES.joinToString(",") { "[src*=\"$it\"]" }
        append(byHost).append("{display:none!important;}")
        // ⑤ **站点自己打了"广告"标签的那些位**：国内 CMS（苹果 CMS 那类）的广告卡
        // 里一定有一枚写着"广告"的小标签（`<div class="adtip">广告</div>`），
        // 而卡片壳用的是普通类名（`.wbalist_thumb` 之类）—— 按类名藏会连正文
        // 一起藏，按这枚标签用 `:has()` 往上找才准（欧乐影院的广告卡就是
        // `a > div > div > .adtip`，实测那一页 14 张卡全是广告，正文卡不长这样）。
        //
        // **只认卡片类元素（a / li / figure / aside / article），不认 div**：
        // `div:has(.adtip)` 那种写法会命中**所有祖先 div**（`.adtip` 在页面深处时
        // 连 `#play_page`、各种 wrapper 一起藏掉）—— "网页加载完成后变成空白页面"
        // 就是这么来的（用户点名，已用该站真实 HTML 复现并修掉）。
        // 链接 / 列表项 / 图注本身不会是页面容器，哪怕标签埋得深，藏掉它也只是
        // 藏掉那个广告卡
        append(cardHas(".adtip") + cardHas(".adb"))
        // ⑥ 播放器自带的广告帧：MacPlayer（苹果 CMS 的播放器）在播放器里塞了两个
        // iframe —— `#buffer`（缓冲时盖的广告页）、`#install`（"下载 App"广告），
        // 都挂在 `.MacPlayer` 里。按容器限定，别的站点同名 id 不受影响
        append(".MacPlayer #buffer,.MacPlayer #install{display:none!important;}")
        // ⑦ **暂停广告**（用户点名）：播放器暂停时盖上来的那一层。
        // 这一层多是站点脚本**现插**的（不是服务端直出），网络层也拦不到它自己 ——
        // 只能按各家播放器 / 模板的固定写法认。`pause_ad` / `pause-ad` / `pauseAd`
        // 这几种命名几乎穷尽了国内模板的写法；再补上"视频广告位"那一族通用名。
        // 仍然是"整词 / 前缀"的写法，不做"含 ad 就藏"
        append("[id^=\"pause_ad\"],[id^=\"pause-ad\"],[id^=\"pauseAd\"],")
        append("[class~=\"pause_ad\"],[class~=\"pause-ad\"],[class~=\"pauseAd\"],")
        append("[class~=\"pause_adv\"],[class~=\"pause-advert\"],")
        append(".video-ad,.video-ads,.player-ad,.player-ads,.player-advert,")
        append(".preroll-ad,.midroll-ad,.overlay-ad,.pause-adv,.ad-pause,")
        append(".vjs-pause-ad,.dplayer-ad,.art-pause-ad,.xgplayer-ad")
        append("{display:none!important;}")
        // ⑦′ MacPlayer 里凡是名字带 pause 的那一层：就是它的暂停广告罩。
        // **按容器限定**，所以不会误伤别的站点上同名的正常元素
        append(".MacPlayer [id*=\"pause\"],.MacPlayer [class*=\"pause\"]")
        append("{display:none!important;}")
        // ⑧ **指向广告网络的链接**：跳转广告 / 联盟推广位基本都是 `<a href="…adhost…">`。
        // 与 ④ 同一份域名表 —— 多认一个 `href`，就多覆盖一大片"正文里混着的推广卡"
        append(HOST_SUFFIXES.joinToString(",") { "a[href*=\"$it\"]" })
        append("{display:none!important;}")
        // ⑨ **赞助 / 推广**：站点自己会给这类位子打标签，中英文两种写法都收。
        // `[class*="guanggao"]` / `[class*="tuiguang"]` 用的是拼音 —— 国内模板里
        // 这两个词只可能是广告，不会像 `ad` 那样混进 `load`、`shadow`。
        // **`guangao` 与 `guanggao` 要各写一条**：两者不是子串关系（前者少一个 g），
        // 而实测欧乐影院用的正是少一个 g 的 `guangao`（它自己的关闭按钮脚本就写着
        // `$(".guanbis").click(... $(".guangao").css("display","none") ...)`，
        // 即这一层本来就是站点让用户关掉的广告块）
        append(".sponsored,.sponsor,[class~=\"sponsor\"],[class~=\"sponsored\"],")
        append(".promoted,.promotion-ad,.recommend-ad,.native-ad,.native-ads,")
        append("[class*=\"guanggao\"],[class*=\"guangao\"],[class*=\"tuiguang\"],")
        // 首页横幅广告：模板自带的那一族轮播位。实测这一族的轮播图**没有链接、没有文字**，
        // 纯图片位就是广告位（站点自己的内容轮播是带链接的，不落在这一族里）。
        append("[class*=\"pc-home-swiper\"],[class*=\"home-swiper\"],[class*=\"home_swiper\"],")
        append("[class*=\"sponsor\"],")
        append("[id*=\"guanggao\"],[id*=\"guangao\"],[id*=\"tuiguang\"]")
        append("{display:none!important;}")
        // ⑩ **悬浮 / 弹窗 / 插屏广告**：这类位子本身就是"盖在正文上的一块"，
        // 按它自己的命名认最准（`.float-ad`、`.popup-ad`、`.interstitial` 之类）。
        // 只认带 ad 的写法，不收 `.float` / `.popup` 这种——那可能是站点自己的浮层
        append(".float-ad,.float-ads,.floating-ad,.fixed-ad,.fixed-ads,")
        append(".popup-ad,.popup-ads,.popunder,.pop-under,.interstitial-ad,")
        append(".modal-ad,.overlay-ads,.sticky-ad,.sticky-ads,.anchor-ad,")
        append("[id^=\"floatAd\"],[id^=\"float-ad\"],[id^=\"popup-ad\"],")
        append("[id^=\"interstitial\"],[class~=\"float_ad\"],[class~=\"pop_ad\"]")
        append("{display:none!important;}")
        // ⑪ 广告平台**固定的 iframe 名**：百度联盟的 `cproIframe`、Google 的
        // `google_ads_iframe` / `aswift_`。id 已在上面的 ①，这里补 `name`
        append("iframe[name^=\"google_ads_iframe\"],iframe[name^=\"cproIframe\"],")
        append("iframe[name^=\"cproiframe\"],iframe[id^=\"cproIframe\"]")
        append("{display:none!important;}")
        // ⑫ **播放器自己的广告罩**（用户点名的"暂停时弹出的广告"，实测复现于欧乐影院）：
        // 那一层是脚本**现插**的 —— 播放器页面里 `player.on('pause', showAd)` 把一个
        // `#adWrap`（里面一张 `#adImage` + 关闭按钮 `#adClose`）塞进 `.plyr--video`，
        // 点图靠 `onclick` 跳转（**不是 `<a href>`**，所以"按链接认"的那几条都碰不到它，
        // 这正是它此前漏网的原因）。这里按它写死的 id 认，再补上各家播放器的广告容器类名
        append("#adWrap,#adImage,#adClose,[id^=\"adWrap\"],[id^=\"adImage\"],")
        append(".plyr__ads,.plyr__ad,.plyr__ads-container,[class*=\"plyr__ads\"],")
        append(".vjs-ads,.dplayer-ad-container,.art-ad-container")
        append("{display:none!important;}")
    }

    /**
     * [GAP_JS] 用到的选择器：与 [HIDE_CSS] 里"广告位自己"的那几族对应，
     * 但**只收容器型 / 槽位型**的写法 —— 从这些元素往上找才可能找到"占着高度的外层"。
     *
     * **必须声明在 [GAP_JS] 之前**：object 的属性按声明顺序初始化，声明在后面的话
     * [GAP_JS] 构建时它还是 null（[HIDE_CSS] 那边踩过同一个坑）。
     */
    private val GAP_SELECTORS: String = listOf(
        "[data-ad-slot]", "[data-ad-client]", "[data-adunit]", "[data-ad-placement]",
        "[id^=\"div-gpt-ad\"]", "[id^=\"google_ads_\"]", "[id^=\"aswift_\"]",
        "[class~=\"ad\"]", "[class~=\"ads\"]", "[class~=\"adb\"]",
        "[class~=\"ad_box\"]", "[class~=\"ad_top\"]", "[class~=\"ad_bottom\"]",
        "[class~=\"ad_pic\"]", "[class~=\"ad_img\"]", "[class~=\"ad_show\"]",
        "[class~=\"ads_box\"]", "[class~=\"ads_top\"]", "[class~=\"ads_bottom\"]",
        "[class~=\"adtip\"]", "[id=\"ad\"]", "[id=\"ads\"]", "[id=\"adb\"]",
        "[id^=\"ad_\"]", "[id^=\"ad-\"]",
        "[id^=\"pause_ad\"]", "[id^=\"pause-ad\"]", "[id^=\"pauseAd\"]",
        "[class~=\"pause_ad\"]", "[class~=\"pause-ad\"]", "[class~=\"pauseAd\"]"
    ).joinToString(",")

    /**
     * "清完广告留白"的脚本（幂等，随 [injectJs] 一起下发）。
     *
     * 广告位本身被 `display:none` 之后占位就没了，但**很多模板把尺寸写在外层容器上**
     *（`<div class="ad-wrap" style="height:250px">` 里再放一个广告 iframe）—— 我们
     * 只藏了里面那个 iframe，外面那层照样占着 250px，页面上就留下一大段空白
     *（用户点名）。
     *
     * 做法：从**确实被我们藏掉的**广告元素往上找最多两层，若某一层已经**没有可见
     * 内容**（子元素要么也隐藏了、要么尺寸为零），而它自己还占着 ≥60px 的高度，
     * 就把它的高度收掉（`height:0` + `overflow:hidden`，不写 `display:none` ——
     * 站点脚本常有量尺寸的动作，抽掉元素比收掉高度更容易踩到它）。
     *
     * 保护：子树里有 `video` / `canvas` 的一律不动（别把播放器容器收掉）；只从
     * 命中广告选择器的元素出发（不扫全页）；每次最多收 40 个，DOM 变动去抖 300ms。
     * 收掉的那些记在 `window.__lerxuAdGapList` 里，关掉广告拦截时原样还原。
     */
    private val GAP_JS: String =
        "(function(){if(window.__lerxuAdGap)return;window.__lerxuAdGap=1;" +
            "var SEL=" + jsString(GAP_SELECTORS) + ";" +
            "window.__lerxuAdGapList=window.__lerxuAdGapList||[];" +
            "function hidden(el){try{var s=getComputedStyle(el);" +
            "return s.display==='none'||s.visibility==='hidden';}catch(e){return false;}}" +
            // 这一层里还有没有"看得见的内容"（不含已经被藏掉的广告）
            "function emptyOfContent(el){try{if(el.querySelector('video,canvas'))return false;" +
            "var kids=el.children;for(var i=0;i<kids.length;i++){var k=kids[i];" +
            "if(hidden(k))continue;" +
            // iframe 一律算内容：跨域广告帧拦不到里面，但正文帧更不能收
            "if(k.tagName==='IFRAME')return false;" +
            "var r=k.getBoundingClientRect();if(r.width>2&&r.height>2)return false;}" +
            "for(var j=0;j<el.childNodes.length;j++){var t=el.childNodes[j];" +
            "if(t.nodeType===3&&(t.nodeValue||'').trim())return false;}" +
            "return true;}catch(e){return false;}}" +
            "function run(){var nodes;try{nodes=document.querySelectorAll(SEL);}catch(e){return;}" +
            "var n=0;for(var i=0;i<nodes.length&&n<40;i++){var el=nodes[i];" +
            "if(!hidden(el))continue;" +
            "var p=el.parentElement,hops=0;" +
            "while(p&&hops<2&&p!==document.body&&p!==document.documentElement){" +
            "if(hidden(p))break;" +
            "if((p.offsetHeight||0)<60)break;" +
            "if(!emptyOfContent(p))break;" +
            "try{p.style.setProperty('height','0','important');" +
            "p.style.setProperty('min-height','0','important');" +
            "p.style.setProperty('overflow','hidden','important');" +
            "window.__lerxuAdGapList.push(p);}catch(e){}" +
            "n++;break;}}}" +
            "var t=0;function later(){clearTimeout(t);t=setTimeout(run,300);}" +
            "try{new MutationObserver(later)" +
            ".observe(document.documentElement,{childList:true,subtree:true});}catch(e){}" +
            "document.addEventListener('DOMContentLoaded',later);" +
            "window.addEventListener('load',later);later();})();"

    /**
     * 通用兜底：**名字认不出来的广告位，按"形状"认**（幂等，随 [injectJs] 一起下发）。
     *
     * 前面几层都是"按名字认"（域名、路径、类名、id、data-*）—— 覆盖得住主流写法，
     * 但总有小站把广告位起成 `wbalist_thumb` 这种看不出所以然的名字。这里补三条
     * **不依赖名字**的判据，都是广告位在版式上的形状特征：
     *
     * ① **文字标签**：元素自己的文字正好是"广告 / 赞助 / 推广 / Sponsored"这类词 ——
     *    站点为了让用户知道那是广告，一定会写上这几个字。找到标签后往上找**第一个
     *    够小的祖先**（卡片类标签，或面积不到视口一半、高度不到 420px 的一块）藏掉。
     *    要求"够小"是关键：不这么限制，一路往上会藏到整栏甚至整页。
     * ② **常见广告尺寸的跨域 iframe**：300×250、728×90、320×100 这些是 IAB 标准
     *    广告位尺寸，正文里的嵌入内容极少正好是这个尺寸；再要求它**跨域**
     *    （与页面不同站），就几乎只剩广告了。
     * ③ **盖住大半个屏幕的弹窗**：`position: fixed/absolute` + `z-index ≥ 1000`
     *    + **面积占视口 30% 以上** + 含图片或 iframe + 有指向别的站的链接**或**自己挂着
     *    `onclick` 跳转。贴顶 / 贴底的整宽条带一律放过（那是导航栏与底栏）。
     * ④ **播放器上的广告罩**：从每个 `<video>` 往上走三层，看兄弟节点里有没有
     *    "绝对定位 + 含 `<img>` + 盖住视频 60% 宽、50% 高"的一层 —— 暂停广告几乎都是
     *    这个形状。播放器自己的大播放键用 svg、海报用 `background-image`，都不含
     *    `<img>`，所以不会被误伤。
     *
     * 几条判据都**不碰**：有 `video` / `canvas` 的子树（别把播放器收掉）、`body` / `html`。
     * 每次最多处理 60 个、单次扫描的元素数有上限，DOM 变动去抖 400ms，处理过的元素
     * 记在数组里不重复处理。藏掉的那些记在 `window.__lerxuAdGuardList`，
     * 关掉广告拦截时原样还原。
     *
     * 这几条判据的阈值都是**拿真实页面量出来的**（欧乐影院的播放页）：
     * - 它的固定顶栏 `#topnav.head_box` 是 1014×110、`z-index` 九位数、里面有 4 张图、
     *   还带指向 `www.olevod.com` 与两个 `.apk` 的**跨站链接** —— 按"宽≥60%、高≥25%"
     *   判会被当成弹窗（横屏时更稳中）。改成面积阈值后它只占视口 14%，落空；
     *   再加"贴顶整宽放过"，双保险。
     * - 它的暂停广告是 `player.on('pause', showAd)` 现插的 `#adWrap`（含 `#adImage`
     *   与关闭按钮 `#adClose`），点图走 `img.onclick = () => window.open(...)` ——
     *   **没有 `<a>`**，所以"只认跨站链接"的写法整条漏网。这也是 ③ 里"或自己挂着
     *   onclick"与 ④ 存在的理由。
     */
    private val GUARD_JS: String =
        "(function(){if(window.__lerxuAdGuard)return;window.__lerxuAdGuard=1;" +
            "var LABELS={};" +
            "['广告','广告位','赞助','赞助商','赞助内容','推广','推广内容','推广链接'," +
            "'商业推广','特约推广','advertisement','advertisements','sponsored'," +
            "'sponsored content','sponsored links','promoted','promoted content'," +
            "'publicite','anzeige','reklam','広告','광고','ad']" +
            ".forEach(function(w){LABELS[w]=1;});" +
            // IAB 标准广告位尺寸（宽,高）
            "var SIZES=[[300,250],[336,280],[728,90],[320,100],[320,50],[970,90]," +
            "[970,250],[160,600],[300,600],[468,60],[234,60],[120,600],[250,250]," +
            "[200,200],[300,100],[580,400],[480,320]];" +
            "window.__lerxuAdGuardList=window.__lerxuAdGuardList||[];" +
            "var done=[];" +
            "function seen(el){for(var i=0;i<done.length;i++)if(done[i]===el)return true;" +
            "return false;}" +
            "function mark(el){done.push(el);if(done.length>800)done.shift();}" +
            "function pageHost(){try{return location.hostname;}catch(e){return '';}}" +
            "function crossHost(u){try{var a=document.createElement('a');a.href=u;" +
            "var h=a.hostname;return !!h&&h!==pageHost();}catch(e){return false;}}" +
            // 藏：播放器子树与整页容器一律不碰
            "function hide(el,why){if(!el||el===document.body||el===document.documentElement)" +
            "return false;try{if(el.querySelector&&el.querySelector('video,canvas'))return false;" +
            "el.style.setProperty('display','none','important');" +
            "window.__lerxuAdGuardList.push(el);return true;}catch(e){return false;}}" +
            // ① 文字标签 → 往上找第一个"够小的"祖先
            "function byLabel(){if(!document.body)return;var n=0;" +
            "var all=document.body.querySelectorAll('span,div,em,i,b,strong,p,a,label');" +
            "var vp=innerWidth*innerHeight;" +
            "for(var i=0;i<all.length&&i<6000&&n<25;i++){var el=all[i];" +
            // 只看叶子（没有子元素）：读 textContent 才不会把整块的文字都拉出来
            "if(el.children.length)continue;" +
            "if(seen(el))continue;" +
            "var t=(el.textContent||'').trim().toLowerCase();" +
            "if(!t||t.length>24||!LABELS[t])continue;" +
            "mark(el);var p=el.parentElement,hop=0,pick=null;" +
            "while(p&&hop<5&&p!==document.body&&p!==document.documentElement){" +
            "var tag=p.tagName,r=p.getBoundingClientRect();" +
            "var isCard=(tag==='A'||tag==='LI'||tag==='FIGURE'||tag==='ASIDE'||" +
            "tag==='ARTICLE');" +
            "var small=(r.width*r.height<vp*0.5&&r.height<420);" +
            "if(isCard||small){pick=p;break;}p=p.parentElement;hop++;}" +
            "if(pick&&hide(pick,'label'))n++;}}" +
            // ② 常见广告尺寸 + 跨域 的 iframe
            "function bySize(){var fs=document.getElementsByTagName('iframe');var n=0;" +
            "for(var i=0;i<fs.length&&n<25;i++){var f=fs[i];if(seen(f))continue;" +
            "var src=f.getAttribute('src')||f.getAttribute('data-src')||'';" +
            "if(!src||src.indexOf('javascript:')===0)continue;" +
            "if(!crossHost(src))continue;" +
            "var r=f.getBoundingClientRect();if(r.width<40||r.height<20)continue;" +
            "var hit=false;for(var k=0;k<SIZES.length;k++){" +
            "if(Math.abs(r.width-SIZES[k][0])<=4&&Math.abs(r.height-SIZES[k][1])<=4)" +
            "{hit=true;break;}}" +
            "if(!hit)continue;mark(f);if(hide(f,'size'))n++;}}" +
            // ③ 盖住大半个屏幕的弹窗
            "function byOverlay(){if(!document.body)return;" +
            "var vw=innerWidth,vh=innerHeight,vp=vw*vh,n=0,cand=[];" +
            "var top=document.body.children;var i,j;" +
            "for(i=0;i<top.length;i++){cand.push(top[i]);" +
            "for(j=0;j<top[i].children.length;j++)cand.push(top[i].children[j]);}" +
            "for(var c=0;c<cand.length&&n<10;c++){var el=cand[c];" +
            "if(seen(el)||!el.getBoundingClientRect)continue;" +
            "var st;try{st=getComputedStyle(el);}catch(e){continue;}" +
            "if(st.position!=='fixed'&&st.position!=='absolute')continue;" +
            "if((parseInt(st.zIndex,10)||0)<1000)continue;" +
            "if(st.display==='none'||st.visibility==='hidden')continue;" +
            "if(parseFloat(st.opacity)===0)continue;" +
            "var r=el.getBoundingClientRect();" +
            // 面积必须占视口 30% 以上。**不能只看宽高各自的比例**：站点的固定顶栏
            //（实测欧乐影院的 #topnav.head_box —— 1014x110、z-index 九位数、里面 4 张图、
            // 还有指向别的站的链接）在"宽≥60%、高≥25%"下会被判成弹窗，横屏时更稳中；
            // 换成面积阈值它就只剩 14%，安全落空。宁可放过少数小弹窗，也不能藏掉导航
            "if(r.width*r.height<vp*0.3)continue;" +
            // 贴顶 / 贴底的整宽条带是导航栏与底栏，不是弹窗
            "if(r.top<=8&&r.width>=vw*0.95)continue;" +
            "if(r.bottom>=vh-8&&r.height<=vh*0.25)continue;" +
            "if(el.querySelector('video,canvas'))continue;" +
            "if(!el.querySelector('img,iframe'))continue;" +
            // "这层是广告"的判据：**指向别的站的链接，或它自己挂着点击跳转**。
            // 后者是必须的 —— 欧乐影院的暂停广告就是 `img.onclick=()=>window.open(...)`，
            // 根本没有 `<a>`，只认链接的话它整条漏网（用户点名的漏网就是这个）
            "var links=el.querySelectorAll('a[href]'),hit=false;" +
            "for(var q=0;q<links.length;q++){" +
            "if(crossHost(links[q].getAttribute('href'))){hit=true;break;}}" +
            "if(!hit){var hs=el.querySelectorAll('img,div,span');" +
            "for(var w=0;w<hs.length;w++){if(hs[w].onclick){hit=true;break;}}}" +
            "if(!hit)continue;mark(el);if(hide(el,'overlay'))n++;}}" +
            // ④ **播放器上的广告罩**：贴在视频上方、盖住大半个播放器、含图片的一层。
            // 暂停广告几乎都是这个形状 —— 按形状认，比按名字通用得多。
            // 从视频往上走三层、逐层看兄弟节点：Plyr 把广告塞在 `.plyr--video` 上，
            // 而视频自己在 `.plyr__video-wrapper` 里，是**兄弟的上一层**
            "function byPlayerAd(){var vs=document.getElementsByTagName('video');var n=0;" +
            "for(var i=0;i<vs.length&&n<10;i++){var v=vs[i];" +
            "var vr=v.getBoundingClientRect();" +
            "if(vr.width<160||vr.height<90)continue;" +
            "var p=v.parentElement,up=0;" +
            "while(p&&up<3&&n<10){var kids=p.children;" +
            "for(var k=0;k<kids.length&&n<10;k++){var el=kids[k];" +
            "if(el===v||seen(el)||!el.getBoundingClientRect)continue;" +
            // 别把装着视频的那一层当广告（那是播放器本体）
            "if(el.getElementsByTagName&&el.getElementsByTagName('video').length)continue;" +
            "var st;try{st=getComputedStyle(el);}catch(e){continue;}" +
            "if(st.position!=='absolute'&&st.position!=='fixed')continue;" +
            "if(st.display==='none'||st.visibility==='hidden')continue;" +
            "if(parseFloat(st.opacity)===0)continue;" +
            // 必须是**图片**罩：播放器自己的大播放键用 svg，海报用 background-image，
            // 两者都不含 <img>，所以这条把它们都排除了
            "if(!el.querySelector('img'))continue;" +
            "var r=el.getBoundingClientRect();" +
            "if(r.width<vr.width*0.6||r.height<vr.height*0.5)continue;" +
            "mark(el);if(hide(el,'playerad'))n++;}" +
            "p=p.parentElement;up++;}}}" +
            "var t=0;function run(){clearTimeout(t);t=setTimeout(function(){" +
            "try{byLabel();}catch(e){}try{bySize();}catch(e){}" +
            "try{byOverlay();}catch(e){}try{byPlayerAd();}catch(e){}},400);}" +
            "try{new MutationObserver(run)" +
            ".observe(document.documentElement,{childList:true,subtree:true});}catch(e){}" +
            "document.addEventListener('DOMContentLoaded',run);" +
            "window.addEventListener('load',run);run();})();"

    /**
     * 被拦下来的**图片**回什么：一枚 1×1 的透明 GIF。
     *
     * 直接 204 / 空体的话，内联在正文里的广告图会显示成"碎图"图标（拦广告反而
     * 拦出一堆破图）；回一张透明像素，占位照旧、什么都看不见。
     */
    // 43 字节的经典透明 GIF：6 头 + 6 逻辑屏 + (1 比例 + 6 调色板) + 8 图形控制 +
    // (5 图像描述 + 5 帧头) + (5 LZW 数据) + 1 结尾
    val BLANK_GIF: ByteArray = (
        "474946383961" + "010001008000" + "00000000ffffff" + "21f9040100000000" +
            "2c00000000" + "0100010000" + "0202440100" + "3b"
        ).chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    /** URL 的扩展名看起来是图片（用透明像素回应，见 [BLANK_GIF]）。 */
    fun looksLikeImage(url: String): Boolean {
        val path = url.lowercase().substringBefore('?').substringBefore('#')
        return IMAGE_EXTENSIONS.any { path.endsWith(it) }
    }

    private val IMAGE_EXTENSIONS = listOf(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg")

    private fun jsString(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "") + "\""
}
