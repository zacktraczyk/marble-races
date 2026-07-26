import type { Vec2 } from "@engine/core/transform";
import { LegEditorController } from "./editor";
import { EditorOverlay } from "./editor/view";
import { LegHistory } from "./legHistory";
import type {
  LevelObjectData,
  NewLevelObjectData,
  SerializedLevel,
  SpawnPointVariant,
} from "@game/level/document";
import Stage from "@engine/stage";
import { AuthoredLevel } from "@game/level/authoredLevel";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  MAX_MARBLE_RADIUS,
} from "@game/level/constants";
import {
  createDefaultCourse,
  createPusher,
  createSpawnPoint,
  createWall,
  pusherSpeedForMotion,
  type SliderPlacementDefaults,
} from "@game/level/objects";
import { createGridLayout } from "@game/level/grid";
import { getLevelObjectShape } from "@game/level/geometry";
import type { RoundConfiguration } from "@game/race/types";
import {
  isCreationTool,
  isPusherTool,
  pusherKindFromTool,
  type PusherTool,
  SelectedTool,
} from "./tools";
import { RaceController } from "@game/race/controller";
import { LegCourseSync } from "./courseSync";
import { BuilderCameraController } from "./ui/cameraController";
import { BuilderControls } from "./ui/controls";
import { readRoundConfiguration, readWallThickness } from "./ui/settings";
import { resolveBuilderUi, type BuilderUi } from "./ui";
import { GridOverlay } from "./ui/gridOverlay";
import { MotionInspectorController } from "./ui/motionInspector";
import { TransformInspectorController } from "./ui/transformInspector";
import { updateBuilderInterface } from "./ui/presenter";
import { TooltipController } from "@ui/tooltip";

export type LegBuilderOptions = {
  initialLevel?: SerializedLevel;
  roundConfiguration?: RoundConfiguration;
  onCommit?: (level: SerializedLevel) => void;
  onPreviewStarted?: () => void;
};

export class LegBuilderRuntime {
  private readonly stage: Stage;
  private readonly ui: BuilderUi;
  private readonly level: AuthoredLevel;
  private readonly race: RaceController;
  private readonly history: LegHistory;
  private readonly editorController: LegEditorController;
  private readonly editorOverlay: EditorOverlay;
  private readonly gridOverlay: GridOverlay;
  private readonly controls: BuilderControls;
  private readonly cameraController: BuilderCameraController;
  private readonly motionInspector: MotionInspectorController;
  private readonly transformInspector: TransformInspectorController;
  private readonly courseSync: LegCourseSync;
  private readonly onCommit: LegBuilderOptions["onCommit"];
  private readonly onPreviewStarted: LegBuilderOptions["onPreviewStarted"];
  private configuration: RoundConfiguration;
  /**
   * Era finish plan handed in by the leg builder. The settings inputs cannot
   * express it, so it is re-merged whenever the configuration is re-read.
   */
  private readonly finishPlan: RoundConfiguration["finishPlan"];
  private selectedTool = SelectedTool.Pointer;
  private gridSnapEnabled = true;
  private playbackActive = false;
  private sliderPlacementDefaults: SliderPlacementDefaults = {};
  /** Last spawn position that cleared every wall, used to reject bad drags. */
  private lastValidSpawnPosition: Vec2 | null = null;

  constructor(
    rootElement: HTMLElement | null,
    signal: AbortSignal,
    options: LegBuilderOptions = {}
  ) {
    // DOM and engine
    this.ui = resolveBuilderUi(rootElement);
    this.onCommit = options.onCommit;
    this.onPreviewStarted = options.onPreviewStarted;
    if (options.initialLevel) {
      this.syncLevelInputs(options.initialLevel);
    }
    if (options.roundConfiguration) {
      this.syncRoundConfigurationInputs(options.roundConfiguration);
    }
    this.finishPlan = options.roundConfiguration?.finishPlan;
    new TooltipController(this.ui, signal);
    this.stage = new Stage({
      width: options.initialLevel?.size[0] ?? STAGE_WIDTH,
      height: options.initialLevel?.size[1] ?? STAGE_HEIGHT,
    });
    this.cameraController = new BuilderCameraController(
      this.stage,
      this.ui,
      signal
    );

    // Level and race state. A provided configuration (a race-controlled leg)
    // is authoritative — the sidebar inputs only mirror it, and their range
    // bounds could clamp values like redistributed marble counts.
    this.configuration = {
      ...(options.roundConfiguration ?? readRoundConfiguration(this.ui)),
      finishPlan: this.finishPlan,
    };
    this.level = this.createLevel(options.initialLevel);
    this.rememberSpawnPosition();
    this.race = new RaceController(this.stage, this.level, this.configuration);
    this.history = new LegHistory(this.level.document.serialize());
    this.courseSync = new LegCourseSync({
      stage: this.stage,
      level: this.level,
      ui: this.ui,
      getConfiguration: () => this.configuration,
      getLastValidSpawnPosition: () => this.lastValidSpawnPosition,
      setLastValidSpawnPosition: (value) => {
        this.lastValidSpawnPosition = value;
      },
      commitLevelChange: () => this.commitLevelChange(),
      fitCamera: () => this.cameraController.fitStage(),
    });

    // Editor layers
    this.gridOverlay = this.createGridOverlay();
    this.editorController = this.createEditorController(signal);
    this.editorOverlay = new EditorOverlay(
      this.ui.editorOverlayCanvas,
      this.stage
    );
    this.motionInspector = this.createMotionInspector();
    this.transformInspector = new TransformInspectorController(
      this.ui,
      this.editorController,
      () => this.level.wallThickness,
      () => this.playbackActive,
      signal
    );

    // User actions
    this.controls = this.createControls(signal);

    // Initial view
    this.initializeView();
  }

