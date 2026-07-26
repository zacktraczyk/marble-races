import { describe, expect, test } from "bun:test";
import {
  calculateCameraFit,
  calculateCameraFitForRect,
  visibleVerticalFraction,
} from "@engine/camera/fit";

describe("camera fit for rect", () => {
  test("matches the origin-centered fit when the rect is at the origin", () => {
    const viewport = { viewportWidth: 800, viewportHeight: 600 };
    const rect = { center: [0, 0], width: 200, height: 100 };

    const rectFit = calculateCameraFitForRect({ ...viewport, rect });
    const originFit = calculateCameraFit({
      ...viewport,
      contentWidth: rect.width,
      contentHeight: rect.height,
    });

    expect(rectFit.zoom).toBe(originFit.zoom);
    expect(rectFit.position).toEqual(originFit.position);
  });

  test("shifts position by -center * zoom for an off-center rect", () => {
    const viewport = { viewportWidth: 800, viewportHeight: 600 };
    const rect = { center: [40, 90], width: 200, height: 100 };

    const fit = calculateCameraFitForRect({ ...viewport, rect });
    const origin = calculateCameraFit({
      ...viewport,
      contentWidth: rect.width,
      contentHeight: rect.height,
    });

    expect(fit.zoom).toBe(origin.zoom);
    expect(fit.position[0]).toBe(origin.position[0] - 40 * fit.zoom);
    expect(fit.position[1]).toBe(origin.position[1] - 90 * fit.zoom);
  });

  test("places the rect center at the viewport center", () => {
    const viewportWidth = 800;
    const viewportHeight = 600;
    const rect = { center: [40, 90], width: 200, height: 100 };

    const { zoom, position } = calculateCameraFitForRect({
      viewportWidth,
      viewportHeight,
      rect,
    });

    // Camera2D maps world -> screen as world * zoom + position.
    const screenX = rect.center[0] * zoom + position[0];
    const screenY = rect.center[1] * zoom + position[1];
    expect(screenX).toBeCloseTo(viewportWidth / 2);
    expect(screenY).toBeCloseTo(viewportHeight / 2);
  });
});

describe("visible vertical fraction", () => {
  // viewTop = -50, viewBottom = 50 in world space.
  const camera = { position: [0, 50], zoom: 1 };
  const viewportHeight = 100;

  test("returns 1 when the rect is fully inside the viewport", () => {
    const rect = { center: [0, 0], width: 10, height: 20 };

    expect(visibleVerticalFraction(camera, viewportHeight, rect)).toBe(1);
  });

  test("returns a partial fraction when the rect straddles an edge", () => {
    const rect = { center: [50, 50], width: 10, height: 20 };

    expect(visibleVerticalFraction(camera, viewportHeight, rect)).toBeCloseTo(
      0.5
    );
  });

  test("returns 0 when the rect is entirely off-screen", () => {
    const rect = { center: [0, 200], width: 10, height: 20 };

    expect(visibleVerticalFraction(camera, viewportHeight, rect)).toBe(0);
  });

  test("returns 0 for a degenerate rect", () => {
    const rect = { center: [0, 0], width: 10, height: 0 };

    expect(visibleVerticalFraction(camera, viewportHeight, rect)).toBe(0);
  });
});
