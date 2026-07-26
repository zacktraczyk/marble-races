import { describe, expect, test } from "bun:test";
import { Camera2D } from "@engine/camera/camera2d";

describe("2D camera", () => {
  test("converts between screen and world coordinates", () => {
    const camera = new Camera2D({ position: [400, 300], zoom: 2 });

    expect(camera.worldToScreen(25, -10)).toEqual([450, 280]);
    expect(camera.screenToWorld(450, 280)).toEqual([25, -10]);
  });

  test("keeps the selected world point stationary while zooming", () => {
    const camera = new Camera2D({ position: [400, 300], zoom: 1 });
    const worldPoint = camera.screenToWorld(500, 250);

    camera.zoomAtScreenPoint(500, 250, 2);

    expect(camera.worldToScreen(...worldPoint)).toEqual([500, 250]);
  });
});
