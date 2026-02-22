from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / 'assets' / 'sprites'

FIGHTERS = ['shade','volt','blaze','granite']
POSES = ['idle','light','heavy','block','jump','crouch','hitstun','ko','special','victory']


def resize_sprite(path: Path, size=(256,256)):
    img = Image.open(path).convert('RGBA')
    # Keep aspect, fit within box
    img.thumbnail(size, Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0,0,0,0))
    x = (size[0] - img.size[0]) // 2
    y = (size[1] - img.size[1]) // 2
    canvas.paste(img, (x,y), img)
    canvas.save(path)


def resize_bg(path: Path, size=(600,400)):
    img = Image.open(path).convert('RGBA')
    img = img.resize(size, Image.LANCZOS)
    img.save(path)


def main():
    for f in FIGHTERS:
        for p in POSES:
            path = SPRITES / f / f'{p}.png'
            if not path.exists():
                raise FileNotFoundError(path)
            resize_sprite(path)

    resize_bg(SPRITES / 'arena_bg.png')
    resize_bg(SPRITES / 'title_bg.png')


if __name__ == '__main__':
    main()
