#!/usr/bin/env python3
"""
Generate crisp browser extension icons at multiple resolutions.
Each size is drawn natively (at 4x supersampling then downscaled)
to ensure pixel-perfect sharpness with no stretching.

Icon design:
  - Rounded square background with blue gradient
  - White download arrow (Material Design style, proportional)
"""

import math
import os
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def create_gradient_background(size, corner_radius, color_top, color_bottom):
    """Create a rounded-rectangle background with a vertical gradient."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gradient = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pixels = gradient.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(color_top[0] + (color_bottom[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bottom[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bottom[2] - color_top[2]) * t)
        for x in range(size):
            pixels[x, y] = (r, g, b, 255)

    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=corner_radius,
        fill=255
    )
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(gradient, (0, 0), mask)
    return result


def draw_download_arrow(draw, size, color, stroke_width):
    """
    Draw a Material Design style download arrow on the draw context.
    Coordinates based on 24x24 viewBox, scaled to target size.
    Arrow polygon: (19,9)(15,9)(15,3)(9,3)(9,9)(5,9)(12,16)
    Bottom bar:    (5,18)(5,20)(19,20)(19,18)
    """
    s = size / 24.0  # scale factor

    # Arrow head (trapezoid pointing down)
    arrow_pts = [
        (19 * s, 9 * s),
        (15 * s, 9 * s),
        (15 * s, 3 * s),
        (9 * s, 3 * s),
        (9 * s, 9 * s),
        (5 * s, 9 * s),
        (12 * s, 16 * s),
    ]
    draw.polygon(arrow_pts, fill=color)

    # Bottom bar (tray)
    bar_top = 18 * s
    bar_bottom = 20.5 * s
    bar_left = 5 * s
    bar_right = 19 * s
    # Slightly round the bar corners for polish at larger sizes
    bar_radius = min(stroke_width * 0.5, (bar_bottom - bar_top) * 0.4)
    draw.rounded_rectangle(
        [bar_left, bar_top, bar_right, bar_bottom],
        radius=bar_radius,
        fill=color
    )


def generate_icon(target_size):
    """
    Generate a single icon at the target size.
    Uses 4x supersampling for anti-aliasing, then downscales.
    """
    ss_factor = 4
    ss_size = target_size * ss_factor

    # Colors
    color_top = (59, 130, 246)      # Blue-500 (#3B82F6)
    color_bottom = (29, 78, 216)    # Blue-700 (#1D4ED8)
    arrow_color = (255, 255, 255, 255)

    # Corner radius (proportional, but not too small)
    corner_radius = int(ss_size * 0.22)  # ~22% rounded

    # Create gradient background
    icon = create_gradient_background(ss_size, corner_radius, color_top, color_bottom)

    # Draw download arrow
    arrow_draw = ImageDraw.Draw(icon)
    stroke_w = max(1, ss_size // 64)
    draw_download_arrow(arrow_draw, ss_size, arrow_color, stroke_w)

    # Downscale to target size with high-quality LANCZOS
    icon = icon.resize((target_size, target_size), Image.LANCZOS)

    return icon


def main():
    sizes = [16, 32, 48, 128]

    for size in sizes:
        icon = generate_icon(size)
        filename = f'icon{size}.png'
        filepath = os.path.join(OUTPUT_DIR, filename)
        icon.save(filepath, 'PNG', optimize=True)
        print(f'Generated {filename} ({size}x{size})')

    print('All icons generated successfully!')


if __name__ == '__main__':
    main()
