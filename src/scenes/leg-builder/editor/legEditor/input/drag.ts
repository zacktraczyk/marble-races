import type { Vec2 } from "@engine/core/transform";
import { snapDeltaToGrid, type GridLayout } from "@game/level/grid";
import type { LevelObjectData } from "@game/level/document";
import {
  applyLevelObjectShape,
  getLevelObjectBounds,
  getLevelObjectShape,
  setWallEndpoints,
  type LevelObjectShape,
} from "@game/level/geometry";
import {
  boundsFromPoints,
  boundsIntersect,
  constrainDeltaToAxis,
  moveShape,
  resizeShape,
  rotateShape,
} from "../../geometry";
import { oscillationPeriodForRange } from "@game/level/motion";
import {
  DRAG_THRESHOLD,
  MIN_OBJECT_SIZE,
  ROTATION_SNAP_STEP,
  SIZE_SNAP_STEP,
} from "../constants";
import type { EditorGesture, TransformGesture } from "../gestures";
import type { SnapDeps } from "../hitTest";
import { snapWallEndpoint } from "../hitTest";
import type { LegEditorSelection } from "../selection";

export type DragUpdateResult = "pending" | "handled" | "cancel";

export type DragDepsBase = {
  screenDistance: (first: Vec2, second: Vec2) => number;
  getDefaultWallThickness: () => number;
  getGridSnapEnabled: () => boolean;
  getGridLayout: () => GridLayout;
  getObjects: () => readonly LevelObjectData[];
  findObject: (id: string) => LevelObjectData | null | undefined;
  onObjectsChange: (objects: readonly LevelObjectData[]) => void;
};

export type MotionRangeDragDeps = DragDepsBase;

export function updateMotionRangeDrag(
  gesture: Extract<EditorGesture, { kind: "motion-range" }>,
  screenPoint: Vec2,
  worldPoint: Vec2,
  event: PointerEvent,
  deps: MotionRangeDragDeps
): DragUpdateResult {
  if (
    !gesture.changed &&
    deps.screenDistance(screenPoint, gesture.startScreen) < DRAG_THRESHOLD
  ) {
    return "pending";
  }
  const object = deps.findObject(gesture.objectId);
  if (!object || object.motion?.type !== "oscillate") {
    return "cancel";
  }
  const center = getLevelObjectShape(
    object,
    deps.getDefaultWallThickness()
  ).position;
  let vector: Vec2 = [worldPoint[0] - center[0], worldPoint[1] - center[1]];
  if (event.shiftKey) {
    vector = constrainDeltaToAxis(vector);
  }
  if (!event.altKey && deps.getGridSnapEnabled()) {
    vector = snapDeltaToGrid(vector, deps.getGridLayout());
  }
  if ((object.motion.repeat ?? "ping-pong") === "loop") {
    vector = [
      vector[0] * object.motion.direction,
      vector[1] * object.motion.direction,
    ];
  }
  if (Math.hypot(...vector) >= MIN_OBJECT_SIZE) {
    object.motion.periodMs = oscillationPeriodForRange(
      object.motion,
      Math.hypot(...vector)
    );
    object.motion.vector = vector;
    gesture.changed = true;
    deps.onObjectsChange([object]);
  }
  return "handled";
}

export type WallDragDeps = {
  snapDeps: SnapDeps;
};

export function updateWallDrag(
  gesture: Extract<EditorGesture, { kind: "wall" }>,
  screenPoint: Vec2,
  worldPoint: Vec2,
  event: PointerEvent,
  deps: WallDragDeps & Pick<DragDepsBase, "screenDistance">
): DragUpdateResult {
  gesture.end = snapWallEndpoint(deps.snapDeps, gesture.start, worldPoint, {
    free: event.altKey,
    constrain: event.shiftKey,
  });
  gesture.changed =
    deps.screenDistance(screenPoint, gesture.startScreen) >= DRAG_THRESHOLD;
  return "handled";
}

export type MarqueeDragDeps = DragDepsBase & {
  selection: LegEditorSelection;
};

export function updateMarqueeDrag(
  gesture: Extract<EditorGesture, { kind: "marquee" }>,
  screenPoint: Vec2,
  worldPoint: Vec2,
  deps: MarqueeDragDeps
): DragUpdateResult {
  gesture.currentWorld = worldPoint;
  gesture.changed =
    deps.screenDistance(screenPoint, gesture.startScreen) >= DRAG_THRESHOLD;
  if (gesture.changed) {
    const selectionBounds = boundsFromPoints(
      gesture.startWorld,
      gesture.currentWorld
    );
    const nextSelection = gesture.additive
      ? new Set(gesture.initialSelection)
      : new Set<string>();
    for (const object of deps.getObjects()) {
      if (
        !object.locked &&
        boundsIntersect(
          selectionBounds,
          getLevelObjectBounds(object, deps.getDefaultWallThickness())
        )
      ) {
        nextSelection.add(object.id);
      }
    }
    deps.selection.replaceAll(nextSelection);
  }
  return "handled";
}

