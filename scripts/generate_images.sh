#!/usr/bin/env bash
set -euo pipefail
cd /home/troels/.openclaw/workspace-researcher/raybans-fighter
mkdir -p assets/sprites/shade assets/sprites/volt assets/sprites

# SHADE
curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin in sleek fighting stance, dark purple cloak with shadow tendrils, void energy in hand","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/idle.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin quick shadow swipe attack, dark energy slash trail","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/light.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin teleport-striking through void portal, shadow explosion","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/heavy.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin wrapped in shadow barrier, tendrils forming protective cocoon","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/block.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin floating mid-air, cloak billowing, shadow energy beneath","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/jump.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin in low stance, shadow tendrils extending along ground","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/crouch.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin recoiling, dispersing into shadow particles","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/hitstun.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin dissolving into darkness, fading away","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/ko.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin teleporting, body splitting into shadow fragments, void energy","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/special.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, shadow assassin standing in shadow mist, glowing purple eyes, menacing","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/shade/victory.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

# VOLT
curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior dynamic fighting stance, lightning crackling across arms, electric blue energy","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/idle.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior fast electric snap punch, lightning arc from fist","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/light.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior overhead thunder strike, massive lightning bolt coming down","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/heavy.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior in electric barrier stance, lightning field surrounding body","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/block.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior leaping with lightning trail, electric energy below feet","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/jump.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior low sliding stance, electric spark trail","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/crouch.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior jolted backward, electricity short-circuiting, sparks flying","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/hitstun.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior collapsing, electricity fading and flickering out","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/ko.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior firing lightning bolt projectile from palm, blue-white energy","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/special.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"2D fighting game character sprite, detailed cel-shaded anime style like Guilty Gear or Street Fighter Alpha, bold black outlines, dynamic pose, transparent background, side-view profile facing right, full body visible, 1024x1024, electric warrior victorious, lightning storm around body, powerful pose","n":1,"size":"1024x1024","background":"transparent","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/volt/victory.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

# BACKGROUNDS (1536x1024)
curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"Dark futuristic fighting arena background, neon holographic grid floor, dark sky with distant city lights, cyberpunk tournament arena, atmospheric lighting, 2D side-scrolling fighting game","n":1,"size":"1536x1024","background":"opaque","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/arena_bg.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"Dark fighting game title screen background, neon lights, dramatic atmosphere, cyberpunk arena, smoke and sparks, cinematic, 2D","n":1,"size":"1536x1024","background":"opaque","output_format":"png"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('assets/sprites/title_bg.png','wb').write(base64.b64decode(d['data'][0]['b64_json']))"
