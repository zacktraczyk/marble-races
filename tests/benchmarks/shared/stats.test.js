import { describe, expect, test } from "bun:test";
import {
  bootstrapMedianConfidenceInterval,
  comparePaired,
  signFlipPValue,
  summarize,
} from "../../../benchmarks/shared/stats.ts";
import { createBalancedPairOrder } from "../../../benchmarks/shared/sequence.ts";

describe("benchmark statistics", () => {
  test("summarizes a distribution without mutating it", () => {
    const values = [4, 1, 3, 2];
    const summary = summarize(values);

    expect(values).toEqual([4, 1, 3, 2]);
    expect(summary).toMatchObject({
      count: 4,
      min: 1,
      max: 4,
      mean: 2.5,
      p50: 2.5,
    });
    expect(summary.p95).toBeCloseTo(3.85);
  });

  test("creates a deterministic bootstrap interval", () => {
    const first = bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], {
      samples: 500,
      seed: 7,
    });
    const second = bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], {
      samples: 500,
      seed: 7,
    });

    expect(first).toEqual(second);
    expect(first[0]).toBeLessThanOrEqual(3);
    expect(first[1]).toBeGreaterThanOrEqual(3);
  });

  test("uses an exact sign-flip test for small paired samples", () => {
    expect(signFlipPValue([-1, -1, -1, -1])).toBe(0.125);
    expect(signFlipPValue([0, 0])).toBe(1);
  });

  test("verifies a large consistent lower-is-better improvement", () => {
    const baseline = Array.from({ length: 10 }, (_, index) => 10 + index);
    const candidate = baseline.map((value) => value * 0.8);
    const comparison = comparePaired(baseline, candidate, {
      bootstrapSamples: 1_000,
      seed: 2,
    });

    expect(comparison.verdict).toBe("verified");
    expect(comparison.medianRelativeChange).toBeCloseTo(-0.2);
    expect(comparison.candidateWins).toBe(10);
    expect(comparison.signFlipPValue).toBeLessThan(0.05);
  });

  test("leaves small noisy changes inconclusive", () => {
    const comparison = comparePaired(
      [10, 10, 10, 10, 10, 10],
      [9.9, 10.1, 9.8, 10.2, 10, 10],
      { bootstrapSamples: 500 }
    );
    expect(comparison.verdict).toBe("inconclusive");
  });
});

describe("balanced pair ordering", () => {
  test("balances every complete block of two and is reproducible", () => {
    const first = createBalancedPairOrder(10, 123, "basic", "instanced");
    const second = createBalancedPairOrder(10, 123, "basic", "instanced");

    expect(first).toEqual(second);
    for (let index = 0; index < first.length; index += 2) {
      expect(first[index].order).toEqual([...first[index + 1].order].reverse());
    }
  });
});
