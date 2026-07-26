import { describe, expect, test } from "bun:test";
import { Camera2D } from "@engine/camera/camera2d";
import { calculateCameraFitForRect } from "@engine/camera/fit";
import {
  GLIDE_MAX_DURATION_MS,
  GLIDE_MIN_DURATION_MS,
  GLIDE_MS_PER_WORLD_UNIT,
  RaceCameraController,
} from "@scenes/race-player/raceCamera";

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// When the camera is idle it frames the active rect exactly, so a glide's
// scroll distance equals the distance between the two rect centers.
const expectedGlideDuration = (from, to) => {
  const distance = Math.hypot(
    to.center[0] - from.center[0],
    to.center[1] - from.center[1]
  );
  return Math.min(
    GLIDE_MAX_DURATION_MS,
    Math.max(GLIDE_MIN_DURATION_MS, distance * GLIDE_MS_PER_WORLD_UNIT)
  );
};

const makeCanvas = (clientWidth, clientHeight) => ({
  clientWidth,
  clientHeight,
});

const legRect = (centerY) => ({
  center: [0, centerY],
  width: 480,
  height: 810,
});

const fitFor = (canvas, rect, insets = NO_INSETS) =>
  calculateCameraFitForRect({
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight,
    rect,
    insets,
  });

const pose = (camera) => ({
  position: [camera.position[0], camera.position[1]],
  zoom: camera.zoom,
});

describe("RaceCameraController", () => {
  test("snapTo applies the active rect's fit immediately", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    const rect = legRect(0);
    controller.snapTo(rect);

    const expected = fitFor(canvas, rect);
    expect(camera.zoom).toBeCloseTo(expected.zoom);
    expect(camera.position[0]).toBeCloseTo(expected.position[0]);
    expect(camera.position[1]).toBeCloseTo(expected.position[1]);
    expect(controller.gliding).toBe(false);
  });

  test("idle update refits after the canvas size changes", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    const rect = legRect(400);
    controller.snapTo(rect);

    // Resize the viewport; an idle update must snap to the fresh fit.
    canvas.clientWidth = 1200;
    canvas.clientHeight = 400;
    controller.update(16);

    const expected = fitFor(canvas, rect);
    expect(camera.zoom).toBeCloseTo(expected.zoom);
    expect(camera.position[0]).toBeCloseTo(expected.position[0]);
    expect(camera.position[1]).toBeCloseTo(expected.position[1]);
  });

  test("glideTo eases monotonically toward the target and lands exactly on it", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    controller.snapTo(legRect(0));
    const target = legRect(810);
    controller.glideTo(target);
    expect(controller.gliding).toBe(true);

    const targetFit = fitFor(canvas, target);
    let previousY = camera.position[1];
    let steps = 0;
    // Position y should move monotonically downward toward the target.
    while (controller.gliding && steps < 1000) {
      controller.update(16);
      steps += 1;
      // camera.position[1] decreases as the framed content moves down
      // (framing a larger world Y shifts the origin's screen y upward).
      expect(camera.position[1]).toBeLessThanOrEqual(previousY + 1e-9);
      previousY = camera.position[1];
    }

    expect(controller.gliding).toBe(false);
    expect(camera.zoom).toBeCloseTo(targetFit.zoom);
    expect(camera.position[0]).toBeCloseTo(targetFit.position[0]);
    expect(camera.position[1]).toBeCloseTo(targetFit.position[1]);
  });

  test("zoom interpolates in log space (geometric mean at t'=0.5)", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    // Two legs of different widths -> different fit zooms.
    const from = { center: [0, 0], width: 480, height: 810 };
    const to = { center: [0, 810], width: 960, height: 810 };
    controller.snapTo(from);
    const startZoom = camera.zoom;
    controller.glideTo(to);
    const endZoom = fitFor(canvas, to).zoom;

    // Advance to exactly the glide midpoint. smoothstep(0.5) = 0.5, so eased
    // t is 0.5 and zoom should be the geometric mean of the endpoints.
    const half = expectedGlideDuration(from, to) / 2;
    controller.update(half);

    expect(camera.zoom).toBeCloseTo(Math.sqrt(startZoom * endZoom));
  });

  test("completeGlide jump-cuts to the target and ends the glide", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    controller.snapTo(legRect(0));
    const target = legRect(810);
    controller.glideTo(target);
    controller.update(16);
    expect(controller.gliding).toBe(true);

    controller.completeGlide();

    const targetFit = fitFor(canvas, target);
    expect(controller.gliding).toBe(false);
    expect(camera.zoom).toBeCloseTo(targetFit.zoom);
    expect(camera.position[1]).toBeCloseTo(targetFit.position[1]);
  });

  test("advance:false freezes progress but still tracks a canvas resize", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    controller.snapTo(legRect(0));
    const target = legRect(810);
    controller.glideTo(target);

    // Advance partway.
    controller.update(300);
    const frozen = pose(camera);
    expect(controller.gliding).toBe(true);

    // Paused updates must not advance progress: at the same viewport the pose
    // is identical no matter how many frozen frames pass.
    controller.update(300, { advance: false });
    controller.update(300, { advance: false });
    expect(camera.position[1]).toBeCloseTo(frozen.position[1]);
    expect(camera.zoom).toBeCloseTo(frozen.zoom);
    expect(controller.gliding).toBe(true);

    // ...but a resize while paused must still be tracked (re-evaluated pose).
    canvas.clientWidth = 1200;
    canvas.clientHeight = 400;
    controller.update(300, { advance: false });
    expect(camera.zoom).not.toBeCloseTo(frozen.zoom);
    expect(controller.gliding).toBe(true);
  });

  test("gliding flag lifecycle", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    expect(controller.gliding).toBe(false);
    controller.snapTo(legRect(0));
    expect(controller.gliding).toBe(false);

    controller.glideTo(legRect(810));
    expect(controller.gliding).toBe(true);

    controller.update(GLIDE_MAX_DURATION_MS + 100);
    expect(controller.gliding).toBe(false);
  });

  test("glide duration is clamped to the configured range", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    // A tiny scroll clamps to the minimum duration: advancing by just under
    // the minimum leaves the glide unfinished.
    controller.snapTo(legRect(0));
    controller.glideTo({ center: [0, 1], width: 480, height: 810 });
    controller.update(GLIDE_MIN_DURATION_MS - 1);
    expect(controller.gliding).toBe(true);
    controller.update(1);
    expect(controller.gliding).toBe(false);

    // A huge scroll clamps to the maximum duration: advancing by just under
    // the maximum leaves the glide unfinished.
    controller.snapTo(legRect(0));
    controller.glideTo({ center: [0, 100000], width: 480, height: 810 });
    controller.update(GLIDE_MAX_DURATION_MS - 1);
    expect(controller.gliding).toBe(true);
    controller.update(1);
    expect(controller.gliding).toBe(false);
  });

  test("visibleFractionOf reports how much of a rect is on screen", () => {
    const canvas = makeCanvas(800, 600);
    const camera = new Camera2D();
    const controller = new RaceCameraController(canvas, camera, {
      insets: NO_INSETS,
    });

    const rect = legRect(0);
    controller.snapTo(rect);
    // The active rect is fully framed.
    expect(controller.visibleFractionOf(rect)).toBeCloseTo(1);

    // A rect one full leg below is entirely off screen.
    expect(controller.visibleFractionOf(legRect(810))).toBe(0);
  });
});
