#!/usr/bin/env python3
"""Remove backgrounds from JPEG sprites only (ones that need it)."""
import os
import subprocess
from pathlib import Path

SPRITES_DIR = Path(__file__).parent.parent / "assets" / "sprites"

def is_jpeg(path):
    with open(path, 'rb') as f:
        header = f.read(3)
        return header[:2] == b'\xff\xd8'

def main():
    jpegs = []
    for fighter in ["blaze", "granite", "shade", "volt"]:
        fighter_dir = SPRITES_DIR / fighter
        if not fighter_dir.exists():
            continue
        for f in sorted(fighter_dir.glob("*.png")):
            if is_jpeg(f):
                jpegs.append(f)
    
    print(f"Found {len(jpegs)} JPEG sprites that need background removal:")
    for j in jpegs:
        print(f"  {j.relative_to(SPRITES_DIR)}")
    
    for j in jpegs:
        print(f"\nProcessing {j.name}...")
        try:
            from rembg import remove
            from PIL import Image
            import io
            
            with open(j, "rb") as f:
                input_data = f.read()
            output_data = remove(input_data)
            img = Image.open(io.BytesIO(output_data))
            img.save(j, "PNG")
            print(f"  ✅ {j.name} — converted to PNG with transparency")
        except Exception as e:
            print(f"  ❌ {j.name}: {e}")
    
    print(f"\n✅ Done! Processed {len(jpegs)} sprites.")

if __name__ == "__main__":
    main()