  private createLevel(initialLevel?: SerializedLevel) {
    const wallThickness =
      initialLevel?.settings.wallThickness ?? readWallThickness(this.ui);
    const level = new AuthoredLevel(
      this.stage,
      this.configuration,
      wallThickness
    );
    if (initialLevel) {
      level.restore(initialLevel);
      // The spawn tool is gone, so a level missing its spawn point (older
      // saves) gets the default one back — it is a permanent fixture now.
      if (!level.find("spawn-point")) {
        level.add(
          createSpawnPoint([0, -this.stage.height / 2 + MAX_MARBLE_RADIUS * 10])
        );
      }
      return level;
    }
    for (const object of createDefaultCourse(
      this.stage.width,
      this.stage.height,
      wallThickness,
      this.configuration
    )) {
      level.add(object);
    }
    return level;
  }

  private createGridOverlay() {
    return new GridOverlay(
      this.stage,
      this.ui.majorGridToggleButton,
      this.ui.minorGridToggleButton,
      this.ui.gridOverlay,
      this.getGridWorldBounds
    );
  }

  private createEditorController(signal: AbortSignal) {
    return new LegEditorController({
      stage: this.stage,
      cameraControls: this.cameraController,
      getObjects: () => this.level.objects,
      getDefaultWallThickness: () => this.level.wallThickness,
      getGridSnapEnabled: () => this.gridSnapEnabled,
      getGridLayout: () => createGridLayout(this.getGridWorldBounds()),
      callbacks: {
        onObjectsChange: (objects) => this.refreshAuthoredObjects(objects),
        onObjectsCommit: () => this.commitLevelChange(),
        onDelete: (objects) => {
          // The spawn point is a permanent course fixture.
          const removable = objects.filter(
            (object) => object.prefab !== "spawn-point"
          );
          if (removable.length === 0) {
            return;
          }
          for (const object of removable) {
            this.level.remove(object.id);
          }
          this.commitLevelChange();
        },
        onInsert: (objects) =>
          objects.map((object) => {
            const copy = structuredClone(object);
            delete (copy as Partial<LevelObjectData>).id;
            return this.level.add(copy as NewLevelObjectData);
          }),
        onDiscard: (objects) => {
          for (const object of objects) {
            this.level.remove(object.id);
          }
        },
        onCreateWall: (start, end) => {
          const object = this.level.add(createWall(start, end));
          this.commitLevelChange();
          return object;
        },
        onPlaceObject: (tool, position) => {
          const object = this.level.add(
            this.createConfiguredPusher(tool, position)
          );
          this.commitLevelChange();
          return object;
        },
        onToolRequest: (tool) => this.setActiveTool(tool),
        onToolComplete: (tool) => {
          if (isPusherTool(tool)) {
            this.setActiveTool(SelectedTool.Pointer);
          }
        },
        onUndo: () => this.undo(),
        onRedo: () => this.redo(),
        onReset: () => this.resetRace(),
        onFocus: (objects) =>
          this.cameraController.focusObjects(objects, this.level.wallThickness),
      },
      signal,
    });
  }

  private createMotionInspector() {
    return new MotionInspectorController(
      this.ui,
      this.editorController,
      this.level,
      () => this.playbackActive,
      () => this.commitLevelChange()
    );
  }

