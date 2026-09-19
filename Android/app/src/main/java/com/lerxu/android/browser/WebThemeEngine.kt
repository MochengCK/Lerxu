package com.lerxu.android.browser

/**
 * Web 主题引擎：**站点自带主题优先，我们的覆盖只是兜底**。
 *
 * 优先级：
 * 1. 让网页启用**它自己的**深色 / 浅色模式 ——
 *    - 自带官方深色主题的站点（B 站那套 bili-theme 调色板）：注入它的官方
 *      深色值，整站 UI 都跟随站点自己的变量体系，卡片、分割线、弹层天然协调；
 *    - 靠 `prefers-color-scheme` 的站点：文档起始脚本把媒体查询对齐到应用
 *      主题（WebView 的 uiMode 上下文已在 Kotlin 侧保证，这里补齐 JS 侧）。
 * 2. 只有当页面**没跟上**（深色主题下仍是浅色页 / 浅色主题下仍是深色页）
 *    时，才注入兜底覆盖（Lerxu 色板 + 站点适配器）。
 *
 * 判定放页面内做（只看 body/html 的计算背景亮度，O(1)），带滞后复检：
 * 站点渲染是异步的，SSR 型站点首帧浅色、hydrate 后才变深，不该被我们
 * 抢先涂成兜底色；而永远不变深的站点几毫秒内就会盖上兜底，不留白。
 *
 * 其余历史约束不变：
 * - **不用整页 CSS filter 反色**（会级联到视频/图片/代码高亮），媒体元素
 *   显式 `filter:none` 保护；
 * - **不 `* { background }`**，兜底也只动外壳 / 控件 / 链接 / 滚动条；
 * - 样式节点常驻 + MutationObserver（防抖 + requestIdleCallback）只做
 *   O(1) 存在性检查，新节点由 CSS 选择器自动命中，不做全页扫描。
 */
object WebThemeEngine {

    /** Lerxu 主题色板（十六进制字符串），顺序与首页注入的 homeColors 一致。 */
    data class Tokens(
        val background: String,
        val surface: String,
        val border: String,
        val text: String,
        val muted: String,
        val primary: String
    )

    /** 从 homeColors（逗号分隔的 #RRGGBB）解析；不足 6 段返回 null（用兜底）。 */
    fun tokensFrom(colors: String): Tokens? {
        val parts = colors.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size < 6) return null
        return Tokens(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
    }

    private val fallback = Tokens("#101014", "#1C1F26", "#2C313A", "#DFE3E8", "#9AA4B2", "#4A9EFF")

    /** 一个页面要下发的两层：站点自带（native）+ 兜底（fallback）。 */
    class SiteTheme(val native: String, val fallback: String)

    /** 生成当前页面该下发的两层样式。深色才谈"启用站点深色"；浅色站点默认就浅。 */
    fun css(host: String, dark: Boolean, t: Tokens): SiteTheme {
        val h = host.lowercase()
        // **移动版 B 站（m.bilibili.com）压根没有深色样式**（用户点名）：
        // 给它注入桌面那套调色板只会染出"半深不深"的半成品。这里把它排除在
        // "站点自带深色"之外 —— 它于是自然落到兜底覆盖那一层（页面测出是浅色 → 盖我们的一套）。
        // 桌面版 www.bilibili.com 照旧用自己的官方深色。
        val mobileBili = h.startsWith("m.bilibili.com")
        val native = if (dark && !mobileBili) {
            natives.firstOrNull { h.contains(it.hostMatch) }?.css.orEmpty()
        } else {
            ""
        }
        return SiteTheme(native, fallbackCss(h, dark, t))
    }

    /**
     * 站点自带的深色模式：调色板原样来自站点官方主题包（[WebThemePalettes]），
     * 不做任何配色改写 —— 我们只负责"把开关拨到深色"。
     */
    private class Native(val hostMatch: String, val css: String)

    private val natives = listOf(
        Native(
            "bilibili.com",
            ":root{" + WebThemePalettes.BILI_DARK_DECLS + "}" +
                // 声明页面是深色：表单控件/滚动条跟随，同时让渲染层的
                // "算法变暗"跳过这个页面（避免二次压暗）
                "html{color-scheme:dark!important;}"
        )
    )

