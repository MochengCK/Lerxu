package com.lerxu.android.browser

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.net.URI

/**
 * 影视模式的**页面提取**：把当前这一页影视站的"外壳"读出来（站点分类导航、内容卡片、
 * 推荐区块），交给自家的 UI 重建（见 `MovieScreen`）。
 *
 * 与 [MovieMode] 的分工（两份脚本互不依赖）：
 * - [MovieMode.INJECT_JS] 是**常驻探测**，经 `installPageToolsDocStart` 注入到每个页面、
 *   每个 frame 的文档起始，只回答"这一页有没有像样的视频元素"。它必须轻。
 * - 这份提取是**按需的一次读**（只注主文档，同源 iframe 由脚本自己进去读），只在影视模式
 *   开着时调，**绝不进** document-start 那条路径 —— 它是重量级 DOM 扫描，挂在每个页面上
 *   等于白烧所有站点的性能。
 *
 * 三条硬约束：
 * 1. **只读、绝不写 DOM**。影视模式要能随时退出、退出后网页逐字节一致（[MovieMode] 的
 *    既有口径），所以这里全程 `querySelectorAll` / `getAttribute` / `getBoundingClientRect`。
 * 2. **绝不抛**。每个子函数自带 `try/catch`，最外层再包一层 —— 这段脚本会在**任意**影视站
 *    上跑，一个未捕获的异常会连累页内其它脚本（[MovieMode.INJECT_JS] 里已有同样的教训）。
 * 3. **启发式 + 阈值**，不认域名、不要站点名单（同 [looksLikeMoviePage] 的口径）。判错的
 *    代价只是"这一页重建出来是空的"，下面那套上限与剔除规则就是为了让它**宁可空、不可错**。
 *
 * 取数走 `evaluateJavascript` 的返回值回调（[EXTRACT_CALL_JS]），**不新增 JS 桥**：这是
 * App 主动发起的"请求-响应"，闭包里带令牌就能丢弃过期结果，也不必在标签页回收时多维护
 * 一个桥的注销。桥仍旧只留给"页面主动上报"（`LerxuMovie.video` / `LerxuDock` / `LerxuVideoRect`）。
 */
object MoviePageExtractor {

    // ────────────────────────────── 上限与阈值 ──────────────────────────────
    // 全部写死成常量：这些数是"宁可空、不可错"的边界，单测直接断言，防止被人偷偷放宽。

    /** 站点分类导航最多取几条（影视站的顶栏一般 6-12 条，24 是防跑飞的上限）。 */
    const val MAX_NAV = 24

    /** 主内容最多取几张卡（网格 3 列 × 20 行足够，再多也没人翻）。 */
    const val MAX_CARDS = 60

    /** 推荐区块最多取几段。 */
    const val MAX_SECTIONS = 3

    /** 单段推荐区最多取几张卡。 */
    const val MAX_SECTION_CARDS = 30

    /** 卡片名称最长字符数（列表里放不下，太长只是白传）。 */
    const val MAX_TITLE = 40

    /** 导航项文本最长字符数（"首页/电影/电视剧/动漫"这类都不超过 10）。 */
    const val MAX_NAV_TEXT = 10

    /** 清晰度角标最长字符数（"1080P""更新至12集"这一档）。 */
    const val MAX_BADGE = 8

    /** 评分最长字符数（"8.5""9.0分"这一档）。 */
    const val MAX_RATING = 8

    /** 推荐区块标题最长字符数。 */
    const val MAX_SECTION_TITLE = 24

    /** 一个推荐区块至少要有几张卡才算数（只有一两张的多半是误抓到的零散链接）。 */
    const val MIN_SECTION_CARDS = 2

    /** 评论区最多取几条（评论区是长尾，一屏之外没人翻）。 */
    const val MAX_COMMENTS = 12

    /** 一条评论正文最长字符数。 */
    const val MAX_COMMENT_TEXT = 200

    /** 评论者昵称 / 时间最长字符数。 */
    const val MAX_COMMENT_NAME = 24

    /** 单条评论下面最多显示几条回复。 */
    const val MAX_REPLIES = 6

    /** 板块名（主内容墙 / 推荐区 / 评论区左上角那一行）最长字符数。 */
    const val MAX_BLOCK_TITLE = 24

    /** 站点搜索表单的关键词参数名最长字符数（`wd` / `keyword` 这一档）。 */
    const val MAX_SEARCH_PARAM = 24

    /** 站点搜索输入框的占位文字最长字符数（拿它当我们搜索框的提示语）。 */
    const val MAX_SEARCH_HINT = 20

