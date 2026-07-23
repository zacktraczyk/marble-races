import type { Vec2 } from "../../../../../engine/core/transform";
import {
  getLevelObjectShape,
  getWallEndpoints,
} from "../../../../../game/level/geometry";
import {
  pickLevelObject,
  pickTolerance,
  type ResizeHandle,
} from "../../geometry";
import type { LevelObjectData } from "../../../../../game/level/document";
import { isPusherTool, SelectedTool } from "../../tools";
import { HANDLE_HIT_RADIUS, MIN_WALL_LENGTH } from "../constants";
import type { EditorEnv } from "../env";
import type { TransformGesture } from "../gestures";
import {
  endpointAt,
  findWallEndpointTarget,
  motionRangeHandleAt,
  resizeHandleAt,
  rotationHandleAt,
  snapPlacementPoint,
  snapWallEndpoint,
} from "../hitTest";
import type { EditorSession } from "../session";
import {
  updateMarqueeDrag,
  updateMotionRangeDrag,
  updateMoveDrag,
  updateTransformDrag,
  updateWallDrag,
  updateWallEndpointDrag,
} from "./drag";
import { updateIdleState } from "./idleCursor";
import { cancelGesture } from "./rollback";

// Input-module API implemented in private helpers (not separate public modules).
export type { DragDepsBase, DragUpdateResult } from "./drag";
export { updateCursor, updateIdleState } from "./idleCursor";
export { LegEditorKeyboard } from "./keyboard";
export type { LegEditorKeyboardActions } from "./keyboard";
export { cancelGesture, rollbackGesture } from "./rollback";

export function beginPan(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2
) {
  session.gesture = {
    kind: "pan",
    pointerId: event.pointerId,
    lastScreen: screenPoint,
  };
  env.capturePointer(event.pointerId);
  env.setCursor("grabbing");
}

export function beginMove(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2,
  options: { inserted?: boolean; sourceSelection?: string[] } = {}
) {
  const originals = new Map(
    session.selection.selectedObjects.map((object) => [
      object.id,
      structuredClone(object),
    ])
  );
  session.gesture = {
    kind: "move",
    pointerId: event.pointerId,
    startWorld: env.worldPoint(screenPoint),
    startScreen: screenPoint,
    originals,
    inserted: options.inserted ?? false,
    sourceSelection: options.sourceSelection ?? [],
    changed: false,
  };
  env.capturePointer(event.pointerId);
  env.setCursor("grabbing");
}

export function beginTransform(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  object: LevelObjectData,
  kind: TransformGesture["kind"],
  screenPoint: Vec2,
  handle?: ResizeHandle
) {
  session.gesture = {
    kind,
    pointerId: event.pointerId,
    objectId: object.id,
    handle,
    startShape: getLevelObjectShape(object, env.getDefaultWallThickness()),
    startWorld: env.worldPoint(screenPoint),
    startScreen: screenPoint,
    changed: false,
  };
  env.capturePointer(event.pointerId);
}

function tryBeginPan(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2
): boolean {
  const temporaryPan = env.keyboard.spaceHeld && event.button === 0;
  if (
    event.button === 1 ||
    temporaryPan ||
    (session.activeTool === SelectedTool.Pan && event.button === 0)
  ) {
    beginPan(session, env, event, screenPoint);
    event.preventDefault();
    return true;
  }
  return false;
}

function tryBeginWallDraw(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2,
  temporarySelection: boolean
): boolean {
  if (
    session.activeTool !== SelectedTool.Wall ||
    temporarySelection ||
    session.readOnly
  ) {
    return false;
  }
  const worldPoint = env.worldPoint(screenPoint);
  const existingAnchor = session.wallAnchor;
  const anchored = existingAnchor !== null;
  const start = existingAnchor
    ? ([...existingAnchor] as Vec2)
    : snapPlacementPoint(env.snapDeps(), worldPoint, event.altKey);
  const end = anchored
    ? snapWallEndpoint(env.snapDeps(), start, worldPoint, {
        free: event.altKey,
        constrain: event.shiftKey,
      })
    : ([...start] as Vec2);
  session.gesture = {
    kind: "wall",
    pointerId: event.pointerId,
    start,
    end,
    startScreen: screenPoint,
    anchored,
    changed: false,
  };
  env.capturePointer(event.pointerId);
  event.preventDefault();
  return true;
}

