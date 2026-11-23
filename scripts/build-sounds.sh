#!/usr/bin/env bash
# Builds the crash sounds in public/sounds from CC0 recordings on OpenGameArt,
# layered and pitched down so household knocks sound like a car:
#
#   crash.mp3      a sub-bass thump, a heavy thud, two metal crunches and a rattle
#   glass.mp3      a window breaking
#   explosion.mp3  a sub-bass boom, an explosion, then debris landing
#
# and the driving sounds, from real recordings:
#
#   squeal.wav      tires screeching, a seamless loop (WAV, since MP3 pads
#                   its ends with silence that would click at the seam)
#   door-open.mp3   a car door's latch and swing
#   door-close.mp3  the same door shutting
#
# and the pistol's:
#
#   gunshot.mp3     a .357 Magnum pistol shot
#
#   scripts/build-sounds.sh
#
# Sources, all CC0 (public domain):
#   https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (rubberduck)
#   https://opengameart.org/content/100-cc0-sfx (rubberduck)
#   https://opengameart.org/content/glass-break
#   https://opengameart.org/content/chunky-explosion
#   https://bigsoundbank.com/screeching-tires-1-s2368.html (Dorian Clair)
#   https://bigsoundbank.com/car-door-4-s1526.html (Joseph Sardin)
#   https://bigsoundbank.com/shot-in-357-magnum-9-mm-s0438.html
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/public/sounds"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
files=https://opengameart.org/sites/default/files
curl -sSfL -o breaking.zip "$files/sfx_breaking_and_falling.zip"
curl -sSfL -o cc100.zip "$files/100-CC0-SFX_0.zip"
curl -sSfL -o glass.wav "$files/glass_breaking.wav"
curl -sSfL -o explosion.mp3 "$files/Chunky%20Explosion.mp3"
curl -sSfL -o tires.mp3 https://bigsoundbank.com/UPLOAD/mp3/2368.mp3
curl -sSfL -o door.mp3 https://bigsoundbank.com/UPLOAD/mp3/1526.mp3
curl -sSfL -o 0438.mp3 https://bigsoundbank.com/UPLOAD/mp3/0438.mp3
unzip -q breaking.zip -d breaking
unzip -q cc100.zip -d cc100
mkdir -p "$out"

# Each layer is made mono, slowed to `rate` of its pitch, delayed `ms`, and scaled.
layer() { echo "[$1]aformat=channel_layouts=mono,aresample=44100,asetrate=44100*$2,aresample=44100,adelay=$3,volume=$4[l$1]"; }
render() { ffmpeg -v error -y "$@" -ac 1 -codec:a libmp3lame -q:a 4; }

render \
  -f lavfi -i "aevalsrc=0.9*sin(2*PI*(70-40*t)*t)*exp(-9*t):s=44100:d=0.6" \
  -i breaking/bfh1_hit_02.ogg -i cc100/metal_07.ogg -i cc100/metal_10.ogg -i breaking/bfh1_metal_falling_02.ogg \
  -filter_complex "$(layer 1 0.75 0 1.2);$(layer 2 0.8 10 0.9);$(layer 3 0.7 40 0.8);$(layer 4 0.85 90 0.5);[0][l1][l2][l3][l4]amix=inputs=5:normalize=0,alimiter=limit=0.9" \
  "$out/crash.mp3"

render -i glass.wav -filter_complex "[0]aformat=channel_layouts=mono,alimiter=limit=0.9" "$out/glass.mp3"

render \
  -f lavfi -i "aevalsrc=1.0*sin(2*PI*(55-25*t)*t)*exp(-2.2*t):s=44100:d=2.5" \
  -i explosion.mp3 -i breaking/bfh1_metal_falling_01.ogg -i breaking/bfh1_metal_falling_02.ogg -i cc100/metal_10.ogg \
  -filter_complex "$(layer 1 0.9 0 1.1);$(layer 2 0.85 900 0.45);$(layer 3 0.8 1500 0.35);$(layer 4 0.7 2100 0.4);[0][l1][l2][l3][l4]amix=inputs=5:normalize=0,alimiter=limit=0.9" \
  "$out/explosion.mp3"

# The squeal's steady middle, 0.45 to 1.95 s, whose last 0.25 s fades into the
# 0.2 to 0.45 s just before it, so its end runs on into its start.
ffmpeg -v error -y -i tires.mp3 -filter_complex \
  "[0]aformat=channel_layouts=mono,aresample=44100,asplit[a][b];[a]atrim=0.45:1.95,asetpts=PTS-STARTPTS,afade=t=out:st=1.25:d=0.25[body];[b]atrim=0.2:0.45,asetpts=PTS-STARTPTS,afade=t=in:d=0.25,adelay=1250[head];[body][head]amix=inputs=2:normalize=0:duration=first,volume=-3dB" \
  -codec:a pcm_s16le "$out/squeal.wav"

render -i door.mp3 -af "atrim=0:1.3,afade=t=out:st=1.1:d=0.2,volume=13dB" "$out/door-open.mp3"
render -i door.mp3 -af "atrim=3.05:3.85,asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=0.6:d=0.2,volume=-1dB" "$out/door-close.mp3"

render -i 0438.mp3 -af "atrim=0:1.4,asetpts=PTS-STARTPTS,afade=t=out:st=1:d=0.4" "$out/gunshot.mp3"

ls -l "$out"