export function updateMoveDrag(
  gesture: Extract<EditorGesture, { kind: "move" }>,
  screenPoint: Vec2,
  worldPoint: Vec2,
  event: PointerEvent,
  deps: DragDepsBase
): DragUpdateResult {
  if (
    !gesture.changed &&
    deps.screenDistance(screenPoint, gesture.startScreen) < DRAG_THRESHOLD
  ) {
    return "pending";
  }
  gesture.changed = true;
  let rawDelta: Vec2 = [
    worldPoint[0] - gesture.startWorld[0],
    worldPoint[1] - gesture.startWorld[1],
  ];
  if (event.shiftKey) {
    rawDelta = constrainDeltaToAxis(rawDelta);
  }
  const delta =
    (event.altKey && !gesture.inserted) || !deps.getGridSnapEnabled()
      ? rawDelta
      : snapDeltaToGrid(rawDelta, deps.getGridLayout());
  const changed: LevelObjectData[] = [];
  for (const [id, original] of gesture.originals) {
    const object = deps.findObject(id);
    if (!object) {
      continue;
    }
    if (object.prefab === "wall" && original.prefab === "wall") {
      setWallEndpoints(
        object,
        [
          original.properties.start[0] + delta[0],
          original.properties.start[1] + delta[1],
        ],
        [
          original.properties.end[0] + delta[0],
          original.properties.end[1] + delta[1],
        ]
      );
    } else {
      const originalShape = getLevelObjectShape(
        original,
        deps.getDefaultWallThickness()
      );
      applyLevelObjectShape(
        object,
        moveShape(originalShape, [
          originalShape.position[0] + delta[0],
          originalShape.position[1] + delta[1],
        ])
      );
    }
    changed.push(object);
  }
  deps.onObjectsChange(changed);
  return "handled";
}

export type WallEndpointDragDeps = DragDepsBase & {
  snapDeps: SnapDeps;
};

export function updateWallEndpointDrag(
  gesture: Extract<EditorGesture, { kind: "wall-endpoint" }>,
  screenPoint: Vec2,
  worldPoint: Vec2,
  event: PointerEvent,
  deps: WallEndpointDragDeps
): DragUpdateResult {
  if (
    !gesture.changed &&
    deps.screenDistance(screenPoint, gesture.startScreen) < DRAG_THRESHOLD
  ) {
    return "pending";
  }
  const object = deps.findObject(gesture.objectId);
  if (!object || object.prefab !== "wall") {
    return "cancel";
  }
  gesture.changed = true;
  const fixed = gesture.endpoint === "start" ? gesture.end : gesture.start;
  const endpoint = snapWallEndpoint(
    deps.snapDeps,
    fixed,
    worldPoint,
    {
      free: event.altKey,
      constrain: event.shiftKey,
    },
    {
      objectId: gesture.objectId,
      endpoint: gesture.endpoint,
    }
  );
  setWallEndpoints(
    object,
    gesture.endpoint === "start" ? endpoint : gesture.start,
    gesture.endpoint === "end" ? endpoint : gesture.end
  );
  deps.onObjectsChange([object]);
  return "handled";
}

export function updateTransformDrag(
  gesture: TransformGesture,
  screenPoint: Vec2,
  worldPoint: Vec2,
  event: PointerEvent,
  deps: DragDepsBase
): DragUpdateResult {
  if (
    !gesture.changed &&
    deps.screenDistance(screenPoint, gesture.startScreen) < DRAG_THRESHOLD
  ) {
    return "pending";
  }
  const object = deps.findObject(gesture.objectId);
  if (!object) {
    return "cancel";
  }
  gesture.changed = true;
  let nextShape: LevelObjectShape;
  if (gesture.kind === "resize") {
    if (!gesture.handle) {
      return "pending";
    }
    nextShape = resizeShape(
      gesture.startShape,
      gesture.handle,
      worldPoint,
      event.altKey ? 0 : SIZE_SNAP_STEP,
      MIN_OBJECT_SIZE
    );
  } else {
    const center = gesture.startShape.position;
    const startAngle = Math.atan2(
      gesture.startWorld[1] - center[1],
      gesture.startWorld[0] - center[0]
    );
    const currentAngle = Math.atan2(
      worldPoint[1] - center[1],
      worldPoint[0] - center[0]
    );
    const angleDelta = Math.atan2(
      Math.sin(currentAngle - startAngle),
      Math.cos(currentAngle - startAngle)
    );
    nextShape = rotateShape(
      gesture.startShape,
      gesture.startShape.rotation + angleDelta,
      event.altKey ? 0 : ROTATION_SNAP_STEP
    );
  }
  applyLevelObjectShape(object, nextShape);
  deps.onObjectsChange([object]);
  return "handled";
}
