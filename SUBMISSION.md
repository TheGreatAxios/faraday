# Devpost submission draft

## Project title

Faraday — agent-native volumetric reading room

## Tagline

The agent reads the scan. The scan never leaves the tab.

## Elevator (built with)

WebMCP · NiiVue (WebGPU/WebGL2) · React · Vite · Bun

## Why this is a strong fit for WebMCP

Medical volumes live as GPU textures. DOM automation sees an empty canvas. Server-side MCP cannot reach PHI that must never leave the hospital network. Faraday exposes structured tools on the page so ChatGPT/Codex can measure anatomy **without ever receiving voxels**. Journeys scope tools by phase; export is human-gated.

## Better UX: what people and agents do together

- Human: loads a study (or one-click demo), watches overlays, approves export
- Agent: orients via `describe_study`, finds bright regions, focuses, changes view, exports measurements
- Impossible before: reliable agent actuation on a canvas-only medical viewer without uploading the scan

## How we implemented WebMCP

`document.modelContext.registerTool` via `@thegreataxios/webmcp-react` (`WebMCPTool`, `ExperimentalWebMCPJourney`, `ExperimentalWebMCPGuardedTool`). Polyfill installs when native WebMCP is absent. Intensity histogram uses WebGPU compute with CPU fallback. Region labels paint into NiiVue’s drawing overlay.

## Links to fill on Devpost

- Live URL: https://thegreataxios.github.io/faraday/
- Repo: https://github.com/TheGreatAxios/faraday
- Demo video: _(YouTube, <3 min — see DEMO.md)_

## Prior work note

Faraday is new for this challenge. Vendored WebMCP packages come from the independent `@thegreataxios/webmcp` community implementation; Faraday-specific work (viewer, tools, GPU histogram, overlay, sample, deploy) is the submission surface.