    /**
     * 安装脚本：定义 `window.__lerxuMovieExtract()`（幂等）。
     *
     * **每次调用都现算**（一个文档最多 8 趟，见脚本里的 `MAX_SCAN`）：页面 DOM 是异步渲染的，进模式的
     * 那一刻常常只渲染了一半 —— 顶栏（导航）先出来、内容后出来是常态，所以"有导航、没内容"
     * 这种半份结果绝不能缓存：缓存了后面几拍就永远拿着空内容去渲染，页面明明有内容也显示
     * 空态。上限只用来防"页面反复调"，正常情况下一个页面只被问四五次。
     *
     * 封面**不只有 `<img>` 一种形态**：苹果 CMS 系 / jQuery lazyload 系站点整页可能连一个
     * `<img>` 都没有，封面全是"带 `data-original` 的 `<a>` / `<div>` + 内联背景图"。见
     * `COVER_ATTRS` 与 `coverFrom`。
     */
    val INJECT_JS: String = """
(function(){
if(window.__lerxuMovieExtract)return;
var MAX_NAV=24,MAX_CARDS=60,MAX_SECTIONS=3,PER_SEC=30,MIN_NAV=3,MIN_LIST=4,MIN_SEC=2,MAXTITLE=40,TEXT_NAV=10,MAX_SCAN=12,MAX_COMMENTS=12,MAX_CTEXT=200,MAX_CNAME=24,MIN_COMMENTS=2,MAX_HEAD=24,MAX_REPLIES=6;
/* 我们自己注入的节点一律不认（样式节点、将来可能加的标记），免得把自己的东西当成站点的 */
var SKIP_ID=/^lerxu-/;
/* 占位图 / 图标类：封面图不能是这些（loading / blank 这类名字是懒加载站点的占位图） */
var NOISE=/logo|avatar|icon|sprite|blank|placeholder|pixel|spacer|transparent|loading|\b1x1\b|load\.(gif|png)/i;
/* 元素**自己**的类名 / ID 命中这些词的，不是封面（站标、头像、图标、二维码、按钮、广告位） */
var NOISE_EL=/(logo|avatar|icon|sprite|qr|btn|share|advert|banner|guangao|guanggao|广告)/i;
/* 懒加载站点的真图放在这些属性上。**封面不是只有 <img> 一种形态**：苹果 CMS 系 /
   jQuery lazyload 系站点整页可能连一个 <img> 都没有，封面全是"带 data-original 的
   <a> / <div> + 内联背景图"（<a class="vodlist_thumb lazyload" data-original="封面"
   title="片名">），只认 <img> 会一张卡都抓不到。 */
var COVER_ATTRS=['data-original','data-src','data-echo','data-lazy-src','data-lazy','data-background','data-bg','data-url','data-cover','data-image'];
/* 清晰度与状态词：既用来从卡片文本里抠角标，也用来从名称里剔掉它们 */
var QUALITY=/(4K|2160P|1440P|1080P|720P|480P|360P|HD|BD|蓝光|超清|高清|抢先|TC|TS)/i;
var STATUS=/(全\s*\d+\s*集|更新至|连载|完结|第\s*\d+\s*集|正片|国语|粤语|中字|HDTV)/;
/* 推荐区块的标题词：影视站翻来覆去就这几句（末位的"推荐"兜住各种变体） */
var RECOMMEND=/(猜你喜欢|相关推荐|猜你想看|热门推荐|相似|大家都在看|更多推荐|你可能喜欢|为你推荐|相关影片|相似影片|热门视频|推荐)/;
/* 评论区 / 页脚 / 广告位：这三处的链接与图片一律不认（用户口径：评论区不呈现，由我们的
   推荐区取代；广告位在影视站里遍地都是，认了会整排广告卡片混进内容墙） */
var COMMENT=/(comment|reply|pinglun|评论)/i;
var FOOTER=/(footer|copyright|friendlink|banquan|beian|guangao|guanggao|广告)/i;
/* 顶部导航的常见容器：桌面版一排分类 + **移动版把分类塞进抽屉**的两种写法都要认
   （抽屉是隐藏的，见 navOf 的兜底那一趟） */
var NAV_SEL=['header','nav','.nav','.navbar','.nav_list','.head_menu','.header','.top-nav','.mobile-nav','.menu','#nav','#header','.nav-bar','.navs','.m-nav','.mnav','.menu_list','.menu-list','.top-menu','.top_menu','.header-nav','.header_nav','.mobile-menu','.mobile_menu','.drawer','.offcanvas','.off-canvas','.dropdown-menu','.navbox','.nav_box','.link_nav'];
var MAIN_SEL=['.vodlist','.module-list','.module-items','.stui-vodlist','.public-list','.pic-list','.video-list','.grid','.list','.module-poster-items'];
var HEAD_SEL='h1,h2,h3,h4,.title,.pannel_head,.module-title,.section-title,.hd';
/* 评论区：只用来**定位**评论，样式一律用我们自己的（见 MovieScreen）。
   一条评论的骨架各家不同，但字段名高度一致：正文叫 content / text / desc，昵称叫
   name / user / nick，时间叫 time / date。**整块 textContent 当正文的兜底绝对不要** ——
   实测会把"共 10 条评论 + 分页 + 回复举报"全揉成一坨（见 commentOf）。 */
var CMT_SEL='[class*=comment],[class*=pinglun],[class*=pl_list],[class*=reply],[id*=comment],[id*=pinglun]';
var CMT_ITEM_SEL='li,.comment-item,.comment_item,.cmt-item,.cmt_item,.pl_item,.reply-item,.item,.list-item';
/* 回复块：各家写法都是"评论条目 + 紧随其后的回复块"，类名几乎都带这几个词 */
var CMT_REPLY_SEL='[class*=reply],[class*=rp_head],[class*=rp_cont],[class*=sub_comment]';
/* "回复 / 举报"那两个按钮不算回复（类名也带 reply） */
var CMT_ACTION=/digg|action|report|btn|link|num/i;
var CMT_BODY=/content|text|desc|message|msg|body/i;
/* 时间**按文字形状认**，不认类名：站点的类名五花八门（part_tip / comm_time / pl_date…），
   认类名必然漏；而"2026-09-22 11:03:31""16:18""3小时前"这些形状到哪都一样 */
var CMT_DATETIME=/(\d{4}\s*[-\/年.]\s*\d{1,2}\s*[-\/月.]\s*\d{1,2})|(\d{1,2}:\d{2})|(\d+\s*(秒|分钟|小时|天|月|年)前)|(\d+\s*(min|hour|day|month|year)s?\s*ago)/i;

/* 折叠空白 + 截断（零宽字符是影视站防采集的老把戏，抄下来全是看不见的乱码） */
function flat(s,n){
  try{ s=(s==null?'':String(s)).replace(/[\u200B-\u200D\uFEFF\uE000-\uF8FF]/g,'').replace(/\s+/g,' ').trim(); }catch(e){ return ''; }
  return s.length>n?s.substring(0,n):s;
}
function txt(el,n){
  try{ return flat(el&&el.textContent||'',n); }catch(e){ return ''; }
}
/* 相对地址转绝对；只认 http(s)，其余（javascript:/data:/mailto:/纯锚点）一律空串 */
function abs(h){
  try{
    if(!h||h.charAt(0)==='#')return '';
    var u=new URL(h,location.href);
    return (u.protocol==='http:'||u.protocol==='https:')?u.href:'';
  }catch(e){return '';}
}
function dead(el){
  try{var cs=getComputedStyle(el);return cs.display==='none'||cs.visibility==='hidden';}catch(e){return false;}
}
/* 祖先链上有评论区 / 页脚 / 表单 / 视频壳的，整支不认 */
function badCtx(el){
  try{
    for(var p=el,i=0;p&&i<14;p=p.parentElement,i++){
      if(SKIP_ID.test(p.id||''))return true;
      var tag=p.tagName;
      if(tag==='VIDEO'||tag==='FOOTER'||tag==='FORM')return true;
      var sig=''+(p.id||'')+' '+(p.className||'');
      if(COMMENT.test(sig)||FOOTER.test(sig))return true;
    }
  }catch(e){}
  return false;
}
/* 内联 background-image 里的地址（懒加载站点常用它当封面的兜底层） */
function bgUrl(s){
  try{ var m=/url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(s||''); return m?m[1]:''; }catch(e){ return ''; }
}
/* 这个地址能不能当封面：得是 http(s) 的图片地址，且不是占位图 / 图标 / 站标 */
function okCover(u){
  try{
    if(!u)return '';
    if(String(u).indexOf('data:')===0)return '';
    var v=abs(String(u));
    if(!v||NOISE.test(v))return '';
    return v;
  }catch(e){ return ''; }
}
/* <img> 的地址：**src 常常是占位图、真图在 data-* / srcset 上**，所以候选要一起排队比，
   取第一个像封面的（而不是"有 src 就用 src"——那样会拿到 1x1 占位图而丢掉真图） */
function imgUrl(im){
  var cs=[];
  try{ if(im.currentSrc)cs.push([im.currentSrc,1]); }catch(e){}
  try{
    var ss=im.getAttribute('srcset')||im.getAttribute('data-srcset');
    if(ss)cs.push([ss.split(',')[0].trim().split(/\s+/)[0],0]);
  }catch(e){}
  try{ var s=im.getAttribute('src'); if(s)cs.push([s,1]); }catch(e){}
  for(var i=0;i<COVER_ATTRS.length;i++){ try{ var a=im.getAttribute(COVER_ATTRS[i]); if(a)cs.push([a,0]); }catch(e){} }
  try{ var b=bgUrl(im.getAttribute('style')); if(b)cs.push([b,0]); }catch(e){}
  for(var j=0;j<cs.length;j++){
    var u=okCover(cs[j][0]);
    if(!u)continue;
    /* 真的加载出来过的（src / currentSrc）量一下自然尺寸：几十像素的是图标或占位图。
       地址来自 data-* 的还没加载、量不到尺寸，只信地址。 */
    if(cs[j][1]){ var w=0; try{ w=im.naturalWidth||0; }catch(e){} if(w&&w<60)continue; }
    return u;
  }
  return '';
}
/* 是不是**同一站**：广告位（第三方域名）在影视站里遍地都是，不挡就会混进内容墙与推荐区
  （实测"推荐阅读"那段里一半是广告）。比 host 的**主域**：`www.` 不算差异，子域算同站。 */
function sameSite(u){
  try{
    var h=new URL(u).hostname.toLowerCase().replace(/^www\./,'');
    var p=location.hostname.toLowerCase().replace(/^www\./,'');
    if(h===p)return true;
    return h.split('.').slice(-2).join('.')===p.split('.').slice(-2).join('.');
  }catch(e){return false;}
}
/* 一个元素**自己**身上有没有封面（<img> / data-* / 内联背景图） */
function ownCover(el){
  try{
    if(!el||el.nodeType!==1)return '';
    if(NOISE_EL.test(''+(el.id||'')+' '+(el.className||'')))return '';
    if(el.tagName==='IMG')return imgUrl(el);
    for(var i=0;i<COVER_ATTRS.length;i++){ var u=okCover(el.getAttribute(COVER_ATTRS[i])); if(u)return u; }
    return okCover(bgUrl(el.getAttribute('style')));
  }catch(e){ return ''; }
}
/* 从 root 自己 + 它的后代（往下 depth 层）里找第一个封面 */
function coverFrom(root,depth){
  try{
    var list=[root],n=0;
    while(list.length&&n++<24){
      var el=list.shift();
      if(!el||el.nodeType!==1)continue;
      var u=ownCover(el);
      if(u)return u;
      if(depth>0){ var ch=el.children||[]; for(var j=0;j<ch.length&&j<12;j++)list.push(ch[j]); }
    }
  }catch(e){}
  return '';
}
/* 一个容器里有几处封面。多过一处说明它是**列表容器**，不能把它的封面配给单张卡
   （会张冠李戴：整排卡片全用同一张图） */
function coversIn(root){
  try{
    var list=[root],n=0,c=0;
    while(list.length&&n++<24&&c<2){
      var el=list.shift();
      if(!el||el.nodeType!==1)continue;
      if(ownCover(el)){ c++; continue; }
      var ch=el.children||[];
      for(var j=0;j<ch.length&&j<12;j++)list.push(ch[j]);
    }
    return c;
  }catch(e){ return 0; }
}
/* 一张卡 = 一个能点、有封面、还带着名字的 <a>：名称在左下角，角标（清晰度 / 更新状态）另取。
   这个 <a> 是站点的"卡片入口"，不一定是它自己包住封面 —— 三种写法都要认：
   ① 封面与名字都在这个 <a> 里（苹果 CMS 的封面 <a> 除外，见 ②）；
   ② 封面是 <a> 自己（data-original / 内联背景图），名字在 title 属性上（olevod 这类）；
   ③ 封面与名字被拆成两个 <a>（苹果 CMS：封面 <a> 只放图、标题 <a> 只放字）—— 往下找不到
      封面时到**父节点**里找，但父节点得"只有一张封面"才算，否则那是列表容器（会张冠李戴）。 */
function cardOf(a){
  try{
    if(!a||badCtx(a)||dead(a))return null;
    var url=abs(a.getAttribute('href')||a.href);
    if(!url)return null;
    if(!sameSite(url))return null;   /* 站外链接（广告位）不要 */
    var cover=coverFrom(a,1);
    if(!cover){
      var p=a.parentElement;
      if(p&&coversIn(p)===1)cover=coverFrom(p,1);
    }
    /* 名字的优先级：a[title] / 内层 [title] / img[alt]（站点最标准的写法，而且不会把封面上
       "更新至 12 集"这类角标误当片名）→ 常见标题类名 → 整段文本 */
    var name=flat(a.getAttribute('title')||'',MAXTITLE);
    if(!name){ var t=null; try{ t=a.querySelector('[title]'); }catch(e2){} if(t)name=flat(t.getAttribute('title')||'',MAXTITLE); }
    if(!name){ var im=null; try{ im=a.querySelector('img[alt]'); }catch(e2){} if(im)name=flat(im.getAttribute('alt')||'',MAXTITLE); }
    if(!name)name=txt(a.querySelector('.title,.name,.vodname,.pic-text,h3,h4'),MAXTITLE);
    var fromText=false;
    if(!name){name=txt(a,MAXTITLE);fromText=true;}
    if(!name)return null;
    /* **没有封面也能是卡片**：搜索结果页那种纯文字列表一张图都没有（实测整页 nImgs=1）。
       但卡得很紧，三条同时成立才算：名字不来自"整段文本"、整块文本短、而且地址是
       **内容页**（detail / play 这一档）—— 不然"排行榜""电影"这些导航链接会全被当成卡片。 */
    if(!cover&&(fromText||txt(a,80).length>60||!/detail|play|vodshow/i.test(url)))return null;
    var badge=txt(a.querySelector('.pic-text,.note,.hd,.label,.tag,[class*=note]'),12);
    if(badge&&!QUALITY.test(badge)&&!STATUS.test(badge))badge='';
    if(!badge){var m=QUALITY.exec(txt(a,80))||STATUS.exec(txt(a,80));badge=m?m[1]:'';}
    /* 评分：类名 / id 命中 score / rating / vote / point / star 的短文本（"8.5"、"9.0分"）。
       有就带出来（界面压在封面右上角），没有就空着。 */
    var rating='';
    try{
      var rEl=a.querySelector('[class*=score],[class*=rating],[class*=vote],[class*=point],[class*=star]');
      if(rEl){var rt=txt(rEl,8);if(/\d/.test(rt))rating=rt;}
    }catch(e){}
    /* 名称里带着"HD国语"这类角标时剔掉，只留片名 */
    var clean=name.replace(QUALITY,'').replace(STATUS,'').replace(/[-_·|\/、:：]+$/,'').trim();
    if(!clean)clean=name;
    return {title:clean,cover:cover,badge:badge,rating:rating,url:url};
  }catch(e){return null;}
}
/* 一个容器里的卡片；少于 min 张就当"这不是一个列表"，返回空 */
function listOfMin(root,min){
  var out=[],seen={},as=[];
  try{as=root.querySelectorAll('a[href]');}catch(e){return out;}
  var n=as.length>2000?2000:as.length;
  for(var i=0;i<n&&out.length<MAX_CARDS;i++){
    var c=cardOf(as[i]);
    if(!c)continue;
    if(seen[c.url])continue;
    seen[c.url]=1;
    out.push(c);
  }
  return out.length>=min?out:[];
}
function listOf(root){return listOfMin(root,MIN_LIST);}
/* 热搜词 / 明星名 那种列表的链接**全都指向站内搜索**（`…search…?wd=某某`）：这一类一律
   不算导航 —— 以前只看"谁链接多"，热搜词那一排（十几二十条明星名）经常把真导航挤掉
   （用户点名："向下展开后显示的都是一些明星的名称"）。 */
function isSearchUrl(u){
  var s=(u||'').toLowerCase();
  return /[?&](wd|keyword|q|search)=/.test(s)||/\/search/.test(s);
}
/* 导航项：短文本 + 合法地址，至少 MIN_NAV 条 */
function navItems(box){
  var out=[],seen={},as=[];
  try{as=box.querySelectorAll('a[href]');}catch(e){return out;}
  var n=as.length>60?60:as.length;
  for(var i=0;i<n&&out.length<MAX_NAV;i++){
    var a=as[i];
    var t=txt(a,TEXT_NAV+2);
    if(!t||t.length>TEXT_NAV)continue;
    /* 图标字体（iconfont）那种链接的文本是**私用区码点**：读出来一片空白，点了却会跳页 ——
       用户侧看到的就是"空白的选项"。要求文本里至少有一个真字（字母 / 数字 / 汉字）才算数。 */
    if(!/[0-9A-Za-z\u4e00-\u9fa5]/.test(t))continue;
    if(badCtx(a))continue;
    var u=abs(a.getAttribute('href')||a.href);
    if(!u||!sameSite(u)||isSearchUrl(u)||seen[u])continue;
    seen[u]=1;
    out.push({text:t,url:u});
  }
  return out.length>=MIN_NAV?out:[];
}
/* 顶部导航：先按常见容器直选，再兜底扫"视口上方 30% 内的容器"，取链接最多的那一组 */
function navOf(d){
  var cands=[];
  try{
    for(var i=0;i<NAV_SEL.length;i++){
      var es=null;
      try{es=d.querySelectorAll(NAV_SEL[i]);}catch(e){es=null;}
      if(!es)continue;
      for(var j=0;j<es.length&&j<4;j++)cands.push(es[j]);
    }
    var all=null;
    try{all=d.querySelectorAll('div,ul');}catch(e){all=null;}
    if(all){
      var lim=all.length>600?600:all.length;
      var vh=(window.innerHeight||800)*0.3;
      for(var k=0;k<lim;k++){
        var el=all[k];
        var r=null;
        try{r=el.getBoundingClientRect();}catch(e2){continue;}
        if(r&&r.top<vh&&r.height>0&&r.height<160)cands.push(el);
      }
    }
  }catch(e){}
  var best=[];
  for(var m=0;m<cands.length;m++){
    var items=navItems(cands[m]);
    if(items.length>best.length)best=items;
  }
  /* 兜底：常见容器与"视口上方 30%"都没捞到 —— 移动版站点常把分类收进抽屉，抽屉是
     隐藏的（高度 0），上面那条视口规则必然漏掉它。这时**不看位置、也不看可见性**，
     整文档找"短文本同站链接最密"的那一块（footer / 广告 / 评论区已由 badCtx 排掉）。 */
  if(best.length<MIN_NAV){
    var all2=null;
    try{all2=d.querySelectorAll('div,ul,dl,nav,section');}catch(e){all2=null;}
    if(all2){
      var lim2=all2.length>800?800:all2.length;
      for(var q=0;q<lim2;q++){
        var items2=navItems(all2[q]);
        if(items2.length>best.length)best=items2;
      }
    }
  }
  return best;
}
/* 板块名要**短**（"猜你喜欢""相关推荐""最近更新"都是 4 个字），而且不能是"一排链接"
   的容器 —— 实测分类页上有个 <h3> 的整段文本是"换一换电影特别推荐电影频道更多"，
   它命中了推荐词，把一整排东西当成了一个板块。 */
var MAX_BLOCK=12;
/* 一块内容**自己的名字**：从装它的那一块往上找三层，取第一个像板块名的标题元素 /
   容器自己的 title 属性。找不到返回空串，调用方退回别的名字（分类名 / 页面标题）。 */
function titleOfBox(box,pageTitle){
  try{
    var node=box;
    for(var lvl=0;lvl<3&&node;lvl++){
      var own='';
      try{ own=flat(node.getAttribute&&(node.getAttribute('title')||node.getAttribute('data-title')||''),MAX_BLOCK); }catch(e){}
      if(own&&own.length<=MAX_BLOCK)return own;
      var hs=null;
      try{hs=node.querySelectorAll(HEAD_SEL);}catch(e){hs=null;}
      if(hs){
        for(var i=0;i<hs.length&&i<8;i++){
          var h=hs[i];
          var as=0;
          try{as=h.querySelectorAll('a').length;}catch(e){as=0;}
          if(as>0)continue;
          var t=txt(h,MAX_BLOCK+1);
          if(!t||t.length>MAX_BLOCK||t===pageTitle)continue;
          return t;
        }
      }
      node=node.parentElement;
    }
  }catch(e){}
  return '';
}
/* 主内容：常见列表容器里挑卡片最多的；都不像就整文档找一遍。同时把它**自己的名字**一起
   带出来（板块名要显示在每个内容板块的左上角，见 MovieScreen） */
function mainOf(d,pageTitle){
  var best=[],bestBox=null;
  try{
    for(var i=0;i<MAIN_SEL.length;i++){
      var es=null;
      try{es=d.querySelectorAll(MAIN_SEL[i]);}catch(e){es=null;}
      if(!es)continue;
      for(var j=0;j<es.length&&j<6;j++){
        var l=listOf(es[j]);
        if(l.length>best.length){best=l;bestBox=es[j];}
      }
    }
  }catch(e){}
  if(best.length<MIN_LIST){
    var all=listOf(d);
    if(all.length>best.length){best=all;bestBox=d.body;}
  }
  if(best.length<MIN_LIST)return {title:'',cards:[]};
  var t=bestBox?titleOfBox(bestBox,pageTitle||''):'';
  return {title:t.replace(QUALITY,'').replace(STATUS,'').trim(),cards:best.slice(0,MAX_CARDS)};
}
/* 板块正文：**标题所在的那一块**（标题的父节点）里能出卡片的就算它，**不再往上找**。
   实测（olevod 这一站）：标题的父节点拿不到东西时往上找一层，捞到的是"整条主列 + 侧栏"
   那个大容器，于是我们的"猜你喜欢"显示成 15 张（站点那边这一块其实全是广告位）——
   用户侧就是"我们的猜你喜欢和它原来显示的不一样、多了很多内容"。宁可没有，也不要错。 */
function listFor(h){
  try{
    if(h.parentElement)return listOfMin(h.parentElement,MIN_SEC);
  }catch(e){}
  return [];
}
/* 这一块里还有**别的**推荐标题（文字不一样）→ 说明这个容器包着好几段，卡片未必属于这个
   标题（用户点名："推荐猜你喜欢的标题被渲染成其他文字"）。宁可不要，也不要挂错名字。 */
function mixedBlock(box,title){
  try{
    if(!box)return false;
    var hs=box.querySelectorAll(HEAD_SEL);
    for(var i=0;i<hs.length&&i<8;i++){
      var t=txt(hs[i],MAX_BLOCK+1);
      if(!t||t.length>MAX_BLOCK||!RECOMMEND.test(t))continue;
      if(t.replace(QUALITY,'').replace(STATUS,'').trim()!==title)return true;
    }
  }catch(e){}
  return false;
}
/* 推荐区块：标题命中推荐词 → 取**它所在的那一块**当正文（见 listFor） */
function sectionsOf(d,mainUrls){
  var out=[],used={};
  var hs=[];
  try{hs=d.querySelectorAll(HEAD_SEL);}catch(e){return out;}
  var n=hs.length>400?400:hs.length;
  for(var i=0;i<n&&out.length<MAX_SECTIONS;i++){
    var h=hs[i];
    var t=txt(h,MAX_BLOCK+1);
    if(!t||t.length>MAX_BLOCK||!RECOMMEND.test(t))continue;
    var hAs=0;
    try{hAs=h.querySelectorAll('a').length;}catch(e){hAs=0;}
    if(hAs>0)continue;
    if(badCtx(h))continue;
    var l=listFor(h);
    if(l.length<MIN_LIST)continue;
    var title=t.replace(QUALITY,'').replace(STATUS,'').trim();
    if(mixedBlock(h.parentElement,title))continue;
    /* 卡片**全在主内容墙里**就丢：那是主内容墙被我们再抄一遍（实测"推荐阅读"就是这种，
       它把主列表原样又摆了一遍）。只是有重叠**不算** —— 站点本来就常把同一批片子既放
       主列表又放"猜你喜欢"，按重叠比例去丢，用户就再也看不到"猜你喜欢"了。 */
    var dup=0;
    for(var j=0;j<l.length;j++){if(mainUrls[l[j].url])dup++;}
    if(dup>=l.length)continue;
    var key=l[0].url;
    if(used[key])continue;
    used[key]=1;
    out.push({title:title,cards:l.slice(0,PER_SEC)});
  }
  return out;
}
/* ── 评论区：只把"谁说了什么"读出来（头像 / 昵称 / 正文 / 时间），**样式一律用我们自己的**
   （用户口径：网页有评论区就显示评论区，只是把它的样式换成我们的，见 MovieScreen）。 ── */
/* 正文：类名命中 content / text / desc 的元素里取**文字最长的那个**。
   为什么不是"取第一个"：实测 olevod 的 <li class="comm_each"> 里第一个命中 text 的是昵称
   <span class="text_line">游客</span>，取第一个就会把昵称当正文（真踩过）。 */
function pickBody(root){
  var best=null,bestLen=1;
  /* 两趟：**先只认 content / desc / message 这类"正文专属"的类名**（哪怕它更短），
     再退到 text 这种通用词。为什么不是一趟取最长：回复常常很短（"吐了"两个字），
     而同一块里"昵称 ／ 时间"那一行比它长，一趟取最长就会把"游客 ／ 16:14"当正文（真踩过）。 */
  var passes=[/content|desc|message|msg|body/i,CMT_BODY];
  try{
    var all=root.querySelectorAll('*');
    var n=all.length>80?80:all.length;
    for(var p=0;p<passes.length&&!best;p++){
      for(var i=0;i<n;i++){
        var e=all[i];
        if(e.children&&e.children.length>4)continue;
        var t=(e.textContent||'').replace(/\s+/g,' ').trim();
        if(t.length<=bestLen)continue;
        if(!passes[p].test(''+(e.className||'')+' '+(e.id||'')))continue;
        best=e;bestLen=t.length;
      }
    }
  }catch(e){}
  return best;
}
/* 时间：排除正文之后，第一个"文字长得像时间"的**叶子**。必须要求是叶子 —— 昵称与时间
   常常包在同一个父节点里（<div class="comm_head"><span>游客</span><span>11:03:31</span>），
   放宽到"子节点不多"就会把父节点整段读成时间（实测读出"游客2026-09-22 11:03:31"）。 */
function pickTime(root,bodyEl){
  try{
    var all=root.querySelectorAll('*');
    var n=all.length>80?80:all.length;
    for(var i=0;i<n;i++){
      var e=all[i];
      if(e===bodyEl)continue;
      if(e.children&&e.children.length>0)continue;
      var t=txt(e,MAX_CNAME);
      if(t&&t.length<=MAX_CNAME&&CMT_DATETIME.test(t))return t;
    }
  }catch(e){}
  return '';
}
/* 昵称：排除正文与时间之后，第一个"短文本叶子"（评论条目的第一行几乎都是昵称） */
function pickName(root,bodyEl,time){
  try{
    var all=root.querySelectorAll('*');
    var n=all.length>80?80:all.length;
    for(var i=0;i<n;i++){
      var e=all[i];
      if(e===bodyEl)continue;
      if(e.children&&e.children.length>0)continue;
      var t=txt(e,MAX_CNAME);
      if(!t||t.length>MAX_CNAME)continue;
      if(time&&t===time)continue;
      if(CMT_DATETIME.test(t))continue;
      return t;
    }
  }catch(e){}
  return '';
}
/* 一条评论：正文必须来自"像正文的那个元素"（拿不到就**不算一条**，宁可少不可错） */
function commentOf(el){
  try{
    if(!el||el.nodeType!==1)return null;
    var tag=el.tagName;
    if(tag==='FORM'||tag==='TEXTAREA'||tag==='INPUT'||tag==='BUTTON'||tag==='SCRIPT'||tag==='STYLE')return null;
    /* 带输入框的整块是"发表评论"那张表单，不是一条评论（实测会被当成一条，还把验证码
       图片当成头像） */
    var f=null;
    try{f=el.querySelector('textarea,input');}catch(e){f=null;}
    if(f)return null;
    var bodyEl=pickBody(el);
    if(!bodyEl)return null;
    var body=txt(bodyEl,MAX_CTEXT);
    if(!body||body.length<2)return null;
    var time=pickTime(el,bodyEl);
    var name=pickName(el,bodyEl,time);
    /* 回复块常把"昵称 ／ 时间"写在同一行（`游客 ／ 16:18`）：按"结尾那段时间"倒着切开。
       不写死分隔符 —— 实测各家用的是全角斜杠、竖线、中点、顿号都有，认分隔符必然漏。
       **无条件尝试**：昵称那一格可能是空的，也可能被"点赞数"那种小字抢先占掉，
       而"时间前面的那一段"几乎一定就是昵称。 */
    if(time){
      var m2=/(.+?)[\s\u2044\u2215\uFF0F\/|·,，、]+(\d{1,2}:\d{2}|\d{4}\s*[-\/年.]\s*\d{1,2}.*)$/.exec(time);
      if(m2){ name=m2[1].trim(); time=m2[2].trim(); }
    }
    var avatar='';
    try{ var im=el.querySelector('img'); if(im)avatar=imgUrl(im); }catch(e){}
    /* 站点常把昵称写在正文 / 时间同一行，读出来就带前缀，这里剔掉 */
    if(name&&body.indexOf(name)===0)body=body.substring(name.length).replace(/^[\s:：,，。·]+/,'');
    if(name&&time&&time.indexOf(name)===0)time=time.substring(name.length).replace(/^[\s:：,，。·／/]+/,'');
    if(!body)return null;
    return {name:name,text:body,time:time,avatar:avatar,replies:[]};
  }catch(e){return null;}
}
/* 一个容器里的评论条目：先按"条目类名"扫（CMS 的评论列表基本是 ul>li），不够再退回直接子节点。
   返回 [{el,data}] —— 回复还要靠元素在文档里的位置来挂，所以这里不能只返回数据 */
function commentNodes(box){
  var out=[],seen={};
  function push(el){
    var c=commentOf(el);
    if(!c)return;
    var k=c.text.substring(0,40);
    if(seen[k])return;
    seen[k]=1;
    out.push({el:el,data:c});
  }
  try{
    var cands=[];
    try{cands=box.querySelectorAll(CMT_ITEM_SEL);}catch(e){cands=[];}
    for(var i=0;i<cands.length&&out.length<MAX_COMMENTS;i++)push(cands[i]);
    if(out.length<MIN_COMMENTS){
      var kids=box.children||[];
      for(var k=0;k<kids.length&&out.length<MAX_COMMENTS;k++)push(kids[k]);
    }
  }catch(e){}
  return out;
}
/* 回复：挂到**文档序里在它之前、离它最近**的那条评论下面。
   为什么这么挂：各家写法都是"评论条目 + 紧随其后的回复块"，回复块的类名几乎都带
   reply / rp / child。回复自己**不算一条评论** —— 否则评论区会被回复刷满、原评论反被淹。 */
function attachReplies(box,list){
  if(!list.length)return;
  var rps=null;
  try{rps=box.querySelectorAll(CMT_REPLY_SEL);}catch(e){rps=null;}
  if(!rps||!rps.length)return;
  var lim=rps.length>40?40:rps.length;
  var seen={};
  for(var i=0;i<lim;i++){
    var el=rps[i];
    if(CMT_ACTION.test(''+(el.className||'')))continue;   /* "回复 / 举报"那两个按钮不算回复 */
    var c=commentOf(el);
    if(!c)continue;
    /* 同一条回复会被外层的回复块与它内层的"头部"各命中一次（`comm_reply` 与 `comm_rp_head`），
       按正文去重 —— 不去重的话同一条回复会显示两遍（实测过） */
    var key=c.text.substring(0,40);
    if(seen[key])continue;
    var host=null;
    for(var j=0;j<list.length;j++){
      var pos=0;
      try{pos=list[j].el.compareDocumentPosition(el);}catch(e){pos=0;}
      /* 4 = el 在这条评论之后；16 = el 被这条评论包着（有的站点把回复嵌在评论里） */
      if(pos&4||pos&16)host=list[j];
    }
    if(!host)continue;
    if(host.data.replies.length>=MAX_REPLIES)continue;
    seen[key]=1;
    host.data.replies.push(c);
  }
}
/* 评论最多的那一块就是评论区；少于 MIN_COMMENTS 条一律当"这一页没有评论区"（宁可没有） */
function commentsOf(d){
  var best=null,bestN=0;
  try{
    var bs=null;
    try{bs=d.querySelectorAll(CMT_SEL);}catch(e){bs=null;}
    if(!bs||!bs.length)return {title:'',items:[]};
    var lim=bs.length>60?60:bs.length;
    for(var i=0;i<lim;i++){
      var n=commentNodes(bs[i]).length;
      if(n>bestN){bestN=n;best=bs[i];}
    }
  }catch(e){}
  if(!best||bestN<MIN_COMMENTS)return {title:'',items:[]};
  var list=commentNodes(best).slice(0,MAX_COMMENTS);
  attachReplies(best,list);
  var items=[];
  for(var i=0;i<list.length;i++)items.push(list[i].data);
  return {title:commentTitleOf(best),items:items};
}
/* 评论区的标题：往上三层找"命中评论词、且短"的标题；"共 10 条评论评论"这类脏串在这里洗干净 */
function commentTitleOf(box){
  try{
    var node=box;
    for(var lvl=0;lvl<3&&node;lvl++){
      var hs=null;
      try{hs=node.querySelectorAll(HEAD_SEL);}catch(e){hs=null;}
      if(hs){
        for(var i=0;i<hs.length&&i<8;i++){
          var t=txt(hs[i],MAX_HEAD);
          if(!t||!/(评论|留言|comment)/i.test(t))continue;
          t=t.replace(/^共\s*\d+\s*条/,'').replace(/(评论|留言|comment)\1+$/i,'$1').trim();
          if(t)return t;
        }
      }
      node=node.parentElement;
    }
  }catch(e){}
  return '';
}
/* 站内搜索：找站点自己的"搜索表单"（input 的 name / class / id / 占位文字命中搜索词），
   把 action 与参数名、以及输入框的占位文字一起带出来 —— App 用它们拼搜索地址。
   找不到就全空，界面上那个搜索框**不显示**（宁可没有，也不要给一个点了没用的框）。 */
function searchOf(d){
  try{
    var fs=null;
    try{fs=d.querySelectorAll('form');}catch(e){fs=null;}
    if(!fs)return null;
    var lim=fs.length>20?20:fs.length;
    for(var i=0;i<lim;i++){
      var f=fs[i];
      var ins=null;
      try{ins=f.querySelectorAll('input');}catch(e){ins=null;}
      if(!ins)continue;
      for(var j=0;j<ins.length;j++){
        var el=ins[j];
        var ty=(el.getAttribute('type')||'text').toLowerCase();
        if(ty==='hidden'||ty==='submit'||ty==='button'||ty==='checkbox'||ty==='radio')continue;
        var sig=''+(el.getAttribute('name')||'')+' '+(el.className||'')+' '+(el.id||'')+' '+(el.getAttribute('placeholder')||'');
        if(!/(wd|search|keyword|query|key)/i.test(sig))continue;
        var nm=el.getAttribute('name')||'';
        if(!nm)continue;
        var act=abs(f.getAttribute('action')||f.action||'');
        if(!act)continue;
        return {action:act,param:nm,hint:flat(el.getAttribute('placeholder')||'',20)};
      }
    }
  }catch(e){}
  return null;
}
/* 主文档 + 同源 iframe（跨域的 contentDocument 读不到，直接跳过）。
   每个子文档上的"进过没"标记要带**本趟扫描**的编号：标记不区分趟次的话，第二趟就再也
   进不去那个 iframe 了（第一趟留下的标记还在），而这一份提取本来就是靠反复取数补齐的。 */
var docStamp=0;
function eachDoc(fn){
  var stamp=++docStamp;
  var docs=[document],seen=0;
  while(docs.length&&seen++<8){
    var d=docs.shift();
    try{fn(d);}catch(e){}
    var fs=null;
    try{fs=d.querySelectorAll('iframe');}catch(e){fs=null;}
    if(!fs)continue;
    for(var i=0;i<fs.length&&i<8;i++){
      var sub=null;
      try{sub=fs[i].contentDocument;}catch(e){sub=null;}
      if(sub&&sub.__lerxuMovieSeen!==stamp){sub.__lerxuMovieSeen=stamp;docs.push(sub);}
    }
  }
}
var result={url:location.href,pageTitle:'',nav:[],cards:[],sections:[],mainTitle:'',commentTitle:'',comments:[],searchAction:'',searchParam:'',searchHint:''};
function scan(){
  var r={url:location.href,pageTitle:'',nav:[],cards:[],sections:[],mainTitle:'',commentTitle:'',comments:[],searchAction:'',searchParam:'',searchHint:''};
  try{
    r.pageTitle=(function(){try{var t=(document.title||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();return t.length>120?t.substring(0,120):t;}catch(e){return '';}})();
    var navSeen={};
    eachDoc(function(d){
      var m=mainOf(d,r.pageTitle);
      if(m.cards.length>r.cards.length){r.cards=m.cards;r.mainTitle=m.title;}
      var nav=navOf(d);
      for(var i=0;i<nav.length&&r.nav.length<MAX_NAV;i++){
        if(navSeen[nav[i].url])continue;
        navSeen[nav[i].url]=1;
        r.nav.push(nav[i]);
      }
      var mainUrls={};
      for(var k=0;k<r.cards.length;k++)mainUrls[r.cards[k].url]=1;
      var ss=sectionsOf(d,mainUrls);
      for(var j=0;j<ss.length&&r.sections.length<MAX_SECTIONS;j++)r.sections.push(ss[j]);
      var cm=commentsOf(d);
      if(cm.items.length>r.comments.length){r.comments=cm.items;r.commentTitle=cm.title;}
      if(!r.searchAction){
        var se=searchOf(d);
        if(se){r.searchAction=se.action;r.searchParam=se.param;r.searchHint=se.hint;}
      }
    });
  }catch(e){}
  r.nav=r.nav.slice(0,MAX_NAV);
  r.cards=r.cards.slice(0,MAX_CARDS);
  result=r;
}
/* 每次调用都**现算**（一个文档最多算 MAX_SCAN 趟）：进模式那一刻页面常常只渲染了一半 ——
   顶栏先出来、内容后出来是常态，把"有导航、没内容"的半份结果缓存下来的话，后面几拍就永远
   拿着空内容去渲染了（用户看到的就是"这一页没有可显示的内容"，而网页上明明有内容）。 */
var scans=0;
window.__lerxuMovieExtract=function(){
  try{ if(scans++<MAX_SCAN)scan(); }catch(e){}
  return result;
};
})();
""".trimIndent()

