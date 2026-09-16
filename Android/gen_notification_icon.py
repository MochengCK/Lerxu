#!/usr/bin/env python3
"""从 L512 logo 生成 Android 通知栏小图标：纯白剪影 + 透明背景。

Android 通知 small icon 只取 alpha 通道做单色渲染，
必须是无背景的白色剪影（黑底 PNG 会变成一坨色块）。
"""
from PIL import Image
import os

SRC = '/Users/zzzz/Documents/Lerxu/static/L512.png'
OUT = '/Users/zzzz/Documents/Lerxu/Android/app/src/main/res/drawable-nodpi/ic_notification.png'
CANVAS = 96          # 通知图标标准尺寸（约 24dp @ mdpi 基准，各 dpi 自动缩放）
CONTENT_RATIO = 0.82  # 内容占画布比例，留出边缘

img = Image.open(SRC).convert('RGBA')
print(f'source: {img.size}')

# 非 white/近白 → 白色不透明；white/近白 → 透明。按亮度求 alpha 保留抗锯齿边缘。
silhouette = Image.new('RGBA', img.size, (0, 0, 0, 0))
src_px = img.load()
dst_px = silhouette.load()
WHITE_FLOOR = 235  # 高于该亮度的像素视为背景
DARK_CEIL = 80     # 低于该亮度全不透明
for y in range(img.size[1]):
    for x in range(img.size[0]):
        r, g, b, a = src_px[x, y]
        if a == 0:
            continue
        m = min(r, g, b)
        if m >= WHITE_FLOOR:
            continue
        if m <= DARK_CEIL:
            alpha = 255
        else:
            alpha = int(255 * (WHITE_FLOOR - m) / (WHITE_FLOOR - DARK_CEIL))
        dst_px[x, y] = (255, 255, 255, alpha)

# 裁剪到内容包围盒
bbox = silhouette.getbbox()
if bbox:
    silhouette = silhouette.crop(bbox)
print(f'content bbox: {silhouette.size}')

# 居中放到 96×96 透明画布
long_side = max(silhouette.size)
target = int(CANVAS * CONTENT_RATIO)
scale = target / long_side
new_size = (max(1, int(silhouette.size[0] * scale)), max(1, int(silhouette.size[1] * scale)))
silhouette = silhouette.resize(new_size, Image.LANCZOS)

canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
offset = ((CANVAS - new_size[0]) // 2, (CANVAS - new_size[1]) // 2)
canvas.paste(silhouette, offset, silhouette)
canvas.save(OUT)
print(f'saved: {OUT} ({os.path.getsize(OUT)} bytes)')
