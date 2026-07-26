import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "@game/level/document";
import type { GridLayout } from "@game/level/grid";
import type { PusherTool, SelectedTool } from "../tools";
import type { DragDepsBase } from "./input/drag";
import type { LegEditorKeyboard } from "./input/keyboard";
import type { HandleTestDeps, SnapDeps } from "./hitTest";

export type EditorCallbacks = {
  onObjectsChange(objects: readonly LevelObjectData[]): void;
  onObjectsCommit(objects: readonly LevelObjectData[]): void;
  onDelete(objects: readonly LevelObjectData[]): void;
  onInsert(objects: readonly LevelObjectData[]): LevelObjectData[];
  onDiscard(objects: readonly LevelObjectData[]): void;
  onCreateWall(start: Vec2, end: Vec2): LevelObjectData;
  onPlaceObject(tool: PusherTool, position: Vec2): LevelObjectData;
  onToolRequest(tool: SelectedTool): void;
  onToolComplete(tool: SelectedTool): void;
  onUndo(): void;
  onRedo(): void;
  onReset(): void;
  onFocus(objects: readonly LevelObjectData[]): void;
};

export type EditorCameraControls = {
  panByScreen(deltaX: number, deltaY: number): void;
  handleWheel(screenPoint: Vec2, event: WheelEvent): void;
};

/** Service ports for editor modules — no session mutations. */
export type EditorEnv = {
  readonly callbacks: EditorCallbacks;
  readonly getObjects: () => readonly LevelObjectData[];
  readonly getDefaultWallThickness: () => number;
  readonly getGridSnapEnabled: () => boolean;
  readonly getGridLayout: () => GridLayout;
  readonly cameraControls: EditorCameraControls;
  readonly keyboard: LegEditorKeyboard;
  readonly screenPoint: (event: PointerEvent | WheelEvent) => Vec2;
  readonly worldPoint: (screenPoint: Vec2) => Vec2;
  readonly screenDistance: (first: Vec2, second: Vec2) => number;
  readonly setCursor: (cursor: string) => void;
  readonly capturePointer: (pointerId: number) => void;
  readonly releasePointer: (pointerId: number) => void;
  readonly cameraZoom: () => number;
  readonly handleDeps: () => HandleTestDeps;
  readonly snapDeps: () => SnapDeps;
  readonly dragDeps: () => DragDepsBase;
};

/**
 * Looks up a course object by id, tolerating a null id so callers can pass a
 * possibly-empty selection straight through.
 * @param getObjects - accessor for the current course objects
 * @param id - the object id to find, or null
 * @returns the matching object, or null when the id is null or unknown
 */
export function findLevelObject(
  getObjects: () => readonly LevelObjectData[],
  id: string | null
): LevelObjectData | null {
  if (!id) {
    return null;
  }
  return getObjects().find((object) => object.id === id) ?? null;
}