    /**
     * 取数：调用 [INJECT_JS] 装好的那个函数并序列化。
     *
     * 脚本没装上（页面把我们的函数清掉了 / 主文档还没解析出 `<head>`）时返回 `null` 字符串，
     * 不抛错 —— 与 [INJECT_JS] 同一个理由。
     */
    val EXTRACT_CALL_JS: String =
        "(function(){try{return JSON.stringify(" +
            "window.__lerxuMovieExtract?window.__lerxuMovieExtract():null" +
            ");}catch(e){return 'null';}})();"

    // ────────────────────────────── 数据模型 ──────────────────────────────

    /** 站点分类导航的一项（文本 + 绝对地址）。 */
    @Serializable
    data class MovieNavItem(val text: String = "", val url: String = "")

    /** 一张内容卡片：封面、名称、清晰度角标、评分、点它的地址。 */
    @Serializable
    data class MovieCard(
        val title: String = "",
        val cover: String = "",
        val badge: String = "",
        /** 站点给的评分（"8.5" 这一档）；站点没有就空着（界面压在封面右上角）。 */
        val rating: String = "",
        val url: String = ""
    )

    /** 一个推荐区块（标题 + 卡片），对应站点自己的「猜你喜欢 / 相关推荐」那一段。 */
    @Serializable
    data class MovieSection(val title: String = "", val cards: List<MovieCard> = emptyList())

