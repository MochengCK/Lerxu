#!/usr/bin/env python3
"""
Generate application icons and torrent file icons from source PNGs.

Usage:
  python3 build/generate_icons.py

Sources:
  - lerxu.png      -> app icon (icns, ico, png variants)
  - bt.png            -> torrent file icon (icns, ico)
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
STATIC_DIR = ROOT / "static"

# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

# macOS app icons follow Apple's Human Interface Guidelines: the visible
# artwork should occupy ~80% of the canvas, leaving a ~10% transparent
# margin on each side.  Without this padding the icon looks noticeably
# larger than standard macOS app icons.
# macOS app icons follow Apple's Human Interface Guidelines: the visible
# artwork should occupy ~80% of the canvas, leaving a ~10% transparent
# margin on each side.  Without this padding the icon looks noticeably
# larger than standard macOS app icons.
#
# The source PNG already has its own small transparent margins (~6.5%),
# so we use 0.90 to achieve an actual visible content of ~84% of the
# canvas — a comfortable middle ground that matches standard macOS icons.
MACOS_ICON_CONTENT_RATIO = 0.90


def resize_png(src: Path, dest: Path, size: int):
    """Resize a PNG to *size*x*size* and save (full-bleed, no padding)."""
    img = Image.open(src)
    img = img.convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "PNG")


def resize_png_padded(src: Path, dest: Path, size: int, content_ratio: float = MACOS_ICON_CONTENT_RATIO):
    """Resize a PNG to *size*x*size* with transparent padding so the
    artwork occupies only *content_ratio* of the canvas (macOS style)."""
    img = Image.open(src).convert("RGBA")
    content_size = round(size * content_ratio)
    # Use a high-resolution intermediate for better downscaling quality
    intermediate = max(content_size * 2, size)
    img_hr = img.resize((intermediate, intermediate), Image.LANCZOS)
    img_scaled = img_hr.resize((content_size, content_size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = (size - content_size) // 2
    canvas.alpha_composite(img_scaled, (offset, offset))
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")


def make_iconset(src_png: Path, iconset_dir: Path):
    """Create a macOS .iconset folder from a source PNG.

    Applies macOS-compliant padding (~10% margin) so the icon matches the
    visual size of standard macOS application icons.
    """
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True)

    sizes = [16, 32, 128, 256, 512]
    for s in sizes:
        resize_png_padded(src_png, iconset_dir / f"icon_{s}x{s}.png", s)
        resize_png_padded(src_png, iconset_dir / f"icon_{s}x{s}@2x.png", s * 2)


def make_icns(iconset_dir: Path, icns_path: Path):
    """Convert an .iconset folder to a single .icns file via iconutil."""
    if icns_path.exists():
        icns_path.unlink()
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)],
        check=True,
    )


def make_ico(src_png: Path, ico_path: Path, sizes=None):
    """Create a Windows .ico file from a source PNG.

    Pillow's ICO writer automatically resizes the source image to each
    requested size, so we only need to pass the largest image and the
    ``sizes`` list.
    """
    if sizes is None:
        sizes = [16, 24, 32, 48, 64, 128, 256]
    img = Image.open(src_png).convert("RGBA")
    ico_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(
        str(ico_path),
        format="ICO",
        sizes=[(s, s) for s in sizes],
    )


def make_linux_hicolor_icons(src: Path, dest_dir: Path, sizes=None):
    """Generate Linux hicolor-compliant icon PNGs at standard sizes.

    Files are named ``<size>x<size>.png`` so electron-builder's
    ``linux.icon`` directory scan picks them up automatically and the
    resulting AppImage / deb / rpm packages can install them to
    ``/usr/share/icons/hicolor/<size>x<size>/apps/`` — matching the
    coverage that ``L.icns`` provides for macOS so the Linux app icon
    stays visually consistent across distros and icon-theme sizes.
    """
    if sizes is None:
        sizes = [16, 32, 48, 64, 128, 256, 512]
    dest_dir.mkdir(parents=True, exist_ok=True)
    for s in sizes:
        resize_png(src, dest_dir / f"{s}x{s}.png", s)
    print(
        f"[app-icon] Wrote Linux hicolor PNGs: "
        + ", ".join(f"{s}x{s}.png" for s in sizes)
    )


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #

def generate_app_icon(src: Path):
    """Generate all app-icon assets from lerxu.png."""
    print(f"[app-icon] Source: {src.name} ({src.stat().st_size} bytes)")

    # 1. macOS iconset + icns  ->  build/icon.iconset, build/icon.icns
    iconset = BUILD_DIR / "icon.iconset"
    make_iconset(src, iconset)
    make_icns(iconset, BUILD_DIR / "icon.icns")
    print(f"[app-icon] Wrote {BUILD_DIR / 'icon.icns'}")

    # 2. Windows ico  ->  build/icon.ico
    make_ico(src, BUILD_DIR / "icon.ico")
    print(f"[app-icon] Wrote {BUILD_DIR / 'icon.ico'}")

    # 3. static/ PNG variants
    resize_png(src, STATIC_DIR / "512x512.png", 512)
    resize_png(src, STATIC_DIR / "L.png", 512)
    resize_png(src, STATIC_DIR / "L512.png", 512)
    print(f"[app-icon] Wrote static PNGs (L.png, L512.png, 512x512.png)")

    # 3b. Linux hicolor PNGs (consumed by electron-builder `linux.icon`
    # directory scan; keeps Linux rendering consistent with macOS's
    # full iconset at every icon-theme size)
    make_linux_hicolor_icons(src, STATIC_DIR)

    # 4. static/L.icns  (mac icon referenced by electron-builder.json)
    make_icns(iconset, STATIC_DIR / "L.icns")
    print(f"[app-icon] Wrote {STATIC_DIR / 'L.icns'}")

    # 5. static/L_ico_256x256.ico  (Windows 256px ico used in some places)
    make_ico(src, STATIC_DIR / "L_ico_256x256.ico", sizes=[256])
    print(f"[app-icon] Wrote {STATIC_DIR / 'L_ico_256x256.ico'}")

    # 6. Copy source into iconset for reference
    shutil.copy2(src, iconset / "source.png")


def generate_torrent_icon(src: Path):
    """Generate torrent file-icon assets from bt.png."""
    print(f"[bt-icon] Source: {src.name} ({src.stat().st_size} bytes)")

    # 1. macOS iconset + icns  ->  build/torrent.iconset, build/torrent.icns
    iconset = BUILD_DIR / "torrent.iconset"
    make_iconset(src, iconset)
    make_icns(iconset, BUILD_DIR / "torrent.icns")
    print(f"[bt-icon] Wrote {BUILD_DIR / 'torrent.icns'}")

    # 2. Windows ico  ->  build/torrent.ico
    make_ico(src, BUILD_DIR / "torrent.ico")
    print(f"[bt-icon] Wrote {BUILD_DIR / 'torrent.ico'}")


def main():
    app_src = BUILD_DIR / "sources" / "lerxu.png"
    bt_src = BUILD_DIR / "sources" / "bt.png"

    if not app_src.exists():
        print(f"ERROR: {app_src} not found", file=sys.stderr)
        sys.exit(1)
    if not bt_src.exists():
        print(f"ERROR: {bt_src} not found", file=sys.stderr)
        sys.exit(1)

    generate_app_icon(app_src)
    generate_torrent_icon(bt_src)
    print("\n✅ All icons generated successfully.")


if __name__ == "__main__":
    main()
