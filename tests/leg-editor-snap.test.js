import { describe, expect, test } from "bun:test";
import { createGridLayout } from "../src/game/level/grid.ts";
import { constrainPointToAngle } from "../src/scenes/leg-builder/editor/geometry.ts";
import { ROTATION_SNAP_STEP } from "../src/scenes/leg-builder/editor/constants.ts";
import {
  snapPlacementPoint,
  snapWallEndpoint,
} from "../src/scenes/leg-builder/editor/hitTest.ts";

const bounds = { min: [-705, -390], max: [705, 270] };
const gridLayout = createGridLayout(bounds);

const createSnapDeps = (overrides = {}) => {
  const feedback = { target: "unset", kind: "unset" };
  const deps = {
    worldToScreen: (point) => point,
    getGridSnapEnabled: () => true,
    getGridLayout: () => gridLayout,
    findWallEndpointTarget: () => null,
    setEndpointFeedback: (target, kind) => {
      feedback.target = target;
      feedback.kind = kind;
    },
    ...overrides,
  };
  return { deps, feedback };
};

describe("leg editor snap", () => {
  test("free mode returns the point unchanged and clears feedback", () => {
    const { deps, feedback } = createSnapDeps({
      findWallEndpointTarget: () => ({
        objectId: "wall-a",
        endpoint: "start",
        position: [999, 999],
        object: { id: "wall-a", prefab: "wall" },
      }),
    });

    const point = [37, -18];
    expect(snapPlacementPoint(deps, point, true)).toEqual(point);
    expect(feedback.target).toBeNull();
    expect(feedback.kind).toBe("snap");
  });

  test("snaps to a wall endpoint target when one is present", () => {
    const target = {
      objectId: "wall-a",
      endpoint: "end",
      position: [120, 40],
      object: {
        id: "wall-a",
        prefab: "wall",
        properties: {
          start: [0, 0],
          end: [120, 40],
          thickness: 40,
          color: [1, 1, 1, 1],
        },
      },
    };
    const { deps, feedback } = createSnapDeps({
      findWallEndpointTarget: () => target,
    });

    expect(snapPlacementPoint(deps, [118, 39], false)).toEqual([120, 40]);
    expect(feedback.target).toBe(target);
    expect(feedback.kind).toBe("snap");
  });

  test("falls back to grid snapping when enabled and no endpoint target exists", () => {
    const { deps } = createSnapDeps();
    const rawPoint = [
      bounds.min[0] + gridLayout.step[0] * 3.4,
      bounds.min[1] + gridLayout.step[1] * 7.6,
    ];
    const snapped = snapPlacementPoint(deps, rawPoint, false);

    expect(snapped[0]).toBeCloseTo(bounds.min[0] + gridLayout.step[0] * 3);
    expect(snapped[1]).toBeCloseTo(bounds.min[1] + gridLayout.step[1] * 8);
  });

  test("returns the raw point when grid snapping is disabled and no endpoint exists", () => {
    const { deps } = createSnapDeps({
      getGridSnapEnabled: () => false,
    });
    const point = [13, -27];

    expect(snapPlacementPoint(deps, point, false)).toEqual(point);
  });

  test("snapWallEndpoint uses angle constraint when shift is held", () => {
    const { deps, feedback } = createSnapDeps();
    const fixed = [0, 0];
    const point = [10, 5];
    const gridStep = gridLayout.step;
    const expected = constrainPointToAngle(
      fixed,
      point,
      ROTATION_SNAP_STEP,
      (gridStep[0] + gridStep[1]) / 2
    );

    expect(
      snapWallEndpoint(deps, fixed, point, { free: false, constrain: true })
    ).toEqual(expected);
    expect(feedback.target).toBeNull();
    expect(feedback.kind).toBe("snap");
  });

  test("snapWallEndpoint free mode returns the point unchanged and clears feedback", () => {
    const { deps, feedback } = createSnapDeps({
      findWallEndpointTarget: () => ({
        objectId: "wall-a",
        endpoint: "start",
        position: [0, 0],
        object: { id: "wall-a", prefab: "wall" },
      }),
    });
    const point = [44, -12];

    expect(
      snapWallEndpoint(deps, [0, 0], point, { free: true, constrain: false })
    ).toEqual(point);
    expect(feedback.target).toBeNull();
    expect(feedback.kind).toBe("snap");
  });
});
