#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set" >&2
  exit 1
fi

BASE_PREFIX='2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024'

base_dir="/home/troels/.openclaw/workspace-researcher/raybans-fighter/assets/sprites"
mkdir -p "$base_dir"/{blaze,granite,shade,volt}

gen_png(){
  local prompt="$1"
  local size="$2"
  local out="$3"

  echo "[gen] $out"
  mkdir -p "$(dirname "$out")"

  local payload
  payload="$(python3 - <<PY
import json
print(json.dumps({
  'model':'gpt-image-1',
  'prompt': '''$prompt''',
  'n': 1,
  'size': '$size',
  'background': 'transparent' if '$size'=='1024x1024' else 'opaque',
  'output_format':'png'
}))
PY
)"

  # Retry a few times on transient network errors.
  local tmp
  tmp="$(mktemp)"
  for attempt in 1 2 3; do
    if curl -sS --fail-with-body -X POST "https://api.openai.com/v1/images/generations" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$payload" >"$tmp"; then
      break
    fi
    echo "curl failed (attempt $attempt)" >&2
    cat "$tmp" >&2 || true
    sleep $((attempt*2))
  done

  python3 - <<PY
import json, base64, pathlib
p = pathlib.Path(r'''$tmp''')
raw = p.read_text('utf-8', errors='replace')
try:
  d = json.loads(raw)
except Exception as e:
  raise SystemExit(f"Bad JSON from API: {e}\n--- body ---\n{raw[:1000]}")
if 'data' not in d or not d['data']:
  raise SystemExit(f"No image data in response: {raw[:1000]}")
out = pathlib.Path(r'''$out''')
out.write_bytes(base64.b64decode(d['data'][0]['b64_json']))
print(f"wrote {out} ({out.stat().st_size} bytes)")
PY

  rm -f "$tmp"
}

# --- Fighters ---
# Blaze
b="$base_dir/blaze"
gen_png "$BASE_PREFIX, fire warrior in relaxed fighting stance, fists raised, flames flickering from hands and hair, weight on back foot, ready to strike" 1024x1024 "$b/idle.png"
gen_png "$BASE_PREFIX, fire warrior throwing a fast straight punch, arm extended, small flame burst at fist, body leaning forward" 1024x1024 "$b/light.png"
gen_png "$BASE_PREFIX, fire warrior doing powerful overhead fire slam, both fists raised above head bringing down with huge flame trail, dramatic" 1024x1024 "$b/heavy.png"
gen_png "$BASE_PREFIX, fire warrior in defensive guard stance, arms crossed in front of face, flame shield aura around forearms" 1024x1024 "$b/block.png"
gen_png "$BASE_PREFIX, fire warrior mid-air jumping, knees tucked, flame trail below feet, looking down at opponent" 1024x1024 "$b/jump.png"
gen_png "$BASE_PREFIX, fire warrior in low crouching stance, one knee down, preparing low sweep, flames along ground" 1024x1024 "$b/crouch.png"
gen_png "$BASE_PREFIX, fire warrior recoiling from being hit, body leaning backward, face grimacing in pain, sparks flying" 1024x1024 "$b/hitstun.png"
gen_png "$BASE_PREFIX, fire warrior falling backward defeated, eyes closed, flames extinguished, dramatic fall" 1024x1024 "$b/ko.png"
gen_png "$BASE_PREFIX, fire warrior launching a massive fireball from both hands, huge orange flame projectile, power stance, intense energy" 1024x1024 "$b/special.png"
gen_png "$BASE_PREFIX, fire warrior victorious pose, arms crossed confidently, flames roaring around body, smirking" 1024x1024 "$b/victory.png"

# Granite
g="$base_dir/granite"
gen_png "$BASE_PREFIX, massive stone armored warrior in heavy fighting stance, thick arms at sides, rocky fists clenched, immovable look" 1024x1024 "$g/idle.png"
gen_png "$BASE_PREFIX, stone warrior throwing a wide backhand strike, stone fist extended, rock fragments flying from impact" 1024x1024 "$g/light.png"
gen_png "$BASE_PREFIX, stone warrior doing devastating ground stomp, one foot raised high then slamming down, earthquake cracks radiating" 1024x1024 "$g/heavy.png"
gen_png "$BASE_PREFIX, stone warrior with massive rock shield raised, stone armor glowing with absorption energy, tanking a hit" 1024x1024 "$g/block.png"
gen_png "$BASE_PREFIX, stone warrior mid-air, huge body airborne, arms spread for body splash, surprisingly aerial for size" 1024x1024 "$g/jump.png"
gen_png "$BASE_PREFIX, stone warrior in crouching position, one fist planted on ground, rising uppercut stance, rocks floating around fist" 1024x1024 "$g/crouch.png"
gen_png "$BASE_PREFIX, stone warrior staggering from a hit, cracks forming in stone armor, grimacing but barely moved" 1024x1024 "$g/hitstun.png"
gen_png "$BASE_PREFIX, stone warrior crumbling and falling, stone armor breaking apart, dramatic collapse" 1024x1024 "$g/ko.png"
gen_png "$BASE_PREFIX, stone warrior activating rock shield power-up, glowing stone aura surrounding entire body, invincible stance" 1024x1024 "$g/special.png"
gen_png "$BASE_PREFIX, stone warrior standing victorious, arms folded, massive and immovable, rocks orbiting slowly" 1024x1024 "$g/victory.png"

