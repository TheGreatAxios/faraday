import { expect, test } from "bun:test";
import { findRegions, type VolumeMeta } from "./regions";

const DIMS: [number, number, number] = [20, 20, 20];
const meta: VolumeMeta = { dims: DIMS, spacing: [2, 2, 2] };

function emptyVolume() {
  return new Float32Array(DIMS[0] * DIMS[1] * DIMS[2]);
}

function at(x: number, y: number, z: number) {
  return x + y * DIMS[0] + z * DIMS[0] * DIMS[1];
}

/** Fill an axis-aligned box, inclusive of both corners. */
function fillBox(
  volume: Float32Array,
  from: [number, number, number],
  to: [number, number, number],
  value: number,
) {
  for (let z = from[2]; z <= to[2]; z += 1) {
    for (let y = from[1]; y <= to[1]; y += 1) {
      for (let x = from[0]; x <= to[0]; x += 1) {
        volume[at(x, y, z)] = value;
      }
    }
  }
}

test("separates two disconnected blobs and ranks them by size", () => {
  const volume = emptyVolume();
  fillBox(volume, [2, 2, 2], [5, 5, 5], 100); // 4x4x4 = 64 voxels
  fillBox(volume, [12, 12, 12], [13, 13, 13], 100); // 2x2x2 = 8 voxels

  const regions = findRegions(volume, meta, { min: 50, max: 150 });

  expect(regions.length).toBe(2);
  expect(regions[0]!.voxelCount).toBe(64);
  expect(regions[1]!.voxelCount).toBe(8);
  expect(regions[0]!.id).toBe(1);
});

test("reports volume and extent in physical units, not voxels", () => {
  const volume = emptyVolume();
  fillBox(volume, [2, 2, 2], [5, 5, 5], 100);

  const region = findRegions(volume, meta, { min: 50, max: 150 })[0]!;

  // 64 voxels x (2mm)^3 = 512 mm^3 = 0.512 mL
  expect(region.volumeMl).toBeCloseTo(0.512, 6);
  // 4 voxels across x 2mm spacing
  expect(region.boundingBoxMm).toEqual([8, 8, 8]);
  expect(region.maxExtentMm).toBe(8);
  expect(region.centroid).toEqual([3.5, 3.5, 3.5]);
  expect(region.meanIntensity).toBeCloseTo(100, 6);
});

test("touching blobs are one component, not two", () => {
  const volume = emptyVolume();
  fillBox(volume, [2, 2, 2], [3, 3, 3], 100);
  fillBox(volume, [4, 2, 2], [5, 3, 3], 100); // face-adjacent to the first

  const regions = findRegions(volume, meta, { min: 50, max: 150 });

  expect(regions.length).toBe(1);
  expect(regions[0]!.voxelCount).toBe(16);
});

test("intensity window excludes voxels outside the range", () => {
  const volume = emptyVolume();
  fillBox(volume, [2, 2, 2], [5, 5, 5], 100);
  fillBox(volume, [12, 12, 12], [13, 13, 13], 900); // too bright

  const regions = findRegions(volume, meta, { min: 50, max: 150 });

  expect(regions.length).toBe(1);
  expect(regions[0]!.voxelCount).toBe(64);
});

test("minVoxels discards specks", () => {
  const volume = emptyVolume();
  fillBox(volume, [2, 2, 2], [5, 5, 5], 100);
  volume[at(15, 15, 15)] = 100; // single-voxel speck

  const all = findRegions(volume, meta, { min: 50, max: 150 });
  const filtered = findRegions(volume, meta, { min: 50, max: 150, minVoxels: 2 });

  expect(all.length).toBe(2);
  expect(filtered.length).toBe(1);
});

test("rejects a dims/data mismatch instead of reading past the end", () => {
  const volume = new Float32Array(10);
  expect(() => findRegions(volume, meta, { min: 0, max: 1 })).toThrow(/dims imply/);
});

test("rejects an inverted intensity window", () => {
  expect(() => findRegions(emptyVolume(), meta, { min: 200, max: 100 })).toThrow(
    /empty intensity window/,
  );
});