    /**
     * 注入到每个网页的常驻运行时（幂等）：
     * `window.__lerxuTheme.set(native, fallback, dark)` 下发两层样式；
     * 页面内自行探测 body/html 背景亮度决定兜底层是否生效。
     * 顺带清掉旧版整页反色的遗留节点。
     */
    const val RUNTIME_JS: String =
        "(function(){if(window.__lerxuTheme)return;" +
            "var legacy=document.getElementById('lerxu-night-style');if(legacy){legacy.remove();}" +
            "function setCss(id,css){var n=document.getElementById(id);" +
            "if(!n){if(!css)return;n=document.createElement('style');n.id=id;" +
            "(document.head||document.documentElement).appendChild(n);}" +
            "if(n.textContent!==css)n.textContent=css;}" +
            // MediaWiki 系（维基百科 / 维基词典 / 各种 wiki）：它的夜间模式**不看**
            // prefers-color-scheme，而是靠 html 上这一个 class 触发整套设计 token
            // 换色（`html.skin-theme-clientpref-night` 就是它们编译进样式表的选择器）。
            // 默认跟的是**用户自己在站内的偏好**，而站内默认是浅色 —— 所以应用是深色
            // 时手机版维基百科照样白（用户点名）。这里替用户把这个开关拨到夜间，
            // 整站就用它自己的深色配色，比我们硬涂一套兜底色协调得多。
            // 判据用 `skin-*` 前缀 / generator 元信息；非 MediaWiki 页面上这个 class
            // 不命中任何样式，纯属无害
            "function isMediaWiki(){try{" +
            "var c=document.documentElement.className||'';if(c.indexOf('skin-')>=0)return true;" +
            "var m=document.querySelector('meta[name=\"generator\"]');" +
            "return !!(m&&/mediawiki/i.test(m.getAttribute('content')||''));}catch(e){return false;}}" +
            "function applySkinTheme(){try{var el=document.documentElement;" +
            "var night='skin-theme-clientpref-night';" +
            "if(st.dark&&isMediaWiki()){" +
            "if(!el.classList.contains(night))el.classList.add(night);" +
            // 站内显式选了"浅色"（day）或"跟随系统"（os）时要盖过去：留着 day 会让
            // 两套 token 同时命中、谁生效取决于样式表顺序；os 则要看系统媒体查询
            "el.classList.remove('skin-theme-clientpref-day');" +
            "el.classList.remove('skin-theme-clientpref-os');" +
            "}else{el.classList.remove(night);}}catch(e){}}" +
            // 判"页面是不是深色"时，MediaWiki 系优先读它的设计 token：它的白底往往
            // 画在内容容器上，body 本身量出来还是浅的，只按背景色判会把"站点自己的
            // 深色"误判成浅色，于是又把兜底层盖上去 —— 两套配色打架
            "function pageDark(){" +
            "try{var v=getComputedStyle(document.documentElement).getPropertyValue('--background-color-base');" +
            "var hm=v&&v.match(/#([0-9a-f]{6})/i);" +
            "if(hm){var n=parseInt(hm[1],16);" +
            "return (0.2126*((n>>16)&255)+0.7152*((n>>8)&255)+0.0722*(n&255))/255<0.5;}}catch(e){}" +
            "var ns=[document.body,document.documentElement];" +
            "for(var i=0;i<ns.length;i++){if(!ns[i])continue;" +
            "var c=getComputedStyle(ns[i]).backgroundColor;var m=c&&c.match(/[0-9.]+/g);" +
            "if(!m||m.length<3)continue;if(m.length>=4&&parseFloat(m[3])===0)continue;" +
            "return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255<0.5;}" +
            // 背景是透明的（大量站点把底色放在外层 div / 背景图上）时不能就此放弃：
            // 用**正文颜色**反推 —— 深色文字说明站点是浅色的。少了这一步，这类站点
            // 在深色主题下既不会启用站点自己的深色模式（它们没跟 prefers-color-scheme），
            // 也落不到我们的兜底层（量不出结果 → 判定"无需处理"），结果就是一片白。
            "var el=document.body||document.documentElement;if(!el)return null;" +
            "var tc=getComputedStyle(el).color;var tm=tc&&tc.match(/[0-9.]+/g);" +
            "if(tm&&tm.length>=3){return (0.2126*tm[0]+0.7152*tm[1]+0.0722*tm[2])/255>=0.5;}" +
            "return null;}" +
            "var st={site:'',fb:'',dark:false,applied:''};" +
            // 量的时候要把兜底层临时禁掉：兜底自己就可能把页面涂成深色，
            // 不禁掉的话复检量到的是我们自己的颜色，会来回"套上又撤下"
            "function measureDark(){var fb=document.getElementById('lerxu-fallback');" +
            "var was=fb?fb.disabled:false;if(fb)fb.disabled=true;" +
            "var d=pageDark();if(fb)fb.disabled=was;return d;}" +
            "function decide(){setCss('lerxu-site',st.site);applySkinTheme();" +
            "var d=measureDark();var need=(d===null)?false:(d!==st.dark);" +
            "st.applied=need?st.fb:'';setCss('lerxu-fallback',st.applied);}" +
            "window.__lerxuTheme={set:function(site,fb,dark){" +
            "st.site=site||'';st.fb=fb||'';st.dark=!!dark;window.__lerxuDark=st.dark;" +
            "decide();" +
            // 只在兜底**已生效**时才延迟复检（SSR 站点 hydration 后自己变深就该把
            // 兜底撤掉）；页面已达标就不再打扰。
            //
            // 复检**不止跑两次**：必应搜索页第一次访问时，它自己的深色要等两三秒
            // 才落下来（首访没有主题 cookie，服务端先给浅色，之后才切），只查
            // 500/1500ms 就永远看不到 —— 兜底一直盖着，用户得手动刷新一次才恢复成
            // 站点自己的深色（用户点名的现象）。现在改成"只要兜底还在就按递增间隔
            // 继续复检"，约 35 秒封顶，之后彻底不再打扰。每次复检只是两次
            // getComputedStyle 读取，代价可以忽略。
            "var n=0;var again=function(){if(!st.applied)return;decide();" +
            "if(st.applied&&n<9){n++;setTimeout(again,400+n*700);}};" +
            "setTimeout(again,400);}};" +
            "var pending=false;" +
            "try{new MutationObserver(function(){if(pending)return;pending=true;" +
            "var run=function(){pending=false;" +
            // 站点脚本（MediaWiki 的外观面板之类）可能自己改掉 html 上的主题 class，
            // 这里每次 DOM 变动都顺手拨回来（幂等，代价只有一次 classList 判断）
            "applySkinTheme();" +
            "setCss('lerxu-site',st.site);setCss('lerxu-fallback',st.applied);};" +
            "if(window.requestIdleCallback){requestIdleCallback(run,{timeout:500});}" +
            "else{setTimeout(run,200);};" +
            "}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}" +
            "})();"

