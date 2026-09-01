# Devpost submission draft

Copy-paste into https://webmcp.devpost.com — deadline **Sep 3, 2026 @ 1:00pm PDT**.

## Project title

Faraday — agent-native volumetric reading room

## Tagline

The scan stays in the cage.

## Elevator (built with)

WebMCP · NiiVue (WebGPU/WebGL2) · React · Vite · Bun

## Why this is a strong fit for WebMCP

Medical volumes live as GPU textures. DOM automation sees an empty canvas. Server-side MCP cannot reach PHI that must never leave the hospital network. Faraday exposes structured tools on the page so ChatGPT/Codex can measure anatomy **without ever receiving voxels**. Journeys scope tools by phase (`review` / `report`); `export_findings` is human-gated.

## Better UX: what people and agents do together

- **Human:** loads a study (one-click demo), switches Axial/Coronal/Sagittal/MPR/3D, watches overlays update live, approves export
- **Agent:** `describe_study` → on-device WebGPU histogram → `find_regions` → `focus_region` → `set_view` → `export_findings`
- **Impossible before:** reliable agent actuation on a canvas-only medical viewer without uploading the scan

## How we implemented WebMCP

`document.modelContext.registerTool` via vendored `@thegreataxios/webmcp-react` (`WebMCPTool`, `ExperimentalWebMCPJourney`, `ExperimentalWebMCPGuardedTool`). Polyfill installs when native WebMCP is absent. Intensity histogram uses WebGPU compute with CPU fallback. Region labels paint into NiiVue’s drawing overlay.

## Submission links

| Field | Value |
|-------|-------|
| Live URL | https://thegreataxios.github.io/faraday/ |
| Repo | https://github.com/TheGreatAxios/faraday |
| Demo video | **TODO: upload `demo/faraday-demo.mp4` to YouTube (public)** |

Local demo (~40s, narrated): `demo/faraday-demo.mp4`  
Release mirror: https://github.com/TheGreatAxios/faraday/releases/tag/demo-v1  
Re-record: `bun run scripts/record-demo.ts` then remux with `demo/narration.aiff`.

## Suggested YouTube title / description

**Title:** Faraday — WebMCP agent-native medical imaging (WebMCP Challenge)

**Description:**
```
Faraday is a WebMCP-powered reading room: AI agents measure CT/MRI volumes
without voxels ever leaving the browser tab.

Live: https://thegreataxios.github.io/faraday/
Code: https://github.com/TheGreatAxios/faraday

Research/education only — not a medical device.
Built for the OpenAI WebMCP Challenge.
```

## Prior work note

Faraday is new for this challenge. Vendored WebMCP packages come from the independent `@thegreataxios/webmcp` community implementation; Faraday-specific work (viewer, tools, GPU histogram, overlay, sample, deploy, demo) is the submission surface.
