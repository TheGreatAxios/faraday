#!/usr/bin/env bash
# Open everything Sawyer needs to finish the Devpost submission.
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
pbcopy < "$ROOT/SUBMISSION.md" 2>/dev/null || true
echo "Finder → demo/faraday-demo.mp4"
echo "YouTube Studio upload opened"
echo "Devpost opened"
echo "SUBMISSION.md copied to clipboard (if pbcopy available)"
echo ""
echo "After YouTube is Public, paste the URL back in chat to close the goal."
