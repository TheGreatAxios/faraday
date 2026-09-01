import { NiiVue, SLICE_TYPE } from "@niivue/niivue";
import {
  WebMCPProvider,
  // JSX treats a lowercase-initial tag as an intrinsic HTML element, so the
  // experimental_* exports have to be aliased to uppercase to be usable here.
  experimental_WebMCPConfirmProvider as WebMCPConfirmProvider,
  experimental_useWebMCPConfirm,
  useWebMCP,
} from "@thegreataxios/webmcp-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Region } from "./regions";
import { FaradayTools, type ReadingRoomController, type ViewName } from "./tools";
import { readVolume, type NiiVueLike, type VolumeSnapshot } from "./viewer";

const SLICE_TYPES: Record<ViewName, number> = {
  axial: SLICE_TYPE.AXIAL,
  coronal: SLICE_TYPE.CORONAL,
  sagittal: SLICE_TYPE.SAGITTAL,
  multiplanar: SLICE_TYPE.MULTIPLANAR,
  render: SLICE_TYPE.RENDER,
};

function ReadingRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<InstanceType<typeof NiiVue> | null>(null);
  const snapshotRef = useRef<VolumeSnapshot | null>(null);
  const regionsRef = useRef<Region[]>([]);

  const [studyName, setStudyName] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>("multiplanar");
  const { available, native } = useWebMCP();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const nv = new NiiVue();
    nvRef.current = nv;
    void nv.attachToCanvas(canvas);

    return () => {
      nvRef.current = null;
    };
  }, []);

  const openFile = useCallback(async (file: File) => {
    const nv = nvRef.current;
    if (!nv) return;

    // A blob URL keeps the volume in this tab; nothing is uploaded. niivue
    // needs the real filename so it can pick the right decoder.
    const url = URL.createObjectURL(file);
    try {
      await nv.loadVolumes([{ url, name: file.name }]);
      snapshotRef.current = readVolume(nv as unknown as NiiVueLike);
      regionsRef.current = [];
      setRegions([]);
      setFocused(null);
      setStudyName(snapshotRef.current?.name ?? file.name);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const controller: ReadingRoomController = {
    snapshot: () => snapshotRef.current,
    regions: () => regionsRef.current,
    setRegions: (next) => {
      regionsRef.current = next;
      setRegions(next);
      setFocused(null);
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
          <span className={available ? "pill live" : "pill"}>
            {available ? (native ? "WebMCP (native)" : "WebMCP (polyfill)") : "WebMCP unavailable"}
          </span>
        </div>

        <div className="section">
          <h2>Study</h2>
          <label className="file">
            {studyName ? "Open another volume" : "Open a NIfTI volume"}
            <input
              type="file"
              accept=".nii,.nii.gz,.gz"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openFile(file);
              }}
            />
          </label>
          {studyName ? <p className="meta">{studyName}</p> : null}
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
          <button onClick={() => pending.reject()}>Decline</button>
          <button onClick={() => pending.approve()}>Approve</button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <WebMCPProvider name="faraday" version="0.1.0">
      <WebMCPConfirmProvider>
        <ReadingRoom />
      </WebMCPConfirmProvider>
    </WebMCPProvider>
  );
}
