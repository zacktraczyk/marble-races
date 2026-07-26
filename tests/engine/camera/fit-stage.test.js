import { describe, expect, test } from "bun:test";
import { calculateCameraFit } from "@engine/camera/fit";

describe("camera fit layout", () => {
  test("uses the largest scale that fits between floating controls", () => {
    const fit = calculateCameraFit({
      viewportWidth: 1680,
      viewportHeight: 1026,
      contentWidth: 1440,
      contentHeight: 810,
      insets: { top: 94, right: 12, bottom: 70, left: 12 },
    });

    expect(fit.zoom).toBeCloseTo(862 / 810);
    expect(fit.position).toEqual([840, 525]);
  });

  test("honors only the side margins when horizontal space is tighter", () => {
    const fit = calculateCameraFit({
      viewportWidth: 1000,
      viewportHeight: 1000,
      contentWidth: 1440,
      contentHeight: 810,
      insets: { top: 94, right: 12, bottom: 70, left: 12 },
    });

    expect(fit.zoom).toBeCloseTo(976 / 1440);
    expect(fit.position).toEqual([500, 512]);
  });

  test("centers vertically inside asymmetric toolbar insets", () => {
    const fit = calculateCameraFit({
      viewportWidth: 1680,
      viewportHeight: 700,
      contentWidth: 1440,
      contentHeight: 810,
      insets: { top: 70, right: 12, bottom: 60, left: 12 },
    });

    expect(fit.zoom).toBeCloseTo(570 / 810);
    expect(fit.position).toEqual([840, 355]);
  });
});
