import { NiiVue, SLICE_TYPE } from "@niivue/niivue";
import {
  WebMCPProvider,
  ExperimentalWebMCPConfirmProvider,
  experimental_useWebMCPConfirm,
} from "@thegreataxios/webmcp-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Region } from "./regions";
import { StudyGate, createExclusiveQueue } from "./session";
import { FaradayTools, type ReadingRoomController, type ViewName } from "./tools";
import { readVolume, type NiiVueLike, type VolumeSnapshot } from "./viewer";

type RenderBackend = "webgpu" | "webgl2" | "unknown";
type CoordUnit = "mm" | "vox";

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

const CROSSHAIR_WIDTH = 0.85;
const CROSSHAIR_COLOR = [0.92, 0.52, 0.18, 0.95];

function preferBackend(): "webgpu" | "webgl2" {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "webgl2";
}

function pickFile(
  event: ChangeEvent<HTMLInputElement>,
  openFile: (file: File) => Promise<void>,
) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) void openFile(file);
}

function ReadingRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const nvRef = useRef<InstanceType<typeof NiiVue> | null>(null);
  const snapshotRef = useRef<VolumeSnapshot | null>(null);
  const regionsRef = useRef<Region[]>([]);
  const gateRef = useRef(new StudyGate());
  const exclusiveRef = useRef(createExclusiveQueue());
  const readyRef = useRef<Promise<void> | null>(null);
  const resolveReadyRef = useRef<(() => void) | null>(null);
  const crosshairWidthRef = useRef(CROSSHAIR_WIDTH);

  const [studyName, setStudyName] = useState<string | null>(null);
  const [studyMeta, setStudyMeta] = useState<{ dims: number[]; spacing: number[] } | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>("multiplanar");
  const [backend, setBackend] = useState<RenderBackend>("unknown");
  const [loading, setLoading] = useState(false);
  const [studyEpoch, setStudyEpoch] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crosshairsOn, setCrosshairsOn] = useState(true);
  const [coordUnit, setCoordUnit] = useState<CoordUnit>("mm");
  const [coords, setCoords] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [zoomPct, setZoomPct] = useState(100);
  const [navSection, setNavSection] = useState<"home" | "study" | "regions" | "settings">("study");
  const [windowOpen, setWindowOpen] = useState(false);
  const [intensitySpan, setIntensitySpan] = useState<{ min: number; max: number } | null>(null);
  const [displayWindow, setDisplayWindow] = useState<{ min: number; max: number } | null>(null);
  const coordUnitRef = useRef<CoordUnit>("mm");
  coordUnitRef.current = coordUnit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    readyRef.current = new Promise<void>((resolve) => {
      resolveReadyRef.current = resolve;
    });

    const preferred = preferBackend();
    const opts = {
      backend: preferred,
      placeholderText: "",
      crosshairWidth: CROSSHAIR_WIDTH,
      crosshairColor: CROSSHAIR_COLOR,
      backColor: [0.02, 0.02, 0.02, 1],
    } as ConstructorParameters<typeof NiiVue>[0];
    let nv = new NiiVue(opts);
    nvRef.current = nv;

    const onLocation = (loc: { mm?: number[]; vox?: number[] }) => {
      const unit = coordUnitRef.current;
      if (unit === "mm" && loc.mm && loc.mm.length >= 3) {
        setCoords({
          x: Math.round(loc.mm[0]!),
          y: Math.round(loc.mm[1]!),
          z: Math.round(loc.mm[2]!),
        });
        return;
      }
      if (loc.vox && loc.vox.length >= 3) {
        setCoords({
          x: Math.round(loc.vox[0]!),
          y: Math.round(loc.vox[1]!),
          z: Math.round(loc.vox[2]!),
        });
      }
    };

    void (async () => {
      try {
        await nv.attachToCanvas(canvas);
        setBackend((nv.backend as RenderBackend | undefined) ?? preferred);
      } catch (error) {
        if (preferred === "webgpu") {
          const fallback = new NiiVue({ ...opts, backend: "webgl2" });
          nv = fallback;
          nvRef.current = fallback;
          await fallback.attachToCanvas(canvas);
          setBackend("webgl2");
          console.warn("WebGPU attach failed; fell back to WebGL2", error);
        } else {
          throw error;
        }
      } finally {
        nv.addEventListener("locationChange", onLocation as never);
        resolveReadyRef.current?.();
        resolveReadyRef.current = null;
      }
    })();

    return () => {
      nv.removeEventListener("locationChange", onLocation as never);
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
      nv.drawIsEnabled = false;
      nv.drawScene();
      return;
    }
    drawing.img.set(labels);
    nv.drawOpacity = 0.55;
    nv.drawIsEnabled = true;
    nv.refreshDrawing();
    nv.drawScene();
  }, []);

  const clearStudySurface = useCallback(() => {
    snapshotRef.current = null;
    regionsRef.current = [];
    setRegions([]);
    setFocused(null);
    paintOverlay(null);
    setWindowOpen(false);
    setIntensitySpan(null);
    setDisplayWindow(null);
  }, [paintOverlay]);

  const openUrl = useCallback(
    async (url: string, name: string) => {
      await readyRef.current;
      const nv = nvRef.current;
      if (!nv) return;

      const gen = gateRef.current.beginLoad();
      setStudyEpoch(gen);
      setLoading(true);
      setLoadError(null);
      clearStudySurface();

      try {
        await nv.loadVolumes([{ url, name }]);
        if (!gateRef.current.commit(gen)) return;

        const snap = readVolume(nv as unknown as NiiVueLike);
        snapshotRef.current = snap;
        setStudyName(snap?.name ?? name);
        setStudyMeta(snap ? { dims: snap.meta.dims, spacing: snap.meta.spacing } : null);
        setNavSection("study");
        if (snap) {
          let min = Infinity;
          let max = -Infinity;
          const data = snap.data;
          // Sample for UI window defaults — full scan is fine at demo size.
          for (let i = 0; i < data.length; i += 1) {
            const v = data[i]!;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            min = 0;
            max = 1;
          }
          setIntensitySpan({ min, max });
          setDisplayWindow({ min, max });
          void nv.setVolume(0, { calMin: min, calMax: max });

          const [nx, ny, nz] = snap.meta.dims;
          const [sx, sy, sz] = snap.meta.spacing;
          const cx = Math.floor(nx / 2);
          const cy = Math.floor(ny / 2);
          const cz = Math.floor(nz / 2);
          nv.crosshairPos = nv.vox2frac([cx, cy, cz]) as unknown as typeof nv.crosshairPos;
          nv.drawScene();
          setCoords(
            coordUnit === "mm"
              ? { x: Math.round(cx * sx), y: Math.round(cy * sy), z: Math.round(cz * sz) }
              : { x: cx, y: cy, z: cz },
          );
        }
        setLoading(false);
      } catch (error) {
        gateRef.current.fail(gen);
        if (gateRef.current.isCurrent(gen)) {
          setLoading(false);
          setLoadError(error instanceof Error ? error.message : "Failed to open volume.");
        }
      }
    },
    [clearStudySurface, coordUnit],
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

  const toggleCrosshairs = useCallback(() => {
    const nv = nvRef.current;
    setCrosshairsOn((on) => {
      const next = !on;
      if (nv) {
        if (next) {
          nv.crosshairWidth = crosshairWidthRef.current;
        } else {
          crosshairWidthRef.current = nv.crosshairWidth || CROSSHAIR_WIDTH;
          nv.crosshairWidth = 0;
        }
        nv.drawScene();
      }
      return next;
    });
  }, []);

  const applyDisplayWindow = useCallback(async (min: number, max: number) => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    setDisplayWindow({ min: lo, max: hi });
    const nv = nvRef.current;
    if (nv) {
      await nv.setVolume(0, { calMin: lo, calMax: hi });
      nv.drawScene();
    }
  }, []);

  const applyZoom = useCallback((pct: number) => {
    const next = Math.min(400, Math.max(50, pct));
    setZoomPct(next);
    const nv = nvRef.current as { setViewport?: (v: { pan: [number, number]; zoom: number }) => void } | null;
    nv?.setViewport?.({ pan: [0, 0], zoom: next / 100 });
  }, []);

  const jumpToCoord = useCallback(
    (axis: "x" | "y" | "z", value: number) => {
      const nv = nvRef.current;
      const snap = snapshotRef.current;
      if (!nv || !snap || !Number.isFinite(value)) return;
      const next = { ...coords, [axis]: Math.round(value) };
      setCoords(next);
      const [sx, sy, sz] = snap.meta.spacing;
      const vox: [number, number, number] =
        coordUnit === "mm"
          ? [Math.round(next.x / sx), Math.round(next.y / sy), Math.round(next.z / sz)]
          : [next.x, next.y, next.z];
      const [nx, ny, nz] = snap.meta.dims;
      vox[0] = Math.max(0, Math.min(nx - 1, vox[0]));
      vox[1] = Math.max(0, Math.min(ny - 1, vox[1]));
      vox[2] = Math.max(0, Math.min(nz - 1, vox[2]));
      nv.crosshairPos = nv.vox2frac(vox) as unknown as typeof nv.crosshairPos;
      nv.drawScene();
    },
    [coordUnit, coords],
  );

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  }, []);

  const switchCoordUnit = useCallback((next: CoordUnit) => {
    const snap = snapshotRef.current;
    if (snap && next !== coordUnit) {
      const [sx, sy, sz] = snap.meta.spacing;
      setCoords((c) =>
        next === "mm"
          ? { x: Math.round(c.x * sx), y: Math.round(c.y * sy), z: Math.round(c.z * sz) }
          : {
              x: Math.round(c.x / sx),
              y: Math.round(c.y / sy),
              z: Math.round(c.z / sz),
            },
      );
    }
    setCoordUnit(next);
  }, [coordUnit]);

  const controller: ReadingRoomController = {
    snapshot: () => snapshotRef.current,
    regions: () => regionsRef.current,
    studyEpoch: () => gateRef.current.epoch,
    isLoading: () => gateRef.current.loading,
    setRegions: (next, labels, epoch) => {
      if (epoch !== undefined && !gateRef.current.isCurrent(epoch)) return false;
      if (gateRef.current.loading) return false;
      regionsRef.current = next;
      setRegions(next);
      setFocused(null);
      paintOverlay(labels ?? null);
      setNavSection("regions");
      return true;
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
    runExclusive: (fn) => exclusiveRef.current(fn),
  };

  const hasStudy = Boolean(studyName && studyMeta && !loading);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-glyph" aria-hidden="true">
            <IconCage />
          </span>
          <div className="brand-text">
            <h1 className="brand-mark">Faraday</h1>
            <p className="brand-tag">The scan stays in the cage.</p>
          </div>
        </div>
        <div className="topbar-spacer" />
        <div className="top-actions">
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void loadDemo()}>
            <IconFolder />
            {loading ? "Loading…" : "Load demo"}
          </button>
          <label className={`btn btn-ghost${loading ? " is-disabled" : ""}`}>
            <IconUpload />
            Open file
            <input
              type="file"
              accept=".nii,.nii.gz,.gz"
              disabled={loading}
              onChange={(event) => pickFile(event, openFile)}
            />
          </label>
        </div>
      </header>

      <div className="shell">
        <nav className="icon-rail" aria-label="Reading room">
          <RailButton
            label="Home"
            active={navSection === "home"}
            onClick={() => setNavSection("home")}
          >
            <IconHome />
          </RailButton>
          <RailButton
            label="Study"
            active={navSection === "study"}
            onClick={() => setNavSection("study")}
          >
            <IconDatabase />
          </RailButton>
          <RailButton
            label="Regions"
            active={navSection === "regions"}
            onClick={() => setNavSection("regions")}
          >
            <IconTags />
          </RailButton>
          <RailButton
            label="Settings"
            active={navSection === "settings"}
            onClick={() => setNavSection("settings")}
          >
            <IconSettings />
          </RailButton>
          <div className="icon-rail-spacer" />
          <div className="avatar" title="Local session" aria-label="Local session">
            F
            <span className="avatar-dot" aria-hidden="true" />
          </div>
        </nav>

        <aside className="panel">
          {(navSection === "home" || navSection === "study" || navSection === "regions") && (
            <>
              <section className="panel-block">
                <h2 className="panel-label">Study</h2>
                {hasStudy ? (
                  <div className="study-card">
                    <p className="study-name">{studyName}</p>
                    <dl className="study-stats">
                      <div>
                        <dt>Grid</dt>
                        <dd>{studyMeta!.dims.join(" × ")}</dd>
                      </div>
                      <div>
                        <dt>Spacing</dt>
                        <dd>{studyMeta!.spacing.map((s) => s.toFixed(2)).join(" × ")} mm</dd>
                      </div>
                      <div>
                        <dt>View</dt>
                        <dd>{VIEW_LABEL[view]}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="study-hint">
                    {loading
                      ? "Decoding volume…"
                      : "Load the demo sample or open a local NIfTI. Opening a file replaces the current study."}
                  </p>
                )}
                {loadError ? <p className="load-error">{loadError}</p> : null}
              </section>

              <section className="panel-block" id="regions-panel">
                <h2 className="panel-label">Regions · {regions.length}</h2>
                {regions.length === 0 ? (
                  <p className="empty-rail">
                    {hasStudy
                      ? "No regions yet. Create regions to annotate areas of interest."
                      : "Load a study to begin."}
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
            </>
          )}

          {navSection === "settings" ? (
            <section className="panel-block">
              <h2 className="panel-label">Session</h2>
              <div className="study-card">
                <dl className="study-stats">
                  <div>
                    <dt>Render</dt>
                    <dd>{backend}</dd>
                  </div>
                  <div>
                    <dt>Epoch</dt>
                    <dd>{studyEpoch}</dd>
                  </div>
                  <div>
                    <dt>Zoom</dt>
                    <dd>{zoomPct}%</dd>
                  </div>
                </dl>
              </div>
              <p className="study-hint">
                One volume per tab. Agents share this study; mutating tools run one at a time.
              </p>
            </section>
          ) : null}

          <p className="disclaimer">
            Research and education only. Not a medical device. Not for diagnostic use.
          </p>
        </aside>

        <main
          ref={stageRef as never}
          className={hasStudy ? "stage has-study" : "stage"}
          aria-label="Volume viewport"
        >
          {hasStudy ? (
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
              <button
                type="button"
                className={windowOpen ? "tool-icon active" : "tool-icon"}
                aria-label="Window / level"
                aria-expanded={windowOpen}
                title="Window / level"
                onClick={() => setWindowOpen((v) => !v)}
              >
                <IconSun />
              </button>
              {windowOpen && intensitySpan && displayWindow ? (
                <div className="window-popover" role="dialog" aria-label="Display window">
                  <label>
                    <span>Min</span>
                    <input
                      type="range"
                      min={intensitySpan.min}
                      max={intensitySpan.max}
                      step={(intensitySpan.max - intensitySpan.min) / 256 || 1}
                      value={displayWindow.min}
                      onChange={(e) =>
                        void applyDisplayWindow(Number(e.target.value), displayWindow.max)
                      }
                    />
                    <em>{Math.round(displayWindow.min)}</em>
                  </label>
                  <label>
                    <span>Max</span>
                    <input
                      type="range"
                      min={intensitySpan.min}
                      max={intensitySpan.max}
                      step={(intensitySpan.max - intensitySpan.min) / 256 || 1}
                      value={displayWindow.max}
                      onChange={(e) =>
                        void applyDisplayWindow(displayWindow.min, Number(e.target.value))
                      }
                    />
                    <em>{Math.round(displayWindow.max)}</em>
                  </label>
                  <button
                    type="button"
                    className="window-reset"
                    onClick={() => void applyDisplayWindow(intensitySpan.min, intensitySpan.max)}
                  >
                    Reset
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <canvas ref={canvasRef} aria-hidden={!hasStudy} />

          {hasStudy ? (
            <div className="stage-footer" role="toolbar" aria-label="Viewport controls">
              <label className="toggle">
                <span>Crosshairs</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={crosshairsOn}
                  className={crosshairsOn ? "switch on" : "switch"}
                  onClick={toggleCrosshairs}
                >
                  <span className="switch-knob" />
                  <span className="switch-label">{crosshairsOn ? "ON" : "OFF"}</span>
                </button>
              </label>

              <div className="coord-row">
                {(["x", "y", "z"] as const).map((axis) => (
                  <label key={axis} className="coord">
                    <span>{axis.toUpperCase()}</span>
                    <input
                      type="number"
                      value={coords[axis]}
                      onChange={(e) => jumpToCoord(axis, Number(e.target.value))}
                    />
                  </label>
                ))}
                <select
                  className="unit-select"
                  value={coordUnit}
                  aria-label="Coordinate units"
                  onChange={(e) => switchCoordUnit(e.target.value as CoordUnit)}
                >
                  <option value="mm">mm</option>
                  <option value="vox">vox</option>
                </select>
              </div>

              <div className="zoom-row">
                <button type="button" className="tool-icon" aria-label="Zoom out" onClick={() => applyZoom(zoomPct - 10)}>
                  −
                </button>
                <button type="button" className="zoom-readout" aria-label="Reset zoom" onClick={() => applyZoom(100)}>
                  <IconSearch /> {zoomPct}%
                </button>
                <button type="button" className="tool-icon" aria-label="Zoom in" onClick={() => applyZoom(zoomPct + 10)}>
                  +
                </button>
                <button type="button" className="tool-icon" aria-label="Fullscreen" onClick={() => void toggleFullscreen()}>
                  <IconExpand />
                </button>
              </div>
            </div>
          ) : null}

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
                  <IconFolder />
                  Load demo CT/MR
                </button>
                <label className="btn btn-ghost">
                  <IconUpload />
                  Open NIfTI
                  <input
                    type="file"
                    accept=".nii,.nii.gz,.gz"
                    onChange={(event) => pickFile(event, openFile)}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <FaradayTools controller={controller} />
      <ConfirmDialog studyEpoch={studyEpoch} />
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "rail-btn active" : "rail-btn"}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({ studyEpoch }: { studyEpoch: number }) {
  const { pending } = experimental_useWebMCPConfirm();
  const epochWhenShown = useRef<number | null>(null);

  useEffect(() => {
    if (pending) epochWhenShown.current = studyEpoch;
    else epochWhenShown.current = null;
  }, [pending, studyEpoch]);

  useEffect(() => {
    if (
      pending &&
      epochWhenShown.current !== null &&
      epochWhenShown.current !== studyEpoch
    ) {
      pending.reject();
    }
  }, [studyEpoch, pending]);

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

function IconCage() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1.25" y="1.25" width="19.5" height="19.5" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5.5" y="5.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <circle cx="11" cy="11" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconTags() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12V5.5A1.5 1.5 0 0 1 4.5 4H12l8 8-7.5 7.5L3 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.1l1.6 1.5M17.5 15.4l1.6 1.5M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.5M17.5 8.6l1.6-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
