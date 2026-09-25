package com.lerxu.android.browser

/**
 * 向下滚动时把**网页自己的**上下两条导航栏收起来（用户点名）。
 *
 * 逐字的要求是两条：**向下滚动先收顶栏、再把底栏收掉**（"逐渐"= 走补间，不是瞬移），
 * 向上滚就都放回来。为什么值得做：站点那条吸顶顶栏压在视频上沿，正是播放器
 * "一闪一闪"的来源之一（覆盖层要按它裁自己，它一出现/消失就要改裁剪窗口）；收起来之后
 * 那条顶栏不再盖住任何东西，播放器也就稳了。
 *
 * 认栏只用**结构判据**，不做站点适配（判错会把正文当栏收掉，比不收更糟）：
 * - `position` 必须是 `fixed`（顶栏）或 `fixed/sticky`（底栏）；
 * - 宽 ≥ 视口 82%、高 ≤ 150px（sticky 顶栏更严：≤ 88px，导航条才那个高度）；
 * - 顶栏贴上沿（≤ 12px）、底栏贴下沿（≤ 12px）；
 * - **自己已经在动的让开**：元素身上有 transform 的（站点自己的隐藏动画、坞的避让脚本
 *   动过的 `data-lerxu-*`）一律不碰 —— 两家同时写 transform 只会打架；
 * - 我们自己的节点（`id` 以 `lerxu-` 开头）、含 `<video>` 的、以及不可见的都不算。
 *
 * 只改 `transform`（配合一段 transition），**不动布局**：站点自己的 `top/bottom` 定位、
 * 占位、层级全都不变，滚动条也不会因为收栏而抖一下。
 */
object NavAutoHide {

    val INJECT_JS: String =
        "(function(){" +
            "if(window.__lerxuNavHide)return;window.__lerxuNavHide=1;" +
            "var MIN_SCROLL=48,MINW=0.82,MAXH=150,MAXH_STICKY=88,EDGE=12,MS=230,TH=6;" +
            "var TOP_DELAY=0,BOT_DELAY=90;" +
            // lastY 一进来就取当前值（不是 null）：首次滚动那次也要算方向，
            // 否则"跳着滚一下"永远不触发。acc = 同方向的累计位移，
            // **要过 TH 才算一次转向** —— 1px 的回弹不该把栏再弹回来（来回抖）
            "var topBar=null,botBar=null,hiddenNow=false,acc=0;" +
            "var lastY=window.scrollY||document.documentElement.scrollTop||0;" +
            "function dockTouched(el){" +
            "for(var p=el;p&&p!==document.body;p=p.parentElement){" +
            "if(p.dataset&&(parseFloat(p.dataset.lerxuShift||'')>0||" +
            "p.dataset.lerxuPadded==='1'))return true;}" +
            "return false;}" +
            "function usable(el,cs,stickyOk){" +
            "if(!el||el===document.body||el===document.documentElement)return false;" +
            "if((el.id||'').indexOf('lerxu-')===0)return false;" +
            "if(el.tagName==='VIDEO')return false;" +
            "if(el.querySelector&&el.querySelector('video'))return false;" +
            "if(dockTouched(el))return false;" +
            "if(cs.position!=='fixed'&&!(stickyOk&&cs.position==='sticky'))return false;" +
            "if(cs.visibility==='hidden'||cs.display==='none')return false;" +
            "if(parseFloat(cs.opacity||'1')<0.05)return false;" +
            // 站点自己已经在动它（隐藏动画之类）：我们让开，别两家一起写 transform
            "if(cs.transform&&cs.transform!=='none')return false;" +
            "return true;}" +
            "function pick(){" +
            "topBar=null;botBar=null;" +
            "var vw=window.innerWidth||0,vh=window.innerHeight||0;" +
            "if(!vw||!vh)return;" +
            "var all=document.querySelectorAll('body *');" +
            "var topH=0,botH=0;" +
            "for(var i=0;i<all.length;i++){" +
            "var el=all[i];var cs=null;try{cs=getComputedStyle(el);}catch(e){continue;}" +
            "var r=null;try{r=el.getBoundingClientRect();}catch(e){continue;}" +
            "if(!r||r.width<vw*MINW)continue;" +
            "if(r.height<24)continue;" +
            "var sticky=(cs.position==='sticky');" +
            "if(r.height>(sticky?MAXH_STICKY:MAXH))continue;" +
            "if(!usable(el,cs,true))continue;" +
            "if(r.top<=EDGE){" +
            "if(r.height>topH){topH=r.height;topBar=el;}" +
            "}else if(vh-r.bottom<=EDGE){" +
            "if(r.height>botH){botH=r.height;botBar=el;}" +
            "}}}" +
            "function put(el,on,delay){" +
            "if(!el)return;" +
            "try{el.style.transition='transform '+MS+'ms cubic-bezier(.22,.61,.36,1)';" +
            "el.style.transitionDelay=(on?delay:0)+'ms';" +
            "el.style.transform=on?(el===topBar?'translateY(-100%)':'translateY(100%)'):'';" +
            "}catch(e){}}" +
            "function apply(){" +
            "put(topBar,hiddenNow,hiddenNow?TOP_DELAY:0);" +
            "put(botBar,hiddenNow,hiddenNow?BOT_DELAY:0);}" +
            "function onScroll(){" +
            "var y=window.scrollY||document.documentElement.scrollTop||0;" +
            "var dy=y-lastY;lastY=y;" +
            "if(!dy)return;" +
            // 换方向先把累计清零；同方向累到过阈值才动作
            "if((dy>0)!==(acc>0))acc=0;" +
            "acc+=dy;" +
            "if(Math.abs(acc)<TH)return;" +
            "acc=0;" +
            "if((topBar&&!topBar.isConnected)||(botBar&&!botBar.isConnected)){" +
            "topBar=null;botBar=null;}" +
            "if(!topBar&&!botBar)pick();" +
            // 向上滚：都放回来。向下滚且已经离开顶部一段：先收顶栏、再收底栏
            "if(dy<0){if(hiddenNow){hiddenNow=false;apply();}}" +
            "else if(y>MIN_SCROLL&&!hiddenNow){hiddenNow=true;apply();}" +
            "}" +
            "window.addEventListener('scroll',onScroll,{passive:true});" +
            // 站点换导航（SPA 路由）之后重新认一次：认之前先把旧的复位，免得留着位移
            "setInterval(function(){" +
            "if(document.hidden)return;" +
            "if((topBar&&!topBar.isConnected)||(botBar&&!botBar.isConnected)||(!topBar&&!botBar)){" +
            "topBar=null;botBar=null;pick();apply();}" +
            "},1500);" +
            "})();"
}
