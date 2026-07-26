// Classifying a pointer-down into a gesture: the tryBegin* chain and the
// entry points that install one on the session. Advancing a live gesture
// lives in gestureUpdate.ts.
import type { Vec2 } from "@engine/core/transform";
import { getLevelObjectShape, getWallEndpoints } from "@game/level/geometry";
import { pickLevelObject, pickTolerance, type ResizeHandle } from "../geometry";
import type { LevelObjectData } from "@game/level/document";
import { isPusherTool, SelectedTool } from "../../tools";
import { HANDLE_HIT_RADIUS } from "../constants";
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
import { updateIdleState } from "./idleCursor";

function beginPan(
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

function beginMove(
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

function beginTransform(
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
