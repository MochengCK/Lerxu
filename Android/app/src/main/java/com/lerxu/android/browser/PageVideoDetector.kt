package com.lerxu.android.browser

/**
 * 网页视频的**接管探测 + 位置回传 + 只留原生播放器**（全部注入脚本都在这里）。
 *
 * 它解决四件事：
 * 1. **什么时候接管**：页面里开始播放一个"像样的"视频时通知 App（MSE 型播放器在按下
 *    播放之前根本没有可播地址，只能等它起播），由 App 把这一路交给自己的播放器
 *    （见 `ui/player/NativePlayerOverlay`）。Shadow DOM 里的 `<video>` 用
 *    `composedPath()` 认出来 —— 事件冒到 document 上时 `target` 会被重定向成宿主元素。
 * 2. **贴在哪儿**：持续把那个 `<video>` 的 `getBoundingClientRect()`（主文档视口坐标）
 *    报回去 —— App 的播放器不是页面元素，不给它位置它就只会"浮"在原地。同一域 iframe
 *    里的播放器也算得出来（逐层加上 iframe 的偏移）；跨域 iframe 读不到内容，就退而
 *    拿"最大的那块可见 iframe"当它的位置。
 * 3. **只留原生播放器**：把页面那一层播放器**整套**按住 —— `<video>`（或跨域 iframe）
 *    自己不画 + 它外面那圈壳（站点自己的控制条/海报）跟着隐掉 + **在它的盒子上盖一块
 *    黑板**（站点用 `!important` 之类的手段压不住时，那块黑板保证不会露出站点自己的
 *    播放器）。判定只看高度（壳往往整宽、按宽度卡一层都收不掉），上限 1.9 倍视频高度，
 *    超过就说明已经是页面级的块了，立刻停手。退出时**按名单**逐个还原（Shadow DOM 里
 *    的元素用属性选择器扫不到，只能用名单）。
 * 4. **吸附规则也在页面里算**：网页里 `position:fixed/sticky` 的吸顶顶栏是画在视频之上的，
 *    而我们的播放器是窗口最上层的一层。页面直接报"**吸附之后**该摆在哪一条"（视频上沿越过
 *    顶栏露出来的那一条就钉在它下面，顶栏收起来就贴视口顶），原生那边照着摆、不再自己拼
 *    吸附线 —— 两处数字相加时对不齐就会在顶上裂出一道缝（见脚本里的 `playerTop`）。
 *
 * 几个必要的收敛（都在脚本里）：
 * - 背景视频不算（静音 + 循环）、太小的不算；一页只报一次（报完关闸门，重新导航重置）。
 * - 通知前先把页面这一路 `pause()`，不然原生播放器一起来就是两路声音。
 * - 用 `visibility` 而不是 `display`：`display:none` 会抽掉布局盒、把页面顶上去。
 *
 * 改这段脚本**必须**先跑 `node --check` 再用**真实浏览器**（无头 Chrome + 桩 DOM）跑一遍
 * 场景断言（`/tmp/jsdom/t*.html`；判据/事件细节踩过太多次，Kotlin 里的拼接看不出真实形态）。
 * 脚本的**唯一源文件**是 `/tmp/jsdom/INJECT_JS.js`，Kotlin 里的字面量由 `gen_kotlin.py`
 * 机械生成，再用 `diff_check.py` 还原回来逐字对拍 —— 手写转义/换行吃掉空格这类坑肉眼看不出来。
 */
object PageVideoDetector {

