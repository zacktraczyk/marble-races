import type { Vec2 } from "@engine/core/transform";
import type Stage from "@engine/stage";
import type { GridLayout } from "@game/level/grid";
import { isPusherTool, SelectedTool } from "../tools";
import type { LevelObjectData } from "@game/level/document";
import type {
  PusherPlacementPreview,
  SelectionMarquee,
  WallDraft,
} from "./gestures";
import {
  findLevelObject,
  type EditorCallbacks,
  type EditorCameraControls,
  type EditorEnv,
} from "./env";
import {
  findWallEndpointTarget,
  type HandleTestDeps,
  type SnapDeps,
} from "./hitTest";
import {
  cancelGesture,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  LegEditorKeyboard,
  updateCursor,
  updateIdleState,
} from "./input";
import { EditorSession } from "./session";
import {
  alignSelectedObjects,
  copySelectedObjects,
  cutSelectedObjects,
  deleteSelectedObjects,
  distributeSelectedObjects,
  duplicateSelectedObjects,
  finishWallDraft,
  focusSelectedObjects,
  handleEscapeKey,
  hasClipboardObjects,
  mirrorCopySelectedObjects,
  mirrorSelectedObjects,
  nudgeSelectedObjects,
  pasteClipboardObjects,
  selectAllObjects,
} from "./selectionActions";
import {
  applyLevelObjectShape,
  type LevelObjectShape,
} from "@game/level/geometry";
import { pickLevelObject, pickTolerance } from "../geometry";
import type {
  SelectionAlignment,
  SelectionDistribution,
  SelectionMirror,
} from "./selection";

export type EditorContextAction =
  | "duplicate"
  | "cut"
  | "copy"
  | "paste"
  | "paste-in-place"
  | "select-all"
  | "focus"
  | "delete"
  | `align-${SelectionAlignment}`
  | `distribute-${SelectionDistribution}`
  | `flip-${SelectionMirror}`
  | `mirror-${SelectionMirror}`;

export type EditorContextState = {
  selectionCount: number;
  copyableSelectionCount: number;
  canPaste: boolean;
};

export class LegEditorController {
  private readonly stage: Stage;
  private readonly cameraControls: EditorCameraControls;
  private readonly getObjects: () => readonly LevelObjectData[];
  private readonly getDefaultWallThickness: () => number;
  private readonly getGridSnapEnabled: () => boolean;
  private readonly getGridLayout: () => GridLayout;
  private readonly callbacks: EditorCallbacks;
  private readonly session: EditorSession;
  private readonly env: EditorEnv;
  private readonly keyboard: LegEditorKeyboard;

  constructor({
    stage,
    cameraControls,
    getObjects,
    getDefaultWallThickness,
    getGridSnapEnabled,
    getGridLayout,
    callbacks,
    signal,
  }: {
    stage: Stage;
    cameraControls: EditorCameraControls;
    getObjects: () => readonly LevelObjectData[];
    getDefaultWallThickness: () => number;
    getGridSnapEnabled: () => boolean;
    getGridLayout: () => GridLayout;
    callbacks: EditorCallbacks;
    signal: AbortSignal;
  }) {
    this.stage = stage;
    this.cameraControls = cameraControls;
    this.getObjects = getObjects;
    this.getDefaultWallThickness = getDefaultWallThickness;
    this.getGridSnapEnabled = getGridSnapEnabled;
    this.getGridLayout = getGridLayout;
    this.callbacks = callbacks;

    this.session = new EditorSession(getObjects);
    this.env = this.createEnv();
    this.keyboard = this.createKeyboard(signal);
    this.bindCanvasEvents(signal);
  }

  private createKeyboard(signal: AbortSignal) {
    return new LegEditorKeyboard(
      {
        undo: () => {
          cancelGesture(this.session, this.env);
          this.callbacks.onUndo();
        },
        redo: () => {
          cancelGesture(this.session, this.env);
          this.callbacks.onRedo();
        },
        copy: this.copySelection,
        cut: this.cutSelection,
        paste: (inPlace) => this.pasteSelection({ inPlace }),
        duplicate: this.duplicateSelection,
        focusSelection: this.focusSelection,
        selectAll: this.selectAll,
        escape: this.handleEscape,
        finishWall: this.finishWall,
        reset: () => {
          if (!this.session.readOnly) {
            return false;
          }
          this.callbacks.onReset();
          return true;
        },
        requestTool: (tool) => {
          if (!this.session.readOnly || tool === SelectedTool.Pan) {
            this.callbacks.onToolRequest(tool);
          }
        },
        deleteSelection: this.deleteSelection,
        nudgeSelection: this.nudgeSelection,
        modifierChanged: this.handleSelectionModifierChange,
        spaceChanged: () => updateCursor(this.session, this.env),
        blur: this.handleWindowBlur,
      },
      signal
    );
  }