    /**
     * 文档起始脚本：把 `prefers-color-scheme` 对齐到应用主题。
     *
     * 站点（YouTube / Google 这类）在首帧就用 `matchMedia` 决定自己的深浅色，
     * 这里在**任何页面脚本之前**把媒体查询的结果钉死成应用主题对应的值，
     * 站点自己的深浅色逻辑就会原样跑起来 —— 我们不改它的任何颜色。
     * 返回的 MediaQueryList 替身保留 matches/media/增删监听全套接口，
     * 真实引擎值变化时原样转发 change 事件。
     */
    fun docStartJs(dark: Boolean): String =
        "(function(){window.__lerxuDark=" + dark + ";" +
            "try{var orig=window.matchMedia;if(!orig||orig.__lerxu)return;" +
            "var mk=function(q){try{" +
            "if(typeof q==='string'&&q.indexOf('prefers-color-scheme')>=0){" +
            "var dt=/dark/i.test(q)?true:(/light/i.test(q)?false:null);" +
            "if(dt!==null){var want=!!window.__lerxuDark;var hit=(dt===want);" +
            "var real=orig.call(window,'(prefers-color-scheme:'+(hit?'dark':'light')+')');" +
            "var ls=[];" +
            "try{real.addEventListener('change',function(){" +
            "for(var i=0;i<ls.length;i++){try{ls[i].call(real,real);}catch(e){}}});}catch(e){}" +
            "return{media:q,matches:hit,onchange:null," +
            "addEventListener:function(t,f){if(t==='change'&&f)ls.push(f);}," +
            "removeEventListener:function(t,f){var i=ls.indexOf(f);if(i>=0)ls.splice(i,1);}," +
            "addListener:function(f){if(f)ls.push(f);}," +
            "removeListener:function(f){var i=ls.indexOf(f);if(i>=0)ls.splice(i,1);}," +
            "dispatchEvent:function(){return false;}};}}}catch(e){}" +
            "return orig.call(window,q);};" +
            "mk.__lerxu=true;window.matchMedia=mk;}catch(e){}})();"

