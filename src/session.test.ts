import { describe, expect, test } from "bun:test";
import { StudyGate, createExclusiveQueue } from "./session";

describe("StudyGate", () => {
  test("later load supersedes an earlier one", () => {
    const gate = new StudyGate();
    const a = gate.beginLoad();
    const b = gate.beginLoad();
    expect(gate.commit(a)).toBe(false);
    expect(gate.loading).toBe(true);
    expect(gate.commit(b)).toBe(true);
    expect(gate.loading).toBe(false);
    expect(gate.isCurrent(b)).toBe(true);
    expect(gate.isCurrent(a)).toBe(false);
  });

  test("fail only clears loading for the current gen", () => {
    const gate = new StudyGate();
    const a = gate.beginLoad();
    gate.beginLoad();
    gate.fail(a);
    expect(gate.loading).toBe(true);
  });
});

describe("createExclusiveQueue", () => {
  test("runs tasks in order even when started together", async () => {
    const run = createExclusiveQueue();
    const order: number[] = [];
    const a = run(async () => {
      await Bun.sleep(20);
      order.push(1);
      return 1;
    });
    const b = run(async () => {
      order.push(2);
      return 2;
    });
    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(order).toEqual([1, 2]);
  });

  test("a rejected task does not block the next", async () => {
    const run = createExclusiveQueue();
    const failed = run(() => Promise.reject(new Error("boom")));
    const ok = run(() => 7);
    await expect(failed).rejects.toThrow("boom");
    expect(await ok).toBe(7);
  });
});
