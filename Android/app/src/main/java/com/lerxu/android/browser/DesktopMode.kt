package com.lerxu.android.browser

/**
 * 网页「电脑模式」：把页面按**桌面浏览器**的样子呈现（用户点名要的那枚右上角快捷开关）。
 *
 * 只做两件事，两件缺一都不成立：
 *
 * 1. **UA 换成桌面 Chrome**（[desktopUserAgent]）—— 站点据此给桌面版 HTML。只用这一条时，
 *    带 `width=device-width` 的响应式站点仍旧按手机宽度排版（媒体查询看的是布局宽度），
 *    看着还是"手机版"，所以要第二条。
 * 2. **把页面的 viewport 钉成 [VIEWPORT_WIDTH]**（[docStartJs]）—— 布局宽度不再是屏幕宽，
 *    媒体查询因此走桌面那一档；`useWideViewPort` + `loadWithOverviewMode`（见
 *    `BrowserController.createWebView`）再把这条 1280 宽的版面整幅缩到屏幕宽，读起来就是
 *    桌面页整页的样子，要看清某块自己双指放大。
 *
 * 脚本挂在**文档起始**那一档（`addDocumentStartJavaScript`）：`<meta name="viewport">` 是
 * 解析到 `head` 才出现的，所以这里挂一个 `MutationObserver` 盯着，一出现就改；4 秒后自己
 * 断开（那时版面早已成形，再盯下去只是白耗 CPU）。
 *
 * **自家首页要放过**（`file:` 协议）：`browser-home.html` 是照手机宽度画的，套上 1280 会
 * 排版全乱 —— 那也是唯一一处 `file:` 文档。
 *
 * 常量与纯函数都在这里（UA 拼装、脚本正文），单测 `DesktopModeTest` 钉住。
 */
object DesktopMode {

    /**
     * 电脑模式的布局宽度（CSS px）。
     *
     * 1280 是桌面站点最常见的断点档（≥1200 那一档就是"完整桌面版"）：再窄（1024 / 980）
     * 很多站点会退到平板版面，两边留白或改成两栏，反而不像电脑。
     */
    const val VIEWPORT_WIDTH = 1280

    /** 从系统默认 UA 里取 Chromium 版本号（`Chrome/120.0.6099.144`）。 */
    private val CHROME_VERSION = Regex("""Chrome/(\d+(?:\.\d+)*)""")

    /**
     * 认不出 Chromium 版本时的兜底 UA。
     *
     * 正常不会走到：Android WebView 的默认 UA 一定带 `Chrome/<版本>`。留一个**像样的**
     * 桌面 Chrome 而不是空串 —— UA 为空时 WebView 会退回默认 UA，电脑模式就静悄悄地失效了。
     */
    const val FALLBACK_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    /**
     * 由 WebView 的默认 UA 拼一个**桌面 Chrome** UA。
     *
     * 为什么是"拼"而不是写死一串：UA 里的版本号要跟设备上真实的 Chromium 一致，否则
     * 站点会按一个它不认识的版本来给功能（写死老版本 = 被当古董浏览器，给降级页面）。
     * 平台取 Windows（桌面站点覆盖最广的那一档）。`Mobile` / `wv` 两个标记必须去掉：
     * 留着它们，不少站点照样判成"手机浏览器"。
     */
    fun desktopUserAgent(defaultUa: String?): String {
        val version = CHROME_VERSION.find(defaultUa.orEmpty())?.groupValues?.getOrNull(1)
        if (version.isNullOrBlank()) return FALLBACK_UA
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/$version Safari/537.36"
    }

    /**
     * 文档起始脚本：把 viewport 钉成 [VIEWPORT_WIDTH]。
     *
     * 关掉电脑模式时返回空串（[BrowserController.installThemeDocStart] 直接拼在主题脚本后面，
     * 空串等于没注入）。
     *
     * 写法约束（都是踩点）：
     * - **ES5**，不用箭头函数 / 可选链：老 WebView 上语法错会让整段脚本静默失效；
     * - 每次改动前先比一次 `content`：`MutationObserver` 会因为自己写属性再次回调，
     *   不比就成死循环；
     * - `document.head` 还没出现时**什么都不做**（挂到 `<html>` 上的 `meta` 不生效），
     *   等观察者下一次回调再补。
     */
    fun docStartJs(enabled: Boolean): String {
        if (!enabled) return ""
        return "(function(){" +
            "try{" +
            "if(location.protocol==='file:')return;" +
            // 只在**主框架**改：iframe 里的 viewport meta 本来就不生效（视口只属于顶层文档），
            // 往别人的文档里塞一个 meta 只是无谓的写操作
            "if(window.top!==window.self)return;" +
            "var want='width=" + VIEWPORT_WIDTH + "';" +
            "function fix(){" +
            "try{" +
            "var m=document.querySelector('meta[name=\"viewport\"]');" +
            "if(m){" +
            "if(m.getAttribute('content')!==want)m.setAttribute('content',want);" +
            "return;" +
            "}" +
            "var h=document.head;" +
            "if(!h)return;" +
            "m=document.createElement('meta');" +
            "m.setAttribute('name','viewport');" +
            "m.setAttribute('content',want);" +
            "h.appendChild(m);" +
            "}catch(e){}" +
            "}" +
            "fix();" +
            "var pending=false;" +
            "function schedule(){" +
            "if(pending)return;pending=true;" +
            "var run=function(){pending=false;fix();};" +
            "if(window.requestAnimationFrame){requestAnimationFrame(run);}else{setTimeout(run,16);}" +
            "}" +
            "var ob=null;" +
            "try{" +
            "ob=new MutationObserver(function(){" +
            "var m=document.querySelector('meta[name=\"viewport\"]');" +
            "if(!m||m.getAttribute('content')!==want)schedule();" +
            "});" +
            "ob.observe(document.documentElement||document,{childList:true,subtree:true});" +
            "}catch(e){}" +
            "setTimeout(function(){try{if(ob)ob.disconnect();}catch(e){}},4000);" +
            "document.addEventListener('DOMContentLoaded',fix);" +
            "window.addEventListener('load',fix);" +
            "}catch(e){}" +
            "})();"
    }
}
