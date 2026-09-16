#!/usr/bin/env python3
"""
Generate Android launcher & notification icons from the desktop artwork.

Usage:
  python3 build/generate_android_icons.py

Source:
  - static/L512.png (same artwork as build/sources/lerxu.png, full-bleed 512px)

Outputs (Android/app/src/main/res):
  - mipmap-*/ic_launcher_foreground.png  adaptive foreground, artwork fills
    ~65% of the 108dp canvas (the 72dp mask viewport) so the glyph is as
    large as possible without being clipped by launcher masks
  - mipmap-*/ic_launcher.png / ic_launcher_round.png  legacy full-bleed
    white tile with the artwork at 75%
  - drawable-nodpi/ic_notification.png  white alpha silhouette for the
    engine foreground-service notification (system tints it)
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static" / "L512.png"
RES = ROOT / "Android" / "app" / "src" / "main" / "res"

# Adaptive icon: 108dp canvas, launcher mask shows the central 72dp.
# Artwork ratio 0.65 => glyph spans ~97% of the visible mask diameter.
ADAPTIVE_ART_RATIO = 0.65

# Legacy tile icon: artwork at 75% of the tile.
LEGACY_ART_RATIO = 0.75

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}


def load_artwork() -> Image.Image:
    """Trim the source to its exact alpha bounding box."""
    img = Image.open(SRC).convert("RGBA")
    img = img.crop(img.getchannel("A").getbbox())
    return img


def make_foreground(art: Image.Image, scale: float) -> Image.Image:
    canvas_px = round(108 * scale)
    content_px = round(108 * scale * ADAPTIVE_ART_RATIO)
    scaled = art.resize((content_px, content_px), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    offset = (canvas_px - content_px) // 2
    canvas.alpha_composite(scaled, (offset, offset))
    return canvas


def _tile(size: int, circular: bool) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    color = (255, 255, 255, 255)
    radius = round(size * 0.22)
    if circular:
        draw.ellipse([0, 0, size - 1, size - 1], fill=color)
    else:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return tile


def make_legacy(art: Image.Image, scale: float, circular: bool) -> Image.Image:
    size = round(48 * scale)
    content_px = round(size * LEGACY_ART_RATIO)
    scaled = art.resize((content_px, content_px), Image.LANCZOS)
    canvas = _tile(size, circular)
    offset = (size - content_px) // 2
    canvas.alpha_composite(scaled, (offset, offset))
    return canvas


def make_notification_icon(art: Image.Image) -> Image.Image:
    """White glyph silhouette for notifications.

    The artwork includes a baked-in white tile; the silhouette must be the
    L glyph only, so reject near-white pixels (tile) and keep the dark/blue
    glyph pixels, then render them as pure white with that alpha.
    """
    size = 96
    scaled = art.resize((size, size), Image.LANCZOS)
    px = scaled.load()
    mask = Image.new("L", (size, size), 0)
    mpx = mask.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            is_glyph = a > 60 and not (r > 235 and g > 235 and b > 235)
            mpx[x, y] = 255 if is_glyph else 0
    icon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    icon.putalpha(mask)
    return icon


def main():
    art = load_artwork()
    print(f"[android-icon] Source: {SRC.name} -> artwork {art.size[0]}x{art.size[1]}")

    for density, scale in DENSITIES.items():
        d = RES / f"mipmap-{density}"
        d.mkdir(parents=True, exist_ok=True)
        make_foreground(art, scale).save(d / "ic_launcher_foreground.png", "PNG")
        make_legacy(art, scale, circular=False).save(d / "ic_launcher.png", "PNG")
        make_legacy(art, scale, circular=True).save(d / "ic_launcher_round.png", "PNG")
        print(f"[android-icon] mipmap-{density}: foreground + launcher + round")

    nodpi = RES / "drawable-nodpi"
    nodpi.mkdir(parents=True, exist_ok=True)
    make_notification_icon(art).save(nodpi / "ic_notification.png", "PNG")
    print(f"[android-icon] drawable-nodpi/ic_notification.png")

    print("\n✅ Android icons generated.")


if __name__ == "__main__":
    main()
