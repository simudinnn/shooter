#!/usr/bin/env python3
"""Generate 16x16 weapon item icons (no hands) into assets/items/{name}.png."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

GUNS = ['glock', 'm16', 'm870', 'm24', 'uzi', 'revolver', 'famas', 'fal']
MELEES = ['knife', 'fire_axe', 'wooden_bat', 'crowbar']
ALL = GUNS + MELEES
SIZE = 16


def px(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: str) -> None:
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def draw_gun(draw: ImageDraw.ImageDraw, base: str, o: int = 1) -> None:
    if base == 'glock':
        px(draw, 4 + o, 6 + o, 8, 3, '#606870')
        px(draw, 9 + o, 5 + o, 4, 4, '#4a3828')
        px(draw, 3 + o, 8 + o, 3, 4, '#5a4030')
    elif base in ('m16', 'famas'):
        px(draw, 2 + o, 6 + o, 12, 3, '#707880')
        px(draw, 10 + o, 5 + o, 4, 2, '#3a4048')
        px(draw, 1 + o, 7 + o, 4, 5, '#5a4030')
        if base == 'famas':
            px(draw, 3 + o, 5 + o, 10, 2, '#4a6850')
    elif base == 'fal':
        px(draw, 1 + o, 6 + o, 13, 3, '#686868')
        px(draw, 11 + o, 5 + o, 4, 2, '#3a4048')
        px(draw, 1 + o, 7 + o, 5, 5, '#6a4830')
    elif base == 'm870':
        px(draw, 1 + o, 6 + o, 13, 4, '#6a5038')
        px(draw, 3 + o, 5 + o, 10, 2, '#3a3028')
        px(draw, 11 + o, 6 + o, 3, 2, '#909098')
    elif base == 'm24':
        px(draw, 0 + o, 6 + o, 15, 2, '#3a4048')
        px(draw, 4 + o, 4 + o, 6, 3, '#2a3038')
        px(draw, 12 + o, 5 + o, 3, 2, '#f0a030')
    elif base == 'uzi':
        px(draw, 4 + o, 7 + o, 8, 4, '#505860')
        px(draw, 6 + o, 5 + o, 5, 3, '#3a4048')
        px(draw, 5 + o, 10 + o, 4, 3, '#5a4030')
    elif base == 'revolver':
        px(draw, 5 + o, 6 + o, 7, 3, '#606870')
        px(draw, 8 + o, 5 + o, 5, 5, '#4a3828')
        px(draw, 6 + o, 9 + o, 4, 4, '#5a4030')
    else:
        px(draw, 2 + o, 6 + o, 12, 3, '#707880')
        px(draw, 1 + o, 7 + o, 4, 5, '#5a4030')


def draw_melee(draw: ImageDraw.ImageDraw, name: str, o: int = 1) -> None:
    if name == 'knife':
        px(draw, 7 + o, 2 + o, 2, 9, '#c0c4cc')
        px(draw, 6 + o, 9 + o, 4, 3, '#5a4030')
        px(draw, 7 + o, 1 + o, 2, 2, '#e8ecf0')
    elif name == 'fire_axe':
        px(draw, 4 + o, 1 + o, 8, 5, '#a03028')
        px(draw, 5 + o, 0 + o, 6, 2, '#c84838')
        px(draw, 7 + o, 6 + o, 2, 9, '#5a4030')
    elif name == 'wooden_bat':
        px(draw, 7 + o, 0 + o, 3, 13, '#8a6840')
        px(draw, 6 + o, 1 + o, 5, 11, '#6a5030')
        px(draw, 8 + o, 12 + o, 2, 2, '#4a3828')
    elif name == 'crowbar':
        px(draw, 7 + o, 0 + o, 2, 12, '#707880')
        px(draw, 5 + o, 0 + o, 4, 3, '#9098a0')
        px(draw, 6 + o, 11 + o, 4, 2, '#606870')


def render_weapon(name: str) -> Image.Image:
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if name in GUNS:
        draw_gun(draw, name)
    else:
        draw_melee(draw, name)
    return img


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / 'assets' / 'items'
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ALL:
        path = out_dir / f'{name}.png'
        render_weapon(name).save(path)
        print(f'  {path.relative_to(root)}')
    print(f'Created {len(ALL)} item icons in assets/items/')


if __name__ == '__main__':
    main()
