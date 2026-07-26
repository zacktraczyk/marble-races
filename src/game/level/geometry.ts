import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "./document";

export type RectangleLevelShape = {
  kind: "rectangle";
  position: Vec2;
  rotation: number;
  width: number;
  height: number;
};

export type CircleLevelShape = {
  kind: "circle";
  position: Vec2;
  rotation: number;
  radius: number;
};

export type LevelObjectShape = RectangleLevelShape | CircleLevelShape;

export type Bounds = {
  min: Vec2;
  max: Vec2;
};

/** A wall's thickness in world units, falling back to the level default when the wall sets none. */
export const getWallThickness = (
  object: Extract<LevelObjectData, { prefab: "wall" }>,
  defaultWallThickness: number
) => object.properties.thickness ?? defaultWallThickness;

/** Copies of a wall's `start`/`end` points in world space (safe to mutate). */
export const getWallEndpoints = (
  object: Extract<LevelObjectData, { prefab: "wall" }>
) => ({
  start: [...object.properties.start] as Vec2,
  end: [...object.properties.end] as Vec2,
});

/** Overwrites a wall's `start`/`end` points, storing copies of the given world-space points. */
export const setWallEndpoints = (
  object: Extract<LevelObjectData, { prefab: "wall" }>,
  start: Vec2,
  end: Vec2
) => {
  object.properties.start = [...start];
  object.properties.end = [...end];
};

/**
 * Normalizes any level object into a common rectangle/circle shape in world
 * space — walls become a rotated rectangle spanning their endpoints.
 * @param object - the level object to describe
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns the object's world-space shape (position, rotation in radians, size)
 */
export const getLevelObjectShape = (
  object: LevelObjectData,
  defaultWallThickness = 25
): LevelObjectShape => {
  switch (object.prefab) {
    case "wall": {
      const { start, end } = getWallEndpoints(object);
      return {
        kind: "rectangle",
        position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        rotation: Math.atan2(end[1] - start[1], end[0] - start[0]),
        width: Math.hypot(end[0] - start[0], end[1] - start[1]),
        height: getWallThickness(object, defaultWallThickness),
      };
    }
    case "finish-zone":
      return {
        kind: "rectangle",
        position: [...object.transform.position],
        rotation: object.transform.rotation ?? 0,
        width: object.properties.width,
        height: object.properties.height,
      };
    case "bumper":
    case "spawn-point":
      return {
        kind: "circle",
        position: [...object.transform.position],
        rotation: object.transform.rotation ?? 0,
        radius: object.properties.radius,
      };
  }
};

/** Whether the object exposes resize handles (unlocked bumpers and finish zones). */
export const isLevelObjectResizable = (object: LevelObjectData) =>
  !object.locked &&
  (object.prefab === "bumper" || object.prefab === "finish-zone");

/** Whether the object exposes a rotation handle (unlocked finish zones and spawn points). */
export const isLevelObjectRotatable = (object: LevelObjectData) =>
  !object.locked &&
  (object.prefab === "finish-zone" || object.prefab === "spawn-point");

/**
 * Transforms a point from a shape's local space (origin at its center, axes
 * unrotated) into world space.
 * @param shape - shape supplying the world position and rotation (radians)
 * @param point - local-space point
 * @returns the point in world space
 */
export const localToWorld = (shape: LevelObjectShape, [x, y]: Vec2): Vec2 => {
  const cosine = Math.cos(shape.rotation);
  const sine = Math.sin(shape.rotation);
  return [
    shape.position[0] + x * cosine - y * sine,
    shape.position[1] + x * sine + y * cosine,
  ];
};

/**
 * Transforms a world-space point into a shape's local space (origin at its
 * center, axes unrotated) — the inverse of {@link localToWorld}.
 * @param shape - shape supplying the world position and rotation (radians)
 * @param point - world-space point
 * @returns the point in the shape's local space
 */
export const worldToLocal = (shape: LevelObjectShape, [x, y]: Vec2): Vec2 => {
  const offsetX = x - shape.position[0];
  const offsetY = y - shape.position[1];
  const cosine = Math.cos(shape.rotation);
  const sine = Math.sin(shape.rotation);
  return [
    offsetX * cosine + offsetY * sine,
    -offsetX * sine + offsetY * cosine,
  ];
};

/** The rectangle's four corners in world space. */
export const getRectangleCorners = (shape: RectangleLevelShape): Vec2[] => [
  localToWorld(shape, [-shape.width / 2, -shape.height / 2]),
  localToWorld(shape, [shape.width / 2, -shape.height / 2]),
  localToWorld(shape, [shape.width / 2, shape.height / 2]),
  localToWorld(shape, [-shape.width / 2, shape.height / 2]),
];

/**
 * Whether a world-space point lies within an object's shape, optionally
 * expanded by a tolerance.
 * @param object - the level object to test
 * @param point - world-space point
 * @param tolerance - extra hit margin in world units
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns true when the point is inside the shape (plus tolerance)
 */
export const hitTestLevelObject = (
  object: LevelObjectData,
  point: Vec2,
  tolerance = 0,
  defaultWallThickness = 25
) => {
  const shape = getLevelObjectShape(object, defaultWallThickness);
  const [x, y] = worldToLocal(shape, point);
  if (shape.kind === "circle") {
    return Math.hypot(x, y) <= shape.radius + tolerance;
  }
  return (
    Math.abs(x) <= shape.width / 2 + tolerance &&
    Math.abs(y) <= shape.height / 2 + tolerance
  );
};

/**
 * Axis-aligned bounding box of an object in world space.
 * @param object - the level object to measure
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns world-space min/max corners enclosing the object
 */
export const getLevelObjectBounds = (
  object: LevelObjectData,
  defaultWallThickness = 25
): Bounds => {
  const shape = getLevelObjectShape(object, defaultWallThickness);
  const points =
    shape.kind === "rectangle"
      ? getRectangleCorners(shape)
      : [
          [shape.position[0] - shape.radius, shape.position[1] - shape.radius],
          [shape.position[0] + shape.radius, shape.position[1] + shape.radius],
        ];
  return points.reduce<Bounds>(
    (bounds, [x, y]) => ({
      min: [Math.min(bounds.min[0], x), Math.min(bounds.min[1], y)],
      max: [Math.max(bounds.max[0], x), Math.max(bounds.max[1], y)],
    }),
    {
      min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    }
  );
};

/**
 * Writes a shape back onto a level object, updating the fields each prefab
 * uses (walls store `start`/`end` endpoints; others store transform + size).
 * A shape whose kind does not match the prefab is ignored.
 */
export const applyLevelObjectShape = (
  object: LevelObjectData,
  shape: LevelObjectShape
) => {
  if (object.prefab === "wall") {
    if (shape.kind !== "rectangle") {
      return;
    }
    setWallEndpoints(
      object,
      localToWorld(shape, [-shape.width / 2, 0]),
      localToWorld(shape, [shape.width / 2, 0])
    );
    return;
  }

  object.transform.position = [...shape.position];
  object.transform.rotation = shape.rotation;

  if (shape.kind === "circle") {
    if (object.prefab === "bumper" || object.prefab === "spawn-point") {
      object.properties.radius = shape.radius;
    }
    return;
  }

  if (object.prefab === "finish-zone") {
    object.properties.width = shape.width;
    object.properties.height = shape.height;
  }
};
