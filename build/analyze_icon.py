#!/usr/bin/env python3
"""Analyze icon content fill ratio."""
from PIL import Image

img = Image.open('linkcore.png').convert('RGBA')
bbox = img.getbbox()
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]

print(f"Source canvas: {img.size}")
print(f"Content bbox: {bbox}")
print(f"Content size: {w}x{h}")
print(f"Content fills: {w/img.size[0]*100:.1f}% x {h/img.size[1]*100:.1f}%")
print(f"Margins: left={bbox[0]} top={bbox[1]} right={img.size[0]-bbox[2]} bottom={img.size[1]-bbox[3]}")

for ratio in [0.80, 0.85, 0.90, 0.92, 0.95, 1.00]:
    actual = ratio * w / img.size[0] * 100
    print(f"  ratio={ratio:.2f} -> actual visible content: {actual:.1f}% of canvas")
