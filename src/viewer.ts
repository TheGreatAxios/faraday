import { getImageDataRAS } from "@niivue/niivue";
import type { VolumeMeta } from "./regions";

/**
 * Minimal structural view of the niivue volume fields we actually read.
 * Declaring our own keeps an @niivue/niivue release-candidate bump from
 * breaking the build over types we never touch.
 */
export interface NiiVueLikeVolume {
  name?: string;
  hdr?: {
    dims?: number[];
    pixDims?: number[];
    scl_slope?: number;
    scl_inter?: number;
  } | null;
}

export interface NiiVueLike {
  volumes: NiiVueLikeVolume[];
}

export interface VolumeSnapshot {
  name: string;
  meta: VolumeMeta;
  /**
   * Intensities with the NIfTI scaling applied, so CT values are true
   * Hounsfield units. Held in this tab only — never serialised to a tool result.
   */
  data: Float32Array;
}

/**
 * Read the loaded volume into plain scaled intensities.
 *
 * getImageDataRAS returns *raw* stored values, so scl_slope/scl_inter have to
 * be applied here. Skipping this silently shifts every intensity window: a CT
 * lung threshold of -500 HU would select nothing.
 */
export function readVolume(nv: NiiVueLike, index = 0): VolumeSnapshot | null {
  const volume = nv.volumes[index];
  if (!volume) return null;

  const raw = getImageDataRAS(volume as never);
  if (!raw) return null;

  const dims = volume.hdr?.dims;
  const pixDims = volume.hdr?.pixDims;
  if (!dims || !pixDims) return null;

  // NIfTI headers are 1-indexed: dims[1..3] are the spatial extents.
  const meta: VolumeMeta = {
    dims: [dims[1] ?? 0, dims[2] ?? 0, dims[3] ?? 0],
    spacing: [pixDims[1] ?? 1, pixDims[2] ?? 1, pixDims[3] ?? 1],
  };
  if (meta.dims.some((d) => d <= 0)) return null;

  const inter = volume.hdr?.scl_inter ?? 0;
  const rawSlope = volume.hdr?.scl_slope ?? 1;
  // Per the NIfTI spec a slope of 0 means "no scaling", not "flatten to zero".
  const slope = rawSlope === 0 ? 1 : rawSlope;

  const data =
    slope === 1 && inter === 0
      ? raw
      : raw.map((value) => value * slope + inter);

  return { name: volume.name ?? `volume ${index}`, meta, data };
}

/** Convert voxel indices to millimetres from the volume corner. */
export function voxelToMm(
  voxel: readonly [number, number, number],
  meta: VolumeMeta,
): [number, number, number] {
  return [
    voxel[0] * meta.spacing[0],
    voxel[1] * meta.spacing[1],
    voxel[2] * meta.spacing[2],
  ];
}
