import type { Vec2 } from "../../../../engine/core/transform";
import type { LevelObjectData } from "../../../../game/level/document";
import {
  applyLevelObjectShape,
  getLevelObjectShape,
  getWallEndpoints,
  setWallEndpoints,
} from "../../../../game/level/geometry";
import { moveShape } from "../geometry";
import { SelectedTool } from "../tools";
import type { EditorEnv } from "./env";
import { cancelGesture, updateCursor } from "./input";
import type { EditorSession } from "./session";
import {
  alignLevelObjects,
  distributeLevelObjects,
  getSelectionBounds,
  mirrorLevelObjects,
  moveLevelObjectBy,
  selectionCenter,
  type SelectionAlignment,
  type SelectionDistribution,
  type SelectionMirror,
} from "./selection";

const CLIPBOARD_KEY = "marble:leg-editor-clipboard";
let memoryClipboard: LevelObjectData[] = [];

const copyableObjects = (objects: readonly LevelObjectData[]) =>
  objects.filter((object) => !object.locked && object.prefab !== "spawn-point");

const writeClipboard = (objects: readonly LevelObjectData[]) => {
  memoryClipboard = structuredClone(copyableObjects(objects));
  try {
    window.sessionStorage.setItem(
      CLIPBOARD_KEY,
      JSON.stringify(memoryClipboard)
    );
  } catch {
    // The in-memory clipboard still supports the current editor session.
  }
};

const clipboardCopies = (env: EditorEnv, objects: readonly LevelObjectData[]) =>
  structuredClone(copyableObjects(objects)).map((object) => {
    if (object.prefab === "wall" && object.properties.thickness === undefined) {
      object.properties.thickness = env.getDefaultWallThickness();
    }
    return object;
  });

const readClipboard = () => {
  if (memoryClipboard.length > 0) {
    return structuredClone(memoryClipboard);
  }
  try {
    const value = window.sessionStorage.getItem(CLIPBOARD_KEY);
    const parsed = value ? (JSON.parse(value) as LevelObjectData[]) : [];
    memoryClipboard = copyableObjects(parsed);
  } catch {
    memoryClipboard = [];
  }
  return structuredClone(memoryClipboard);
};

export const selectAllObjects = (session: EditorSession, env: EditorEnv) => {
  if (session.readOnly) {
    return false;
  }
  session.selection.replaceAll(
    env
      .getObjects()
      .filter((object) => !object.locked)
      .map((object) => object.id)
  );
  return true;
};

export const handleEscapeKey = (session: EditorSession, env: EditorEnv) => {
  if (session.gesture) {
    cancelGesture(session, env);
  } else if (session.wallAnchor) {
    session.clearWallAnchor();
  } else if (session.activeTool !== SelectedTool.Pointer) {
    env.callbacks.onToolRequest(SelectedTool.Pointer);
  } else if (session.selection.size > 0) {
    session.selection.clearAll();
  }
  return true;
};

export const finishWallDraft = (session: EditorSession, env: EditorEnv) => {
  if (!session.wallAnchor) {
    return false;
  }
  session.clearWallAnchor();
  updateCursor(session, env);
  return true;
};

export const deleteSelectedObjects = (
  session: EditorSession,
  env: EditorEnv
) => {
  const selected = copyableObjects(session.selection.selectedObjects);
  if (selected.length === 0 || session.readOnly) {
    return false;
  }
  cancelGesture(session, env);
  env.callbacks.onDelete(selected);
  session.selection.clearAll();
  return true;
};

export const hasClipboardObjects = () => readClipboard().length > 0;

export const copySelectedObjects = (session: EditorSession, env: EditorEnv) => {
  const selected = copyableObjects(session.selection.selectedObjects);
  if (selected.length === 0) {
    return false;
  }
  writeClipboard(clipboardCopies(env, selected));
  return true;
};

export const cutSelectedObjects = (session: EditorSession, env: EditorEnv) => {
  const selected = copyableObjects(session.selection.selectedObjects);
  if (selected.length === 0 || session.readOnly) {
    return false;
  }
  writeClipboard(clipboardCopies(env, selected));
  cancelGesture(session, env);
  env.callbacks.onDelete(selected);
  session.selection.replaceAll(
    session.selection.selectedObjects
      .filter((object) => !selected.includes(object))
      .map((object) => object.id)
  );
  return true;
};

