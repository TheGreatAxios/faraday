#!/usr/bin/env bash
# Open the surfaces needed to finish Devpost (YouTube + form).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo/faraday-demo.mp4"

if [[ ! -f "$DEMO" ]]; then
  echo "Missing $DEMO — run: bun run record-demo && remux with narration"
  exit 1
fi

open "$ROOT/demo"
open "https://studio.youtube.com/channel/upload"
open "https://webmcp.devpost.com/"
open "https://thegreataxios.github.io/faraday/"

# Clipboard: YouTube description block (title is one line above it in SUBMISSION.md)
{
  echo "Faraday — WebMCP agent-native medical imaging (WebMCP Challenge)"
  echo ""
  cat <<'EOF'
Faraday is a WebMCP-powered reading room: AI agents measure CT/MRI volumes
without voxels ever leaving the browser tab.

Live: https://thegreataxios.github.io/faraday/
Code: https://github.com/TheGreatAxios/faraday

Research/education only — not a medical device.
Built for the OpenAI WebMCP Challenge.
EOF
} | pbcopy 2>/dev/null || true

echo "Finder → demo/faraday-demo.mp4"
echo "YouTube Studio + Devpost + live app opened"
echo "YouTube title + description copied to clipboard"
echo "Paste pack for Devpost fields: $ROOT/SUBMISSION.md"
echo "Codex handoff: $ROOT/HANDOFF.md"
