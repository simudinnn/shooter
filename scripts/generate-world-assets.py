#!/usr/bin/env python3
"""Generate world floor + foliage sprites into assets/world/."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'world'
SIZE = 16

FLOORS = {
    'floor_grass': ('#b8b8b0', '#a8a8a0', '#c8c8c0'),
    'floor_dirt': ('#6a5840', '#5a4834', '#7a6848'),
    'floor_rock': ('#5a5a58', '#4a4a48', '#6a6a66'),
}

FOLIAGE = {
    'foliage_grass': 'grass',
    'foliage_grass_tall': 'grass_tall',
    'foliage_rock': 'rock',
    'foliage_tree': 'tree',
    'foliage_stump': 'stump',
}


def px(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: str) -> None:
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def draw_floor(name: str, colors: tuple[str, str, str]) -> Image.Image:
    base, dark, light = colors
    img = Image.new('RGBA', (SIZE, SIZE), base)
    draw = ImageDraw.Draw(img)
    px(draw, 0, 0, 7, 7, dark)
    px(draw, 9, 9, 7, 7, light)
    px(draw, 0, 9, 4, 4, dark)
    px(draw, 12, 0, 4, 4, light)
    if 'rock' in name:
        px(draw, 4, 4, 8, 8, dark)
        px(draw, 6, 6, 4, 4, light)
    if 'dirt' in name:
        px(draw, 2, 2, 5, 4, dark)
        px(draw, 9, 8, 5, 5, light)
    return img


def draw_foliage(kind: str) -> Image.Image:
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if kind == 'grass':
        px(draw, 6, 11, 2, 3, '#505848')
        px(draw, 9, 11, 2, 3, '#505848')
        px(draw, 7, 9, 2, 4, '#606858')
        px(draw, 5, 10, 2, 3, '#585850')
        px(draw, 10, 10, 2, 3, '#585850')
    elif kind == 'grass_tall':
        px(draw, 7, 6, 2, 8, '#989890')
        px(draw, 4, 5, 2, 8, '#a8a8a0')
        px(draw, 10, 5, 2, 8, '#a8a8a0')
        px(draw, 6, 4, 4, 2, '#b8b8b0')
    elif kind == 'rock':
        px(draw, 3, 8, 10, 6, '#5a5a58')
        px(draw, 5, 6, 7, 5, '#6a6a66')
        px(draw, 7, 5, 4, 3, '#7a7a74')
    elif kind == 'tree':
        px(draw, 7, 10, 2, 5, '#5a4030')
        px(draw, 3, 2, 10, 9, '#3a7840')
        px(draw, 5, 1, 6, 5, '#4a9050')
        px(draw, 4, 4, 8, 5, '#2d5a30')
    elif kind == 'stump':
        px(draw, 5, 9, 6, 5, '#5a4030')
        px(draw, 6, 7, 4, 3, '#6a5040')
        px(draw, 4, 8, 8, 2, '#4a3828')
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, colors in FLOORS.items():
        draw_floor(name, colors).save(OUT / f'{name}.png')
    for name, kind in FOLIAGE.items():
        draw_foliage(kind).save(OUT / f'{name}.png')
    wall = Image.new('RGBA', (SIZE, SIZE), '#8a8580')
    wdraw = ImageDraw.Draw(wall)
    px(wdraw, 1, 1, 14, 2, '#f0a030')
    px(wdraw, 2, 4, 12, 10, '#6a6560')
    wall.save(OUT / 'wall.png')
    print(f'Wrote {len(FLOORS) + len(FOLIAGE) + 1} sprites to {OUT}')


if __name__ == '__main__':
    main()