function tryBeginPlacement(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2,
  temporarySelection: boolean
): boolean {
  if (
    !isPusherTool(session.activeTool) ||
    temporarySelection ||
    session.readOnly
  ) {
    return false;
  }
  session.gesture = {
    kind: "place",
    pointerId: event.pointerId,
    tool: session.activeTool,
    startScreen: screenPoint,
  };
  env.capturePointer(event.pointerId);
  event.preventDefault();
  return true;
}

function tryBeginMotionRange(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2
): boolean {
  const selectedObject = session.selection.selectedObject;
  if (
    !selectedObject ||
    !motionRangeHandleAt(env.handleDeps(), selectedObject, screenPoint) ||
    session.readOnly ||
    !selectedObject.motion
  ) {
    return false;
  }
  session.gesture = {
    kind: "motion-range",
    pointerId: event.pointerId,
    objectId: selectedObject.id,
    startMotion: structuredClone(selectedObject.motion),
    startScreen: screenPoint,
    changed: false,
  };
  env.capturePointer(event.pointerId);
  event.preventDefault();
  return true;
}

function tryBeginWallEndpoint(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2,
  temporarySelection: boolean
): boolean {
  const selectedObject = session.selection.selectedObject;
  const directEndpointTarget = temporarySelection
    ? findWallEndpointTarget(env.handleDeps(), screenPoint, HANDLE_HIT_RADIUS, {
        selectableOnly: true,
      })
    : null;
  const endpointObject =
    directEndpointTarget?.object ??
    (selectedObject?.prefab === "wall" ? selectedObject : null);
  const endpoint =
    directEndpointTarget?.endpoint ??
    (endpointObject
      ? endpointAt(env.handleDeps(), endpointObject, screenPoint)
      : null);
  if (!endpointObject || !endpoint || session.readOnly) {
    return false;
  }
  if (directEndpointTarget) {
    session.selection.replace(endpointObject.id);
  }
  const { start, end } = getWallEndpoints(endpointObject);
  session.gesture = {
    kind: "wall-endpoint",
    pointerId: event.pointerId,
    objectId: endpointObject.id,
    endpoint,
    start,
    end,
    startScreen: screenPoint,
    changed: false,
  };
  session.setEndpointFeedback(directEndpointTarget, "edit");
  env.capturePointer(event.pointerId);
  event.preventDefault();
  return true;
}

function tryBeginTransform(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2
): boolean {
  const selectedObject = session.selection.selectedObject;
  if (!selectedObject || session.readOnly) {
    return false;
  }
  if (rotationHandleAt(env.handleDeps(), selectedObject, screenPoint)) {
    beginTransform(session, env, event, selectedObject, "rotate", screenPoint);
    event.preventDefault();
    return true;
  }
  const resizeHandle = resizeHandleAt(
    env.handleDeps(),
    selectedObject,
    screenPoint
  );
  if (resizeHandle) {
    beginTransform(
      session,
      env,
      event,
      selectedObject,
      "resize",
      screenPoint,
      resizeHandle
    );
    event.preventDefault();
    return true;
  }
  return false;
}

