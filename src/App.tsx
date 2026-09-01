import { NiiVue, SLICE_TYPE } from "@niivue/niivue";
import {
  WebMCPProvider,
  ExperimentalWebMCPConfirmProvider,
  experimental_useWebMCPConfirm,
  useWebMCP,
} from "@thegreataxios/webmcp-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Region } from "./regions";
import { FaradayTools, type ReadingRoomController, type ViewName } from "./tools";
import { readVolume, type NiiVueLike, type VolumeSnapshot } from "./viewer";

type RenderBackend = "webgpu" | "webgl2" | "unknown";

const SLICE_TYPES: Record<ViewName, number> = {
  axial: SLICE_TYPE.AXIAL,
  coronal: SLICE_TYPE.CORONAL,
  sagittal: SLICE_TYPE.SAGITTAL,
  multiplanar: SLICE_TYPE.MULTIPLANAR,
  render: SLICE_TYPE.RENDER,
};

function preferBackend(): "webgpu" | "webgl2" {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "webgl2";
}

function ReadingRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<InstanceType<typeof NiiVue> | null>(null);
  const snapshotRef = useRef<VolumeSnapshot | null>(null);
  const regionsRef = useRef<Region[]>([]);

  const [studyName, setStudyName] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>("multiplanar");
  const [backend, setBackend] = useState<RenderBackend>("unknown");
  const { available, native } = useWebMCP();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preferred = preferBackend();
    // Default @niivue/niivue build ships both backends and falls through
    // webgpu → webgl2. We ask for WebGPU when the browser has it so the
    // session badge tells the truth about what's driving the canvas.
    const nv = new NiiVue({ backend: preferred });
    nvRef.current = nv;

    void (async () => {
      try {
        await nv.attachToCanvas(canvas);
      } catch (error) {
        if (preferred === "webgpu") {
          // Explicit WebGPU request can throw on a half-broken adapter; retry
          // on WebGL2 so a judge with a quirky GPU still gets a working demo.
          const fallback = new NiiVue({ backend: "webgl2" });
          nvRef.current = fallback;
          await fallback.attachToCanvas(canvas);
          setBackend("webgl2");
          console.warn("WebGPU attach failed; fell back to WebGL2", error);
          return;
        }
        throw error;
      }
      setBackend((nv.backend as RenderBackend | undefined) ?? preferred);
    })();

    return () => {
      nvRef.current = null;
    };
  }, []);

  const paintOverlay = useCallback((labels: Uint8Array | null) => {
    const nv = nvRef.current;
    if (!nv) return;
    if (!labels) {
      nv.drawIsEnabled = false;
      nv.drawScene();
      return;
    }
    nv.createEmptyDrawing();
    const drawing = nv.drawingVolume as { img?: Uint8Array } | null;
    if (!drawing?.img || drawing.img.length !== labels.length) {
      // Drawing volume layout can differ from RAS raw length on some loads;
      // skip the overlay rather than corrupt the canvas.
      return;
    }
    drawing.img.set(labels);
    nv.drawOpacity = 0.55;
    nv.drawIsEnabled = true;
    nv.refreshDrawing();
    nv.drawScene();
  }, []);

  const openUrl = useCallback(
    async (url: string, name: string) => {
      const nv = nvRef.current;
      if (!nv) return;
      await nv.loadVolumes([{ url, name }]);
      snapshotRef.current = readVolume(nv as unknown as NiiVueLike);
      regionsRef.current = [];
      setRegions([]);
      setFocused(null);
      paintOverlay(null);
      setStudyName(snapshotRef.current?.name ?? name);
    },
    [paintOverlay],
  );

  const openFile = useCallback(
    async (file: File) => {
      // Blob URL keeps the volume in this tab; nothing is uploaded. niivue
      // needs the real filename so it can pick the right decoder.
      const url = URL.createObjectURL(file);
      try {
        await openUrl(url, file.name);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [openUrl],
  );

  const loadDemo = useCallback(async () => {
    // Bundled public sample (UPENN-GBM T1-Gd, CC BY 4.0) so judges can demo
    // without downloading HuggingFace data first.
    await openUrl(
      "/samples/UPENN-GBM-00001_11_T1GD.nii.gz",
      "UPENN-GBM-00001_11_T1GD.nii.gz",
    );
  }, [openUrl]);

  const controller: ReadingRoomController = {
    snapshot: () => snapshotRef.current,
    regions: () => regionsRef.current,
    setRegions: (next, labels) => {
      regionsRef.current = next;
      setRegions(next);
      setFocused(null);
      paintOverlay(labels ?? null);
    },
    focusVoxel: (voxel) => {
      const nv = nvRef.current;
      if (!nv) return;
      // crosshairPos is a gl-matrix vec3; vox2frac hands back a plain triple.
      nv.crosshairPos = nv.vox2frac(voxel) as unknown as typeof nv.crosshairPos;
      nv.drawScene();
      const match = regionsRef.current.find(
        (region) => region.centroid.every((c, i) => Math.round(c) === voxel[i]),
      );
      setFocused(match?.id ?? null);
    },
    setView: (next) => {
      const nv = nvRef.current;
      if (nv) nv.sliceType = SLICE_TYPES[next];
      setView(next);
    },
    currentView: () => view,
    renderBackend: () => backend,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Faraday</h1>
          <p>The agent reads the scan. The scan never leaves the tab.</p>
        </div>

        <div className="section">
          <h2>Session</h2>
          <div className="pills">
            <span className={available ? "pill live" : "pill"}>
              {available ? (native ? "WebMCP (native)" : "WebMCP (polyfill)") : "WebMCP unavailable"}
            </span>
            <span className={backend === "webgpu" ? "pill live" : "pill"}>
              {backend === "unknown" ? "GPU…" : backend === "webgpu" ? "WebGPU" : "WebGL2"}
            </span>
          </div>
        </div>

        <div className="section">
          <h2>Study</h2>
          <div className="actions-row">
            <button type="button" onClick={() => void loadDemo()}>
              Load demo CT/MR
            </button>
            <label className="file">
              {studyName ? "Open another" : "Open NIfTI"}
              <input
                type="file"
                accept=".nii,.nii.gz,.gz"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void openFile(file);
                }}
              />
            </label>
          </div>
          {studyName ? <p className="meta">{studyName}</p> : (
            <p className="meta">Demo is UPENN-GBM T1-Gd (CC BY 4.0). Stays in this tab.</p>
          )}
        </div>

        <div className="section">
          <h2>Regions ({regions.length})</h2>
          {regions.length === 0 ? (
            <p className="meta">Ask the agent to find regions by intensity.</p>
          ) : (
            <ul className="regions">
              {regions.slice(0, 8).map((region) => (
                <li key={region.id} className={focused === region.id ? "focused" : undefined}>
                  <strong>#{region.id}</strong> {region.volumeMl.toFixed(2)} mL
                  <div className="meta">
                    extent {region.maxExtentMm.toFixed(1)} mm · mean{" "}
                    {region.meanIntensity.toFixed(0)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="disclaimer">
          Research and education only. Not a medical device and not for diagnostic use.
        </p>
      </aside>

      <main className="stage">
        <canvas ref={canvasRef} />
        {studyName ? null : (
          <div className="empty">
            <strong>No volume loaded</strong>
            <span>Open a .nii or .nii.gz file. It is decoded in this tab and never uploaded.</span>
          </div>
        )}
      </main>

      <FaradayTools controller={controller} />
      <ConfirmDialog />
    </div>
  );
}

function ConfirmDialog() {
  const { pending } = experimental_useWebMCPConfirm();
  if (!pending) return null;

  return (
    <div className="confirm">
      <div className="card">
        <h2>Approve “{pending.tool}”?</h2>
        <p>The agent is asking to run this. Measurements leave the page; voxel data does not.</p>
        <pre>{JSON.stringify(pending.args, null, 2)}</pre>
        <div className="actions">
          <button type="button" onClick={() => pending.reject()}>
            Decline
          </button>
          <button type="button" onClick={() => pending.approve()}>
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <WebMCPProvider name="faraday" version="0.1.0">
      <ExperimentalWebMCPConfirmProvider>
        <ReadingRoom />
      </ExperimentalWebMCPConfirmProvider>
    </WebMCPProvider>
  );
}