  private createEnv(): EditorEnv {
    // Keyboard is assigned after env; modules only read it after construction.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- env ports
    const controller = this;
    return {
      callbacks: this.callbacks,
      getObjects: this.getObjects,
      getDefaultWallThickness: this.getDefaultWallThickness,
      getGridSnapEnabled: this.getGridSnapEnabled,
      getGridLayout: this.getGridLayout,
      cameraControls: this.cameraControls,
      get keyboard() {
        return controller.keyboard;
      },
      screenPoint: (event) => this.screenPoint(event),
      worldPoint: (screenPoint) => this.worldPoint(screenPoint),
      screenDistance: (first, second) => this.screenDistance(first, second),
      setCursor: (cursor) => this.setCursor(cursor),
      capturePointer: (pointerId) => this.capturePointer(pointerId),
      releasePointer: (pointerId) => this.releasePointer(pointerId),
      cameraZoom: () => this.cameraZoom,
      handleDeps: () => this.handleDeps,
      snapDeps: () => this.snapDeps,
      dragDeps: () => this.dragDeps,
    };
  }

  setActiveTool(tool: SelectedTool) {
    if (this.session.activeTool !== tool) {
      cancelGesture(this.session, this.env);
      this.session.clearWallAnchor();
    }
    this.session.activeTool = tool;
    this.session.selection.setHovered(null);
    this.session.endpointFeedback = null;
    this.session.placementPreviewPosition = null;
    updateCursor(this.session, this.env);
  }

  setReadOnly(readOnly: boolean) {
    if (readOnly && !this.session.readOnly) {
      cancelGesture(this.session, this.env);
      this.session.clearWallAnchor();
      this.session.selection.setHovered(null);
      this.session.endpointFeedback = null;
      this.session.placementPreviewPosition = null;
    }
    this.session.readOnly = readOnly;
    updateCursor(this.session, this.env);
  }

  clearSelection() {
    this.session.selection.clearAll();
  }

  get isActive() {
    return (
      this.session.activeTool === SelectedTool.Pointer ||
      this.session.selection.size > 0 ||
      this.session.wallAnchor !== null ||
      this.session.endpointFeedback !== null ||
      this.pusherPlacementPreview !== null ||
      this.session.gesture?.kind === "wall" ||
      this.session.gesture?.kind === "marquee"
    );
  }

  get selectedObjects() {
    return this.session.selection.selectedObjects;
  }

  get selectedObject() {
    return this.session.selection.selectedObject;
  }

  get selectionCount() {
    return this.session.selection.size;
  }

  prepareContextMenu(screenPoint: Vec2): EditorContextState {
    if (!this.session.readOnly) {
      const picked = pickLevelObject(
        this.getObjects(),
        this.worldPoint(screenPoint),
        pickTolerance(this.cameraZoom),
        this.getDefaultWallThickness()
      );
      if (picked && !this.session.selection.has(picked.id)) {
        this.session.selection.replace(picked.id);
      } else if (!picked) {
        this.session.selection.clear();
      }
    }
    return {
      selectionCount: this.session.selection.size,
      copyableSelectionCount: this.selectedObjects.filter(
        (object) => object.prefab !== "spawn-point"
      ).length,
      canPaste: !this.session.readOnly && hasClipboardObjects(),
    };
  }

