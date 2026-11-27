#!/bin/bash
# Converte os vídeos .webm gravados por tests/e2e/record-demos.cjs em .mp4 (H.264), leves e compatíveis.
# Uso: scripts/videos-to-mp4.sh [pasta]   (padrão: ./demo-videos)
set -e
DIR="${1:-demo-videos}"
for f in "$DIR"/*.webm; do
  [ -e "$f" ] || { echo "nenhum .webm em $DIR"; exit 1; }
  out="${f%.webm}.mp4"
  ffmpeg -y -loglevel error -i "$f" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -r 25 -movflags +faststart -an "$out"
  printf "%s  %s  %s\n" "$(basename "$out")" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | awk '{printf "%dm%02ds", $1/60, $1%60}')" "$(du -h "$out" | cut -f1)"
done
