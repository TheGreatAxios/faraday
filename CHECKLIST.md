# Faraday — final submission checklist

Deadline: **Sep 3, 2026 @ 1:00pm PDT** · https://webmcp.devpost.com

## Already done

- [x] Live app: https://thegreataxios.github.io/faraday/
- [x] Public MIT repo: https://github.com/TheGreatAxios/faraday
- [x] WebMCP tools + journeys + HITL export (smoke-tested)
- [x] Demo sample + README / SUBMISSION copy
- [x] Narrated demo file: `demo/faraday-demo.mp4` (~43s)

## You do now (≈5 minutes)

1. **YouTube** — upload `demo/faraday-demo.mp4` as **Public**
   - Or download from the release: https://github.com/TheGreatAxios/faraday/releases/tag/demo-v1
   - Title: `Faraday — WebMCP agent-native medical imaging (WebMCP Challenge)`
   - Description: see `SUBMISSION.md`
   - Helper: `./scripts/open-submit.sh` (opens Finder + YouTube Studio + Devpost)
2. **Devpost** — Enter a Submission at https://webmcp.devpost.com
   - Paste fields from `SUBMISSION.md`
   - Live URL + repo + YouTube link
3. Reply here with the YouTube URL so the goal can be marked complete

## Agent demo prompt (for live judging)

```
Load the demo study if needed. Call describe_study, then find_regions with the
suggested bright window. Focus region 1, set_view to render, then export_findings.
```
