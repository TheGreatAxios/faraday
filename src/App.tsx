import { NiiVue, SLICE_TYPE } from "@niivue/niivue";
import {
  WebMCPProvider,
  ExperimentalWebMCPConfirmProvider,
  experimental_useWebMCPConfirm,
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

const VIEW_OPTIONS: { id: ViewName; label: string }[] = [
  { id: "axial", label: "Axial" },
  { id: "coronal", label: "Coronal" },
  { id: "sagittal", label: "Sagittal" },
  { id: "multiplanar", label: "MPR" },
  { id: "render", label: "3D" },
];

const VIEW_LABEL: Record<ViewName, string> = Object.fromEntries(
  VIEW_OPTIONS.map((option) => [option.id, option.label]),
) as Record<ViewName, string>;

function preferBackend(): "webgpu" | "webgl2" {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "webgl2";
}

function ReadingRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<InstanceType<typeof NiiVue> | null>(null);
  const snapshotRef = useRef<VolumeSnapshot | null>(null);
  const regionsRef = useRef<Region[]>([]);

  const [studyName, setStudyName] = useState<string | null>(null);
  const [studyMeta, setStudyMeta] = useState<{ dims: number[]; spacing: number[] } | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>("multiplanar");
  const [backend, setBackend] = useState<RenderBackend>("unknown");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preferred = preferBackend();
    const opts = {
      backend: preferred,
      placeholderText: "",
      crosshairWidth: 0.8,
      crosshairColor: [0.77, 0.65, 0.45, 0.85],
      backColor: [0.02, 0.02, 0.02, 1],
    } as ConstructorParameters<typeof NiiVue>[0];
    const nv = new NiiVue(opts);
    nvRef.current = nv;

    void (async () => {
      try {
        await nv.attachToCanvas(canvas);
      } catch (error) {
        if (preferred === "webgpu") {
          const fallback = new NiiVue({ ...opts, backend: "webgl2" });
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
      setLoading(true);
      try {
        await nv.loadVolumes([{ url, name }]);
        snapshotRef.current = readVolume(nv as unknown as NiiVueLike);
        regionsRef.current = [];
        setRegions([]);
        setFocused(null);
        paintOverlay(null);
        const snap = snapshotRef.current;
        setStudyName(snap?.name ?? name);
        setStudyMeta(snap ? { dims: snap.meta.dims, spacing: snap.meta.spacing } : null);
      } finally {
        setLoading(false);
      }
    },
    [paintOverlay],
  );

  const openFile = useCallback(
    async (file: File) => {
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
    await openUrl(
      `${import.meta.env.BASE_URL}samples/UPENN-GBM-00001_11_T1GD.nii.gz`,
      "UPENN-GBM-00001_11_T1GD.nii.gz",
    );
  }, [openUrl]);

  const applyView = useCallback((next: ViewName) => {
    const nv = nvRef.current;
    if (nv) nv.sliceType = SLICE_TYPES[next];
    setView(next);
  }, []);

  const focusRegion = useCallback((region: Region) => {
    const nv = nvRef.current;
    if (!nv) return;
    const voxel = region.centroid.map((c) => Math.round(c)) as [number, number, number];
    nv.crosshairPos = nv.vox2frac(voxel) as unknown as typeof nv.crosshairPos;
    nv.drawScene();
    setFocused(region.id);
  }, []);

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
      nv.crosshairPos = nv.vox2frac(voxel) as unknown as typeof nv.crosshairPos;
      nv.drawScene();
      const match = regionsRef.current.find(
        (region) => region.centroid.every((c, i) => Math.round(c) === voxel[i]),
      );
      setFocused(match?.id ?? null);
    },
    setView: applyView,
    currentView: () => view,
    renderBackend: () => backend,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-glyph" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="1.25" y="1.25" width="19.5" height="19.5" rx="4" stroke="currentColor" strokeWidth="1.4" />
              <rect x="5.5" y="5.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
              <circle cx="11" cy="11" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <div className="brand-text">
            <h1 className="brand-mark">Faraday</h1>
            <p className="brand-tag">The scan stays in the cage.</p>
          </div>
        </div>
        <div className="topbar-spacer" />
        <div className="top-actions">
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void loadDemo()}>
            {loading ? "Loading…" : "Load demo"}
          </button>
          <label className="btn btn-ghost">
            {studyName ? "Open file" : "Open NIfTI"}
            <input
              type="file"
              accept=".nii,.nii.gz,.gz"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openFile(file);
              }}
            />
          </label>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <section className="rail-block">
            <h2 className="rail-label">Study</h2>
            {studyName && studyMeta ? (
              <div className="study-card">
                <p className="study-name">{studyName}</p>
                <dl className="study-stats">
                  <div>
                    <dt>Grid</dt>
                    <dd>{studyMeta.dims.join(" × ")}</dd>
                  </div>
                  <div>
                    <dt>Spacing</dt>
                    <dd>{studyMeta.spacing.map((s) => s.toFixed(2)).join(" × ")} mm</dd>
                  </div>
                  <div>
                    <dt>View</dt>
                    <dd>{VIEW_LABEL[view]}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="study-hint">
                Load the demo sample or open a local NIfTI. Stays in this tab.
              </p>
            )}
          </section>

          <section className="rail-block">
            <h2 className="rail-label">Regions · {regions.length}</h2>
            {regions.length === 0 ? (
              <p className="empty-rail">
                {studyName ? "No regions yet." : "Load a study to begin."}
              </p>
            ) : (
              <ul className="regions">
                {regions.slice(0, 10).map((region) => (
                  <li key={region.id}>
                    <button
                      type="button"
                      className={focused === region.id ? "region focused" : "region"}
                      onClick={() => focusRegion(region)}
                    >
                      <div className="region-top">
                        <span className="region-id">Region {region.id}</span>
                        <span className="region-vol">{region.volumeMl.toFixed(2)} mL</span>
                      </div>
                      <div className="region-meta">
                        {region.maxExtentMm.toFixed(1)} mm · μ {region.meanIntensity.toFixed(0)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="disclaimer">
            Research and education only. Not a medical device. Not for diagnostic use.
          </p>
        </aside>

        <main className={studyName ? "stage has-study" : "stage"} aria-label="Volume viewport">
          {studyName ? (
            <div className="stage-toolbar" role="toolbar" aria-label="View mode">
              <div className="seg">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={view === option.id}
                    disabled={loading}
                    onClick={() => applyView(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <canvas ref={canvasRef} aria-hidden={!studyName} />

          {loading ? (
            <div className="loading-veil" role="status">
              Decoding volume
            </div>
          ) : null}

          {!studyName && !loading ? (
            <div className="empty">
              <p className="empty-kicker">Reading room</p>
              <h2>Open a study. Keep the voxels here.</h2>
              <p>Open a volume in this tab. The agent works from measurements — never the image itself.</p>
              <div className="empty-actions">
                <button type="button" className="btn btn-primary" onClick={() => void loadDemo()}>
                  Load demo CT/MR
                </button>
                <label className="btn btn-ghost">
                  Open NIfTI
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
            </div>
          ) : null}
        </main>
      </div>

      <FaradayTools controller={controller} />
      <ConfirmDialog />
    </div>
  );
}

function ConfirmDialog() {
  const { pending } = experimental_useWebMCPConfirm();
  if (!pending) return null;

  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="sheet">
        <h2 id="confirm-title">Approve “{pending.tool}”?</h2>
        <p>This tool may send measurements off the page. Voxel data stays here.</p>
        <pre>{JSON.stringify(pending.args, null, 2)}</pre>
        <div className="actions">
          <button type="button" className="btn btn-danger" onClick={() => pending.reject()}>
            Decline
          </button>
          <button type="button" className="btn btn-approve" onClick={() => pending.approve()}>
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