  performContextAction(action: EditorContextAction, screenPoint?: Vec2) {
    if (action.startsWith("align-")) {
      return this.alignSelection(action.slice(6) as SelectionAlignment);
    }
    if (action.startsWith("distribute-")) {
      return this.distributeSelection(
        action.slice(11) as SelectionDistribution
      );
    }
    if (action.startsWith("mirror-")) {
      return this.mirrorCopySelection(action.slice(7) as SelectionMirror);
    }
    if (action.startsWith("flip-")) {
      return mirrorSelectedObjects(
        this.session,
        this.env,
        action.slice(5) as SelectionMirror
      );
    }
    switch (action) {
      case "duplicate":
        return this.duplicateSelection();
      case "cut":
        return this.cutSelection();
      case "copy":
        return this.copySelection();
      case "paste":
        return this.pasteSelection(
          screenPoint ? { at: this.worldPoint(screenPoint) } : undefined
        );
      case "paste-in-place":
        return this.pasteSelection({ inPlace: true });
      case "select-all":
        return this.selectAll();
      case "focus":
        return this.focusSelection();
      case "delete":
        return this.deleteSelection();
    }
  }

  alignSelection(alignment: SelectionAlignment) {
    return alignSelectedObjects(this.session, this.env, alignment);
  }

  distributeSelection(distribution: SelectionDistribution) {
    return distributeSelectedObjects(this.session, this.env, distribution);
  }

  mirrorCopySelection(mirror: SelectionMirror) {
    return mirrorCopySelectedObjects(this.session, this.env, mirror);
  }

  updateSelectedShape(shape: LevelObjectShape, wallThickness?: number) {
    const object = this.selectedObject;
    if (!object || this.session.readOnly) {
      return false;
    }
    applyLevelObjectShape(object, shape);
    if (object.prefab === "wall" && wallThickness !== undefined) {
      object.properties.thickness = wallThickness;
    }
    this.callbacks.onObjectsChange([object]);
    this.callbacks.onObjectsCommit([object]);
    return true;
  }

  get hoveredObject() {
    return this.session.selection.hoveredObject;
  }

  get wallDraft(): WallDraft | null {
    if (this.session.gesture?.kind === "wall") {
      return {
        start: [...this.session.gesture.start],
        end: [...this.session.gesture.end],
        thickness: this.getDefaultWallThickness(),
      };
    }
    if (this.session.wallAnchor) {
      return {
        start: [...this.session.wallAnchor],
        end: [...(this.session.wallPreviewEnd ?? this.session.wallAnchor)],
        thickness: this.getDefaultWallThickness(),
      };
    }
    return null;
  }

  get selectionMarquee(): SelectionMarquee | null {
    return this.session.gesture?.kind === "marquee" &&
      this.session.gesture.changed
      ? {
          start: [...this.session.gesture.startWorld],
          end: [...this.session.gesture.currentWorld],
        }
      : null;
  }

  get wallEndpointFeedback() {
    return this.session.endpointFeedback
      ? {
          ...this.session.endpointFeedback,
          position: [...this.session.endpointFeedback.position] as Vec2,
        }
      : null;
  }

  get pusherPlacementPreview(): PusherPlacementPreview | null {
    return isPusherTool(this.session.activeTool) &&
      this.session.placementPreviewPosition
      ? {
          tool: this.session.activeTool,
          position: [...this.session.placementPreviewPosition],
        }
      : null;
  }

  private get handleDeps(): HandleTestDeps {
    return {
      worldToScreen: (point) =>
        this.stage.camera.worldToScreen(...point) as Vec2,
      screenDistance: this.screenDistance.bind(this),
      getObjects: this.getObjects,
      getDefaultWallThickness: this.getDefaultWallThickness,
      cameraZoom: this.stage.camera.zoom,
    };
  }

  private get snapDeps(): SnapDeps {
    return {
      worldToScreen: (point) =>
        this.stage.camera.worldToScreen(...point) as Vec2,
      getGridSnapEnabled: this.getGridSnapEnabled,
      getGridLayout: this.getGridLayout,
      findWallEndpointTarget: (screenPoint, maximumDistance, options) =>
        findWallEndpointTarget(
          this.handleDeps,
          screenPoint,
          maximumDistance,
          options
        ),
      setEndpointFeedback: (target, kind) =>
        this.session.setEndpointFeedback(target, kind),
    };
  }

  private get dragDeps() {
    return {
      screenDistance: this.screenDistance.bind(this),
      getDefaultWallThickness: this.getDefaultWallThickness,
      getGridSnapEnabled: this.getGridSnapEnabled,
      getGridLayout: this.getGridLayout,
      getObjects: this.getObjects,
      findObject: (id: string) => findLevelObject(this.getObjects, id),
      onObjectsChange: this.callbacks.onObjectsChange.bind(this.callbacks),
    };
  }

