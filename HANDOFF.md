# Codex handoff — Faraday WebMCP Challenge

Deadline: Sep 3, 2026 1:00pm PDT · https://webmcp.devpost.com

Use the Devpost Hackathons plugin in Codex for register/submit. Paste pack is `SUBMISSION.md`.

## Verified ready

| Item | Evidence |
|------|----------|
| Live app | https://thegreataxios.github.io/faraday/ |
| Repo (MIT, public) | https://github.com/TheGreatAxios/faraday |
| Vendored deps (no private `file:../`) | `vendor/webmcp-*` |
| Tools | `describe_study`, `find_regions`, `focus_region`, `set_view`, `export_findings` (HITL) |
| Multi-file / agents | Load epoch + exclusive tool queue; live `e2e-multifile` on Pages |
| Journeys | `review`, `report` |
| Demo sample | bundled UPENN-GBM T1-Gd |
| Narrated demo MP4 (~30s) | `demo/faraday-demo.mp4` · [Pages stream](https://thegreataxios.github.io/faraday/faraday-demo.mp4) · [release](https://github.com/TheGreatAxios/faraday/releases/tag/demo-v1) |

## Devpost gallery images

`demo/gallery/` — empty, loaded MPR, regions overlay, 3D, HITL approve.

## You must finish

1. Upload `demo/faraday-demo.mp4` to YouTube as **Public**
2. Put the YouTube URL into the Devpost form (and into `SUBMISSION.md` Demo video field)
3. Submit with live URL + repo + description from `SUBMISSION.md`

## Judge prompt

```
Load the demo study if needed. Call describe_study, then find_regions with the
suggested bright window. Focus region 1, set_view to render, then export_findings.
```