# Shade
s="$base_dir/shade"
gen_png "$BASE_PREFIX, shadow assassin in sleek fighting stance, dark purple cloak with shadow tendrils, one hand extended with void energy" 1024x1024 "$s/idle.png"
gen_png "$BASE_PREFIX, shadow assassin doing quick shadow swipe attack, arm extended with dark energy slash trail, fast and elegant" 1024x1024 "$s/light.png"
gen_png "$BASE_PREFIX, shadow assassin teleport-striking, phasing forward through void portal, devastating palm strike with shadow explosion" 1024x1024 "$s/heavy.png"
gen_png "$BASE_PREFIX, shadow assassin wrapped in shadow barrier, tendrils forming protective cocoon, ethereal defense" 1024x1024 "$s/block.png"
gen_png "$BASE_PREFIX, shadow assassin floating mid-air, cloak billowing, shadow energy beneath, ghost-like movement" 1024x1024 "$s/jump.png"
gen_png "$BASE_PREFIX, shadow assassin in low stance, shadow tendrils extending along ground, reaching toward opponent" 1024x1024 "$s/crouch.png"
gen_png "$BASE_PREFIX, shadow assassin hit and dispersing into shadow particles, form flickering between solid and shadow" 1024x1024 "$s/hitstun.png"
gen_png "$BASE_PREFIX, shadow assassin dissolving into darkness, fading away dramatically, shadow wisps dissipating" 1024x1024 "$s/ko.png"
gen_png "$BASE_PREFIX, shadow assassin teleporting, body splitting into shadow fragments, appearing behind where opponent would be, void energy swirling" 1024x1024 "$s/special.png"
gen_png "$BASE_PREFIX, shadow assassin standing in shadow mist, glowing purple eyes, tendrils writhing, menacing and victorious" 1024x1024 "$s/victory.png"

# Volt
v="$base_dir/volt"
gen_png "$BASE_PREFIX, electric warrior in dynamic fighting stance, lightning crackling across arms and body, electric blue energy, alert and ready" 1024x1024 "$v/idle.png"
gen_png "$BASE_PREFIX, electric warrior doing fast electric snap punch, lightning arc from fist to opponent direction, quick strike" 1024x1024 "$v/light.png"
gen_png "$BASE_PREFIX, electric warrior doing overhead thunder strike, arm raised high with massive lightning bolt coming down, dramatic arc" 1024x1024 "$v/heavy.png"
gen_png "$BASE_PREFIX, electric warrior in electric barrier stance, lightning field surrounding body, defensive but charged" 1024x1024 "$v/block.png"
gen_png "$BASE_PREFIX, electric warrior leaping upward with lightning trail, electric energy below feet, dynamic aerial pose" 1024x1024 "$v/jump.png"
gen_png "$BASE_PREFIX, electric warrior in low sliding stance, electric spark trail behind, momentum and speed" 1024x1024 "$v/crouch.png"
gen_png "$BASE_PREFIX, electric warrior jolted backward, own electricity short-circuiting briefly, sparks flying chaotically" 1024x1024 "$v/hitstun.png"
gen_png "$BASE_PREFIX, electric warrior collapsing, electricity fading and flickering out, dramatic power-down" 1024x1024 "$v/ko.png"
gen_png "$BASE_PREFIX, electric warrior firing lightning bolt projectile, intense concentrated beam of electricity from palm, blue-white energy" 1024x1024 "$v/special.png"
gen_png "$BASE_PREFIX, electric warrior standing victorious, lightning storm around body, electricity arcing everywhere, powerful pose" 1024x1024 "$v/victory.png"

# --- Shared backgrounds ---
gen_png "Dark futuristic fighting arena background, neon holographic grid floor, dark sky with distant city lights, cyberpunk tournament arena, atmospheric, moody lighting, 2D side-scrolling fighting game background, wide format" 1536x1024 "$base_dir/arena_bg.png"
gen_png "Dark fighting game title screen background, neon lights, dramatic atmosphere, cyberpunk tournament arena, smoke and sparks, cinematic, 2D" 1536x1024 "$base_dir/title_bg.png"

echo "done"