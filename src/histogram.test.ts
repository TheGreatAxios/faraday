import { describe, expect, test } from "bun:test";
import { histogramCpu, suggestBrightWindow } from "./histogram";

describe("suggestBrightWindow", () => {
  test("picks the bright tail, not mid-grey mass", () => {
    // 10k dark + 100 bright — upper 0.05% of 10100 is ~5, so the cut sits in the bright bins.
    const data = new Float32Array(10_100);
    for (let i = 0; i < 10_000; i += 1) data[i] = 100;
    for (let i = 10_000; i < 10_100; i += 1) data[i] = 900 + (i % 50);
    const hist = histogramCpu(data);
    const hint = suggestBrightWindow(hist);
    expect(hint.min).toBeGreaterThan(500);
    expect(hint.max).toBeGreaterThanOrEqual(hint.min);
  });

  test("degenerate range stays usable", () => {
    const hist = histogramCpu(new Float32Array(8).fill(42));
    const hint = suggestBrightWindow(hist);
    expect(hint.min).toBe(42);
    expect(hint.max).toBe(42);
  });
});
