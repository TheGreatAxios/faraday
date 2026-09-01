# Demo script (<3 minutes)

Record in ChatGPT’s in-app browser or Chrome with WebMCP enabled. Speak clearly; show the Faraday UI and the agent chat side by side if possible.

## Beat sheet

**0:00–0:20 — Hook**
> “This is Faraday. Every MRI suite is a Faraday cage — RF doesn’t leave the room. Same idea for data: the scan stays in the tab. The agent only gets measurements.”

Empty stage → **Load demo CT/MR** → volume appears.

**0:20–1:10 — Reach**
> “Without WebMCP an agent sees a blank canvas. With WebMCP it gets real tools.”

```
Call describe_study. Then find_regions using the suggested bright window. Focus region 1 and set_view to render.
```

Overlay paints, crosshair moves, 3D view. Tool results are mL / mm / intensities — not voxels.

**1:10–1:50 — Privacy + HITL**
> “The only tool that moves data off the page is export_findings — and it needs my approval.”

`export_findings` → confirm → Approve → JSON measurements only.

**1:50–2:30 — Why it matters**
> “Agents can’t do medical imaging today because PHI can’t be uploaded. WebMCP turns the tab into a privacy airlock: GPU compute in, scalars out.”

**2:30–2:50 — Close**
> “Faraday — agent-native reading room. Open source. Not for diagnosis. Built for the WebMCP Challenge.”

## Automated capture

```bash
bun run record-demo
# say -v Samantha -f demo/narration.txt -o demo/narration.aiff
# ffmpeg -y -i demo/faraday-demo.webm -i demo/narration.aiff \
#   -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest demo/faraday-demo.mp4
```

Narrated file: `demo/faraday-demo.mp4` (~30s). Also on the [demo-v1 release](https://github.com/TheGreatAxios/faraday/releases/tag/demo-v1). Upload to YouTube as **Public** for Devpost.

## Before upload

- [ ] Hard refresh the live app once
- [ ] Under 3:00
- [ ] YouTube: Public
- [ ] No copyrighted music
