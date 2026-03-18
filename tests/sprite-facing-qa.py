#!/usr/bin/env python3
"""
Sprite Facing QA — Verifies all fighter sprites face the same direction.

Approach: For each sprite, compute the horizontal center-of-mass of non-transparent
pixels. If the character's mass is concentrated on the LEFT side of the image,
they're facing LEFT. If concentrated RIGHT, they're facing RIGHT.

Attack sprites (light, heavy, special + windup/followthrough) have their attack
extending in the facing direction, so the mass shifts toward the attack side.

All sprites should face LEFT consistently (game code flips P1 to face right).
"""

import os
import sys
from PIL import Image
import json

SPRITES_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
FIGHTERS = ['blaze', 'granite', 'shade', 'volt']

# Poses that involve directional action (attack extending one way)
ATTACK_POSES = ['light', 'light_windup', 'light_followthrough',
                'heavy', 'heavy_windup', 'heavy_followthrough', 
                'special', 'special_windup', 'special_followthrough']

def analyze_sprite(path):
    """
    Returns the horizontal center-of-mass ratio (0.0 = all mass on left, 1.0 = all mass on right).
    Also returns the left-half vs right-half pixel mass for clearer comparison.
    """
    try:
        img = Image.open(path).convert('RGBA')
    except Exception as e:
        return None, str(e)
    
    w, h = img.size
    pixels = img.load()
    
    total_mass = 0
    weighted_x = 0
    left_mass = 0
    right_mass = 0
    mid = w / 2
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 30:  # skip transparent/near-transparent
                continue
            # Use alpha as mass weight
            mass = a / 255.0
            total_mass += mass
            weighted_x += x * mass
            if x < mid:
                left_mass += mass
            else:
                right_mass += mass
    
    if total_mass == 0:
        return None, "Empty/fully transparent sprite"
    
    com_ratio = weighted_x / (total_mass * w)  # 0.0 = left edge, 1.0 = right edge
    left_pct = left_mass / total_mass
    right_pct = right_mass / total_mass
    
    return {
        'com_ratio': round(com_ratio, 4),
        'left_pct': round(left_pct, 4),
        'right_pct': round(right_pct, 4),
        'facing': 'LEFT' if com_ratio < 0.48 else ('RIGHT' if com_ratio > 0.52 else 'CENTER'),
        'total_mass': round(total_mass),
    }, None


def main():
    results = {}
    issues = []
    all_ok = True
    
    print("=" * 70)
    print("SPRITE FACING QA — All sprites should face LEFT")
    print("=" * 70)
    
    for fighter in FIGHTERS:
        fighter_dir = os.path.join(SPRITES_DIR, fighter)
        if not os.path.isdir(fighter_dir):
            issues.append(f"MISSING: {fighter}/ directory not found")
            continue
        
        sprites = sorted([f for f in os.listdir(fighter_dir) if f.endswith('.png')])
        if not sprites:
            issues.append(f"MISSING: No PNG sprites in {fighter}/")
            continue
        
        print(f"\n{'─' * 50}")
        print(f"  {fighter.upper()}")
        print(f"{'─' * 50}")
        
        fighter_results = {}
        fighter_facings = []
        
        for sprite_name in sprites:
            path = os.path.join(fighter_dir, sprite_name)
            analysis, err = analyze_sprite(path)
            
            if err:
                print(f"  ⚠️  {sprite_name}: ERROR — {err}")
                issues.append(f"ERROR: {fighter}/{sprite_name} — {err}")
                continue
            
            pose = sprite_name.replace('.png', '')
            fighter_results[pose] = analysis
            fighter_facings.append(analysis['facing'])
            
            # Determine if this is correct
            is_attack = pose in ATTACK_POSES
            facing = analysis['facing']
            com = analysis['com_ratio']
            
            if facing == 'LEFT':
                status = "✅"
            elif facing == 'CENTER':
                status = "⚠️ "  # Centered is borderline OK
            else:
                status = "❌"
                all_ok = False
                issues.append(f"WRONG FACING: {fighter}/{sprite_name} faces {facing} (COM={com})")
            
            attack_tag = " [ATTACK]" if is_attack else ""
            print(f"  {status} {sprite_name:<30} facing={facing:<7} COM={com:.4f} L={analysis['left_pct']:.2f} R={analysis['right_pct']:.2f}{attack_tag}")
        
        results[fighter] = fighter_results
        
        # Check consistency within fighter
        unique_facings = set(fighter_facings)
        if len(unique_facings) > 1:
            issues.append(f"INCONSISTENT: {fighter} has mixed facings: {unique_facings}")
    
    # Summary
    print(f"\n{'=' * 70}")
    print("SUMMARY")
    print(f"{'=' * 70}")
    
    total_sprites = sum(len(v) for v in results.values())
    facing_counts = {'LEFT': 0, 'RIGHT': 0, 'CENTER': 0}
    for fighter, poses in results.items():
        for pose, data in poses.items():
            facing_counts[data['facing']] += 1
    
    print(f"  Total sprites analyzed: {total_sprites}")
    print(f"  Facing LEFT:   {facing_counts['LEFT']}")
    print(f"  Facing RIGHT:  {facing_counts['RIGHT']}")
    print(f"  Facing CENTER: {facing_counts['CENTER']}")
    
    if issues:
        print(f"\n  ⚠️  ISSUES FOUND: {len(issues)}")
        for issue in issues:
            print(f"    • {issue}")
    else:
        print(f"\n  ✅ ALL SPRITES FACE LEFT — PASS")
    
    # Write JSON report
    report_path = os.path.join(os.path.dirname(__file__), 'sprite-facing-report.json')
    report = {
        'total_sprites': total_sprites,
        'facing_counts': facing_counts,
        'issues': issues,
        'pass': len(issues) == 0,
        'details': results
    }
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n  Report saved to: {report_path}")
    
    return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())
