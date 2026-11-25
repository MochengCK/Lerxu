// 首帧主题预置：主进程把 theme 带在 URL 上，这个脚本在 <style> 之前
// 同步执行，先把主题类落到 <html> —— 页面第一次上色就是正确主题，
// 不再等 dom-ready 的 sync-theme（那会先闪一帧浅色）。
(function () {
  'use strict'

  let theme = ''
  try {
    theme = new URLSearchParams(window.location.search).get('theme') || ''
  } catch (e) {}

  document.documentElement.classList.add(theme === 'dark' ? 'dark' : 'light')
})()
