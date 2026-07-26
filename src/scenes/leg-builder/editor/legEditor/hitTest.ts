import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "@game/level/document";
import {
  getLevelObjectShape,
  getWallEndpoints,
  isLevelObjectRotatable,
  isLevelObjectResizable,
} from "@game/level/geometry";
import { snapPointToGrid, type GridLayout } from "@game/level/grid";
import { getOscillationEndpoints } from "@game/level/motion";
import {
  findNearestPointIndex,
  getRotationHandle,
  getResizeAnchors,
  constrainPointToAngle,
  type ResizeHandle,
} from "../geometry";
import type { WallEndpointFeedback } from "./gestures";
import {
  ENDPOINT_SNAP_RADIUS,
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET,
  ROTATION_SNAP_STEP,
} from "./constants";

export type WallObject = Extract<LevelObjectData, { prefab: "wall" }>;
export type WallEndpointTarget = Omit<WallEndpointFeedback, "kind"> & {
  object: WallObject;
};
export type WallEndpointExclusion = Pick<
  WallEndpointTarget,
  "objectId" | "endpoint"
>;

export type HandleTestDeps = {
  worldToScreen: (point: Vec2) => Vec2;
  screenDistance: (first: Vec2, second: Vec2) => number;
  getObjects: () => readonly LevelObjectData[];
  getDefaultWallThickness: () => number;
  cameraZoom: number;
};

/**
 * Identifies which of one wall's two endpoints sits under a screen point.
 * @param deps - hit-test dependencies (screen mapping, object lookup)
 * @param object - the object to test; non-walls never match
 * @param screenPoint - the screen-space point to test
 * @returns `"start"`, `"end"`, or null when neither is within the handle radius
 */
export function endpointAt(
  deps: HandleTestDeps,
  object: LevelObjectData,
  screenPoint: Vec2
) {
  if (object.prefab !== "wall") {
    return null;
  }
  const { start, end } = getWallEndpoints(object);
  const startScreen = deps.worldToScreen(start);
  const endScreen = deps.worldToScreen(end);
  if (deps.screenDistance(startScreen, screenPoint) <= HANDLE_HIT_RADIUS) {
    return "start" as const;
  }
  if (deps.screenDistance(endScreen, screenPoint) <= HANDLE_HIT_RADIUS) {
    return "end" as const;
  }
  return null;
}

/**
 * Finds the nearest wall endpoint to a screen point across every wall on the
 * course, unlike `endpointAt` which tests a single object.
 * @param deps - hit-test dependencies (screen mapping, object lookup)
 * @param screenPoint - the screen-space point to search around
 * @param maximumDistance - search radius in screen units
 * @param options - `selectableOnly` skips locked walls; `exclude` omits one
 * endpoint, so a dragged endpoint does not snap to itself
 * @returns the nearest matching endpoint, or null when none is in range
 */
export function findWallEndpointTarget(
  deps: HandleTestDeps,
  screenPoint: Vec2,
  maximumDistance: number,
  {
    selectableOnly = false,
    exclude,
  }: {
    selectableOnly?: boolean;
    exclude?: WallEndpointExclusion;
  } = {}
): WallEndpointTarget | null {
  const candidates = deps.getObjects().flatMap((object) => {
    if (object.prefab !== "wall" || (selectableOnly && object.locked)) {
      return [];
    }
    const { start, end } = getWallEndpoints(object);
    return (["start", "end"] as const)
      .filter(
        (endpoint) =>
          object.id !== exclude?.objectId || endpoint !== exclude.endpoint
      )
      .map((endpoint) => ({
        object,
        objectId: object.id,
        endpoint,
        position: endpoint === "start" ? start : end,
      }));
  });
  const nearestIndex = findNearestPointIndex(
    candidates.map((candidate) => deps.worldToScreen(candidate.position)),
    screenPoint,
    maximumDistance
  );
  return nearestIndex === null ? null : candidates[nearestIndex];
}

/**
 * Identifies which resize anchor of an object sits under a screen point.
 * @param deps - hit-test dependencies (screen mapping, wall thickness)
 * @param object - the object to test; non-resizable objects never match
 * @param screenPoint - the screen-space point to test
 * @returns the matching resize handle, or null when none is in range
 */
export function resizeHandleAt(
  deps: HandleTestDeps,
  object: LevelObjectData,
  screenPoint: Vec2
) {
  if (!isLevelObjectResizable(object)) {
    return null;
  }
  const shape = getLevelObjectShape(object, deps.getDefaultWallThickness());
  for (const anchor of getResizeAnchors(shape)) {
    const anchorScreen = deps.worldToScreen(anchor.position);
    if (deps.screenDistance(anchorScreen, screenPoint) <= HANDLE_HIT_RADIUS) {
      return anchor.handle;
    }
  }
  return null;
}

