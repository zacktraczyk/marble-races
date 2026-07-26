import type { Vec2 } from "@engine/core/transform";
import { getWallEndpoints } from "@game/level/geometry";
import {
  pickLevelObject,
  pickTolerance,
  resizeHandleCursor,
} from "../../geometry";
import { SelectedTool } from "../../tools";
import { HANDLE_HIT_RADIUS } from "../constants";
import type { EditorEnv } from "../env";
import {
  endpointAt,
  findWallEndpointTarget,
  motionRangeHandleAt,
  resizeHandleAt,
  rotationHandleAt,
} from "../hitTest";
import type { EditorSession } from "../session";

export function updateIdleState(
  session: EditorSession,
  env: EditorEnv,
  screenPoint: Vec2,
  {
    temporarySelection = env.keyboard.selectionModifierHeld &&
      session.creationToolActive,
  }: { temporarySelection?: boolean } = {}
) {
  if (session.gesture) {
    return;
  }
  if (env.keyboard.spaceHeld || session.activeTool === SelectedTool.Pan) {
    session.selection.setHovered(null);
    env.setCursor("grab");
    return;
  }
  if (session.creationToolActive && !temporarySelection) {
    session.selection.setHovered(null);
    env.setCursor(session.readOnly ? "not-allowed" : "crosshair");
    return;
  }

  const handleDeps = env.handleDeps();
  const directEndpointTarget = temporarySelection
    ? findWallEndpointTarget(handleDeps, screenPoint, HANDLE_HIT_RADIUS, {
        selectableOnly: true,
      })
    : null;
  if (directEndpointTarget) {
    session.selection.setHovered(directEndpointTarget.objectId);
    session.setEndpointFeedback(directEndpointTarget, "edit");
    env.setCursor(session.readOnly ? "default" : "crosshair");
    return;
  }

  session.endpointFeedback = null;
  const selectedObject = session.selection.selectedObject;
  if (
    selectedObject &&
    motionRangeHandleAt(handleDeps, selectedObject, screenPoint)
  ) {
    session.selection.setHovered(selectedObject.id);
    env.setCursor(session.readOnly ? "default" : "crosshair");
    return;
  }
  const selectedEndpoint = selectedObject
    ? endpointAt(handleDeps, selectedObject, screenPoint)
    : null;
  if (selectedObject?.prefab === "wall" && selectedEndpoint) {
    const { start, end } = getWallEndpoints(selectedObject);
    session.selection.setHovered(selectedObject.id);
    session.setEndpointFeedback(
      {
        object: selectedObject,
        objectId: selectedObject.id,
        endpoint: selectedEndpoint,
        position: selectedEndpoint === "start" ? start : end,
      },
      "edit"
    );
    env.setCursor(session.readOnly ? "default" : "crosshair");
    return;
  }
  if (
    selectedObject &&
    rotationHandleAt(handleDeps, selectedObject, screenPoint)
  ) {
    session.selection.setHovered(selectedObject.id);
    env.setCursor(session.readOnly ? "default" : "grab");
    return;
  }
  const handle = selectedObject
    ? resizeHandleAt(handleDeps, selectedObject, screenPoint)
    : null;
  if (handle) {
    session.selection.setHovered(selectedObject?.id ?? null);
    env.setCursor(session.readOnly ? "default" : resizeHandleCursor(handle));
    return;
  }
  const hoveredObject = pickLevelObject(
    env.getObjects(),
    env.worldPoint(screenPoint),
    pickTolerance(env.cameraZoom()),
    env.getDefaultWallThickness()
  );
  session.selection.setHovered(hoveredObject?.id ?? null);
  env.setCursor(hoveredObject && !session.readOnly ? "grab" : "default");
}

export function updateCursor(session: EditorSession, env: EditorEnv) {
  if (session.gesture?.kind === "pan") {
    env.setCursor("grabbing");
  } else if (
    env.keyboard.spaceHeld ||
    session.activeTool === SelectedTool.Pan
  ) {
    env.setCursor("grab");
  } else if (env.keyboard.selectionModifierHeld && session.creationToolActive) {
    env.setCursor("default");
  } else if (session.creationToolActive) {
    env.setCursor(session.readOnly ? "not-allowed" : "crosshair");
  } else {
    env.setCursor("default");
  }
}
