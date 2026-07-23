import type { Vec2 } from "../../../engine/core/transform";
import type { LevelObjectData } from "../../../game/level/document";
import {
  hitTestLevelObject,
  localToWorld,
  worldToLocal,
  type Bounds,
  type LevelObjectShape,
} from "../../../game/level/geometry";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type ResizeAnchor = {
  handle: ResizeHandle;
  position: Vec2;
};

export type RotationHandle = {
  connection: Vec2;
  position: Vec2;
};

const rectangleHandles: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];
const circleHandles: ResizeHandle[] = ["n", "e", "s", "w"];

const handleDirection: Record<ResizeHandle, Vec2> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

const snap = (value: number, step: number) =>
  step > 0 ? Math.round(value / step) * step : value;

const snapPoint = ([x, y]: Vec2, step: number): Vec2 => [
  snap(x, step),
  snap(y, step),
];

/** Locks a movement delta to its dominant axis (horizontal or vertical). */
export const constrainDeltaToAxis = ([x, y]: Vec2): Vec2 =>
  Math.abs(x) >= Math.abs(y) ? [x, 0] : [0, y];

/**
 * Index of the point nearest a target within a maximum distance.
 * @param points - candidate points
 * @param target - the point to measure from
 * @param maximumDistance - largest accepted distance (same space as the points)
 * @returns the nearest point's index, or null when none are within range
 */
