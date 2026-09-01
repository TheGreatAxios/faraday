/**
 * Region finding over a scalar volume.
 *
 * This is the compute the agent triggers but never observes: it passes an
 * intensity window, and gets back measurements. Voxels never leave the tab.
 */

export interface VolumeMeta {
  /** Voxel counts along x, y, z. */
  dims: [number, number, number];
  /** Millimetres per voxel along x, y, z. */
  spacing: [number, number, number];
}

export interface Region {
  id: number;
  voxelCount: number;
  volumeMl: number;
  /** Centre of mass in voxel coordinates. */
  centroid: [number, number, number];
  /** Inclusive voxel-space bounding box. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** Bounding box side lengths in mm. */
  boundingBoxMm: [number, number, number];
  /**
   * Longest bounding box side in mm. This is an axis-aligned extent, NOT a
   * caliper diameter — an oblique lesion measures larger by caliper than this
   * reports. Never label this "diameter" in agent-facing output.
   */
  maxExtentMm: number;
  meanIntensity: number;
}

export interface FindRegionsOptions {
  /** Inclusive lower bound on voxel intensity. */
  min: number;
  /** Inclusive upper bound on voxel intensity. */
  max: number;
  /** Discard components smaller than this many voxels. Defaults to 1. */
  minVoxels?: number;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Label 6-connected components whose intensity falls inside [min, max],
 * returning one measurement record per component, largest first.
 *
 * ponytail: single-threaded flood fill over the full grid — roughly 40ms on a
 * 240x240x155 volume, which is fine interactively. If it becomes the
 * bottleneck, the upgrade path is a WebGPU label-propagation pass rather than
 * a faster CPU traversal.
 */
export function findRegions(
  data: ArrayLike<number>,
  meta: VolumeMeta,
  options: FindRegionsOptions,
): Region[] {
  const [nx, ny, nz] = meta.dims;
  const expected = nx * ny * nz;
  if (data.length !== expected) {
    throw new Error(`volume has ${data.length} voxels, dims imply ${expected}`);
  }

  const { min, max } = options;
  if (min > max) throw new Error(`empty intensity window: min ${min} > max ${max}`);
  const minVoxels = options.minVoxels ?? 1;

  const [sx, sy, sz] = meta.spacing;
  const mlPerVoxel = (sx * sy * sz) / 1000;

  const labels = new Int32Array(expected);
  const stack: number[] = [];
  const regions: Region[] = [];

  // Every index is bounds-checked before it reaches here, so the read is safe.
  const valueAt = (index: number) => data[index] as number;
  const inWindow = (index: number) => {
    const value = valueAt(index);
    return value >= min && value <= max;
  };

  for (let seed = 0; seed < expected; seed += 1) {
    if (labels[seed] !== 0 || !inWindow(seed)) continue;

    const id = regions.length + 1;
    labels[seed] = id;
    stack.push(seed);

    let voxelCount = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let sumIntensity = 0;
    let minX = nx;
    let minY = ny;
    let minZ = nz;
    let maxX = -1;
    let maxY = -1;
    let maxZ = -1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % nx;
      const y = ((index - x) / nx) % ny;
      const z = Math.floor(index / (nx * ny));

      voxelCount += 1;
      sumX += x;
      sumY += y;
      sumZ += z;
      sumIntensity += valueAt(index);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;

      for (const [dx, dy, dz] of NEIGHBOURS) {
        const cx = x + dx;
        const cy = y + dy;
        const cz = z + dz;
        if (cx < 0 || cx >= nx || cy < 0 || cy >= ny || cz < 0 || cz >= nz) continue;
        const neighbour = cx + cy * nx + cz * nx * ny;
        if (labels[neighbour] !== 0 || !inWindow(neighbour)) continue;
        labels[neighbour] = id;
        stack.push(neighbour);
      }
    }

    if (voxelCount < minVoxels) continue;

    const boundingBoxMm: [number, number, number] = [
      (maxX - minX + 1) * sx,
      (maxY - minY + 1) * sy,
      (maxZ - minZ + 1) * sz,
    ];

    regions.push({
      id,
      voxelCount,
      volumeMl: voxelCount * mlPerVoxel,
      centroid: [sumX / voxelCount, sumY / voxelCount, sumZ / voxelCount],
      bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      boundingBoxMm,
      maxExtentMm: Math.max(...boundingBoxMm),
      meanIntensity: sumIntensity / voxelCount,
    });
  }

  regions.sort((a, b) => b.voxelCount - a.voxelCount);
  return regions.map((region, rank) => ({ ...region, id: rank + 1 }));
}