    /**
     * 兜底层：**最小安全集**——只锁页面外壳与交互强调，不逐元素改色。
     *
     * 为什么收敛：把 a/input/表格边框都强行锁成主题色时，站点自带的
     * 浅色卡片会留下深色文字、浅色输入框被染深，区块之间互相打架，
     * 整页配色看起来"乱"。只处理 body 外壳后，站点自己的卡片在设计上
     * 本来就是"浅底深字"，放在深色外壳里依旧自洽可读。
     */
    private fun generic(dark: Boolean, t: Tokens): String = buildString {
        append(":root{--lerxu-bg:").append(t.background)
        append(";--lerxu-surface:").append(t.surface)
        append(";--lerxu-border:").append(t.border)
        append(";--lerxu-text:").append(t.text)
        append(";--lerxu-muted:").append(t.muted)
        append(";--lerxu-primary:").append(t.primary).append(";}")
        // ① 页面外壳（顺带声明 color-scheme：滚动条/表单控件跟随）
        append("html{color-scheme:").append(if (dark) "dark" else "light").append("!important;}")
        append("html,body{background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}")
        // ② 交互强调：链接、控件强调色、焦点环、选中态、滚动条
        append("a{color:var(--lerxu-primary)!important;}")
        append("button,input,select,textarea{accent-color:var(--lerxu-primary)!important;}")
        append(":focus-visible{outline-color:var(--lerxu-primary)!important;}")
        append("::selection{background:var(--lerxu-primary)!important;color:var(--lerxu-bg)!important;}")
        append("::-webkit-scrollbar{background:transparent;}")
        append("::-webkit-scrollbar-thumb{background:var(--lerxu-border)!important;}")
        // ②′ **默认就是浅色的那几类组件**：不压它们，深色页面上就会东一块浅、西一块浅
        //（用户点名"有的组件深、有的组件浅"）。这里只碰**没有品牌含义**的那几类 ——
        // 表单控件、下拉项、表格、代码块、对话框、分隔线、占位符：它们在任何站点上
        // 都该跟随主题。**按钮的底色故意不动**：主按钮往往是品牌色，压成灰才是真的
        // 把配色搞乱。
        append("input,textarea,select,optgroup,option{")
        append("background:var(--lerxu-surface)!important;color:var(--lerxu-text)!important;")
        append("border-color:var(--lerxu-border)!important;}")
        append("input::placeholder,textarea::placeholder{color:var(--lerxu-muted)!important;}")
        append("input:disabled,textarea:disabled,select:disabled{")
        append("background:var(--lerxu-bg)!important;color:var(--lerxu-muted)!important;}")
        append("table,thead,tbody,tr,th,td{background-color:transparent!important;")
        append("color:var(--lerxu-text)!important;border-color:var(--lerxu-border)!important;}")
        append("hr{border-color:var(--lerxu-border)!important;}")
        append("pre,code,kbd,samp{background:var(--lerxu-surface)!important;")
        append("color:var(--lerxu-text)!important;}")
        append("dialog,[role=dialog],[aria-modal=true]{background:var(--lerxu-surface)!important;")
        append("color:var(--lerxu-text)!important;}")
        append("blockquote{border-color:var(--lerxu-border)!important;color:var(--lerxu-muted)!important;}")
        // ③ 媒体内容永不参与主题化：显式清掉任何滤镜
        append("video,canvas,img,picture,iframe{filter:none!important;}")
    }

