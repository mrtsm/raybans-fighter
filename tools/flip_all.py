#!/usr/bin/env python3
"""Flip ALL fighter sprites horizontally so they face LEFT."""
from PIL import Image
from pathlib import Path

SPRITES_DIR = Path(__file__).parent.parent / "assets" / "sprites"

def main():
    count = 0
    for fighter in ["blaze", "granite", "shade", "volt"]:
        fighter_dir = SPRITES_DIR / fighter
        if not fighter_dir.exists():
            continue
        print(f"\n🔄 Flipping {fighter.upper()}...")
        for sprite_file in sorted(fighter_dir.glob("*.png")):
            img = Image.open(sprite_file)
            flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
            flipped.save(sprite_file, "PNG")
            print(f"  ✅ {sprite_file.name}")
            count += 1
    print(f"\n✅ Flipped {count} sprites.")

if __name__ == "__main__":
    main()
