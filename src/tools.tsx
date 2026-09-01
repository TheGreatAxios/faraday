import {
  WebMCPTool,
  ExperimentalWebMCPGuardedTool,
  ExperimentalWebMCPJourney,
} from "@thegreataxios/webmcp-react";
import type { CallToolResult } from "@thegreataxios/webmcp-core";
import { histogramWebGpu, suggestBrightWindow } from "./histogram";
import { findRegions, type Region } from "./regions";
import { voxelToMm, type VolumeSnapshot } from "./viewer";

export type ViewName = "axial" | "coronal" | "sagittal" | "multiplanar" | "render";

export interface ReadingRoomController {
  snapshot(): VolumeSnapshot | null;
  regions(): Region[];
  setRegions(regions: Region[], labels?: Uint8Array): void;
  focusVoxel(voxel: [number, number, number]): void;
  setView(view: ViewName): void;
  currentView(): ViewName;
  renderBackend(): "webgpu" | "webgl2" | "unknown";
}

const VIEWS: ViewName[] = ["axial", "coronal", "sagittal", "multiplanar", "render"];

function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/**
 * Errors are the agent's only feedback channel, so each one says what went
 * wrong and which tool call would fix it. A bare "failed" leaves the agent
 * guessing and it will usually retry the same call.
 */
