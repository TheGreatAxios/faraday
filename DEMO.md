# Demo script (<3 minutes)

Record in ChatGPT’s in-app browser or Chrome with WebMCP enabled. Speak clearly; show the Faraday UI and the agent chat side by side if possible.

## Beat sheet

**0:00–0:20 — Hook**
> “This is Faraday. Every MRI suite is a Faraday cage — RF doesn’t leave the room. Same idea for data: the scan stays in the tab. The agent only gets measurements.”

Show empty canvas → click **Load demo CT/MR** → volume appears. Point at WebGPU + WebMCP badges.

**0:20–1:10 — Reach**
> “Without WebMCP an agent sees a blank canvas. With WebMCP it gets real tools.”

Agent prompt:
```
Call describe_study. Then find_regions using the suggested bright window. Focus region 1 and set_view to render.
```

Watch: overlay paints, crosshair moves, 3D render. Narrate that voxels never appear in the tool result — only mL / mm / intensities.

**1:10–1:50 — Privacy + HITL**
> “The only tool that moves data off the page is export_findings — and it needs my approval.”

Agent: `export_findings` with a short note. Show confirm dialog → Approve → show JSON with measurements only.

**1:50–2:30 — Why it matters**
> “Agents can’t do medical imaging today because PHI can’t be uploaded. WebMCP turns the tab into a privacy airlock: GPU compute in, scalars out. Humans and agents finally share the same study.”

**2:30–2:50 — Close**
> “Faraday — agent-native reading room. Open source. Not for diagnosis. Built for the WebMCP Challenge.”

End on the brand + badges.

## Automated silent capture (optional)

```bash
bun run record-demo   # writes demo/faraday-demo.webm against the live URL
# Narration: say -v Samantha -f demo/narration.txt -o demo/narration.aiff
# Mux: ffmpeg -y -i demo/faraday-demo.webm -i demo/narration.aiff \
#   -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=20[v]" \
#   -map "[v]" -map 1:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
#   -movflags +faststart demo/faraday-demo.mp4
```

A narrated MP4 may already exist at `demo/faraday-demo.mp4` (gitignored). Upload it to YouTube as **public**, then paste the link into Devpost.

## Checklist before recording / upload

- [ ] Hard refresh so demo sample is cached
- [ ] WebMCP available (native or polyfill badge live)
- [ ] WebGPU badge preferred (WebGL2 still OK)
- [ ] Mic on if recording live; or use the narrated MP4
- [ ] Under 3:00
- [ ] YouTube visibility: Public
- [ ] No copyrighted music