    /**
     * 一条评论：昵称、正文、时间、头像。
     *
     * 只把"谁说了什么"读出来，**样式一律用我们自己的**（用户口径：网页有评论区就显示
     * 评论区，只是把它的样式换成我们的，见 `MovieScreen`）。
     */
    @Serializable
    data class MovieComment(
        val name: String = "",
        val text: String = "",
        val time: String = "",
        val avatar: String = "",
        /** 这条评论下面的回复（同一种结构，渲染时缩进一层，见 `MovieScreen`）。 */
        val replies: List<MovieComment> = emptyList()
    )

    /** 一次提取的全部结果。 */
    @Serializable
    data class MoviePageData(
        val url: String = "",
        val pageTitle: String = "",
        val nav: List<MovieNavItem> = emptyList(),
        val cards: List<MovieCard> = emptyList(),
        val sections: List<MovieSection> = emptyList(),
        /** 主内容墙**自己的名字**（站点给的那一行，如「相关推荐」）—— 板块名要显示在左上角。 */
        val mainTitle: String = "",
        /** 评论区自己的标题（如「评论」），空则由界面退回默认文案。 */
        val commentTitle: String = "",
        val comments: List<MovieComment> = emptyList(),
        /**
         * 站点**自己的**搜索表单：提交地址（绝对地址）+ 关键词参数名 + 输入框占位文字。
         *
         * 三项都空 = 这一页没找到可用的搜索表单，界面上的搜索框就不显示（宁可没有）。
         */
        val searchAction: String = "",
        val searchParam: String = "",
        val searchHint: String = ""
    ) {
        /** "有多少内容"：调用方拿它比新旧两份结果谁更丰富（见 `BrowserController`）。 */
        val richness: Int get() = cards.size + sections.sumOf { it.cards.size } + comments.size
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    /** 站点搜索框的占位文字"像不像提示语"：不像就不用它（见 [parse] 里那条）。 */
    private val SEARCH_HINT_OK = Regex("搜索|搜|片名|名称|keyword|search", RegexOption.IGNORE_CASE)

    // ────────────────────────────── 纯函数（可 JVM 单测） ──────────────────────────────

    /**
     * 解析并清洗一份提取结果。
     *
     * 坏 JSON / 空串 / `null` → `null`（调用方按"这一拍没拿到"处理）；解析成功但内容为空
     * **照样返回对象** —— "页面确实没有可重建的内容"与"这次没读到"是两件事，前者的 url
     * 还要用来和当前页比对。
     */
    fun parse(raw: String?, pageUrl: String): MoviePageData? {
        if (raw.isNullOrBlank() || raw == "null") return null
        val data = runCatching { json.decodeFromString<MoviePageData>(raw) }.getOrNull() ?: return null
        val nav = data.nav.mapNotNull { cleanNav(it, pageUrl) }.distinctBy { it.url }.take(MAX_NAV)
        val cards = data.cards.mapNotNull { cleanCard(it, pageUrl) }.distinctBy { it.url }.take(MAX_CARDS)
        val mainTitle = cleanText(data.mainTitle, MAX_BLOCK_TITLE)
        return MoviePageData(
            url = cleanText(data.url, 512),
            pageTitle = cleanText(data.pageTitle, 120),
            nav = nav,
            cards = cards,
            sections = trimSections(data.sections, pageUrl, cards),
            mainTitle = mainTitle,
            commentTitle = cleanText(data.commentTitle, MAX_BLOCK_TITLE),
            comments = trimComments(data.comments, pageUrl),
            searchAction = resolveUrl(data.searchAction, pageUrl),
            searchParam = cleanText(data.searchParam, MAX_SEARCH_PARAM),
            searchHint = cleanText(data.searchHint, MAX_SEARCH_HINT)
                // 站点的占位文字未必是"搜索…"（实测有站点写的是"海量影片精彩看不停"这种口号）：
                // 不像提示语的就不用，界面退回我们自己的文案（"搜索站内内容"）
                .let { if (SEARCH_HINT_OK.containsMatchIn(it)) it else "" }
        )
    }

    /** 折叠空白、去掉零宽字符与图标字体的私用区码点、截断。 */
    fun cleanText(s: String, max: Int): String {
        val flat = s.replace(Regex("[\\u200B-\\u200D\\uFEFF\\uE000-\\uF8FF]"), "")
            .replace(Regex("\\s+"), " ").trim()
        return if (flat.length > max) flat.substring(0, max) else flat
    }

    /** 相对地址转绝对；只认 http(s)，其余（空、纯锚点、javascript:/data:/mailto:/blob:）返回空串。 */
    fun resolveUrl(href: String, pageUrl: String): String {
        val h = href.trim()
        if (h.isEmpty() || h.startsWith("#")) return ""
        val lower = h.lowercase()
        if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("about:") ||
            lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("blob:")
        ) {
            return ""
        }
        if (lower.startsWith("http://") || lower.startsWith("https://")) return h
        return runCatching {
            val resolved = URI(pageUrl).resolve(h)
            val scheme = resolved.scheme?.lowercase()
            if (scheme == "http" || scheme == "https") resolved.toString() else ""
        }.getOrDefault("")
    }

