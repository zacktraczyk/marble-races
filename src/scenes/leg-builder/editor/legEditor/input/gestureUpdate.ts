// Advancing and finishing a live gesture. Starting one lives in
// gestureStart.ts.
import { getLevelObjectShape } from "@game/level/geometry";
import { isPusherTool, SelectedTool } from "../../tools";
import { MIN_WALL_LENGTH } from "../constants";
import type { EditorEnv } from "../env";
import { snapPlacementPoint, snapWallEndpoint } from "../hitTest";
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