function fail(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

const round = (value: number, places = 1) => Number(value.toFixed(places));

function describeRegion(region: Region, snapshot: VolumeSnapshot) {
  const [x, y, z] = voxelToMm(region.centroid, snapshot.meta);
  return {
    id: region.id,
    volume_ml: round(region.volumeMl, 3),
    max_extent_mm: round(region.maxExtentMm),
    bounding_box_mm: region.boundingBoxMm.map((side) => round(side)),
    mean_intensity: round(region.meanIntensity),
    centroid_mm: [round(x), round(y), round(z)],
    voxel_count: region.voxelCount,
  };
}

export function FaradayTools({ controller }: { controller: ReadingRoomController }) {
  const requireVolume = (): VolumeSnapshot | string => {
    const snapshot = controller.snapshot();
    if (!snapshot) {
      return "No volume is loaded yet. Ask the user to open a NIfTI file, then retry.";
    }
    return snapshot;
  };

  return (
    <>
      <WebMCPTool
        name="describe_study"
        title="Describe the loaded study"
        description={
          "Report the loaded volume's grid size, voxel spacing in millimetres, intensity range, " +
          "suggested intensity window for bright-region search, render backend, and current view. " +
          "Call this first to orient yourself. The intensity histogram is computed on-device " +
          "(WebGPU when available); voxel data never leaves the tab."
        }
        annotations={{ readOnlyHint: true }}
        handler={async () => {
          const snapshot = requireVolume();
          if (typeof snapshot === "string") return fail(snapshot);

          const { dims, spacing } = snapshot.meta;
          const hist = await histogramWebGpu(snapshot.data);
          const hint = suggestBrightWindow(hist);
          const backend = controller.renderBackend();

          return ok(
            `Loaded "${snapshot.name}": ${dims.join(" × ")} voxels at ` +
              `${spacing.map((s) => round(s, 2)).join(" × ")} mm. ` +
              `Intensity ${round(hist.min)} → ${round(hist.max)} ` +
              `(histogram via ${hist.backend}). ` +
              `Suggested bright window for find_regions: ${hint.min} → ${hint.max} ` +
              `(${hint.reason}). ` +
              `Viewer: ${controller.currentView()} on ${backend}.`,
            {
              name: snapshot.name,
              dims,
              spacing_mm: spacing.map((s) => round(s, 3)),
              intensity_min: round(hist.min),
              intensity_max: round(hist.max),
              suggested_window: { min: hint.min, max: hint.max, reason: hint.reason },
              histogram_backend: hist.backend,
              render_backend: backend,
              view: controller.currentView(),
            },
          );
        }}
      />

      <WebMCPTool
        name="find_regions"
        title="Find connected regions by intensity"
        description={
          "Find connected 3D regions whose voxel intensity falls inside a window, and measure each " +
          "one (volume in mL, bounding box in mm, mean intensity, centroid). Returns the largest " +
          "regions first. Use describe_study to see the intensity range before choosing a window. " +
          "Voxel data is never returned — only measurements."
        }
        annotations={{ readOnlyHint: true }}
        inputSchema={{
          type: "object",
          properties: {
            min_intensity: {
              type: "number",
              description: "Inclusive lower bound on voxel intensity.",
            },
            max_intensity: {
              type: "number",
              description: "Inclusive upper bound on voxel intensity.",
            },
            min_volume_ml: {
              type: "number",
              description: "Discard regions smaller than this volume in mL. Defaults to 0.1.",
            },
            limit: {
              type: "integer",
              description: "Maximum number of regions to return. Defaults to 5.",
            },
          },
          required: ["min_intensity", "max_intensity"],
        }}
        handler={(args) => {
          const snapshot = requireVolume();
          if (typeof snapshot === "string") return fail(snapshot);

          const min = Number(args.min_intensity);
          const max = Number(args.max_intensity);
          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return fail("min_intensity and max_intensity must both be numbers.");
          }
          if (min > max) {
            return fail(
              `Empty window: min_intensity ${min} is above max_intensity ${max}. Swap them and retry.`,
            );
          }

          const minVolumeMl = Number.isFinite(Number(args.min_volume_ml))
            ? Number(args.min_volume_ml)
            : 0.1;
          const { spacing } = snapshot.meta;
          const mlPerVoxel = (spacing[0] * spacing[1] * spacing[2]) / 1000;
          const minVoxels = Math.max(1, Math.ceil(minVolumeMl / mlPerVoxel));
          const labelOut = new Uint8Array(snapshot.data.length);

          const found = findRegions(snapshot.data, snapshot.meta, {
            min,
            max,
            minVoxels,
            labelOut,
          });
          controller.setRegions(found, labelOut);

          if (found.length === 0) {
            return ok(
              `No regions of at least ${minVolumeMl} mL fall between ${min} and ${max}. ` +
                "Widen the intensity window or lower min_volume_ml.",
              { regions: [] },
            );
          }

          const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 5;
          const shown = found.slice(0, Math.max(1, limit));
          const summary = shown
            .map(
              (region) =>
                `#${region.id}: ${round(region.volumeMl, 2)} mL, ` +
                `largest extent ${round(region.maxExtentMm)} mm, ` +
                `mean intensity ${round(region.meanIntensity)}`,
            )
            .join("\n");

          return ok(
            `Found ${found.length} region(s); showing ${shown.length}. ` +
              "Extents are axis-aligned bounding box sides, not caliper diameters.\n" +
              summary +
              "\nCall focus_region to bring one on screen for the user.",
            { total: found.length, regions: shown.map((r) => describeRegion(r, snapshot)) },
          );
        }}
      />

      <WebMCPTool
        name="focus_region"
        title="Bring a region on screen"
        description={
          "Move the viewer's crosshair to a region found by find_regions, so the user sees what you " +
          "are describing. Call find_regions first to get region ids."
        }
        inputSchema={{
          type: "object",
          properties: {
            region_id: { type: "integer", description: "Region id from find_regions." },
          },
          required: ["region_id"],
        }}
        handler={(args) => {
          const snapshot = requireVolume();
          if (typeof snapshot === "string") return fail(snapshot);

          const regions = controller.regions();
          if (regions.length === 0) {
            return fail("No regions available yet. Call find_regions first.");
          }

          const id = Number(args.region_id);
          const region = regions.find((candidate) => candidate.id === id);
          if (!region) {
            return fail(
              `No region #${id}. Available ids: ${regions.map((r) => r.id).join(", ")}.`,
            );
          }

          const voxel = region.centroid.map(Math.round) as [number, number, number];
          controller.focusVoxel(voxel);

          return ok(
            `Focused region #${region.id} (${round(region.volumeMl, 2)} mL). ` +
              "The viewer now shows it under the crosshair.",
            describeRegion(region, snapshot),
          );
        }}
      />

      <WebMCPTool
        name="set_view"
        title="Change the viewer layout"
        description={`Switch the viewer layout. One of: ${VIEWS.join(", ")}.`}
        inputSchema={{
          type: "object",
          properties: { view: { type: "string", enum: VIEWS } },
          required: ["view"],
        }}
        handler={(args) => {
          const view = String(args.view) as ViewName;
          if (!VIEWS.includes(view)) {
            return fail(`Unknown view "${args.view}". Choose one of: ${VIEWS.join(", ")}.`);
          }
          controller.setView(view);
          return ok(`View set to ${view}.`, { view });
        }}
      />

      <ExperimentalWebMCPJourney
        name="review"
        description="Orient in the study and locate regions of interest."
        tools={["describe_study", "find_regions", "focus_region", "set_view"]}
      />

      <ExperimentalWebMCPJourney
        name="report"
        description="Write measured findings out of the shielded session."
        tools={["export_findings"]}
      >
        <ExperimentalWebMCPGuardedTool
          name="export_findings"
          description={
            "Export the measurements for the regions currently found as a JSON summary the user can " +
            "save. Only measurements leave the page — never voxel data. Requires the user to approve."
          }
          inputSchema={{
            type: "object",
            properties: {
              note: { type: "string", description: "Optional note to attach to the export." },
            },
          }}
          handler={(args: Record<string, unknown>) => {
            const snapshot = requireVolume();
            if (typeof snapshot === "string") return fail(snapshot);

            const regions = controller.regions();
            if (regions.length === 0) {
              return fail("Nothing to export yet. Call find_regions first.");
            }

            return ok(
              `Exported ${regions.length} measured region(s). Voxel data was not included.`,
              {
                study: snapshot.name,
                exported_at: new Date().toISOString(),
                note: typeof args.note === "string" ? args.note : undefined,
                regions: regions.map((region) => describeRegion(region, snapshot)),
              },
            );
          }}
        />
      </ExperimentalWebMCPJourney>
    </>
  );
}
