#!/usr/bin/env python3
"""World sprite manifest — art is authored manually in assets/world/."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'world'

FLOORS = [
    'floor_grass',
    'floor_dirt',
    'floor_rock',
]

FOLIAGE = [
    'foliage_grass',
    'foliage_grass2',
    'foliage_grass3',
    'foliage_grass4',
    'foliage_grass_tall',
    'foliage_pebble',
    'foliage_rock',
    'foliage_bush',
    'foliage_tree',
    'foliage_tree2',
    'foliage_tree3',
    'foliage_stump',
]

OTHER = ['wall']


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f'World sprites directory: {OUT}')
    print('Add your own PNGs (this script does not generate or overwrite art):')
    for name in FLOORS + FOLIAGE + OTHER:
        path = OUT / f'{name}.png'
        status = 'present' if path.is_file() else 'missing'
        print(f'  {name}.png — {status}')


if __name__ == '__main__':
    main()