/**
 * Tests whether an object's rotation handle sits under a screen point. The
 * handle's offset is divided by the camera zoom so it stays a fixed distance
 * away on screen at any zoom level.
 * @param deps - hit-test dependencies (screen mapping, camera zoom)
 * @param object - the object to test; non-rotatable objects never match
 * @param screenPoint - the screen-space point to test
 * @returns true when the handle is within the handle radius
 */
export function rotationHandleAt(
  deps: HandleTestDeps,
  object: LevelObjectData,
  screenPoint: Vec2
) {
  if (!isLevelObjectRotatable(object)) {
    return false;
  }
  const offset =
    ROTATION_HANDLE_OFFSET / Math.max(Math.abs(deps.cameraZoom), 0.001);
  const handle = getRotationHandle(
    getLevelObjectShape(object, deps.getDefaultWallThickness()),
    offset
  );
  return (
    deps.screenDistance(deps.worldToScreen(handle.position), screenPoint) <=
    HANDLE_HIT_RADIUS
  );
}

/**
 * Tests whether an oscillating object's far travel-range handle sits under a
 * screen point. Uses a slightly larger radius than the other handles because it
 * can overlap the object's own outline.
 * @param deps - hit-test dependencies (screen mapping, wall thickness)
 * @param object - the object to test; only `oscillate` motion has this handle
 * @param screenPoint - the screen-space point to test
 * @returns true when the handle is within range
 */
export function motionRangeHandleAt(
  deps: HandleTestDeps,
  object: LevelObjectData,
  screenPoint: Vec2
) {
  if (object.motion?.type !== "oscillate") {
    return false;
  }
  const endpoints = getOscillationEndpoints(
    object,
    deps.getDefaultWallThickness()
  );
  if (!endpoints) {
    return false;
  }
  const handle = endpoints[1];
  return (
    deps.screenDistance(deps.worldToScreen(handle), screenPoint) <=
    HANDLE_HIT_RADIUS + 2
  );
}

export type { ResizeHandle };

export type SnapDeps = {
  worldToScreen: (point: Vec2) => Vec2;
  getGridSnapEnabled: () => boolean;
  getGridLayout: () => GridLayout;
  findWallEndpointTarget: (
    screenPoint: Vec2,
    maximumDistance: number,
    options?: {
      selectableOnly?: boolean;
      exclude?: WallEndpointExclusion;
    }
  ) => WallEndpointTarget | null;
  setEndpointFeedback: (
    target: WallEndpointTarget | null,
    kind: WallEndpointFeedback["kind"]
  ) => void;
};

/**
 * Resolves where a placed point should land: an existing wall endpoint if one
 * is within snap range, else the grid (when grid snap is on), else the raw
 * point. Updates endpoint feedback as a side effect.
 * @param deps - snapping dependencies (screen mapping, grid, endpoint lookup)
 * @param point - the desired world-space point
 * @param free - when true, bypasses all snapping and returns the raw point
 * @param exclude - wall endpoint to ignore when searching for snap targets
 * @returns the resolved world-space point
 */
export function snapPlacementPoint(
  deps: SnapDeps,
  point: Vec2,
  free: boolean,
  exclude?: WallEndpointExclusion
) {
  if (free) {
    deps.setEndpointFeedback(null, "snap");
    return [...point] as Vec2;
  }
  const target = deps.findWallEndpointTarget(
    deps.worldToScreen(point),
    ENDPOINT_SNAP_RADIUS,
    { exclude }
  );
  deps.setEndpointFeedback(target, "snap");
  if (target) {
    return [...target.position] as Vec2;
  }
  return deps.getGridSnapEnabled()
    ? snapPointToGrid(point, deps.getGridLayout())
    : ([...point] as Vec2);
}

/**
 * Resolves a wall's moving endpoint while dragging: free (no snap), angle-
 * constrained relative to the fixed endpoint, or the usual placement snapping.
 * @param deps - snapping dependencies
 * @param fixed - the wall's other, fixed endpoint in world space
 * @param point - the desired world-space endpoint
 * @param options - `free` to bypass snapping, `constrain` to snap the angle
 * @param exclude - wall endpoint to ignore when searching for snap targets
 * @returns the resolved world-space endpoint
 */
export function snapWallEndpoint(
  deps: SnapDeps,
  fixed: Vec2,
  point: Vec2,
  { free, constrain }: { free: boolean; constrain: boolean },
  exclude?: WallEndpointExclusion
) {
  if (free) {
    deps.setEndpointFeedback(null, "snap");
    return [...point] as Vec2;
  }
  if (constrain) {
    deps.setEndpointFeedback(null, "snap");
    const gridStep = deps.getGridLayout().step;
    return constrainPointToAngle(
      fixed,
      point,
      ROTATION_SNAP_STEP,
      deps.getGridSnapEnabled() ? (gridStep[0] + gridStep[1]) / 2 : 0
    );
  }
  return snapPlacementPoint(deps, point, false, exclude);
}
