package com.lerxu.android.browser

/**
 * 影视模式：识别影视页 + 页面侧探测脚本。
 *
 * 「进入影视网站后自动开启，把网页的影视内容提取出来、用自己的 UI 重新呈现」——
 * 要做到这一点，先得回答两个问题：**这一页是不是影视页**（[looksLikeMoviePage]），
 * 以及**页面里有没有一个像样的视频元素**（[INJECT_JS] 报给 App）。
 *
 * 三条判据的由来（用户已确认的口径）：
 * 1. **不认域名、不要站点名单**。影视站无穷无尽，名单永远补不完；而"通用启发式"
 *    只要认两件事——页面里真的摆着一个像样的视频、而且确实嗅到了视频流。
 * 2. **视频元素与视频流必须同时成立**。只有视频元素不够：站点首页 / 资讯页的
 *    自动播放广告位、装饰性背景片到处都是，光看元素会把普通页面误判成影视页。
 *    只有视频流也不够：很多页面在后台预加载下一集的分片（`<link rel=preload>`、
 *    播放器预热），用户根本不在看视频。两个信号**同时**成立，才说明"用户正对着
 *    一个在放的视频"，这时才值得把整页换成我们自己的影视页。
 * 3. **自家首页除外**：它是本地页面，不参与这套判定。
 */
object MovieMode {