  private get cameraZoom() {
    return this.stage.camera.zoom;
  }

  private setCursor(cursor: string) {
    this.stage.canvas.style.cursor = cursor;
  }

  private screenPoint(event: PointerEvent | WheelEvent): Vec2 {
    const bounds = this.stage.canvas.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  }

  private worldPoint(screenPoint: Vec2): Vec2 {
    const [worldX, worldY] = this.stage.camera.screenToWorld(...screenPoint);
    return [worldX, worldY];
  }

  private capturePointer(pointerId: number) {
    this.stage.canvas.setPointerCapture(pointerId);
  }

  private releasePointer(pointerId: number) {
    if (this.stage.canvas.hasPointerCapture(pointerId)) {
      this.stage.canvas.releasePointerCapture(pointerId);
    }
  }

  private screenDistance(first: Vec2, second: Vec2) {
    return Math.hypot(first[0] - second[0], first[1] - second[1]);
  }

  private bindCanvasEvents(signal: AbortSignal) {
    const canvas = this.stage.canvas;
    canvas.addEventListener("pointerdown", this.pointerDown, { signal });
    canvas.addEventListener("pointermove", this.pointerMove, { signal });
    canvas.addEventListener("pointerup", this.pointerUp, { signal });
    canvas.addEventListener("pointercancel", this.pointerCancel, { signal });
    canvas.addEventListener("pointerleave", this.pointerLeave, { signal });
    canvas.addEventListener("wheel", this.wheel, { signal, passive: false });
  }

  private readonly pointerDown = (event: PointerEvent) => {
    handlePointerDown(this.session, this.env, event);
  };

  private readonly pointerMove = (event: PointerEvent) => {
    handlePointerMove(this.session, this.env, event);
  };

  private readonly pointerUp = (event: PointerEvent) => {
    handlePointerUp(this.session, this.env, event);
  };

  private readonly pointerCancel = (event: PointerEvent) => {
    if (this.session.gesture?.pointerId === event.pointerId) {
      cancelGesture(this.session, this.env);
    }
  };

  private readonly pointerLeave = () => {
    this.session.lastPointerScreen = null;
    this.session.placementPreviewPosition = null;
    if (!this.session.gesture) {
      this.session.selection.setHovered(null);
      this.session.endpointFeedback = null;
      updateCursor(this.session, this.env);
    }
  };

  private readonly wheel = (event: WheelEvent) => {
    const screenPoint = this.screenPoint(event);
    this.cameraControls.handleWheel(screenPoint, event);
    event.preventDefault();
  };

  private readonly selectAll = () => selectAllObjects(this.session, this.env);

  private readonly copySelection = () =>
    copySelectedObjects(this.session, this.env);

  private readonly cutSelection = () =>
    cutSelectedObjects(this.session, this.env);

  private readonly pasteSelection = (options?: {
    inPlace?: boolean;
    at?: Vec2;
  }) => pasteClipboardObjects(this.session, this.env, options);

  private readonly duplicateSelection = () => {
    const delta = this.session.repeatDuplicateDelta ?? [
      ...this.getGridLayout().step,
    ];
    const duplicated = duplicateSelectedObjects(this.session, this.env, delta);
    if (duplicated) {
      this.session.repeatDuplicateDelta = [...delta];
    }
    return duplicated;
  };

  private readonly focusSelection = () =>
    focusSelectedObjects(this.session, this.env);

  private readonly handleEscape = () => handleEscapeKey(this.session, this.env);

  private readonly finishWall = () => finishWallDraft(this.session, this.env);

  private readonly deleteSelection = () =>
    deleteSelectedObjects(this.session, this.env);

  private readonly nudgeSelection = (direction: Vec2, distance: number) =>
    nudgeSelectedObjects(this.session, this.env, direction, distance);

  private readonly handleSelectionModifierChange = (held: boolean) => {
    this.session.endpointFeedback = null;
    if (this.session.lastPointerScreen) {
      updateIdleState(this.session, this.env, this.session.lastPointerScreen, {
        temporarySelection: held && this.session.creationToolActive,
      });
    } else {
      updateCursor(this.session, this.env);
    }
  };

  private readonly handleWindowBlur = () => {
    this.session.endpointFeedback = null;
    if (this.session.gesture) {
      cancelGesture(this.session, this.env);
    }
    updateCursor(this.session, this.env);
  };
}
