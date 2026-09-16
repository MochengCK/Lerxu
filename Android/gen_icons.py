#!/usr/bin/env python3
"""Generate Android adaptive icon foreground PNGs with proper padding."""
from PIL import Image
import os

img = Image.open('/Users/zzzz/Documents/Lerxu/static/L512.png').convert('RGBA')
print(f'Original: {img.size}')

res_dir = '/Users/zzzz/Documents/Lerxu/Android/app/src/main/res'

# Foreground: 108dp canvas, content ~62% centered, transparent padding
fg_sizes = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
}

for folder, size in fg_sizes.items():
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fg_size = int(size * 0.62)
    fg = img.resize((fg_size, fg_size), Image.LANCZOS)
    offset = ((size - fg_size) // 2, (size - fg_size) // 2)
    canvas.paste(fg, offset, fg)
    path = os.path.join(res_dir, folder, 'ic_launcher_foreground.png')
    canvas.save(path)
    print(f'{folder}: {size}px canvas, fg={fg_size}px -> {path}')

# Regular icons: full size, no padding
icon_sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

for folder, size in icon_sizes.items():
    icon = img.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(res_dir, folder, 'ic_launcher.png'))
    icon.save(os.path.join(res_dir, folder, 'ic_launcher_round.png'))
    print(f'{folder} icon: {size}px')

print('Done')
