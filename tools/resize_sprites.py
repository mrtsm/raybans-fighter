#!/usr/bin/env python3
"""Resize all fighter sprites to 256x256 and compress."""
from PIL import Image
from pathlib import Path

SPRITES_DIR = Path(__file__).parent.parent / "assets" / "sprites"
TARGET_SIZE = 256

def main():
    count = 0
    saved = 0
    for fighter in ["blaze", "granite", "shade", "volt"]:
        fighter_dir = SPRITES_DIR / fighter
        if not fighter_dir.exists():
            continue
        print(f"\n📐 Resizing {fighter.upper()}...")
        for sprite_file in sorted(fighter_dir.glob("*.png")):
            old_size = sprite_file.stat().st_size
            img = Image.open(sprite_file)
            if img.width > TARGET_SIZE or img.height > TARGET_SIZE:
                img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
            img.save(sprite_file, "PNG", optimize=True)
            new_size = sprite_file.stat().st_size
            saved += old_size - new_size
            print(f"  ✅ {sprite_file.name}: {old_size//1024}KB → {new_size//1024}KB")
            count += 1
    print(f"\n✅ Resized {count} sprites. Saved {saved//1024//1024}MB")

if __name__ == "__main__":
    main()
