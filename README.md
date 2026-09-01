# Faraday

**An agent-native reading room for volumetric medical imaging.**
The agent reads the scan. The scan never leaves the tab.

Every MRI suite is built inside a Faraday cage — a shielded room that stops RF from getting in or
out. This app is the same idea for data. A CT or MRI volume is decoded and rendered entirely in your
browser, and an AI agent works on it through [WebMCP](https://github.com/webmachinelearning/webmcp)
tools that return *measurements*, never voxels.

> Research and education only. Not a medical device and not for diagnostic use.

## Why this needs WebMCP

Three separate things break without it, and all three are load-bearing.

**Reach.** The volume is a GPU texture. An agent driving the DOM sees an empty `<canvas>` — there is
no amount of scraping that recovers a slice, an intensity, or a lesion boundary.

**Privacy.** You cannot upload a patient study to a hosted model: it is PHI, and it is hundreds of
megabytes. So agents are absent from medical imaging entirely — not for lack of capability, but for
lack of a safe path to the data. Here the file is opened from local disk, and the only thing that
crosses the tool boundary is what a tool's output schema explicitly allows. **The tool call is the
de-identification boundary**, and you can read it to know exactly what escapes.

**Compute.** `find_regions` runs a connected-component pass over the whole volume. The agent triggers
that work and receives a handful of measurements; it never observes the data the loop ran over.

Together these let a human and an agent do something neither can do alone. Picking a specific lesion
out of a volume is miserable for a person (scrubbing slices, clicking at a fuzzy boundary) and
impossible for an agent (it's a texture). Said out loud, it takes one sentence:

> *"Find the bright regions over 1 mL, measure them, and show me the largest."*

## Tools

| Tool | Journey | What it does |
|------|---------|--------------|
| `describe_study` | review | Grid size, voxel spacing in mm, intensity range, current view |
| `find_regions` | review | Connected components inside an intensity window, measured and ranked |
| `focus_region` | review | Moves the crosshair so the user sees what the agent is describing |
| `set_view` | review | Switches between axial, coronal, sagittal, multiplanar, 3D render |
| `export_findings` | report | Writes measurements out — **requires explicit user approval** |

Tools are scoped by journey, so the agent is only offered what the current phase warrants, and
`export_findings` — the only tool that moves data off the page — is gated behind a confirmation
dialog the user has to approve.

## Running it

```bash
bun install
bun run dev      # http://localhost:5273
bun test         # region-finding self-check
bun run build
```

Open a `.nii` or `.nii.gz` volume. To drive it with an agent, use ChatGPT's in-app browser, or Chrome
with `chrome://flags/#enable-webmcp-testing` enabled.

### Test data

No imaging data is committed to this repo. See [`data/README.md`](./data/README.md) for openly
licensed volumes to try.

## Built on

- [NiiVue](https://github.com/niivue/niivue) (BSD-2-Clause) — WebGPU/WebGL2 volume rendering
- [`@thegreataxios/webmcp`](https://github.com/thegreataxios/webmcp) (MIT) — WebMCP polyfill, React
  bindings, journeys, and the human-in-the-loop confirm gate

## License

MIT — see [LICENSE](./LICENSE).
