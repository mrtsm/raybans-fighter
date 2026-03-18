#!/usr/bin/env python3
"""
Auto-fix sprites facing the wrong direction by horizontally flipping them.
Reads the QA report and flips any sprite flagged as facing RIGHT.
"""

import os
import json
from PIL import Image

SPRITES_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
REPORT_PATH = os.path.join(os.path.dirname(__file__), 'sprite-facing-report.json')

def fix_sprites():
    with open(REPORT_PATH) as f:
        report = json.load(f)
    
    fixed = []
    for issue in report['issues']:
        if not issue.startswith('WRONG FACING:'):
            continue
        # Parse "WRONG FACING: blaze/block.png faces RIGHT (COM=0.5253)"
        parts = issue.split(' ')
        sprite_path = parts[2]  # "blaze/block.png"
        fighter, filename = sprite_path.split('/')
        
        full_path = os.path.join(SPRITES_DIR, fighter, filename)
        if not os.path.exists(full_path):
            print(f"  ⚠️  NOT FOUND: {full_path}")
            continue
        
        img = Image.open(full_path)
        flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
        flipped.save(full_path)
        fixed.append(sprite_path)
        print(f"  🔄 Flipped: {sprite_path}")
    
    print(f"\n  Fixed {len(fixed)} sprites.")
    return fixed

if __name__ == '__main__':
    print("Fixing wrong-facing sprites...")
    fix_sprites()