    /**
     * 兜底层的站点细化：站点没有自己的深色模式时，通用外壳之外再罩
     * 各自 UI 容器（导航、搜索框、结果卡片），播放器区域不动。
     */
    private class Adapter(val hostMatch: String, val css: (Tokens) -> String)

    private val darkAdapters = listOf(
        Adapter("bilibili.com", { _ ->
            // 极端情况（原生调色板没命中，比如老版页面）：退回变量覆盖
            ":root{--bg1:var(--lerxu-surface)!important;--bg1_shallow:var(--lerxu-surface)!important;" +
                "--bg2:var(--lerxu-bg)!important;--bg2_shallow:var(--lerxu-bg)!important;" +
                "--bg3:var(--lerxu-bg)!important;--bg1_modal:var(--lerxu-surface)!important;" +
                "--text1:var(--lerxu-text)!important;--text2:var(--lerxu-muted)!important;" +
                "--text3:var(--lerxu-muted)!important;--text_theme:var(--lerxu-primary)!important;" +
                "--line1:var(--lerxu-border)!important;--line2:var(--lerxu-border)!important;" +
                "--brand:var(--lerxu-primary)!important;--brand_thin:var(--lerxu-primary)!important;" +
                "--brand_selected:var(--lerxu-primary)!important;}" +
                "body{background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}"
        }),
        Adapter("youtube.com", { _ ->
            // 只兜外壳与搜索框；正文/卡片文字交给站点自己，
            // #ytd-player 不写任何规则，视频画面零影响
            "html,body{background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}" +
                "ytd-app,#background-holder,ytd-masthead{" +
                "background:var(--lerxu-bg)!important;}" +
                "#search-input-container input{background:transparent!important;color:var(--lerxu-text)!important;}"
        }),
        Adapter("google.", { _ ->
            // 搜索页：外壳与搜索框；结果标题的链接色由通用层的 a 规则统一
            "body,.sfbg,#gb,#main,#search,#rhs,#rcnt,#tophf,#foot{" +
                "background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}" +
                ".RNNXgb,#searchform>div{background:var(--lerxu-surface)!important;}"
        }),
        Adapter("bing.", { _ ->
            "body,#b_content,#b_results .b_algo{color:var(--lerxu-text)!important;}" +
                "body,#b_top,#b_context,#b_results{background:transparent!important;}" +
                "#b_header,#satb,#b_content{background:var(--lerxu-bg)!important;}" +
                "#b_results>li{background:var(--lerxu-surface)!important;}" +
                ".b_algo a h2{color:var(--lerxu-primary)!important;}" +
                "#sb_form_q{background:var(--lerxu-surface)!important;color:var(--lerxu-text)!important;}"
        }),
        Adapter("baidu.com", { _ ->
            // 搜索页：结果卡片与外壳跟色；百度首页的搜索框保持站点原样
            "#wrapper,#head,#content_left,#content_right,.result-op,.c-container{" +
                "background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}" +
                ".result,.c-container{color:var(--lerxu-text)!important;}" +
                ".c-title a,.t a{color:var(--lerxu-primary)!important;}" +
                ".c-abstract,.c-color-text{color:var(--lerxu-muted)!important;}"
        }),
        Adapter("zhihu.com", { _ ->
            // 卡片与正文外壳；图片（img）由通用层保护，不动
            ".AppHeader,.Sticky,.Card,.QuestionHeader,.App-main{" +
                "background:var(--lerxu-bg)!important;color:var(--lerxu-text)!important;}" +
                ".ContentItem-title a,.QuestionHeader-title{color:var(--lerxu-text)!important;}" +
                ".RichText{color:var(--lerxu-text)!important;}" +
                ".Button--blue{background:var(--lerxu-primary)!important;}"
        })
    )

    private fun fallbackCss(host: String, dark: Boolean, t: Tokens): String {
        val adapter = if (dark) darkAdapters.firstOrNull { host.contains(it.hostMatch) } else null
        return generic(dark, t) + (adapter?.css?.invoke(t).orEmpty())
    }

    /** 兜底：tokens 缺失（主题还没同步到）时用固定深色调色板，保证不白屏闪跳。 */
    fun safeTokens(colors: String): Tokens = tokensFrom(colors) ?: fallback
}
