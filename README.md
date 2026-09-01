# Faraday

**An agent-native reading room for volumetric medical imaging.**
The agent reads the scan. The scan never leaves the tab.

> Research and education only. Not a medical device and not for diagnostic use.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

## Why WebMCP

Three things break without it — and all three are load-bearing.

**Reach.** The volume is a GPU texture. An agent driving the DOM sees an empty `<canvas>`.

**Privacy.** You cannot upload a patient study to a hosted model. Here the file is opened (or loaded from a bundled de-identified sample) and decoded in-tab. Tool results return **measurements only** — never voxels. The tool output schema is the de-identification boundary.

**Compute.** `describe_study` runs an on-device intensity histogram (WebGPU compute when available, CPU otherwise). `find_regions` labels connected components and paints them onto the viewer so the human *sees* what the agent found.

Demo prompt after loading a study:

> Call `describe_study`, then `find_regions` with the suggested bright window. Focus the largest region and switch to the render view.

## Tools

| Tool | Journey | What it does |
|------|---------|--------------|
| `describe_study` | review | Grid, spacing, intensity range, **suggested window**, render backend |
| `find_regions` | review | Connected components in an intensity window + overlay paint |
| `focus_region` | review | Moves the crosshair to a found region |
| `set_view` | review | axial / coronal / sagittal / multiplanar / render |
| `export_findings` | report | JSON measurements out — **requires user approval** |

## Run locally

```bash
bun install
bun run dev      # http://localhost:5273
bun test
bun run build
```

Click **Load demo CT/MR** (bundled UPENN-GBM T1-Gd, CC BY 4.0) or open your own `.nii` / `.nii.gz`.

### Agent testing

- ChatGPT desktop in-app browser (WebMCP on by default), or
- Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled

Vendored copies of `@thegreataxios/webmcp-core` and `@thegreataxios/webmcp-react` live under `vendor/` so this repo builds without private `file:` links or an npm publish.

## Sample data

- Bundled demo: [`public/samples/`](./public/samples/) — see [ATTRIBUTION.md](./public/samples/ATTRIBUTION.md)
- More volumes: [`data/README.md`](./data/README.md) (gitignored downloads)

## Stack

- [NiiVue](https://github.com/niivue/niivue) — WebGPU / WebGL2 volume rendering
- [`@thegreataxios/webmcp`](https://github.com/TheGreatAxios/webmcp) — WebMCP polyfill, React bindings, journeys, HITL confirm

## License

MIT — see [LICENSE](./LICENSE). Sample imaging data is CC BY 4.0 (separate from this repo’s MIT).