    /**
     * 注入脚本（文档起始 + 主题 payload 两处都挂，见 `installPageToolsDocStart`
     * 与 `applyWebTheme`）。
     *
     * 它只做两件事，**绝不改页面**：
     * - 被动探测：把"这一页有没有像样的视频元素"（`hasPlayerVideo`）报给 App。
     *   App 那条判据里只有这一个来源，所以它必须从**安装那一刻**就开始探 ——
     *   等 `__lerxuMovieStart` 才探就永远进不去（先有鸡还是先有蛋）。
     * - 启停：`__lerxuMovieStart` / `__lerxuMovieStop` 只启停那个低频复检定时器。
     *
     * 为什么**不碰** `<video>` 的可见性：那是 [PageVideoDetector] 的地盘（它负责
     * "只留原生播放器"）。影视模式要能随时退出、退出后网页和进入前一模一样，
     * 所以这里一个 DOM 都不写。
     */
    val INJECT_JS: String =
        "(function(){\n" +
            "if(window.__lerxuMovie)return;window.__lerxuMovie=1;\n" +
            "var MINW=200,MINH=120;\n" +
            "\n" +
            "/* ────────────────────────── 扫出「像样」的那一个 ──────────────────────────\n" +
            "   主文档 + **同源** iframe（跨域的 contentDocument 读不到，直接跳过）。\n" +
            "   影视站常把播放器塞在同域 iframe 里，不进去找就会漏判。 */\n" +
            "function eachDoc(fn){\n" +
            "  var docs=[document],seen=0;\n" +
            "  while(docs.length&&seen++<16){\n" +
            "    var d=docs.shift();\n" +
            "    fn(d);\n" +
            "    var fs=null;try{fs=d.querySelectorAll('iframe');}catch(e){fs=null;}\n" +
            "    if(!fs)continue;\n" +
            "    for(var i=0;i<fs.length;i++){\n" +
            "      var sub=null;try{sub=fs[i].contentDocument;}catch(e){sub=null;}\n" +
            "      if(sub&&!sub.__lerxuMovieSeen){sub.__lerxuMovieSeen=1;docs.push(sub);}\n" +
            "    }\n" +
            "  }\n" +
            "}\n" +
            "/* 尺寸过阈值、且**不是背景视频**（静音 + 循环 = 站点的装饰性背景片，\n" +
            "   首页 / 详情页到处都是，认它就会把普通页面一路误判成影视页）。\n" +
            "   矩形量不到时（还没插进可视区）退回看它自己的 videoWidth/Height ——\n" +
            "   有些播放器是先起播、再被脚本挪进可视区。 */\n" +
            "function decent(v){\n" +
            "  try{\n" +
            "    if(v.loop&&v.muted)return false;\n" +
            "    var r=v.getBoundingClientRect();\n" +
            "    if(r&&r.width>=MINW&&r.height>=MINH)return true;\n" +
            "    if((v.videoWidth||0)>=MINW&&(v.videoHeight||0)>=MINH)return true;\n" +
            "    return false;\n" +
            "  }catch(e){return false;}\n" +
            "}\n" +
            "function pick(){\n" +
            "  var best=null,area=0;\n" +
            "  eachDoc(function(d){\n" +
            "    var vs=null;try{vs=d.querySelectorAll('video');}catch(e){vs=null;}\n" +
            "    if(!vs)return;\n" +
            "    for(var i=0;i<vs.length;i++){\n" +
            "      var v=vs[i];\n" +
            "      if(!decent(v))continue;\n" +
            "      var r=null;try{r=v.getBoundingClientRect();}catch(e){r=null;}\n" +
            "      var a=r?(r.width*r.height):(MINW*MINH);\n" +
            "      if(a>area){area=a;best=v;}\n" +
            "    }\n" +
            "  });\n" +
            "  return best;\n" +
            "}\n" +
            "/* 标题取 document.title，截到 120 字符：列表里一行放不下，太长也只是白传。 */\n" +
            "function pageTitle(){\n" +
            "  var t='';\n" +
            "  try{t=document.title||'';}catch(e){}\n" +
            "  t=String(t).replace(/^\\s+|\\s+$/g,'');\n" +
            "  if(t.length>120)t=t.substring(0,120);\n" +
            "  return t;\n" +
            "}\n" +
            "/* 报给 App。桥不在（在别的宿主里跑这段脚本 / 页面把桥清掉了）**也不许抛错**：\n" +
            "   这份脚本对所有站生效，一个未捕获的异常会把后面的逻辑一起带走。 */\n" +
            "function report(has){\n" +
            "  try{\n" +
            "    if(window.LerxuMovie&&window.LerxuMovie.video)window.LerxuMovie.video(has,pageTitle());\n" +
            "  }catch(e){}\n" +
            "}\n" +
            "/* 被动探测：**只读、绝不写 DOM** —— 影视模式要能随时退出，退出后网页必须和\n" +
            "   进入前一模一样（<video> 的可见性归 PageVideoDetector 管，这里抢过来就会\n" +
            "   在退出影视模式时把网页播放器改花）。 */\n" +
            "function probe(){\n" +
            "  var has=pick()?1:0;\n" +
            "  if(has===window.__lerxuMovieHas)return;\n" +
            "  window.__lerxuMovieHas=has;\n" +
            "  report(has);\n" +
            "}\n" +
            "function arm(){\n" +
            "  if(window.__lerxuMovieTimer)return;\n" +
            "  /* SPA 换集会把 <video> 整个换掉（元素不再是同一个），2s 复检一次足够；\n" +
            "     只有「有 / 没有」翻面时才过桥，这点频率不会把主线程刷爆。 */\n" +
            "  window.__lerxuMovieTimer=setInterval(probe,2000);\n" +
            "}\n" +
            "window.__lerxuMovieStart=function(){\n" +
            "  window.__lerxuMovieOn=1;\n" +
            "  probe();\n" +
            "  arm();\n" +
            "};\n" +
            "window.__lerxuMovieStop=function(){\n" +
            "  window.__lerxuMovieOn=0;\n" +
            "  if(window.__lerxuMovieTimer){clearInterval(window.__lerxuMovieTimer);window.__lerxuMovieTimer=null;}\n" +
            "  /* 复位标记：影视模式动过的就只有这个定时器和这几个标记，清掉即等于从没来过。 */\n" +
            "  window.__lerxuMovieHas=null;\n" +
            "};\n" +
            "/* 安装即探一次 + 几次早期重试（document-start 那一刻 <video> 还没被解析出来），\n" +
            "   之后交给低频心跳把 hasPlayerVideo 一直维持成当下的真值。 */\n" +
            "try{\n" +
            "  probe();\n" +
            "  setTimeout(probe,600);setTimeout(probe,1600);setTimeout(probe,3000);\n" +
            "  arm();\n" +
            "}catch(e){}\n" +
            "})();\n"
}

/**
 * 这一页是不是"影视页"。
 *
 * 三条**同时**成立才算：
 * - `!isHomePage`：自家首页是本地页面，不参与判定；
 * - `hasPlayerVideo`：页面里真摆着一个像样的视频元素（见 [INJECT_JS] 的 `decent`）；
 * - 嗅探到至少一条 `SniffKind.VIDEO`：确实有视频流被拉下来。
 *
 * 为什么是这三条（而不是认域名 / 站点名单）：影视站无穷无尽、域名还老换，
 * 名单永远补不完；而"有视频元素 + 有视频流"是**任何**影视页都成立、普通页面
 * 基本不成立的一组信号。两条缺一不可——只有元素会把首页广告位、装饰背景片
 * 误判进来；只有流会把"后台预热下一集"的普通页面误判进来。
 *
 * 抽成纯函数是为了能在 JVM 上钉死：判据一旦放宽，用户侧的体感是"随便点开个
 * 网页就被换成影视页"，很难从现象反推。
 */
internal fun looksLikeMoviePage(
    hasPlayerVideo: Boolean,
    sniffed: List<SniffedResource>,
    isHomePage: Boolean
): Boolean = !isHomePage && hasPlayerVideo && sniffed.any { it.kind == SniffKind.VIDEO }
