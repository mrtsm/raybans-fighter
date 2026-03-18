#!/usr/bin/env python3
"""Remove backgrounds from all fighter sprites using rembg AI."""
import os
import sys
from pathlib import Path
from rembg import remove
from PIL import Image
import io

SPRITES_DIR = Path(__file__).parent.parent / "assets" / "sprites"
FIGHTERS = ["blaze", "granite", "shade", "volt"]

def process_sprite(path):
    """Remove background from a single sprite and save as PNG."""
    try:
        with open(path, "rb") as f:
            input_data = f.read()
        output_data = remove(input_data)
        # Save as actual PNG with transparency
        img = Image.open(io.BytesIO(output_data))
        img.save(path, "PNG")
        print(f"  ✅ {path.name}")
    except Exception as e:
        print(f"  ❌ {path.name}: {e}")

def main():
    total = 0
    for fighter in FIGHTERS:
        fighter_dir = SPRITES_DIR / fighter
        if not fighter_dir.exists():
            print(f"⚠️  Skipping {fighter} — directory not found")
            continue
        print(f"\n🎨 Processing {fighter.upper()}...")
        for sprite_file in sorted(fighter_dir.glob("*.png")):
            process_sprite(sprite_file)
            total += 1
    print(f"\n✅ Done! Processed {total} sprites.")

if __name__ == "__main__":
    main()