  private createControls(signal: AbortSignal) {
    return new BuilderControls(
      this.ui,
      {
        selectTool: (tool) => this.setActiveTool(tool),
        toggleMajorGrid: () => this.gridOverlay.toggleMajor(),
        toggleMinorGrid: () => this.gridOverlay.toggleMinor(),
        toggleGridSnap: this.toggleGridSnap,
        setSpawnVariant: this.setSpawnVariant,
        changeRoundConfiguration: this.handleRoundConfigurationChange,
        changeCourseSize: this.handleCourseSizeChange,
        changeWallThickness: this.handleWallThicknessChange,
        changeMotionType: this.motionInspector.changeType,
        inputMotionRange: this.motionInspector.inputRange,
        commitMotionRange: this.motionInspector.commitRange,
        reverseMotion: this.motionInspector.reverse,
        setMotionRepeat: this.motionInspector.setRepeat,
        setMotionSpeed: this.motionInspector.setSpeed,
        toggleRace: this.toggleRace,
        resetRace: this.resetRace,
        undo: () => this.undo(),
        redo: () => this.redo(),
        adjustZoom: (delta) => this.cameraController.adjustZoom(delta),
        resetZoom: () => this.cameraController.resetZoom(),
        prepareContextMenu: (screenPoint) =>
          this.editorController.prepareContextMenu(screenPoint),
        performContextAction: (action, screenPoint) =>
          Boolean(
            this.editorController.performContextAction(action, screenPoint)
          ),
      },
      signal
    );
  }

  private initializeView() {
    this.setActiveTool(SelectedTool.Pointer);
    this.controls.showGridSnapEnabled(this.gridSnapEnabled);
    this.gridOverlay.update();
    this.race.reset();
  }

  fixedUpdate(deltaMs: number) {
    this.race.fixedUpdate(deltaMs);
  }

  get levelSnapshot(): SerializedLevel {
    return this.level.document.serialize();
  }