function tryBeginMoveOrMarquee(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent,
  screenPoint: Vec2
): boolean {
  const pickedObject = pickLevelObject(
    env.getObjects(),
    env.worldPoint(screenPoint),
    pickTolerance(env.cameraZoom()),
    env.getDefaultWallThickness()
  );
  if (pickedObject) {
    if (event.shiftKey) {
      if (session.selection.has(pickedObject.id)) {
        session.selection.delete(pickedObject.id);
        updateIdleState(session, env, screenPoint);
        event.preventDefault();
        return true;
      }
      session.selection.add(pickedObject.id);
    } else if (!session.selection.has(pickedObject.id)) {
      session.selection.replace(pickedObject.id);
    }
    session.selection.setHovered(pickedObject.id);
    if (!session.readOnly) {
      if (event.altKey) {
        const sourceSelection = session.selection.selectedObjects.map(
          (object) => object.id
        );
        const copies = env.callbacks.onInsert(
          structuredClone(session.selection.selectedObjects).filter(
            (object) => object.prefab !== "spawn-point"
          )
        );
        if (copies.length > 0) {
          session.selection.replaceAll(copies.map((object) => object.id));
          beginMove(session, env, event, screenPoint, {
            inserted: true,
            sourceSelection,
          });
        }
      } else {
        beginMove(session, env, event, screenPoint);
      }
    }
    event.preventDefault();
    return true;
  }

  const initialSelection = session.selection.snapshot();
  if (!event.shiftKey) {
    session.selection.clear();
  }
  const worldPoint = env.worldPoint(screenPoint);
  session.gesture = {
    kind: "marquee",
    pointerId: event.pointerId,
    startWorld: worldPoint,
    currentWorld: worldPoint,
    startScreen: screenPoint,
    additive: event.shiftKey,
    initialSelection,
    changed: false,
  };
  env.capturePointer(event.pointerId);
  event.preventDefault();
  return true;
}

export function handlePointerDown(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent
) {
  const screenPoint = env.screenPoint(event);
  session.lastPointerScreen = screenPoint;

  if (tryBeginPan(session, env, event, screenPoint)) {
    return;
  }
  if (event.button !== 0) {
    return;
  }

  const temporarySelection = session.isTemporarySelection(event);
  if (tryBeginWallDraw(session, env, event, screenPoint, temporarySelection)) {
    return;
  }
  if (tryBeginPlacement(session, env, event, screenPoint, temporarySelection)) {
    return;
  }
  if (session.activeTool !== SelectedTool.Pointer && !temporarySelection) {
    return;
  }
  if (tryBeginMotionRange(session, env, event, screenPoint)) {
    return;
  }
  if (
    tryBeginWallEndpoint(session, env, event, screenPoint, temporarySelection)
  ) {
    return;
  }
  if (tryBeginTransform(session, env, event, screenPoint)) {
    return;
  }
  tryBeginMoveOrMarquee(session, env, event, screenPoint);
}

export function handlePointerMove(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent
) {
  const screenPoint = env.screenPoint(event);
  session.lastPointerScreen = screenPoint;
  if (!session.gesture) {
    const temporarySelection = session.isTemporarySelection(event);
    const snapDeps = env.snapDeps();
    if (
      session.activeTool === SelectedTool.Wall &&
      session.wallAnchor &&
      !temporarySelection &&
      !session.readOnly
    ) {
      session.wallPreviewEnd = snapWallEndpoint(
        snapDeps,
        session.wallAnchor,
        env.worldPoint(screenPoint),
        {
          free: event.altKey,
          constrain: event.shiftKey,
        }
      );
    } else if (
      session.creationToolActive &&
      !temporarySelection &&
      !session.readOnly
    ) {
      const position = snapPlacementPoint(
        snapDeps,
        env.worldPoint(screenPoint),
        event.altKey
      );
      session.placementPreviewPosition = isPusherTool(session.activeTool)
        ? position
        : null;
    } else if (temporarySelection) {
      session.endpointFeedback = null;
      session.placementPreviewPosition = null;
    }
    updateIdleState(session, env, screenPoint, {
      temporarySelection,
    });
    return;
  }

  if (event.pointerId !== session.gesture.pointerId) {
    return;
  }

  if (session.gesture.kind === "pan") {
    env.cameraControls.panByScreen(
      screenPoint[0] - session.gesture.lastScreen[0],
      screenPoint[1] - session.gesture.lastScreen[1]
    );
    session.gesture.lastScreen = screenPoint;
    event.preventDefault();
    return;
  }

  const worldPoint = env.worldPoint(screenPoint);
  const dragDeps = env.dragDeps();
  const snapDeps = env.snapDeps();
  let result: "pending" | "handled" | "cancel";

  switch (session.gesture.kind) {
    case "motion-range":
      result = updateMotionRangeDrag(
        session.gesture,
        screenPoint,
        worldPoint,
        event,
        dragDeps
      );
      break;
    case "wall":
      result = updateWallDrag(session.gesture, screenPoint, worldPoint, event, {
        ...dragDeps,
        snapDeps,
      });
      break;
    case "place":
      result = "handled";
      break;
    case "marquee":
      result = updateMarqueeDrag(session.gesture, screenPoint, worldPoint, {
        ...dragDeps,
        selection: session.selection,
      });
      break;
    case "move":
      result = updateMoveDrag(
        session.gesture,
        screenPoint,
        worldPoint,
        event,
        dragDeps
      );
      break;
    case "wall-endpoint":
      result = updateWallEndpointDrag(
        session.gesture,
        screenPoint,
        worldPoint,
        event,
        { ...dragDeps, snapDeps }
      );
      break;
    case "resize":
    case "rotate":
      result = updateTransformDrag(
        session.gesture,
        screenPoint,
        worldPoint,
        event,
        dragDeps
      );
      break;
    default:
      return;
  }

  if (result === "pending") {
    return;
  }
  if (result === "cancel") {
    cancelGesture(session, env);
    return;
  }
  event.preventDefault();
}

