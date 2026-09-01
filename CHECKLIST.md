# Faraday — submission handoff

Deadline: **Sep 3, 2026 @ 1:00pm PDT** · https://webmcp.devpost.com

## Ready

- [x] Live: https://thegreataxios.github.io/faraday/
- [x] Repo (MIT): https://github.com/TheGreatAxios/faraday
- [x] Tools + journeys + HITL export (live smoke-tested)
- [x] Local upload + multi-file replace (live `e2e-multifile` — epoch bump, lesion-scale finds)
- [x] Bundled sample + README / WEBMCP / SUBMISSION
- [x] Narrated demo: `demo/faraday-demo.mp4` (~30s)
- [x] Streamable on Pages: https://thegreataxios.github.io/faraday/faraday-demo.mp4
- [x] Release: https://github.com/TheGreatAxios/faraday/releases/tag/demo-v1

## Remaining (Codex / you)

1. Upload `demo/faraday-demo.mp4` to YouTube as **Public** (title/description in `SUBMISSION.md`) — only blocker for Devpost submit
2. Enter the Devpost submission (Devpost Hackathons plugin in Codex is fine) with live URL, repo, YouTube link, and paste pack from `SUBMISSION.md`
3. Optional helper: `./scripts/open-submit.sh`

## Live judge prompt

```
Open a NIfTI (or Load demo). Call describe_study, then find_regions with the
suggested bright window. Focus region 1, set_view to render, then export_findings.
Opening another file replaces the study — re-run describe_study after switch.
```