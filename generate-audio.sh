#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "ELEVENLABS_API_KEY is not set. Export it and re-run." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT_DIR/assets/music" "$ROOT_DIR/assets/sfx" "$ROOT_DIR/assets/voices"

# Output format (safe default)
OF="mp3_44100_128"

# Known public voice IDs (change if you have preferred voices)
VOICE_BLAZE="${VOICE_BLAZE:-pNInz6obpgDQGcFmaJgB}"      # Adam (aggressive)
VOICE_GRANITE="${VOICE_GRANITE:-VR6AewLTigWG4xSOukaG}"  # Arnold (deep)
VOICE_SHADE="${VOICE_SHADE:-EXAVITQu4vr4xnSDxMaL}"      # Bella (whispery-ish)
VOICE_VOLT="${VOICE_VOLT:-21m00Tcm4TlvDq8ikWAM}"        # Rachel (energetic)

curl_json(){
  local url="$1"; shift
  local data="$1"; shift
  local out="$1"; shift
  echo "→ $out" >&2
  curl -sS -f -L "$url" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -o "$out" \
    -d "$data"
}

# --- MUSIC (Eleven Music API) ---
# POST https://api.elevenlabs.io/v1/music?output_format=...
# Body: { prompt, music_length_ms, model_id:"music_v1", force_instrumental:true }

gen_music(){
  local fname="$1"; shift
  local ms="$1"; shift
  local prompt="$1"; shift
  curl_json "https://api.elevenlabs.io/v1/music?output_format=$OF" \
    "{\"prompt\":$(printf %q "$prompt" | sed 's/^\x27/"/;s/\x27$/"/'),\"music_length_ms\":$ms,\"model_id\":\"music_v1\",\"force_instrumental\":true}" \
    "$ROOT_DIR/assets/music/$fname"
}

# NOTE: We avoid shell-escaping issues by building JSON with printf below.
json_str(){
  node - <<'NODE'
const fs = require('fs');
const [prompt, ms] = process.argv.slice(1);
process.stdout.write(JSON.stringify({prompt, music_length_ms: Number(ms), model_id:'music_v1', force_instrumental:true}));
NODE
}

gen_music2(){
  local fname="$1"; shift
  local ms="$1"; shift
  local prompt="$1"; shift
  local body
  body=$(node -e "console.log(JSON.stringify({prompt:process.argv[1],music_length_ms:Number(process.argv[2]),model_id:'music_v1',force_instrumental:true}))" "$prompt" "$ms")
  curl_json "https://api.elevenlabs.io/v1/music?output_format=$OF" "$body" "$ROOT_DIR/assets/music/$fname"
}

echo "Generating music…" >&2

gen_music2 "menu.mp3" 60000 "Dark cinematic electronic music. Ominous synth pads, slow heavy beat, martial arts movie tension. Deep bass. 85 BPM. Mysterious and powerful."

gen_music2 "select.mp3" 45000 "Upbeat dark electronic music. Pulsing bass, crisp hi-hats, building anticipation. Video game character select screen energy. 100 BPM."

gen_music2 "blaze.mp3" 60000 "Aggressive electronic fight music. Distorted synth leads, fast tempo, fire energy. Intense dubstep-influenced drops. 140 BPM."

gen_music2 "granite.mp3" 60000 "Heavy slow electronic fight music. Massive sub-bass, tribal war drums, grinding industrial textures. Powerful and relentless. 90 BPM."

gen_music2 "volt.mp3" 60000 "Glitchy electronic fight music. Stuttering beats, arpeggiated synths, crackling electricity sounds. Energetic and unpredictable. 128 BPM."

gen_music2 "shade.mp3" 60000 "Dark minimal electronic fight music. Sparse reversed sounds, deep sub-bass, eerie pads, whispering textures. Unsettling and hypnotic. 100 BPM."

gen_music2 "laststand.mp3" 30000 "Intense urgent electronic music. Racing tempo, alarm-like synths, pounding drums, rising pitch. Dramatic comeback energy. 160 BPM."

gen_music2 "victory.mp3" 5000 "Short triumphant electronic victory fanfare. Bold brass synths, quick drum fill, satisfying resolution. Powerful and brief."

gen_music2 "defeat.mp3" 3000 "Short dramatic defeat sound. Low descending synth, heavy reverb, somber impact. Brief and final."

# --- SFX (Text-to-SFX) ---
# POST https://api.elevenlabs.io/v1/sound-generation?output_format=...
# Body (current ElevenLabs): { text, duration_seconds }

gen_sfx(){
  local fname="$1"; shift
  local dur="$1"; shift
  local prompt="$1"; shift
  local body
  body=$(node -e "console.log(JSON.stringify({text:process.argv[1],duration_seconds:Number(process.argv[2])}))" "$prompt" "$dur")
  curl_json "https://api.elevenlabs.io/v1/sound-generation?output_format=$OF" "$body" "$ROOT_DIR/assets/sfx/$fname"
}

echo "Generating SFX…" >&2

