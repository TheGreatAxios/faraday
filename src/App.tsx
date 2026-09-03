import { NiiVue, SLICE_TYPE } from "@niivue/niivue";
import {
  WebMCPProvider,
  ExperimentalWebMCPConfirmProvider,
  experimental_useWebMCPConfirm,
} from "@thegreataxios/webmcp-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
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
const CROSSHAIR_COLOR = [0.2, 0.7, 0.95, 0.9];

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
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
      backColor: [0.03, 0.03, 0.04, 1],
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
    nv.drawOpacity = 0.6;
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

        if (snap) {
          let min = Infinity;
          let max = -Infinity;
          const data = snap.data;
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
          setLoadError(error instanceof Error ? error.message : "Failed to load study");
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

  // Drag and Drop Handling
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  const controller: ReadingRoomController = {
    snapshot: () => snapshotRef.current,
    regions: () => regionsRef.current,
    studyEpoch: () => gateRef.current.epoch,
    isLoading: () => loading,
    setRegions: (next, labels, epoch) => {
      if (typeof epoch === "number" && !gateRef.current.isCurrent(epoch)) {
        return false;
      }
      regionsRef.current = next;
      setRegions(next);
      paintOverlay(labels ?? null);
      if (next.length > 0) setPanelOpen(true);
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
    <div
      className={`app ${theme}-theme`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging ? (
        <div className="drag-overlay" role="presentation">
          <div className="drag-target">
            <IconUpload className="drag-icon" />
            <p className="drag-title">Drop NIfTI scan to open</p>
            <p className="drag-hint">Supports .nii and .nii.gz</p>
          </div>
        </div>
      ) : null}

      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Faraday</span>
          <span className="brand-divider">/</span>
          <span className="brand-sub">Reading Room</span>
        </div>

        {hasStudy ? (
          <div className="study-chip" title={studyName!}>
            <span className="study-name">{studyName}</span>
            <span className="study-dim">{studyMeta!.dims.join("×")}</span>
            <span className="study-spacing">{studyMeta!.spacing.map((s) => s.toFixed(1)).join("×")} mm</span>
          </div>
        ) : null}

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          {hasStudy ? (
            <button
              type="button"
              className={panelOpen ? "tb-btn active" : "tb-btn"}
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              <IconTags />
              <span>Findings</span>
              {regions.length > 0 ? <span className="tb-pill">{regions.length}</span> : null}
            </button>
          ) : null}

          <button
            type="button"
            className="tb-btn"
            disabled={loading}
            onClick={() => void loadDemo()}
          >
            <IconFolder />
            <span>Sample study</span>
          </button>

          <label className={`tb-btn primary${loading ? " is-disabled" : ""}`}>
            <IconUpload />
            <span>Open file</span>
            <input
              type="file"
              accept=".nii,.nii.gz,.gz"
              disabled={loading}
              onChange={(event) => pickFile(event, openFile)}
            />
          </label>

          <button
            type="button"
            className="tb-btn theme-toggle"
            title={`Switch to ${theme === "light" ? "Dark PACS" : "Light Workstation"} mode`}
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? <IconMoon /> : <IconSun />}
          </button>
        </div>
      </header>

      {hasStudy ? (
        <div className="control-bar" role="toolbar" aria-label="Viewer controls">
          <div className="cb-group">
            <span className="cb-label">View</span>
            <div className="cb-segmented">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={view === option.id ? "cb-seg-btn active" : "cb-seg-btn"}
                  aria-pressed={view === option.id}
                  disabled={loading}
                  onClick={() => applyView(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cb-divider" />

          <div className="cb-group">
            <button
              type="button"
              className={windowOpen ? "cb-btn active" : "cb-btn"}
              aria-pressed={windowOpen}
              onClick={() => setWindowOpen((v) => !v)}
            >
              <IconSun />
              <span>Window / Level</span>
            </button>

            <button
              type="button"
              className={crosshairsOn ? "cb-btn active" : "cb-btn"}
              aria-pressed={crosshairsOn}
              onClick={toggleCrosshairs}
            >
              <IconCrosshair />
              <span>Crosshair</span>
            </button>
          </div>

          <div className="cb-divider" />

          <div className="cb-group cb-coords">
            <span className="cb-label">Position</span>
            {(["x", "y", "z"] as const).map((axis) => (
              <label key={axis} className="cb-coord-input">
                <span>{axis.toUpperCase()}</span>
                <input
                  type="number"
                  value={coords[axis]}
                  onChange={(e) => jumpToCoord(axis, Number(e.target.value))}
                />
              </label>
            ))}
            <select
              className="cb-select"
              value={coordUnit}
              aria-label="Coordinate units"
              onChange={(e) => switchCoordUnit(e.target.value as CoordUnit)}
            >
              <option value="mm">mm</option>
              <option value="vox">vox</option>
            </select>
          </div>

          <div className="topbar-spacer" />

          <div className="cb-group">
            <div className="cb-zoom">
              <button
                type="button"
                className="cb-btn-icon"
                aria-label="Zoom out"
                onClick={() => applyZoom(zoomPct - 10)}
              >
                −
              </button>
              <button
                type="button"
                className="cb-btn-text"
                aria-label="Reset zoom"
                onClick={() => applyZoom(100)}
              >
                {zoomPct}%
              </button>
              <button
                type="button"
                className="cb-btn-icon"
                aria-label="Zoom in"
                onClick={() => applyZoom(zoomPct + 10)}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="cb-btn-icon"
              aria-label="Fullscreen"
              onClick={() => void toggleFullscreen()}
            >
              <IconExpand />
            </button>
          </div>

          {windowOpen && intensitySpan && displayWindow ? (
            <div className="wl-popover" role="dialog" aria-label="Window / Level presets and range">
              <div className="wl-header">
                <span>Window / Level</span>
                <button
                  type="button"
                  className="wl-close"
                  onClick={() => setWindowOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="wl-presets">
                <button
                  type="button"
                  className="wl-preset-btn"
                  onClick={() => void applyDisplayWindow(intensitySpan.min, intensitySpan.max)}
                >
                  Full range
                </button>
                <button
                  type="button"
                  className="wl-preset-btn"
                  onClick={() => {
                    const span = intensitySpan.max - intensitySpan.min;
                    void applyDisplayWindow(
                      intensitySpan.min + span * 0.15,
                      intensitySpan.min + span * 0.75,
                    );
                  }}
                >
                  Brain
                </button>
                <button
                  type="button"
                  className="wl-preset-btn"
                  onClick={() => {
                    const span = intensitySpan.max - intensitySpan.min;
                    void applyDisplayWindow(
                      intensitySpan.min + span * 0.5,
                      intensitySpan.max,
                    );
                  }}
                >
                  Enhancing
                </button>
              </div>

              <div className="wl-sliders">
                <label className="wl-slider-row">
                  <span className="wl-label">Min</span>
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
                  <span className="wl-val">{Math.round(displayWindow.min)}</span>
                </label>

                <label className="wl-slider-row">
                  <span className="wl-label">Max</span>
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
                  <span className="wl-val">{Math.round(displayWindow.max)}</span>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={panelOpen ? "workspace panel-open" : "workspace"}>
        <main
          ref={stageRef as never}
          className={hasStudy ? "stage has-study" : "stage"}
          aria-label="Volume viewport"
        >
          <canvas ref={canvasRef} aria-hidden={!hasStudy} />

          {loading ? (
            <div className="loading-state" role="status">
              <div className="spinner" />
              <p>Decoding NIfTI volume…</p>
            </div>
          ) : null}

          {!studyName && !loading ? (
            <div className="empty-state">
              <div className="empty-dialog">
                <div className="empty-icon-wrap">
                  <IconFolderLarge />
                </div>
                <h2>No study open</h2>
                <p>Open a NIfTI volume (.nii, .nii.gz) or load the reference sample.</p>
                <div className="empty-actions">
                  <label className="btn primary">
                    <IconUpload />
                    Open file
                    <input
                      type="file"
                      accept=".nii,.nii.gz,.gz"
                      onChange={(event) => pickFile(event, openFile)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void loadDemo()}
                  >
                    Load sample study
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>

        {panelOpen ? (
          <aside className="sidebar" aria-label="Findings inspector">
            <div className="sidebar-header">
              <h3>Findings</h3>
              <span className="sidebar-count">{regions.length} detected</span>
              <button
                type="button"
                className="sidebar-close"
                aria-label="Close panel"
                onClick={() => setPanelOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="sidebar-body">
              {regions.length === 0 ? (
                <div className="sidebar-empty">
                  <p>No segmented regions.</p>
                  <p className="sub">Call <code>find_regions</code> to detect 3D intensity clusters.</p>
                </div>
              ) : (
                <div className="regions-list">
                  {regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      className={focused === region.id ? "region-row focused" : "region-row"}
                      onClick={() => focusRegion(region)}
                    >
                      <div className="region-main">
                        <span className="region-title">Region {region.id}</span>
                        <span className="region-vol">{region.volumeMl.toFixed(2)} mL</span>
                      </div>
                      <div className="region-details">
                        <span>{region.maxExtentMm.toFixed(1)} mm extent</span>
                        <span>μ {region.meanIntensity.toFixed(0)}</span>
                        <span>{region.voxelCount.toLocaleString()} vox</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="sidebar-meta">
                <h4>Study info</h4>
                <dl className="meta-grid">
                  <dt>File</dt>
                  <dd title={studyName ?? ""}>{studyName}</dd>
                  <dt>Dimensions</dt>
                  <dd>{studyMeta?.dims.join(" × ")}</dd>
                  <dt>Spacing</dt>
                  <dd>{studyMeta?.spacing.map((s) => s.toFixed(2)).join(" × ")} mm</dd>
                  <dt>Epoch</dt>
                  <dd>{studyEpoch}</dd>
                  <dt>Layout</dt>
                  <dd>{VIEW_LABEL[view]}</dd>
                  <dt>Backend</dt>
                  <dd>{backend}</dd>
                </dl>
                {loadError ? <p className="load-error">{loadError}</p> : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <footer className="statusbar">
        <div className="sb-group">
          <div className="sb-item">
            <span className="sb-label">POSITION</span>
            <strong className="sb-val">{coords.x}, {coords.y}, {coords.z} {coordUnit}</strong>
          </div>
          {intensitySpan ? (
            <div className="sb-item">
              <span className="sb-label">RANGE</span>
              <strong className="sb-val">{Math.round(intensitySpan.min)} → {Math.round(intensitySpan.max)}</strong>
            </div>
          ) : null}
        </div>

        <div className="topbar-spacer" />

        <div className="sb-agent-pill" title="Autonomous AI agents can directly invoke WebMCP tools on this page">
          <span className="sb-agent-dot" aria-hidden="true" />
          <span>Faraday supports agents natively with WebMCP</span>
        </div>

        <div className="topbar-spacer" />

        <div className="sb-group">
          <div className="sb-item">
            <span className="sb-label">ACCELERATION</span>
            <strong className="sb-val sb-backend">{backend.toUpperCase()}</strong>
          </div>
          <div className="sb-item sb-pill">
            <span>Zero Egress · In-tab compute</span>
          </div>
        </div>
      </footer>

      <FaradayTools controller={controller} />
      <ConfirmDialog studyEpoch={studyEpoch} />
    </div>
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
        <h2 id="confirm-title">Approve tool execution</h2>
        <p className="sheet-msg">
          The agent requested to run <strong>“{pending.tool}”</strong>.
          Measurement summary will be exported. Volumetric voxels stay in this tab.
        </p>
        <pre>{JSON.stringify(pending.args, null, 2)}</pre>
        <div className="sheet-actions">
          <button type="button" className="btn secondary" onClick={() => pending.reject()}>
            Decline
          </button>
          <button type="button" className="btn primary" onClick={() => pending.approve()}>
            Approve export
          </button>
        </div>
      </div>
    </div>
  );
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconFolderLarge() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconTags() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12V5.5A1.5 1.5 0 0 1 4.5 4H12l8 8-7.5 7.5L3 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCrosshair() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