    val INJECT_JS: String =
"(function(){\n" +
        "if(window.__lerxuPageVideo)return;window.__lerxuPageVideo=1;\n" +
        "var MINW=200,MINH=120,armed=true;\n" +
        "\n" +
        "/* ────────────────────────── 找\"要跟的那一路\" ──────────────────────────\n" +
        "   主文档 + **同源** iframe（跨域的读不到 contentDocument，直接跳过）。\n" +
        "   影视站常把播放器塞在同域 iframe 里，不进去找就只能退回兜底位置。 */\n" +
        "function siblings(doc){\n" +
        "  var out=[];\n" +
        "  try{var vs=doc.querySelectorAll('video');for(var i=0;i<vs.length;i++)out.push(vs[i]);}catch(e){}\n" +
        "  return out;\n" +
        "}\n" +
        "function frames(doc){\n" +
        "  var out=[];\n" +
        "  try{var fs=doc.querySelectorAll('iframe');for(var i=0;i<fs.length;i++){\n" +
        "    var d=null;try{d=fs[i].contentDocument;}catch(e){d=null;}\n" +
        "    if(d)out.push(d);\n" +
        "  }}catch(e){}\n" +
        "  return out;\n" +
        "}\n" +
        "function eachDoc(fn){\n" +
        "  var docs=[document],seen=0;\n" +
        "  while(docs.length&&seen++<16){\n" +
        "    var d=docs.shift();\n" +
        "    fn(d);\n" +
        "    var fs=frames(d);\n" +
        "    for(var i=0;i<fs.length;i++){if(!fs[i].__lerxuSeen){fs[i].__lerxuSeen=1;docs.push(fs[i]);}}\n" +
        "  }\n" +
        "}\n" +
        "\n" +
        "/* 元素矩形 → **主文档视口坐标**：元素在 iframe 里时，把每一层 iframe 的偏移加上 */\n" +
        "function rectOf(el){\n" +
        "  var r=null;try{r=el.getBoundingClientRect();}catch(e){return null;}\n" +
        "  if(!r)return null;\n" +
        "  var x=r.left,y=r.top,w=r.width,h=r.height;\n" +
        "  try{\n" +
        "    var win=el.ownerDocument&&el.ownerDocument.defaultView,g=0;\n" +
        "    while(win&&win.frameElement&&g++<8){\n" +
        "      var fr=win.frameElement.getBoundingClientRect();\n" +
        "      x+=fr.left;y+=fr.top;\n" +
        "      win=fr.ownerDocument&&fr.ownerDocument.defaultView;\n" +
        "    }\n" +
        "  }catch(e){}\n" +
        "  return {x:x,y:y,w:w,h:h};\n" +
        "}\n" +
        "\n" +
        "/* 没有 <video> 可跟（典型：播放器在**跨域** iframe 里，主文档读不到它的内容）：\n" +
        "   退而求其次，挑\"最大的那块可见 iframe\"当成播放器所在的框 —— 它就在页面上、\n" +
        "   又量得到，位置照样能对上，壳也能一起隐掉。 */\n" +
        "function pickFrame(){\n" +
        "  var best=null,area=0;\n" +
        "  try{\n" +
        "    var fs=document.querySelectorAll('iframe');\n" +
        "    for(var i=0;i<fs.length;i++){\n" +
        "      var r=null;try{r=fs[i].getBoundingClientRect();}catch(e){continue;}\n" +
        "      if(!r||r.width<MINW||r.height<MINH)continue;\n" +
        "      var a=r.width*r.height;if(a>area){area=a;best=fs[i];}\n" +
        "    }\n" +
        "  }catch(e){}\n" +
        "  return best;\n" +
        "}\n" +
        "\n" +
        "function pick(minArea){\n" +
        "  minArea = minArea || 0;\n" +
        "  var v=window.__lerxuVid;\n" +
        "  if(v&&v.isConnected)return v;\n" +
        "  var best=null,area=minArea;\n" +
        "  eachDoc(function(d){\n" +
        "    var vs=siblings(d);\n" +
        "    for(var i=0;i<vs.length;i++){\n" +
        "      var r=rectOf(vs[i]);\n" +
        "      if(!r||r.w<1||r.h<1)continue;\n" +
        "      var a=r.w*r.h;if(a>area){area=a;best=vs[i];}\n" +
        "    }\n" +
        "  });\n" +
        "  if(!best&&!minArea)best=pickFrame();\n" +
        "  window.__lerxuVid=best;return best;\n" +
        "}\n" +
        "\n" +
        "/* 位置报**一位小数**：CSS px 取整会在滚动时产生 1px 台阶 —— 原生那边再乘密度\n" +
        "   放大成几个设备像素，读起来就是\"抖动\"。页面里那个 <video> 本身是亚像素级的。 */\n" +
        "function r1(v){return Math.round(v*10)/10;}\n" +
        "function send(payload){\n" +
        "  if(payload===window.__lerxuRectKey)return false;\n" +
        "  window.__lerxuRectKey=payload;\n" +
        "  try{LerxuVideoRect.rect(payload);}catch(e){}\n" +
        "  return true;\n" +
        "}\n" +
        "/* 站点那条吸顶顶栏：**认一次、缓存住，之后全用矩形算式**。\n" +
        "   为什么不再逐次命中测试：命中测试在滚动中会随每一帧滚动的量抖（采样点正好\n" +
        "   压在元素边界上、来回跨），所以才被压成\"页面静止 180ms 之后才采\" —— 代价\n" +
        "   是收放都要等停止滚动才跟得上（用户点名：向上滚导航栏出现后，得等我停下来\n" +
        "   它才让位置；吸附时顶栏收了、间距也还挂着）。而这两件事本来都不需要命中测试：\n" +
        "   `bar` 是那条栏**此刻露在视口顶的厚度**（收起来时它是连续变小的），`ct` 是\"栏压住视频\n" +
        "   上沿多少\" = 两个矩形的重叠高度（纯算术）。改成认一次元素、之后按当前矩形现算：栏\n" +
        "   自己带着补间收起/展开时，这两个量都连续变化，播放器顺手就跟上了，不用等静止。 */\n" +
        "var topBarEl=null;\n" +
        "function pickTopBar(){\n" +
        "  try{\n" +
        "    var vw=window.innerWidth||0,vh=window.innerHeight||0;\n" +
        "    if(vw<2||vh<2)return;\n" +
        "    var all=document.querySelectorAll('body *');var best=null,bh=0;\n" +
        "    for(var i=0;i<all.length;i++){\n" +
        "      var e=all[i];var cs=null;try{cs=getComputedStyle(e);}catch(x){continue;}\n" +
        "      if(cs.position!=='fixed'&&cs.position!=='sticky')continue;\n" +
        "      var rr=null;try{rr=e.getBoundingClientRect();}catch(x){continue;}\n" +
        "      if(!rr||rr.width<vw*0.8)continue;\n" +
        "      if(rr.height<20||rr.height>vh*0.3)continue;\n" +
        "      /* 贴顶才算：把它自己的 translateY 扣掉 —— 我们自己把它收起来之后它会跑到\n" +
        "         屏幕上方，那时 rect.top 是负的，不减回去就认不出是同一条栏了 */\n" +
        "      var ty=0;try{var m=cs.transform;\n" +
        "        if(m&&m!=='none'){var n=m.match(/matrix\\(([^)]+)\\)/);\n" +
        "          if(n){var q=n[1].split(',');ty=parseFloat(q[5])||0;}}}catch(x){}\n" +
        "      if(rr.top-ty>2)continue;\n" +
        "      if(rr.height>bh){bh=rr.height;best=e;}\n" +
        "    }\n" +
        "    if(best)topBarEl=best;\n" +
        "  }catch(e){}\n" +
        "}\n" +
        "/* 顶栏此刻的几何：认不到就返回 null（页面本来没有顶栏）。\n" +
        "   `vis` = 它**露在视口顶那一条的厚度**（不是它的高度！）—— 收起/展开时这个量是\n" +
        "   连续变化的，见 ctAndBar。 */\n" +
        "function barGeo(){\n" +
        "  if(topBarEl&&!topBarEl.isConnected)topBarEl=null;\n" +
        "  if(!topBarEl)pickTopBar();\n" +
        "  if(!topBarEl)return null;\n" +
        "  var rr=null;try{rr=topBarEl.getBoundingClientRect();}catch(e){return null;}\n" +
        "  if(!rr)return null;\n" +
        "  /* 不是靠平移收起的（`visibility:hidden` / `opacity:0`）：同样不占视口，\n" +
        "     留出空档照样是一道缝，一律按 0 报 */\n" +
        "  var cs=null;try{cs=getComputedStyle(topBarEl);}catch(e){}\n" +
        "  if(cs){\n" +
        "    if(cs.visibility==='hidden'||cs.visibility==='collapse')return out0(rr);\n" +
        "    var op=parseFloat(cs.opacity);\n" +
        "    if(!isNaN(op)&&op<0.05)return out0(rr);\n" +
        "  }\n" +
        "  var h=rr.height;\n" +
        "  if(!(h>0))return out0(rr);\n" +
        "  /* 顶栏贴在视口上沿（pickTopBar 认的就是贴顶那一条），所以它占住的是最上面那一段：\n" +
        "     厚度 = 下沿（往上一平移下沿就变小，收到 0 就是完全让开了）夹在 [0, 高度] 里 */\n" +
        "  var vis=rr.bottom;if(vis>h)vis=h;if(vis<0)vis=0;\n" +
        "  return {top:rr.top,bottom:rr.bottom,vis:vis};\n" +
        "}\n" +
        "function out0(rr){return {top:rr.top,bottom:rr.top,vis:0};}\n" +
        "/* 播放器**最终该摆在哪一条**（视口坐标）：吸附规则就这一行。\n" +
        "   视频上沿越过\"站点顶栏露出来的那一条\"就钉在它下面、不再往上跑（用户点名：\n" +
        "   \"超出可视范围自动吸附在顶部，跟着继续滑\"）；顶栏收起来（vis=0）时就贴着\n" +
        "   视口顶吸 —— 顶上不留任何空档。\n" +
        "   为什么这条规则放在页面里算、而不是报 `ct`/`bar` 让原生那边拼：早先原生侧是\n" +
        "   \"网页内容顶 + 顶栏高度\"两处数字相加，而那两个数各有各的量化与来源（顶栏高度、\n" +
        "   状态栏内边距、进度条那一截 2dp），对不齐时顶上就裂出一道缝、网页内容从缝里\n" +
        "   透出来（用户点名）。现在**吸附后的位置和视频矩形出自同一次 getBoundingClientRect**，\n" +
        "   结构上不可能对不齐。 */\n" +
        "function playerTop(r){\n" +
        "  var g=barGeo();\n" +
        "  if(!g)return r.y;\n" +
        "  return Math.max(r.y,g.vis);\n" +
        "}\n" +
        "/* `vis` 每报一次位置就现算一次（不再等页面静止）：它是\"当前两条矩形的重叠\"，\n" +
        "   跟命中测试无关，滚动中也不会抖 —— 顶栏带着补间收起/展开时，它连续变化，\n" +
        "   播放器顺手就跟上了（用户点名的那两条：向上滚导航栏出现后要立刻让位；\n" +
        "   吸附时顶栏收了、顶上就不该再留空档）。 */\n" +
        "/* 返回\"这一帧的位置真的变了没有\"：rAF 那条循环靠它决定还要不要继续跑（见 schedule）。 */\n" +
        "function report(){\n" +
        "  var v=window.__lerxuVid;\n" +
        "  // 站点把那个元素换掉了（切清晰度、转屏后重建播放器都会）：**重新挑一个**再报。\n" +
        "  // 早先这里直接报 gone，于是\"全屏转回来播放器就没了\" —— 元素一换，位置永远回不来。\n" +
        "  if(v&&!v.isConnected){window.__lerxuVid=null;v=null;}\n" +
        "  if(!v)v=pick(MINW*MINH);\n" +
        "  if(!v){send('{\"gone\":1}');return false;}\n" +
        "  var r=rectOf(v);\n" +
        "  if(!r||r.w<1||r.h<1){send('{\"gone\":1}');return false;}\n" +
        "  /* 报的是**吸附之后**的位置（playerTop）：原生那边照着摆就行，不再自己拼吸附线 */\n" +
        "  return send('{\"x\":'+r1(r.x)+',\"y\":'+r1(playerTop(r))+\n" +
        "    ',\"w\":'+r1(r.w)+',\"h\":'+r1(r.h)+'}');\n" +
        "}\n" +
        "window.__lerxuReportRect=report;\n" +
        "\n" +
        "/* 滚起来的时候**按帧报**（一路 rAF 到\"位置不再变\"且手指/惯性停下 180ms 为止）。\n" +
        "   为什么不是\"来一个 scroll 事件报一次\"：scroll 事件会被合并、也可能落在渲染之前 ——\n" +
        "   原位侧再按\"自己读到的滚动量\"补差值，两边一打架就是你看到的\"抖动\"。\n" +
        "   改成\"页面按帧说位置\"，原生那边就只认这一份，不再自己猜。\n" +
        "   为什么\"位置还在变\"也要继续跑（不只是 180ms 定时）：站点顶栏收起/展开是**它自己的\n" +
        "   CSS 补间**，滚停之后它还在动几百毫秒 —— 早先滚停 180ms 就收手，于是那一截动画\n" +
        "   我们只跟到一半，剩下的要等 500ms 心跳才补上（用户点名：\"它还要过一会才反应过来，\n" +
        "   而且是直接跳的\"）。改成只要这一帧的位置还在变就继续跟，跟到它自己停住为止。 */\n" +
        "var rafOn=false,lastScrollAt=0;\n" +
        "function schedule(){\n" +
        "  lastScrollAt=Date.now();\n" +
        "  /* 事件本身就是\"位置变了\"，先立刻报一次；再挂上 rAF 逐帧跟到停下来为止。\n" +
        "     （只挂 rAF 的话：某些时机下第一帧会晚于用户对\"立刻生效\"的感知，也会让\n" +
        "     强制重报那条路变成\"下一帧才报\"。） */\n" +
        "  report();\n" +
        "  if(rafOn)return;\n" +
        "  if(!window.requestAnimationFrame){report();return;}\n" +
        "  rafOn=true;\n" +
        "  var step=function(){\n" +
        "    /* 原生侧已经叫停了就当场收手：不收的话还会再报满 180ms，\n" +
        "       那几十个位置是\"关掉播放器之后\"的，只会把已经收摊的原生侧再拨一下 */\n" +
        "    if(!window.__lerxuRectOn){rafOn=false;return;}\n" +
        "    var moved=report();\n" +
        "    if(moved||Date.now()-lastScrollAt<180)window.requestAnimationFrame(step);\n" +
        "    else rafOn=false;\n" +
        "  };\n" +
        "  window.requestAnimationFrame(step);\n" +
        "}\n" +
        "function start(){\n" +
        "  var v=pick(0);if(!v)return;\n" +
        "  if(window.__lerxuRectOn){__lerxuWake();return;}\n" +
        "  window.__lerxuRectOn=1;\n" +
        "  window.addEventListener('scroll',schedule,true);\n" +
        "  window.addEventListener('resize',schedule);\n" +
        "  window.addEventListener('orientationchange',schedule);\n" +
        "  window.__lerxuRectTimer=setInterval(function(){report();window.__lerxuAttach();},500);\n" +
        "  try{if(window.ResizeObserver){window.__lerxuRectRO=new ResizeObserver(schedule);window.__lerxuRectRO.observe(v);}}catch(e){}\n" +
        "  report();\n" +
        "}\n" +
        "function stop(){\n" +
        "  if(!window.__lerxuRectOn)return;window.__lerxuRectOn=0;\n" +
        "  /* 撤的必须是**挂上去的那一个**（schedule）：早先这里写成 report，\n" +
        "     三个监听其实一个都没撤掉 —— 关掉播放器之后页面还在孜孜不倦地报位置 */\n" +
        "  window.removeEventListener('scroll',schedule,true);\n" +
        "  window.removeEventListener('resize',schedule);\n" +
        "  window.removeEventListener('orientationchange',schedule);\n" +
        "  if(window.__lerxuRectTimer){clearInterval(window.__lerxuRectTimer);window.__lerxuRectTimer=null;}\n" +
        "  try{if(window.__lerxuRectRO)window.__lerxuRectRO.disconnect();}catch(e){}\n" +
        "  window.__lerxuVid=null;window.__lerxuRectKey=null;rafOn=false;\n" +
        "}\n" +
        "window.__lerxuStartRect=start;window.__lerxuStopRect=stop;\n" +
        "window.__lerxuWake=function(){try{window.__lerxuRectKey=null;schedule();}catch(e){}};\n" +
        "\n" +
        "/* ────────────────────────── 只留原生播放器 ──────────────────────────\n" +
        "   把页面那一层播放器**整套**按住：\n" +
        "   1) `<video>` 自己不画（`visibility:hidden`，保住布局盒 —— 不能抽掉，\n" +
        "      否则页面排版会跳）；\n" +
        "   2) 它外面那圈\"壳\"（站点自己的控制条 / 海报 / 播放按钮所在的那几层）跟着一起\n" +
        "      隐掉 —— 用户点名\"一个网页两个播放器\"\"应该只保留原生播放器\"。\n" +
        "      判定只看**高度**：一路套着装上去、且每一层都不超过视频高度的 1.9 倍。\n" +
        "      为什么不看宽度：站点的播放器外壳往往是**整宽**的块（实测 785px 壳 / 412px\n" +
        "      视频），按宽度卡会一层都收不掉；而高度上限 1.9 倍本身就是个很紧的界，\n" +
        "      超过就说明这已经是页面级的块了，立刻停手、绝不往上吞页面内容。 */\n" +
        "/* 按过谁就记下来。为什么不用 `querySelectorAll('[data-lerxu-vis]')` 找回它们：\n" +
        "   Shadow DOM 里的元素**扫不到**（属性选择器不进 shadow root），那样反而永远还不了原。 */\n" +
        "window.__lerxuTouched=[];\n" +
        "function hideEl(el){\n" +
        "  if(!el)return;\n" +
        "  try{\n" +
        "    if(!el.hasAttribute('data-lerxu-vis')){\n" +
        "      el.setAttribute('data-lerxu-vis',el.style.visibility||'');\n" +
        "      window.__lerxuTouched.push(el);\n" +
        "    }\n" +
        "    el.style.visibility='hidden';\n" +
        "  }catch(e){}\n" +
        "}\n" +
        "/* 在 `<video>` 的盒子上盖一块**不透明黑板**（插在它父节点里，跟着页面一起滚）。\n" +
        "   为什么还要它：站点藏/显播放器的方式五花八门（`!important` 的行内样式、兄弟节点的\n" +
        "   控制条、canvas 封面…），只靠 `visibility` 未必压得干净 —— 那时我们的播放器一让开\n" +
        "   （网格形变、换标签、位置还没到）用户就会看到\"网页自带播放器露出来了\"。黑板在 DOM 里、\n" +
        "   `pointer-events:none` 不吃点击，正常情况下被我们的播放器完全盖住、根本看不见。 */\n" +
        "function coverOne(v){\n" +
        "  try{\n" +
        "    var par=v.parentNode;\n" +
        "    if(!par)return;\n" +
        "    /* 父节点可能是 **ShadowRoot**（元素直接挂在 shadow 根下）：它没有\n" +
        "       `getBoundingClientRect`、也不是元素 —— 拿它的**宿主**算几何、贴定位。 */\n" +
        "    var box=(par.nodeType===1)?par:(par.host||null);\n" +
        "    if(!box)return;\n" +
        "    var c=v.__lerxuCover;\n" +
        "    if(!c||!c.isConnected){\n" +
        "      c=v.ownerDocument.createElement('div');\n" +
        "      c.setAttribute('data-lerxu-cover','1');\n" +
        "      c.style.cssText='position:absolute;left:0;top:0;width:0;height:0;'+\n" +
        "        'background:#000;pointer-events:none;z-index:2147483000;';\n" +
        "      v.__lerxuCover=c;\n" +
        "    }\n" +
        "    if(c.parentNode!==par)par.appendChild(c);\n" +
        "    var pr=box.getBoundingClientRect(),vr=v.getBoundingClientRect();\n" +
        "    var ps=getComputedStyle(box).position;\n" +
        "    if(!ps||ps==='static')box.style.position='relative';\n" +
        "    c.style.left=(vr.left-pr.left+box.scrollLeft)+'px';\n" +
        "    c.style.top=(vr.top-pr.top+box.scrollTop)+'px';\n" +
        "    c.style.width=vr.width+'px';\n" +
        "    c.style.height=vr.height+'px';\n" +
        "  }catch(e){}\n" +
        "}\n" +
        "function hideOne(e){\n" +
        "  try{e.pause();}catch(x){}\n" +
        "  if(e.tagName==='VIDEO'||e.tagName==='IFRAME')coverOne(e);\n" +
        "  var base=null;try{base=e.getBoundingClientRect();}catch(x){}\n" +
        "  hideEl(e);\n" +
        "  try{\n" +
        "    if(base&&base.width>0&&base.height>0){\n" +
        "      var p=e.parentElement,lvl=0;\n" +
        "      while(p&&lvl<4&&p!==document.body&&p!==document.documentElement){\n" +
        "        var r=p.getBoundingClientRect();\n" +
        "        if(r.width<1||r.height<1)break;\n" +
        "        if(r.height>base.height*1.9)break;\n" +
        "        hideEl(p);lvl++;p=p.parentElement;\n" +
        "      }\n" +
        "    }\n" +
        "  }catch(x){}\n" +
        "}\n" +
        "/* 我们跟的那一个如果不是 `<video>`（典型：**跨域** iframe 里的播放器，内容读不到、\n" +
        "   只能拿它那块框当位置），那也得把**那个元素**按住 —— 只报位置不隐它，\n" +
        "   站点自己的播放器就一直在页面上，我们的播放器一让开它就露出来。 */\n" +
        "function hidePick(){\n" +
        "  var v=window.__lerxuVid;\n" +
        "  if(!v||!v.isConnected)return;\n" +
        "  /* 无条件按一遍：普通 `<video>` 下面那轮 `eachDoc` 也能扫到（重复按是幂等的），\n" +
        "     但 **Shadow DOM 里的扫不到** —— 那一类只能靠这里，不然永远按不住。 */\n" +
        "  hideOne(v);\n" +
        "}\n" +
        "window.__lerxuHideVideos=function(){\n" +
        "  hidePick();\n" +
        "  eachDoc(function(d){\n" +
        "    var vs=siblings(d);\n" +
        "    for(var i=0;i<vs.length;i++)hideOne(vs[i]);\n" +
        "  });\n" +
        "  try{window.__lerxuRectKey=null;report();}catch(e){}\n" +
        "};\n" +
        "window.__lerxuShowVideos=function(){\n" +
        "  var list=window.__lerxuTouched||[];\n" +
        "  for(var i=0;i<list.length;i++){\n" +
        "    var e=list[i];\n" +
        "    try{e.style.visibility=e.getAttribute('data-lerxu-vis')||'';}catch(x){}\n" +
        "    try{e.removeAttribute('data-lerxu-vis');}catch(x){}\n" +
        "    try{\n" +
        "      var c=e.__lerxuCover;\n" +
        "      if(c&&c.parentNode)c.parentNode.removeChild(c);\n" +
        "      e.__lerxuCover=null;\n" +
        "    }catch(x){}\n" +
        "  }\n" +
        "  window.__lerxuTouched=[];\n" +
        "  /* 兜底：属性扫一遍漏网的黑板（换页 / 站点重建播放器后留下的） */\n" +
        "  eachDoc(function(d){\n" +
        "    var cs=null;try{cs=d.querySelectorAll('[data-lerxu-cover]');}catch(e){cs=null;}\n" +
        "    if(!cs)return;\n" +
        "    for(var i=0;i<cs.length;i++){\n" +
        "      var c=cs[i];\n" +
        "      try{if(c.parentNode)c.parentNode.removeChild(c);}catch(x){}\n" +
        "    }\n" +
        "  });\n" +
        "};\n" +
        "\n" +
        "/* 新出现的 iframe 也要挂上监听（列表页常见\"点一下才插进来的播放器\"） */\n" +
        "function onPlay(e){\n" +
        "  var v=e.target;\n" +
        "  /* Shadow DOM 里的 <video> 起播时，事件冒到 document 上 target 会被重定向成宿主元素：\n" +
        "     用 composedPath() 拿到真正的那个节点，不然它既找不到、也按不住。 */\n" +
        "  try{if(e.composedPath){var cp=e.composedPath();if(cp&&cp[0])v=cp[0];}}catch(x){}\n" +
        "  if(!v||v.tagName!=='VIDEO')return;\n" +
        "  if(v.loop&&v.muted)return;\n" +
        "  try{if(getComputedStyle(v).display==='none')return;}catch(e){}\n" +
        "  var r=rectOf(v);\n" +
        "  if(!r||r.w<MINW||r.h<MINH)return;\n" +
        "  if(!armed)return;armed=false;\n" +
        "  window.__lerxuVid=v;\n" +
        "  try{v.pause();}catch(e){}\n" +
        "  try{start();}catch(e){}\n" +
        "  try{window.LerxuPageVideo&&window.LerxuPageVideo.played();}catch(e){}\n" +
        "}\n" +
        "function attach(){\n" +
        "  eachDoc(function(d){\n" +
        "    if(d.__lerxuPlayHooked)return;\n" +
        "    d.__lerxuPlayHooked=1;\n" +
        "    try{\n" +
        "      d.addEventListener('play',onPlay,true);\n" +
        "      d.addEventListener('playing',onPlay,true);\n" +
        "    }catch(e){}\n" +
        "  });\n" +
        "}\n" +
        "window.__lerxuAttach=attach;\n" +
        "attach();\n" +
        "})();\n"
}