    /**
     * 一张卡片能不能用：名称与地址缺一不可，而且地址得是**本站**的。
     *
     * 为什么要卡"本站"：影视站的广告位（第三方域名）遍地都是，不挡就会混进内容墙与推荐区
     *（实测"推荐阅读"那段里一半是广告）。封面缺失只是"没图"，卡片照样留（见 `MovieScreen` 的占位块）。
     */
    internal fun cleanCard(card: MovieCard, pageUrl: String): MovieCard? {
        val title = cleanText(card.title, MAX_TITLE)
        val url = resolveUrl(card.url, pageUrl)
        if (title.isEmpty() || url.isEmpty() || !sameSite(url, pageUrl)) return null
        return MovieCard(
            title = title,
            cover = resolveUrl(card.cover, pageUrl),
            badge = cleanText(card.badge, MAX_BADGE),
            rating = cleanText(card.rating, MAX_RATING),
            url = url
        )
    }

    /**
     * 两个地址是不是**同一站**：比 host 的主域（`www.` 前缀不算差异，子域算同站）。
     *
     * 只看最后两段标签，不做完整 PSL 解析：够挡住"站外广告位"（`59168.wang` vs
     * `olevod.com`），也不会把站点自己的子域（`www.` / `m.` / `static.`）误伤掉。
     */
    internal fun sameSite(url: String, pageUrl: String): Boolean = runCatching {
        fun base(host: String?): String {
            val h = host.orEmpty().removePrefix("www.").lowercase()
            val parts = h.split('.')
            return if (parts.size >= 2) parts.takeLast(2).joinToString(".") else h
        }
        val a = base(URI(url).host)
        val b = base(URI(pageUrl).host)
        a.isNotEmpty() && a == b
    }.getOrDefault(false)