export const findNearestPointIndex = (
  points: readonly Vec2[],
  target: Vec2,
  maximumDistance: number
) => {
  let nearestIndex: number | null = null;
  let nearestDistance = maximumDistance;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const distance = Math.hypot(point[0] - target[0], point[1] - target[1]);
    if (distance <= nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestIndex;
};

/**
 * Snaps a point to a fixed set of angles (and optional distances) around an
 * origin — used for angle-constrained dragging.
 * @param origin - the anchor the angle is measured from
 * @param point - the dragged point
 * @param angleStep - angle increment in radians to snap to
 * @param distanceStep - distance increment to snap to (0 leaves distance free)
 * @returns the constrained point in the same space as the inputs
 */
export const constrainPointToAngle = (
  origin: Vec2,
  point: Vec2,
  angleStep: number,
  distanceStep = 0
): Vec2 => {
  const deltaX = point[0] - origin[0];
  const deltaY = point[1] - origin[1];
  const rawDistance = Math.hypot(deltaX, deltaY);
  const distance = snap(rawDistance, distanceStep);
  const angle = snap(Math.atan2(deltaY, deltaX), angleStep);
  return [
    origin[0] + Math.cos(angle) * distance,
    origin[1] + Math.sin(angle) * distance,
  ];
};

/** World-space positions of a shape's resize handles (eight for rectangles, four for circles). */
export const getResizeAnchors = (shape: LevelObjectShape): ResizeAnchor[] => {
  const handles = shape.kind === "rectangle" ? rectangleHandles : circleHandles;
  return handles.map((handle) => {
    const [horizontal, vertical] = handleDirection[handle];
    const localPosition: Vec2 =
      shape.kind === "rectangle"
        ? [horizontal * (shape.width / 2), vertical * (shape.height / 2)]
        : [horizontal * shape.radius, vertical * shape.radius];
    return { handle, position: localToWorld(shape, localPosition) };
  });
};

/**
 * The rotation handle for a shape: a grab point above its top edge plus the
 * connection point on that edge.
 * @param shape - the shape to attach the handle to
 * @param offset - gap in world units between the edge and the grab point
 * @returns the handle's connection and grab positions in world space
 */
export const getRotationHandle = (
  shape: LevelObjectShape,
  offset: number
): RotationHandle => {
  const edge = shape.kind === "rectangle" ? shape.height / 2 : shape.radius;
  return {
    connection: localToWorld(shape, [0, -edge]),
    position: localToWorld(shape, [0, -edge - offset]),
  };
};

export const PICK_TOLERANCE_PIXELS = 4;

/**
 * Converts the pixel pick tolerance into world units at a given zoom.
 * @param zoom - pixels per world unit
 * @returns the tolerance in world units
 */
export const pickTolerance = (zoom: number) =>
  PICK_TOLERANCE_PIXELS / Math.max(zoom, 0.001);

/**
 * Topmost unlocked object under a world-space point, honoring a hit tolerance.
 * @param objects - level objects in draw order (last is topmost)
 * @param point - world-space point
 * @param tolerance - extra hit margin in world units
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns the hit object, or null when none is under the point
 */
export const pickLevelObject = (
  objects: readonly LevelObjectData[],
  point: Vec2,
  tolerance = 0,
  defaultWallThickness = 25
) => {
  for (let index = objects.length - 1; index >= 0; index--) {
    const object = objects[index];
    if (
      !object.locked &&
      hitTestLevelObject(object, point, tolerance, defaultWallThickness)
    ) {
      return object;
    }
  }
  return null;
};

/** Whether two axis-aligned bounding boxes overlap. */
export const boundsIntersect = (first: Bounds, second: Bounds) =>
  first.min[0] <= second.max[0] &&
  first.max[0] >= second.min[0] &&
  first.min[1] <= second.max[1] &&
  first.max[1] >= second.min[1];

/**
 * Returns a copy of a shape moved to a new position, optionally grid-snapped.
 * @param shape - the shape to move
 * @param position - new world-space center
 * @param snapStep - grid step to snap the position to (0 disables snapping)
 * @returns the moved shape
 */
export const moveShape = (
  shape: LevelObjectShape,
  position: Vec2,
  snapStep = 0
): LevelObjectShape => ({
  ...shape,
  position: snapPoint(position, snapStep),
});

/**
 * Returns a copy of a shape at a new rotation, optionally snapped.
 * @param shape - the shape to rotate
 * @param rotation - new rotation in radians
 * @param snapStep - angle step in radians to snap to (0 disables snapping)
 * @returns the rotated shape
 */
export const rotateShape = (
  shape: LevelObjectShape,
  rotation: number,
  snapStep = 0
): LevelObjectShape => ({
  ...shape,
  position: [...shape.position],
  rotation: snap(rotation, snapStep),
});

/**
 * Returns a copy of a shape resized by dragging one handle toward a pointer,
 * keeping the opposite edge fixed; circles resize about their center.
 * @param shape - the shape to resize
 * @param handle - the handle being dragged
 * @param pointer - pointer position in world space
 * @param snapStep - grid step to snap sizes to (0 disables snapping)
 * @param minimumSize - smallest allowed width/height or radius, in world units
 * @returns the resized shape
 */
export const resizeShape = (
  shape: LevelObjectShape,
  handle: ResizeHandle,
  pointer: Vec2,
  snapStep = 0,
  minimumSize = 10
): LevelObjectShape => {
  const [horizontal, vertical] = handleDirection[handle];
  const [pointerX, pointerY] = worldToLocal(shape, pointer);

  if (shape.kind === "circle") {
    const rawRadius =
      horizontal === 0 ? Math.abs(pointerY) : Math.abs(pointerX);
    const radius = Math.max(minimumSize, snap(rawRadius, snapStep));
    return { ...shape, position: [...shape.position], radius };
  }

  let width = shape.width;
  let height = shape.height;
  let centerX = 0;
  let centerY = 0;

  if (horizontal !== 0) {
    const fixedEdge = (-horizontal * shape.width) / 2;
    const desiredWidth = (pointerX - fixedEdge) * horizontal;
    width = Math.max(minimumSize, snap(desiredWidth, snapStep));
    const movingEdge = fixedEdge + horizontal * width;
    centerX = (fixedEdge + movingEdge) / 2;
  }

  if (vertical !== 0) {
    const fixedEdge = (-vertical * shape.height) / 2;
    const desiredHeight = (pointerY - fixedEdge) * vertical;
    height = Math.max(minimumSize, snap(desiredHeight, snapStep));
    const movingEdge = fixedEdge + vertical * height;
    centerY = (fixedEdge + movingEdge) / 2;
  }

  return {
    ...shape,
    position: localToWorld(shape, [centerX, centerY]),
    width,
    height,
  };
};

/** CSS cursor name for dragging a given resize handle. */
export const resizeHandleCursor = (handle: ResizeHandle) => {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
  }
};

/** Axis-aligned bounds spanning two world-space points. */
export const boundsFromPoints = (first: Vec2, second: Vec2): Bounds => ({
  min: [Math.min(first[0], second[0]), Math.min(first[1], second[1])],
  max: [Math.max(first[0], second[0]), Math.max(first[1], second[1])],
});