  updateInterface() {
    const race = this.race.snapshot;
    this.syncPlaybackState(race.phase !== "ready");
    const spawnPoint = this.level.find("spawn-point");
    const spawnVariant = spawnPoint?.properties.variant ?? "point";
    if (spawnPoint) {
      // A top slider stays visible during playback — marbles drop from it.
      this.level.setVisible(
        spawnPoint.id,
        !this.playbackActive || spawnVariant === "top-slider"
      );
    }
    this.gridOverlay.setSuppressed(this.playbackActive);
    this.gridOverlay.update();
    this.cameraController.updateControls();
    updateBuilderInterface({
      ui: this.ui,
      configuration: this.configuration,
      race,
      selectedObject: this.editorController.selectedObject,
      selectedTool: this.selectedTool,
      spawnVariant,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.transformInspector.update();
  }

  render() {
    this.stage.render();
    const hoveredObject = this.editorController.hoveredObject;
    const selectedObjects = this.editorController.selectedObjects.filter(
      (object) => !(this.playbackActive && object.prefab === "spawn-point")
    );
    const pusherPlacement = this.editorController.pusherPlacementPreview;
    const pusherDraft = pusherPlacement
      ? ({
          ...this.createConfiguredPusher(
            pusherPlacement.tool,
            pusherPlacement.position
          ),
          id: "pusher-placement-preview",
        } as LevelObjectData)
      : null;
    this.editorOverlay.render({
      active: this.editorController.isActive,
      readOnly: this.playbackActive,
      defaultWallThickness: this.level.wallThickness,
      hoveredObject:
        this.playbackActive && hoveredObject?.prefab === "spawn-point"
          ? null
          : hoveredObject,
      selectedObjects,
      wallDraft: this.editorController.wallDraft,
      pusherDraft,
      wallEndpointFeedback: this.editorController.wallEndpointFeedback,
      selectionMarquee: this.editorController.selectionMarquee,
    });
  }

  dispose() {
    this.race.dispose();
    this.stage.dispose();
  }

  private setActiveTool(tool: SelectedTool) {
    if (this.playbackActive && isCreationTool(tool)) {
      return;
    }
    this.rememberSliderPlacementDefaults();
    this.selectedTool = tool;
    this.controls.showSelectedTool(tool);
    this.editorController.setActiveTool(tool);
    this.stage.canvas.dataset.pointer =
      tool === SelectedTool.Pan
        ? "pan"
        : tool === SelectedTool.Pointer
          ? "select"
          : "shape";
  }

  private readonly toggleGridSnap = () => {
    this.gridSnapEnabled = !this.gridSnapEnabled;
    this.controls.showGridSnapEnabled(this.gridSnapEnabled);
  };

  private refreshAuthoredObjects(objects: readonly LevelObjectData[]) {
    for (const object of objects) {
      if (object.prefab === "spawn-point") {
        this.courseSync.constrainSpawnPoint(object);
      }
      this.level.refresh(object);
    }
  }

  private readonly setSpawnVariant = (variant: SpawnPointVariant) => {
    this.courseSync.setSpawnVariant(variant, this.playbackActive);
  };

  private rememberSpawnPosition() {
    const spawnPoint = this.level.find("spawn-point");
    this.lastValidSpawnPosition = spawnPoint
      ? ([...spawnPoint.transform.position] as Vec2)
      : null;
  }

  private rememberSliderPlacementDefaults() {
    const object = this.editorController.selectedObject;
    if (object?.prefab !== "wall" || object.motion?.type !== "oscillate") {
      return;
    }
    this.sliderPlacementDefaults = {
      repeat: object.motion.repeat ?? "ping-pong",
      speed: pusherSpeedForMotion(object.motion),
      rotation: getLevelObjectShape(object, this.level.wallThickness).rotation,
    };
  }

  private createConfiguredPusher(tool: PusherTool, position: Vec2) {
    const kind = pusherKindFromTool(tool);
    return createPusher(
      kind,
      position,
      kind === "slider" ? this.sliderPlacementDefaults : undefined
    );
  }

  private commitLevelChange() {
    this.rememberSliderPlacementDefaults();
    this.race.reset();
    const snapshot = this.levelSnapshot;
    if (this.history.record(snapshot)) {
      this.onCommit?.(snapshot);
    }
  }

  private undo() {
    if (this.playbackActive) {
      return;
    }
    const snapshot = this.history.undo();
    if (snapshot) {
      this.restoreLevel(snapshot);
      this.onCommit?.(this.levelSnapshot);
    }
  }

  private redo() {
    if (this.playbackActive) {
      return;
    }
    const snapshot = this.history.redo();
    if (snapshot) {
      this.restoreLevel(snapshot);
      this.onCommit?.(this.levelSnapshot);
    }
  }

  private restoreLevel(snapshot: SerializedLevel) {
    const sizeChanged =
      snapshot.size[0] !== this.stage.width ||
      snapshot.size[1] !== this.stage.height;
    this.stage.setSize(...snapshot.size);
    this.level.restore(snapshot);
    this.rememberSpawnPosition();
    this.editorController.clearSelection();
    this.syncLevelInputs(snapshot);
    if (sizeChanged) {
      this.cameraController.fitStage();
    }
    this.race.reset();
  }

  private syncLevelInputs(level: SerializedLevel) {
    this.ui.courseWidthInput.value = `${level.size[0]}`;
    this.ui.courseHeightInput.value = `${level.size[1]}`;
    this.ui.wallThicknessInput.value = `${level.settings.wallThickness}`;
  }

  private syncRoundConfigurationInputs(configuration: RoundConfiguration) {
    this.ui.teamCountInput.value = `${configuration.teamCount}`;
    this.ui.marblesPerTeamInput.value = `${configuration.marblesPerTeam}`;
    this.ui.releaseIntervalInput.value = `${configuration.releaseIntervalMs}`;
  }

  private readonly getGridWorldBounds = () =>
    this.courseSync.getGridWorldBounds();

  private syncPlaybackState(playbackActive: boolean) {
    if (this.playbackActive === playbackActive) {
      return;
    }
    this.playbackActive = playbackActive;
    this.ui.root.dataset.previewing = `${playbackActive}`;
    this.editorController.setReadOnly(playbackActive);
    if (playbackActive) {
      this.controls.setPusherLibraryOpen(false);
      this.editorController.clearSelection();
      this.setActiveTool(SelectedTool.Pan);
    } else {
      this.setActiveTool(SelectedTool.Pointer);
    }
  }

  private readonly handleRoundConfigurationChange = () => {
    this.configuration = {
      ...readRoundConfiguration(this.ui),
      finishPlan: this.finishPlan,
    };
    this.race.setConfiguration(this.configuration);
  };

  private readonly handleCourseSizeChange = () => {
    this.courseSync.handleCourseSizeChange();
  };

  private readonly handleWallThicknessChange = () => {
    this.courseSync.handleWallThicknessChange();
  };

  private readonly toggleRace = () => {
    const wasReady = this.race.snapshot.phase === "ready";
    this.race.toggleRunning();
    if (wasReady && this.race.snapshot.phase === "running") {
      this.onPreviewStarted?.();
    }
    this.syncPlaybackState(this.race.snapshot.phase !== "ready");
  };

  private readonly resetRace = () => {
    this.race.reset();
    this.syncPlaybackState(false);
  };
}
