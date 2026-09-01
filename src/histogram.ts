/**
 * Intensity histogram over a scalar volume.
 *
 * Prefers a WebGPU compute pass when navigator.gpu is available; falls back to
 * a typed-array scan. Either path keeps every voxel in-tab — only the bin
 * counts leave the function.
 */

export interface HistogramResult {
  bins: Uint32Array;
  min: number;
  max: number;
  binWidth: number;
  backend: "webgpu" | "cpu";
}

export interface IntensityWindowHint {
  /** Suggested lower bound for find_regions. */
  min: number;
  /** Suggested upper bound for find_regions. */
  max: number;
  /** How this window was chosen (for agent-facing copy). */
  reason: string;
}

const DEFAULT_BINS = 256;

export function histogramCpu(
  data: ArrayLike<number>,
  binCount = DEFAULT_BINS,
  range?: { min: number; max: number },
): HistogramResult {
  let min = range?.min ?? Infinity;
  let max = range?.max ?? -Infinity;
  if (!range) {
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i] as number;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const bins = new Uint32Array(binCount);
    if (data.length > 0) bins[0] = data.length;
    return { bins, min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0, binWidth: 0, backend: "cpu" };
  }

  const binWidth = (max - min) / binCount;
  const bins = new Uint32Array(binCount);
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i] as number;
    let index = Math.floor((value - min) / binWidth);
    if (index < 0) index = 0;
    if (index >= binCount) index = binCount - 1;
    bins[index]! += 1;
  }
  return { bins, min, max, binWidth, backend: "cpu" };
}

/**
 * WebGPU histogram. One workgroup per 256 voxels, atomicAdd into a storage
 * buffer of bin counts. Falls back to CPU if adapter/device init fails.
 *
 * ponytail: float→bin mapping runs in the shader with a fixed min/max passed as
 * uniforms; if you need adaptive range, compute min/max on CPU first (cheap
 * reduction) then dispatch. Upgrade path: a two-pass min/max + histogram
 * pipeline that never reads the volume back to JS.
 */
export async function histogramWebGpu(
  data: Float32Array,
  binCount = DEFAULT_BINS,
  range?: { min: number; max: number },
): Promise<HistogramResult> {
  if (!navigator.gpu) return histogramCpu(data, binCount, range);

  let min = range?.min ?? Infinity;
  let max = range?.max ?? -Infinity;
  if (!range) {
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i]!;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return histogramCpu(data, binCount, { min, max });
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return histogramCpu(data, binCount, { min, max });
    const device = await adapter.requestDevice();

    const binWidth = (max - min) / binCount;
    // Pad to 4-byte alignment for storage buffer copy.
    const voxelCount = data.length;
    const values = new Float32Array(voxelCount);
    values.set(data);

    const valueBuffer = device.createBuffer({
      size: values.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(valueBuffer, 0, values);

    const histBuffer = device.createBuffer({
      size: binCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    // Zero the histogram.
    device.queue.writeBuffer(histBuffer, 0, new Uint32Array(binCount));

    const params = new Float32Array([min, binWidth, binCount, voxelCount]);
    const paramBuffer = device.createBuffer({
      size: params.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramBuffer, 0, params);

    const shader = device.createShaderModule({
      code: /* wgsl */ `
struct Params {
  min_v: f32,
  bin_width: f32,
  bin_count: f32,
  voxel_count: f32,
}

@group(0) @binding(0) var<storage, read> values: array<f32>;
@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.voxel_count)) { return; }
  let v = values[i];
  var bin = i32(floor((v - params.min_v) / params.bin_width));
  let last = i32(params.bin_count) - 1;
  if (bin < 0) { bin = 0; }
  if (bin > last) { bin = last; }
  atomicAdd(&hist[u32(bin)], 1u);
}
`,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shader, entryPoint: "main" },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: valueBuffer } },
        { binding: 1, resource: { buffer: histBuffer } },
        { binding: 2, resource: { buffer: paramBuffer } },
      ],
    });

    const readBuffer = device.createBuffer({
      size: binCount * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(voxelCount / 256));
    pass.end();
    encoder.copyBufferToBuffer(histBuffer, 0, readBuffer, 0, binCount * 4);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const bins = new Uint32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    device.destroy();

    return { bins, min, max, binWidth, backend: "webgpu" };
  } catch {
    return histogramCpu(data, binCount, { min, max });
  }
}

/**
 * Suggest an intensity window for lesion-hunting: skip the giant near-zero
 * background peak (air/skull-stripped empty), then take the upper tail of the
 * remaining mass. Rough heuristic — good enough for agent bootstrapping.
 */
export function suggestBrightWindow(hist: HistogramResult): IntensityWindowHint {
  const { bins, min, binWidth } = hist;
  if (binWidth === 0) {
    return { min, max: hist.max, reason: "degenerate intensity range; using full span" };
  }

  // Find the mode; treat bins within 5% of it as "background".
  let mode = 0;
  for (let i = 1; i < bins.length; i += 1) {
    if ((bins[i] ?? 0) > (bins[mode] ?? 0)) mode = i;
  }
  const backgroundCutoff = mode + Math.max(2, Math.floor(bins.length * 0.05));

  let total = 0;
  for (let i = backgroundCutoff; i < bins.length; i += 1) total += bins[i] ?? 0;
  if (total === 0) {
    return {
      min: Math.round((min + binWidth * backgroundCutoff) * 10) / 10,
      max: Math.round(hist.max * 10) / 10,
      reason: "no bright tail above background; using everything above the mode",
    };
  }

  // Upper ~5% of non-background mass — tighter than 20% so contrast-
  // enhancing lesions on T1-Gd don't dissolve into "the whole brain".
  const target = total * 0.05;
  let acc = 0;
  let start = bins.length - 1;
  for (let i = bins.length - 1; i >= backgroundCutoff; i -= 1) {
    acc += bins[i] ?? 0;
    start = i;
    if (acc >= target) break;
  }

  const suggestedMin = min + binWidth * start;
  return {
    min: Math.round(suggestedMin * 10) / 10,
    max: Math.round(hist.max * 10) / 10,
    reason: `upper ~5% of intensities above the background mode (bin ${mode})`,
  };
}