gen_sfx "light_hit.mp3" 0.5 "Quick sharp punch impact sound, martial arts, digital game"

gen_sfx "heavy_hit.mp3" 0.7 "Powerful heavy slam impact, deep bass thud, fighting game"

gen_sfx "block.mp3" 0.5 "Metallic shield block sound, defensive clang, fighting game"

gen_sfx "grab.mp3" 0.6 "Quick wrestling grab sound, cloth and body grapple"

gen_sfx "dodge.mp3" 0.5 "Fast dodge whoosh, quick air movement, martial arts evasion"

gen_sfx "perfect_dodge.mp3" 0.8 "Satisfying time-slow whoosh, matrix bullet-time sound, brief"

gen_sfx "special_charge.mp3" 1.5 "Rising energy charge sound, building power, electric hum crescendo"

gen_sfx "fire_special.mp3" 0.8 "Fireball whoosh explosion, flame burst, fighting game fire attack"

gen_sfx "rock_special.mp3" 0.8 "Heavy stone impact, earthquake rumble, rock smash fighting game"

gen_sfx "lightning_special.mp3" 0.8 "Electric lightning strike, crackling thunder zap, fighting game"

gen_sfx "shadow_special.mp3" 0.8 "Dark shadow whoosh, eerie void sound, ghostly teleport"

gen_sfx "signature_move.mp3" 1.5 "Massive ultimate attack impact, screen-shaking bass drop, epic fighting game finisher"

gen_sfx "round_start.mp3" 0.5 "Fight bell ding, boxing ring bell, round start"

gen_sfx "ko_impact.mp3" 1.0 "Knockout final blow, dramatic slow-motion impact, deep reverb"

gen_sfx "menu_select.mp3" 0.5 "Clean UI click, digital menu selection, satisfying pop"

gen_sfx "menu_nav.mp3" 0.5 "Soft UI hover whoosh, subtle digital scroll sound"

gen_sfx "xp_gain.mp3" 0.8 "Satisfying reward chime, points counting up, video game XP sound"

gen_sfx "level_up.mp3" 1.5 "Triumphant level up fanfare, bright ascending chime, achievement unlocked"

gen_sfx "achievement.mp3" 1.0 "Achievement unlocked sound, grand reveal chime, golden sparkle"

# --- VOICE (TTS) ---
# POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=...
# Body: { text, model_id, voice_settings }

gen_tts(){
  local voice_id="$1"; shift
  local fname="$1"; shift
  local text="$1"; shift
  local body
  body=$(node -e "console.log(JSON.stringify({text:process.argv[1],model_id:'eleven_flash_v2_5',voice_settings:{stability:0.45,similarity_boost:0.8,style:0.35,use_speaker_boost:true}}))" "$text")
  curl_json "https://api.elevenlabs.io/v1/text-to-speech/$voice_id?output_format=$OF" "$body" "$ROOT_DIR/assets/voices/$fname"
}

echo "Generating voice lines…" >&2

# Blaze

gen_tts "$VOICE_BLAZE" "blaze_start.mp3" "Let's turn up the heat!"

gen_tts "$VOICE_BLAZE" "blaze_special.mp3" "FIREBALL!"

gen_tts "$VOICE_BLAZE" "blaze_sig.mp3" "INFERNO!"

gen_tts "$VOICE_BLAZE" "blaze_win.mp3" "Too hot to handle."

gen_tts "$VOICE_BLAZE" "blaze_lose.mp3" "Ugh!"

# Granite

gen_tts "$VOICE_GRANITE" "granite_start.mp3" "Stand firm."

gen_tts "$VOICE_GRANITE" "granite_special.mp3" "SHIELD!"

gen_tts "$VOICE_GRANITE" "granite_sig.mp3" "AVALANCHE!"

gen_tts "$VOICE_GRANITE" "granite_win.mp3" "Immovable."

gen_tts "$VOICE_GRANITE" "granite_lose.mp3" "Grr!"

# Shade

gen_tts "$VOICE_SHADE" "shade_start.mp3" "You can't fight what you can't see."

gen_ts "$VOICE_SHADE" "shade_special.mp3" "VANISH!" || true
# typo-safe: run the correct one

gen_tts "$VOICE_SHADE" "shade_special.mp3" "VANISH!"

gen_tts "$VOICE_SHADE" "shade_sig.mp3" "ECLIPSE!"

gen_tts "$VOICE_SHADE" "shade_win.mp3" "Nothing remains."

gen_tts "$VOICE_SHADE" "shade_lose.mp3" "Hah."

# Volt

gen_tts "$VOICE_VOLT" "volt_start.mp3" "Let's go, let's go!"

gen_tts "$VOICE_VOLT" "volt_special.mp3" "BOLT!"

gen_tts "$VOICE_VOLT" "volt_sig.mp3" "STORM SURGE!"

gen_tts "$VOICE_VOLT" "volt_win.mp3" "Shocked?"

gen_tts "$VOICE_VOLT" "volt_lose.mp3" "Ah!"

echo "Done." >&2