const insertCopies = (
  session: EditorSession,
  env: EditorEnv,
  source: readonly LevelObjectData[],
  delta: Vec2
) => {
  const copies = structuredClone(copyableObjects(source));
  if (copies.length === 0 || session.readOnly) {
    return false;
  }
  for (const object of copies) {
    moveLevelObjectBy(object, delta, env.getDefaultWallThickness());
  }
  const inserted = env.callbacks.onInsert(copies);
  session.selection.replaceAll(inserted.map((object) => object.id));
  env.callbacks.onObjectsCommit(inserted);
  return inserted.length > 0;
};

export const duplicateSelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  delta: Vec2 = [...env.getGridLayout().step]
) => insertCopies(session, env, session.selection.selectedObjects, delta);

export const pasteClipboardObjects = (
  session: EditorSession,
  env: EditorEnv,
  options: { inPlace?: boolean; at?: Vec2 } = {}
) => {
  const clipboard = readClipboard();
  if (clipboard.length === 0 || session.readOnly) {
    return false;
  }
  let delta: Vec2;
  if (options.at) {
    const bounds = getSelectionBounds(clipboard, env.getDefaultWallThickness());
    const center = bounds ? selectionCenter(bounds) : ([0, 0] as Vec2);
    delta = [options.at[0] - center[0], options.at[1] - center[1]];
  } else if (options.inPlace) {
    delta = [0, 0];
  } else {
    delta = [...env.getGridLayout().step];
  }
  return insertCopies(session, env, clipboard, delta);
};

export const alignSelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  alignment: SelectionAlignment
) => {
  const selected = session.selection.selectedObjects;
  if (
    session.readOnly ||
    !alignLevelObjects(selected, env.getDefaultWallThickness(), alignment)
  ) {
    return false;
  }
  env.callbacks.onObjectsChange(selected);
  env.callbacks.onObjectsCommit(selected);
  return true;
};

export const distributeSelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  distribution: SelectionDistribution
) => {
  const selected = session.selection.selectedObjects;
  if (
    session.readOnly ||
    !distributeLevelObjects(
      selected,
      env.getDefaultWallThickness(),
      distribution
    )
  ) {
    return false;
  }
  env.callbacks.onObjectsChange(selected);
  env.callbacks.onObjectsCommit(selected);
  return true;
};

export const mirrorCopySelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  mirror: SelectionMirror
) => {
  const copies = structuredClone(
    copyableObjects(session.selection.selectedObjects)
  );
  if (
    session.readOnly ||
    !mirrorLevelObjects(copies, env.getDefaultWallThickness(), mirror, [0, 0])
  ) {
    return false;
  }
  const inserted = env.callbacks.onInsert(copies);
  session.selection.replaceAll(inserted.map((object) => object.id));
  env.callbacks.onObjectsCommit(inserted);
  return inserted.length > 0;
};

export const mirrorSelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  mirror: SelectionMirror
) => {
  const selected = session.selection.selectedObjects;
  if (
    session.readOnly ||
    !mirrorLevelObjects(selected, env.getDefaultWallThickness(), mirror)
  ) {
    return false;
  }
  env.callbacks.onObjectsChange(selected);
  env.callbacks.onObjectsCommit(selected);
  return true;
};

export const focusSelectedObjects = (
  session: EditorSession,
  env: EditorEnv
) => {
  const selected = session.selection.selectedObjects;
  if (selected.length === 0) {
    return false;
  }
  env.callbacks.onFocus(selected);
  return true;
};

export const nudgeSelectedObjects = (
  session: EditorSession,
  env: EditorEnv,
  direction: Vec2,
  distance: number
) => {
  const selected = session.selection.selectedObjects;
  if (selected.length === 0 || session.readOnly) {
    return false;
  }
  for (const object of selected) {
    if (object.prefab === "wall") {
      const { start, end } = getWallEndpoints(object);
      setWallEndpoints(
        object,
        [
          start[0] + direction[0] * distance,
          start[1] + direction[1] * distance,
        ],
        [end[0] + direction[0] * distance, end[1] + direction[1] * distance]
      );
    } else {
      const shape = getLevelObjectShape(object, env.getDefaultWallThickness());
      applyLevelObjectShape(
        object,
        moveShape(shape, [
          shape.position[0] + direction[0] * distance,
          shape.position[1] + direction[1] * distance,
        ])
      );
    }
  }
  env.callbacks.onObjectsChange(selected);
  env.callbacks.onObjectsCommit(selected);
  return true;
};
