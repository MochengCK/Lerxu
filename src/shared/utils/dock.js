// Dock 图标速度叠加：下载/上传速度以两个独立圆角容器（chip）
// 叠画在应用图标上方、水平居中，替代长度受限会被省略的系统 badge。
// 容器内左侧为圆角笔画绘制的矢量方向图标（下载=落入托盘的箭头，
// 上传=离开托盘的箭头），右侧为速度文本。

import { transferCanvasTo } from './tray'

const SIZE = 256
const MARGIN = 6
// 底图 512x512.png 为全出血图（artwork 约占文件 ~93.6%），此处比例需折算，
// 使最终可见内容 ≈ 打包 icns 的 ~82.8%（0.885 * 0.936 ≈ 82.9%）。
// 这样渲染层切换动态 Dock 图标前后，图标视觉大小保持一致。
const ICON_CONTENT_RATIO = 0.885
const CHIP_HEIGHT = 64
const CHIP_RADIUS = 20
const CHIP_PADDING_X = 18
const CHIP_GAP = 10
const FONT = 'bold 34px "Arial"'
const GLYPH_BOX = 38
const GLYPH_GAP = 10
const DOWNLOAD_CHIP_BG = 'rgba(30, 111, 255, 0.92)'
const UPLOAD_CHIP_BG = 'rgba(52, 199, 89, 0.92)'

// Temp Fix: 与 tray.js 相同，避免 lodash 依赖问题
const bytesToSize = (bytes) => {
  const b = parseInt(bytes, 10) || 0
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  if (b === 0) { return '0 KB' }
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / (1024 ** i)).toFixed(1)} ${sizes[i]}`
}

const roundRectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const glyphStroke = (ctx) => {
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

// 下载图标：竖直箭杆 + 向下箭头，落入底部托盘线
const drawDownloadGlyph = (ctx, x, y, s) => {
  glyphStroke(ctx)
  const cx = x + s / 2
  ctx.beginPath()
  // 箭杆
  ctx.moveTo(cx, y + 3)
  ctx.lineTo(cx, y + s - 15)
  // 箭头
  ctx.moveTo(cx - 8, y + s - 21)
  ctx.lineTo(cx, y + s - 12)
  ctx.lineTo(cx + 8, y + s - 21)
  // 托盘底线
  ctx.moveTo(x + 5, y + s - 3)
  ctx.lineTo(x + s - 5, y + s - 3)
  ctx.stroke()
}

// 上传图标：自托盘线升起的竖直箭杆 + 向上箭头
const drawUploadGlyph = (ctx, x, y, s) => {
  glyphStroke(ctx)
  const cx = x + s / 2
  ctx.beginPath()
  // 箭杆
  ctx.moveTo(cx, y + s - 3)
  ctx.lineTo(cx, y + 15)
  // 箭头
  ctx.moveTo(cx - 8, y + 21)
  ctx.lineTo(cx, y + 12)
  ctx.lineTo(cx + 8, y + 21)
  // 托盘底线
  ctx.moveTo(x + 5, y + s - 3)
  ctx.lineTo(x + s - 5, y + s - 3)
  ctx.stroke()
}

/// 单个速度容器：图标 + 文本整体水平居中；超宽时压缩文本不省略号。
const drawChip = (ctx, text, bg, y, drawGlyph) => {
  ctx.font = FONT
  const textW = ctx.measureText(text).width
  const contentW = GLYPH_BOX + GLYPH_GAP + Math.ceil(textW)
  const w = Math.min(SIZE - MARGIN * 2, contentW + CHIP_PADDING_X * 2)
  const x = (SIZE - w) / 2

  roundRectPath(ctx, x, y, w, CHIP_HEIGHT, CHIP_RADIUS)
  ctx.fillStyle = bg
  ctx.fill()

  const glyphY = y + (CHIP_HEIGHT - GLYPH_BOX) / 2
  drawGlyph(ctx, x + CHIP_PADDING_X, glyphY, GLYPH_BOX)

  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const textX = x + CHIP_PADDING_X + GLYPH_BOX + GLYPH_GAP
  ctx.fillText(text, textX, y + CHIP_HEIGHT / 2 + 1, w - (textX - x) - CHIP_PADDING_X)
}

export const draw = async ({ canvas, icon, uploadSpeed, downloadSpeed, resultType }) => {
  if (!canvas) {
    throw new Error('canvas is required')
  }

  if (canvas.width !== SIZE) {
    canvas.width = SIZE
  }
  if (canvas.height !== SIZE) {
    canvas.height = SIZE
  }

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, SIZE, SIZE)

  if (icon) {
    // 按标准 macOS 图标比例缩放并居中绘制，避免全出血拉伸导致图标偏大
    const iconSize = Math.round(SIZE * ICON_CONTENT_RATIO)
    const off = Math.round((SIZE - iconSize) / 2)
    ctx.drawImage(icon, off, off, iconSize, iconSize)
  }

  // 两个独立容器都叠在图标上方、水平正中间：
  // 上传（绿）在上、下载（蓝）在下；速度为 0 的方向不绘制。
  let y = MARGIN
  if (uploadSpeed > 0) {
    drawChip(ctx, `${bytesToSize(uploadSpeed)}/s`, UPLOAD_CHIP_BG, y, drawUploadGlyph)
    y += CHIP_HEIGHT + CHIP_GAP
  }
  if (downloadSpeed > 0) {
    drawChip(ctx, `${bytesToSize(downloadSpeed)}/s`, DOWNLOAD_CHIP_BG, y, drawDownloadGlyph)
  }

  return transferCanvasTo(canvas, resultType)
}