    /** 一项导航能不能用：文本与地址缺一不可；指向**当前页自身**的项也去掉（点它等于原地刷新）。 */
    internal fun cleanNav(item: MovieNavItem, pageUrl: String): MovieNavItem? {
        val text = cleanText(item.text, MAX_NAV_TEXT)
        val url = resolveUrl(item.url, pageUrl)
        if (text.isEmpty() || url.isEmpty() || samePage(url, pageUrl)) return null
        // 图标字体那种链接的文本只有私用区码点：读出来一片空白，点了却会跳页（用户看到的
        // 就是"空白的选项"）。要求至少有一个真字（字母 / 数字 / 汉字）。
        if (!text.any { it.isLetterOrDigit() }) return null
        return MovieNavItem(text = text, url = url)
    }

    /**
     * 推荐区块的清洗：段内卡片走同一套规则，少于 [MIN_SECTION_CARDS] 张的段丢掉，
     * **卡片全在主内容墙里**的段丢掉（那是主内容墙被我们再抄一遍），段数与段内张数截断。
     *
     * 为什么只看"全在主内容墙里"：站点本来就常把同一批片子既放主列表又放"猜你喜欢"，
     * 按重叠比例去丢，用户就再也看不到"猜你喜欢"了（用户点名过）。
     */
    internal fun trimSections(
        sections: List<MovieSection>,
        pageUrl: String,
        mainCards: List<MovieCard>
    ): List<MovieSection> {
        val mainUrls = mainCards.mapTo(HashSet()) { it.url }
        val out = mutableListOf<MovieSection>()
        val seenHeads = mutableSetOf<String>()
        for (raw in sections) {
            if (out.size >= MAX_SECTIONS) break
            val cards = raw.cards.asSequence()
                .mapNotNull { cleanCard(it, pageUrl) }
                .distinctBy { it.url }
                .take(MAX_SECTION_CARDS)
                .toList()
            if (cards.size < MIN_SECTION_CARDS) continue
            if (cards.all { it.url in mainUrls }) continue
            if (!seenHeads.add(cards.first().url)) continue
            out += MovieSection(title = cleanText(raw.title, MAX_SECTION_TITLE), cards = cards)
        }
        return out
    }

