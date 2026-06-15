#!/usr/bin/env python3
"""Convert a 128x128 Minecraft-style ASCII atlas to TTF + WOFF2."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

CELL = 8
COLS = 16
UNITS_PER_PX = 64
EM = CELL * UNITS_PER_PX
SPACE_ADVANCE = 3 * UNITS_PER_PX


def is_ink(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a < 32:
        return False
    return (r + g + b) / 3 > 64


def glyph_pixels(img: Image.Image, code: int) -> list[tuple[int, int]]:
    col = code % COLS
    row = code // COLS
    x0 = col * CELL
    y0 = row * CELL
    pixels: list[tuple[int, int]] = []
    for y in range(CELL):
        for x in range(CELL):
            if is_ink(img.getpixel((x0 + x, y0 + y))):
                pixels.append((x, y))
    return pixels


def normalize_pixels(pixels: list[tuple[int, int]]) -> tuple[list[tuple[int, int]], int]:
    if not pixels:
        return [], 0
    min_x = min(p[0] for p in pixels)
    return [((x - min_x), y) for x, y in pixels], min_x


def measure_advance(pixels: list[tuple[int, int]], code: int) -> int:
    if code == 32:
        return SPACE_ADVANCE
    if not pixels:
        return UNITS_PER_PX
    max_x = max(p[0] for p in pixels)
    return (max_x + 2) * UNITS_PER_PX


def build_glyph(pixels: list[tuple[int, int]]):
    pen = TTGlyphPen(None)
    for px, py in pixels:
        x = px * UNITS_PER_PX
        y = (CELL - 1 - py) * UNITS_PER_PX
        s = UNITS_PER_PX
        pen.moveTo((x, y))
        pen.lineTo((x + s, y))
        pen.lineTo((x + s, y + s))
        pen.lineTo((x, y + s))
        pen.closePath()
    return pen.glyph()


def glyph_name(code: int) -> str:
    if code == 0:
        return '.notdef'
    if code == 32:
        return 'space'
    return f'uni{code:04X}'


def convert(src: Path, out_dir: Path) -> None:
    img = Image.open(src).convert('RGBA')
    if img.size != (128, 128):
        raise SystemExit(f'Expected 128x128 atlas, got {img.size[0]}x{img.size[1]}')

    glyphs: dict[str, object] = {}
    cmap: dict[int, str] = {}
    metrics: dict[str, tuple[int, int]] = {}
    advances: list[int] = []

    for code in range(256):
        name = glyph_name(code)
        raw_pixels = glyph_pixels(img, code)
        if code == 0:
            raw_pixels = [(0, 0), (1, 0), (6, 0), (7, 0), (7, 7), (0, 7)]
        pixels, _ = normalize_pixels(raw_pixels)
        advance = measure_advance(pixels, code)
        glyphs[name] = build_glyph(pixels)
        metrics[name] = (advance, 0)
        if code != 0:
            cmap[code] = name
            advances.append(advance)

    avg_width = sum(advances) // max(1, len(advances))

    glyph_order = ['.notdef'] + sorted(
        (name for name in glyphs if name != '.notdef'),
        key=lambda n: int(n[3:], 16) if n.startswith('uni') else (32 if n == 'space' else -1),
    )

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=EM, descent=0)
    fb.setupHead(unitsPerEm=EM)
    fb.setupOS2(
        sTypoAscender=EM,
        sTypoDescender=0,
        usWinAscent=EM,
        usWinDescent=0,
        xAvgCharWidth=avg_width,
    )
    fb.setupPost()
    fb.setupNameTable({'familyName': 'GamePixel', 'styleName': 'Regular'})
    fb.setupDummyDSIG()

    out_dir.mkdir(parents=True, exist_ok=True)
    ttf_path = out_dir / 'game-pixel.ttf'
    woff2_path = out_dir / 'game-pixel.woff2'
    fb.save(ttf_path)

    font = TTFont(ttf_path)
    try:
        font.flavor = 'woff2'
        font.save(woff2_path)
        print(f'Created {woff2_path}')
    except ImportError:
        print('brotli not installed — skipped WOFF2 (TTF still works in browsers)')
    print(f'Created {ttf_path}')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'assets' / 'fonts' / 'ascii.png'
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'assets' / 'fonts'
    convert(src, out)
