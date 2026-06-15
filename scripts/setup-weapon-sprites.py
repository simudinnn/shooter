# Rename/copy weapon sprites and generate _shot frames.
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets' / 'weapons'
root.mkdir(parents=True, exist_ok=True)

renames = {
    'pistol': 'glock',
    'rifle': 'm16',
    'shotgun': 'm870',
    'sniper': 'm24',
}

for old, new in renames.items():
    src = root / f'{old}.png'
    dst = root / f'{new}.png'
    if src.exists() and not dst.exists():
        dst.write_bytes(src.read_bytes())
        print(f'copied {old} -> {new}')

placeholders = {
    'uzi': 'm16',
    'famas': 'm16',
    'fal': 'm16',
    'revolver': 'glock',
    'fire_axe': 'knife',
    'wooden_bat': 'knife',
    'crowbar': 'knife',
}

for name, src_name in placeholders.items():
    src = root / f'{src_name}.png'
    dst = root / f'{name}.png'
    if src.exists() and not dst.exists():
        dst.write_bytes(src.read_bytes())
        print(f'placeholder {name} from {src_name}')

guns = ['glock', 'm16', 'm870', 'm24', 'uzi', 'revolver', 'famas', 'fal']

for base in guns:
    src = root / f'{base}.png'
    if not src.exists():
        continue
    img = Image.open(src).convert('RGBA')
    if img.size != (24, 24):
        canvas = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
        x = max(0, (24 - img.width) // 2)
        y = max(0, 24 - img.height - 2)
        canvas.paste(img, (x, y), img)
        img = canvas
        img.save(src)

    shot = img.copy()
    flash = [
        (10, 2), (11, 2), (12, 2), (13, 2),
        (9, 3), (10, 3), (11, 3), (12, 3), (13, 3), (14, 3),
        (10, 4), (11, 4), (12, 4),
        (11, 1), (12, 1),
    ]
    for x, y in flash:
        shot.putpixel((x, y), (255, 150, 40, 255))
    shot.putpixel((11, 0), (255, 240, 180, 255))
    shot.putpixel((12, 0), (255, 240, 180, 255))
    shot.save(root / f'{base}_shot.png')
    print(f'shot frame {base}_shot.png')

for melee in ['knife', 'fire_axe', 'wooden_bat', 'crowbar']:
    path = root / f'{melee}.png'
    if not path.exists():
        continue
    img = Image.open(path).convert('RGBA')
    if img.size != (24, 24):
        canvas = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
        x = max(0, (24 - img.width) // 2)
        y = max(0, 24 - img.height - 2)
        canvas.paste(img, (x, y), img)
        canvas.save(path)

print('Weapon assets ready.')