export function handlePointerUp(
  session: EditorSession,
  env: EditorEnv,
  event: PointerEvent
) {
  if (!session.gesture || event.pointerId !== session.gesture.pointerId) {
    return;
  }
  const gesture = session.gesture;
  const screenPoint = env.screenPoint(event);
  session.lastPointerScreen = screenPoint;
  session.gesture = null;
  env.releasePointer(event.pointerId);

  if (gesture.kind === "wall") {
    const length = Math.hypot(
      gesture.end[0] - gesture.start[0],
      gesture.end[1] - gesture.start[1]
    );
    if ((gesture.changed || gesture.anchored) && length >= MIN_WALL_LENGTH) {
      const object = env.callbacks.onCreateWall(gesture.start, gesture.end);
      session.selection.replace(object.id);
      if (gesture.anchored) {
        session.wallAnchor = [...gesture.end];
        session.wallPreviewEnd = [...gesture.end];
      } else {
        session.clearWallAnchor();
      }
      env.callbacks.onToolComplete(SelectedTool.Wall);
    } else if (!gesture.anchored) {
      session.wallAnchor = [...gesture.start];
      session.wallPreviewEnd = [...gesture.start];
    } else {
      session.wallPreviewEnd = [...gesture.end];
    }
  } else if (gesture.kind === "place") {
    if (env.screenDistance(screenPoint, gesture.startScreen) < 8) {
      const position = snapPlacementPoint(
        env.snapDeps(),
        env.worldPoint(screenPoint),
        event.altKey
      );
      const object = env.callbacks.onPlaceObject(gesture.tool, position);
      session.selection.replace(object.id);
      session.placementPreviewPosition = null;
      env.callbacks.onToolComplete(gesture.tool);
    }
  } else if (gesture.kind === "move" && gesture.inserted && !gesture.changed) {
    env.callbacks.onDiscard(session.selection.selectedObjects);
    session.selection.replaceAll(gesture.sourceSelection);
  } else if (
    (gesture.kind === "move" ||
      gesture.kind === "resize" ||
      gesture.kind === "rotate" ||
      gesture.kind === "wall-endpoint" ||
      gesture.kind === "motion-range") &&
    gesture.changed
  ) {
    env.callbacks.onObjectsCommit(session.selection.selectedObjects);
  }

  if (gesture.kind === "move" && gesture.inserted && gesture.changed) {
    const firstEntry = gesture.originals.entries().next().value;
    if (firstEntry) {
      const [id, original] = firstEntry;
      const object = env.getObjects().find((candidate) => candidate.id === id);
      if (object) {
        const before = getLevelObjectShape(
          original,
          env.getDefaultWallThickness()
        ).position;
        const after = getLevelObjectShape(
          object,
          env.getDefaultWallThickness()
        ).position;
        session.repeatDuplicateDelta = [
          after[0] - before[0],
          after[1] - before[1],
        ];
      }
    }
  }

  updateIdleState(session, env, screenPoint, {
    temporarySelection: session.isTemporarySelection(event),
  });
  event.preventDefault();
}