    /**
     * 评论的清洗：**正文为空的一条不留**（站点评论区的骨架节点、纯头像格都会被扫进来）；
     * 昵称 / 时间截断、头像转绝对地址、条数截断。
     *
     * 不去重也不排序：评论区是站点自己的顺序（通常最新在前），改顺序反而怪。
     */
    internal fun trimComments(comments: List<MovieComment>, pageUrl: String): List<MovieComment> =
        comments.asSequence()
            .mapNotNull { cleanComment(it, pageUrl) }
            .take(MAX_COMMENTS)
            .toList()

    /** 一条评论（含它的回复）的清洗：正文为空的一条不留；回复同样清洗、同样有上限。 */
    private fun cleanComment(raw: MovieComment, pageUrl: String): MovieComment? {
        val text = cleanText(raw.text, MAX_COMMENT_TEXT)
        if (text.isEmpty()) return null
        return MovieComment(
            name = cleanText(raw.name, MAX_COMMENT_NAME),
            text = text,
            time = cleanText(raw.time, MAX_COMMENT_NAME),
            avatar = resolveUrl(raw.avatar, pageUrl),
            replies = raw.replies.asSequence()
                .mapNotNull { cleanComment(it, pageUrl) }
                .take(MAX_REPLIES)
                .toList()
        )
    }

    /** 两个地址是不是同一页（比 host + 路径；查询串与结尾斜杠不算差异）。 */
    private fun samePage(a: String, b: String): Boolean = runCatching {
        val ua = URI(a)
        val ub = URI(b)
        ua.host == ub.host && ua.path.orEmpty().trimEnd('/') == ub.path.orEmpty().trimEnd('/')
    }.getOrDefault(false)
}