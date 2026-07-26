import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "@game/level/document";
import {
  applyLevelObjectShape,
  getLevelObjectBounds,
  getLevelObjectShape,
  type Bounds,
} from "@game/level/geometry";
import { moveShape, rotateShape } from "../geometry";

/** Owns selection and hover identity independently from gesture handling. */
export class LegEditorSelection {
  private readonly ids = new Set<string>();
  private hoveredId: string | null = null;

  constructor(private readonly getObjects: () => readonly LevelObjectData[]) {}

  get size() {
    return this.ids.size;
  }

  has(id: string) {
    return this.ids.has(id);
  }

  add(id: string) {
    this.ids.add(id);
  }

  delete(id: string) {
    this.ids.delete(id);
  }

  replace(id: string) {
    this.ids.clear();
    this.ids.add(id);
  }

  replaceAll(ids: Iterable<string>) {
    this.ids.clear();
    for (const id of ids) {
      this.ids.add(id);
    }
  }

  clear() {
    this.ids.clear();
  }

  snapshot() {
    return new Set(this.ids);
  }

  setHovered(id: string | null) {
    this.hoveredId = id;
  }

  clearAll() {
    this.ids.clear();
    this.hoveredId = null;
  }

  get selectedObjects() {
    return this.getObjects().filter(
      (object) => !object.locked && this.ids.has(object.id)
    );
  }

  get selectedObject() {
    const selected = this.selectedObjects;
    return selected.length === 1 ? selected[0] : null;
  }

  get hoveredObject() {
    if (!this.hoveredId) {
      return null;
    }
    return (
      this.getObjects().find((object) => object.id === this.hoveredId) ?? null
    );
  }
}

export type SelectionAlignment =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "center-vertical"
  | "bottom";

export type SelectionDistribution = "horizontal" | "vertical";
export type SelectionMirror = "left-right" | "top-bottom";

/**
 * Combined world-space bounds enclosing a set of objects.
 * @param objects - the objects to enclose
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns the enclosing bounds, or null when the set is empty
 */
export const getSelectionBounds = (
  objects: readonly LevelObjectData[],
  defaultWallThickness: number
): Bounds | null => {
  if (objects.length === 0) {
    return null;
  }
  return objects.reduce<Bounds>(
    (selection, object) => {
      const bounds = getLevelObjectBounds(object, defaultWallThickness);
      return {
        min: [
          Math.min(selection.min[0], bounds.min[0]),
          Math.min(selection.min[1], bounds.min[1]),
        ],
        max: [
          Math.max(selection.max[0], bounds.max[0]),
          Math.max(selection.max[1], bounds.max[1]),
        ],
      };
    },
    {
      min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    }
  );
};

/** Center point of a bounding box, in world space. */
export const selectionCenter = (bounds: Bounds): Vec2 => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
];

/**
 * Shifts a level object by a world-space delta, writing the result back onto it.
 * @param object - the object to move (mutated in place)
 * @param delta - world-space offset
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 */
export const moveLevelObjectBy = (
  object: LevelObjectData,
  delta: Vec2,
  defaultWallThickness: number
) => {
  const shape = getLevelObjectShape(object, defaultWallThickness);
  applyLevelObjectShape(
    object,
    moveShape(shape, [
      shape.position[0] + delta[0],
      shape.position[1] + delta[1],
    ])
  );
};

/**
 * Aligns objects to a shared edge or center of their combined bounds.
 * @param objects - the objects to align (mutated in place)
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @param alignment - which edge or center to align to
 * @returns true when applied; false with fewer than two objects
 */
