# Ray-Bans Fighter

A Mortal Kombat–inspired 1v1 fighting game designed for a 600×600 monocular HUD (Meta Ray-Ban Display) with EMG-style gesture mappings.

## Run locally

Just open `index.html` in a local web server (recommended):

```bash
cd raybans-fighter
npx serve .
```

Then visit the printed URL.

## Controls (keyboard)

- **Left / Right Arrow**: Dash left/right (dodge i-frames at dash start)
- **Up Arrow**: Jump (air attack with Z)
- **Down Arrow (hold)**: Stand block
- **Down Arrow + (tap Crouch via quick swipe on touch)**: Crouch / crouch-block
- **Z**: Light attack (one hit per press)
- **X**: Heavy attack
- **C**: Grab
- **Hold Z (>=0.4s) then release**: Special (costs 30 Momentum)
- **Hold Z (~1.0s) then release while Momentum=100**: Signature (costs all 100 Momentum)

Touch fallback:
- Tap = light
- Two-finger tap = heavy
- Three-finger tap = grab
- Swipe left/right/up/down = dash/jump/crouch
- Long press = special charge (release to cast)

## Audio generation (ElevenLabs)

This project expects audio files at:

- `assets/music/*.mp3`
- `assets/sfx/*.mp3`
- `assets/voices/*.mp3`

Generate them with:

```bash
export ELEVENLABS_API_KEY=... 
./generate-audio.sh
```

You can override voice IDs:

```bash
export VOICE_BLAZE=... VOICE_GRANITE=... VOICE_SHADE=... VOICE_VOLT=...
./generate-audio.sh
```

## Save data

Progression, XP, mastery, highscores, achievements, and daily challenge state are stored in `localStorage` under `raybans_fighter_save_v1`.
