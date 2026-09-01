# WebMCP on Faraday

Devpost asks for repos that call `document.modelContext.registerTool`. Faraday does that through `@thegreataxios/webmcp-react`; the call site in the vendored runtime is:

```js
document.modelContext.registerTool(descriptor, { signal, exposedTo })
```

(`vendor/webmcp-react/dist/index.js`)

## Tools registered on the page

| Name | Purpose |
|------|---------|
| `describe_study` | Grid, spacing, intensity range, suggested window |
| `find_regions` | Connected components + drawing overlay |
| `focus_region` | Move crosshair to a found region |
| `set_view` | axial / coronal / sagittal / multiplanar / render |
| `export_findings` | Measurements JSON — **HITL confirm required** |

Journeys: `review` (orient + locate) and `report` (export). Both are active in the reading room.

## Equivalent imperative shape

What judges see conceptually:

```js
document.modelContext.registerTool({
  name: "find_regions",
  description: "Find connected 3D regions by intensity window; return measurements only",
  inputSchema: {
    type: "object",
    properties: {
      min_intensity: { type: "number" },
      max_intensity: { type: "number" },
      min_volume_ml: { type: "number" },
      limit: { type: "integer" },
    },
    required: ["min_intensity", "max_intensity"],
  },
  execute: async (input) => {
    /* flood-fill in-tab; return mL / mm — never voxels */
  },
});
```

React wiring lives in `src/tools.tsx` via `<WebMCPTool />` and `<ExperimentalWebMCPGuardedTool />`.