export const alignLevelObjects = (
  objects: readonly LevelObjectData[],
  defaultWallThickness: number,
  alignment: SelectionAlignment
) => {
  const selection = getSelectionBounds(objects, defaultWallThickness);
  if (!selection || objects.length < 2) {
    return false;
  }
  const center = selectionCenter(selection);
  for (const object of objects) {
    const bounds = getLevelObjectBounds(object, defaultWallThickness);
    let delta: Vec2;
    switch (alignment) {
      case "left":
        delta = [selection.min[0] - bounds.min[0], 0];
        break;
      case "center-horizontal":
        delta = [center[0] - (bounds.min[0] + bounds.max[0]) / 2, 0];
        break;
      case "right":
        delta = [selection.max[0] - bounds.max[0], 0];
        break;
      case "top":
        delta = [0, selection.min[1] - bounds.min[1]];
        break;
      case "center-vertical":
        delta = [0, center[1] - (bounds.min[1] + bounds.max[1]) / 2];
        break;
      case "bottom":
        delta = [0, selection.max[1] - bounds.max[1]];
        break;
    }
    moveLevelObjectBy(object, delta, defaultWallThickness);
  }
  return true;
};

/**
 * Spaces objects evenly between the outermost two along one axis, leaving
 * equal gaps between them.
 * @param objects - the objects to distribute (mutated in place)
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @param distribution - axis to distribute along
 * @returns true when applied; false with fewer than three objects
 */
export const distributeLevelObjects = (
  objects: readonly LevelObjectData[],
  defaultWallThickness: number,
  distribution: SelectionDistribution
) => {
  if (objects.length < 3) {
    return false;
  }
  const axis = distribution === "horizontal" ? 0 : 1;
  const entries = objects
    .map((object) => ({
      object,
      bounds: getLevelObjectBounds(object, defaultWallThickness),
    }))
    .sort((first, second) => first.bounds.min[axis] - second.bounds.min[axis]);
  const first = entries[0].bounds;
  const last = entries.at(-1)?.bounds;
  if (!last) {
    return false;
  }
  const totalSize = entries.reduce(
    (total, entry) => total + entry.bounds.max[axis] - entry.bounds.min[axis],
    0
  );
  const gap =
    (last.max[axis] - first.min[axis] - totalSize) / (entries.length - 1);
  let cursor = first.min[axis];
  for (const entry of entries) {
    const delta = cursor - entry.bounds.min[axis];
    moveLevelObjectBy(
      entry.object,
      axis === 0 ? [delta, 0] : [0, delta],
      defaultWallThickness
    );
    cursor += entry.bounds.max[axis] - entry.bounds.min[axis] + gap;
  }
  return true;
};

/**
 * Mirrors objects across a horizontal or vertical axis, flipping their
 * rotation and motion so their movement mirrors too.
 * @param objects - the objects to mirror (mutated in place)
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @param mirror - the axis to mirror across
 * @param center - world-space pivot; defaults to the selection center
 * @returns true when applied; false when the set is empty
 */
export const mirrorLevelObjects = (
  objects: readonly LevelObjectData[],
  defaultWallThickness: number,
  mirror: SelectionMirror,
  center?: Vec2
) => {
  const selection = getSelectionBounds(objects, defaultWallThickness);
  if (!selection) {
    return false;
  }
  const pivot = center ?? selectionCenter(selection);
  for (const object of objects) {
    const shape = getLevelObjectShape(object, defaultWallThickness);
    const leftRight = mirror === "left-right";
    const position: Vec2 = leftRight
      ? [pivot[0] * 2 - shape.position[0], shape.position[1]]
      : [shape.position[0], pivot[1] * 2 - shape.position[1]];
    const rotation = leftRight ? Math.PI - shape.rotation : -shape.rotation;
    applyLevelObjectShape(
      object,
      moveShape(rotateShape(shape, rotation), position)
    );
    if (object.motion?.type === "oscillate") {
      object.motion.vector = leftRight
        ? [-object.motion.vector[0], object.motion.vector[1]]
        : [object.motion.vector[0], -object.motion.vector[1]];
    } else if (object.motion?.type === "rotate") {
      object.motion.direction = object.motion.direction === 1 ? -1 : 1;
    }
  }
  return true;
};
