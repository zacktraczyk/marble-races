import type { SliderRepeat, SpawnPointVariant } from "@game/level/document";
import type { PusherSpeed } from "@game/level/objects";
import { isPusherTool, SelectedTool } from "../tools";
import type { BuilderUi } from ".";
import type { Vec2 } from "@engine/core/transform";
import type { EditorContextAction, EditorContextState } from "../editor";

export type BuilderControlActions = {
  selectTool(tool: SelectedTool): void;
  toggleMajorGrid(): void;
  toggleMinorGrid(): void;
  toggleGridSnap(): void;
  setSpawnVariant(variant: SpawnPointVariant): void;
  changeRoundConfiguration(): void;
  changeCourseSize(): void;
  changeWallThickness(): void;
  changeMotionType(): void;
  inputMotionRange(): void;
  commitMotionRange(): void;
  reverseMotion(): void;
  setMotionRepeat(repeat: SliderRepeat): void;
  setMotionSpeed(speed: PusherSpeed): void;
  toggleRace(): void;
  resetRace(): void;
  undo(): void;
  redo(): void;
  adjustZoom(delta: number): void;
  resetZoom(): void;
  prepareContextMenu(screenPoint: Vec2): EditorContextState;
  performContextAction(
    action: EditorContextAction,
    screenPoint?: Vec2
  ): boolean;
};

const ZOOM_STEP = 0.1;

const releasePointerFocus = (event: MouseEvent) => {
  if (event.detail > 0 && event.currentTarget instanceof HTMLButtonElement) {
    event.currentTarget.blur();
  }
};

const isKeyboardControlTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.matches(
      'button, a[href], input, textarea, select, summary, [role="button"], [role="menuitem"]'
    ));

/** Owns builder DOM events and transient control presentation. */
export class BuilderControls {
  private readonly buttonByTool: ReadonlyMap<SelectedTool, HTMLButtonElement>;
  private contextScreenPoint: Vec2 | null = null;

  constructor(
    private readonly ui: BuilderUi,
    actions: BuilderControlActions,
    signal: AbortSignal
  ) {
    this.buttonByTool = new Map<SelectedTool, HTMLButtonElement>([
      [SelectedTool.Pan, ui.panButton],
      [SelectedTool.Pointer, ui.pointerButton],
      [SelectedTool.Wall, ui.wallButton],
      [SelectedTool.Slider, ui.sliderButton],
      [SelectedTool.Spinner, ui.spinnerButton],
      [SelectedTool.Sweeper, ui.sweeperButton],
    ]);

    for (const [tool, button] of this.buttonByTool) {
      button.addEventListener(
        "click",
        (event) => {
          actions.selectTool(tool);
          releasePointerFocus(event);
        },
        { signal }
      );
    }

    ui.editorCanvas.addEventListener(
      "contextmenu",
      (event) => {
        event.preventDefault();
        if (ui.root.dataset.previewing === "true") {
          this.setContextMenuOpen(false);
          return;
        }
        const canvasBounds = ui.editorCanvas.getBoundingClientRect();
        const screenPoint: Vec2 = [
          event.clientX - canvasBounds.left,
          event.clientY - canvasBounds.top,
        ];
        this.contextScreenPoint = screenPoint;
        const state = actions.prepareContextMenu(screenPoint);
        this.showContextMenu(event.clientX, event.clientY, state);
      },
      { signal }
    );
    for (const button of ui.contextActionButtons) {
      button.addEventListener(
        "click",
        () => {
          const action = button.dataset.contextAction as
            | EditorContextAction
            | undefined;
          if (action) {
            actions.performContextAction(
              action,
              this.contextScreenPoint ?? undefined
            );
          }
          this.setContextMenuOpen(false);
          ui.editorCanvas.focus();
        },
        { signal }
      );
    }

    ui.pusherMenuToggleButton.addEventListener(
      "click",
      (event) => {
        this.setPusherLibraryOpen(ui.pusherLibrary.hidden);
        releasePointerFocus(event);
      },
      { signal }
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !ui.pusherLibrary.hidden &&
          !ui.pusherLibrary.contains(event.target as Node) &&
          !ui.pusherMenuToggleButton.contains(event.target as Node)
        ) {
          this.setPusherLibraryOpen(false);
        }
        if (
          !ui.contextMenu.hidden &&
          !ui.contextMenu.contains(event.target as Node)
        ) {
          this.setContextMenuOpen(false);
        }
      },
      { signal }
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Escape" &&
          !event.repeat &&
          ui.root.dataset.previewing === "true"
        ) {
          actions.resetRace();
          ui.editorCanvas.focus();
          event.preventDefault();
          event.stopPropagation();
        } else if (
          event.key === "4" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.repeat &&
          !isKeyboardControlTarget(event.target) &&
          !ui.pusherMenuToggleButton.disabled
        ) {
          this.setContextMenuOpen(false);
          this.setPusherLibraryOpen(true);
          ui.sliderButton.focus();
          event.preventDefault();
        } else if (event.key === "Escape" && !ui.pusherLibrary.hidden) {
          this.setPusherLibraryOpen(false);
          ui.pusherMenuToggleButton.focus();
          event.preventDefault();
          event.stopPropagation();
        } else if (event.key === "Escape" && !ui.contextMenu.hidden) {
          this.setContextMenuOpen(false);
          ui.editorCanvas.focus();
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { signal }
    );

    ui.majorGridToggleButton.addEventListener(
      "click",
      actions.toggleMajorGrid,
      {
        signal,
      }
    );
    ui.minorGridToggleButton.addEventListener(
      "click",
      actions.toggleMinorGrid,
      {
        signal,
      }
    );
    ui.gridSnapToggleButton.addEventListener("click", actions.toggleGridSnap, {
      signal,
    });
    ui.spawnTypePointButton.addEventListener(
      "click",
      (event) => {
        actions.setSpawnVariant("point");
        releasePointerFocus(event);
      },
      { signal }
    );
    ui.spawnTypeTopSliderButton.addEventListener(
      "click",
      (event) => {
        actions.setSpawnVariant("top-slider");
        releasePointerFocus(event);
      },
      { signal }
    );
    ui.teamCountInput.addEventListener(
      "input",
      actions.changeRoundConfiguration,
      { signal }
    );
    ui.marblesPerTeamInput.addEventListener(
      "input",
      actions.changeRoundConfiguration,
      { signal }
    );
    ui.releaseIntervalInput.addEventListener(
      "input",
      actions.changeRoundConfiguration,
      { signal }
    );
    ui.courseWidthInput.addEventListener("change", actions.changeCourseSize, {
      signal,
    });
    ui.courseHeightInput.addEventListener("change", actions.changeCourseSize, {
      signal,
    });
    ui.wallThicknessInput.addEventListener(
      "change",
      actions.changeWallThickness,
      { signal }
    );
    ui.motionTypeSelect.addEventListener("change", actions.changeMotionType, {
      signal,
    });
    ui.motionRangeInput.addEventListener("input", actions.inputMotionRange, {
      signal,
    });
    ui.motionRangeInput.addEventListener("change", actions.commitMotionRange, {
      signal,
    });
    ui.motionReverseButton.addEventListener("click", actions.reverseMotion, {
      signal,
    });
    for (const button of ui.motionRepeatButtons) {
      button.addEventListener(
        "click",
        () => {
          const repeat = button.dataset.repeat as SliderRepeat | undefined;
          if (repeat) {
            actions.setMotionRepeat(repeat);
          }
        },
        { signal }
      );
    }
    for (const button of ui.motionSpeedButtons) {
      button.addEventListener(
        "click",
        () => {
          const speed = button.dataset.speed as PusherSpeed | undefined;
          if (speed) {
            actions.setMotionSpeed(speed);
          }
        },
        { signal }
      );
    }
    ui.playButton.addEventListener("click", actions.toggleRace, { signal });
    ui.resetButton.addEventListener("click", actions.resetRace, { signal });
    ui.undoButton.addEventListener("click", actions.undo, { signal });
    ui.redoButton.addEventListener("click", actions.redo, { signal });
    ui.zoomInButton.addEventListener(
      "click",
      () => actions.adjustZoom(ZOOM_STEP),
      { signal }
    );
    ui.zoomOutButton.addEventListener(
      "click",
      () => actions.adjustZoom(-ZOOM_STEP),
      { signal }
    );
    ui.zoomResetButton.addEventListener("click", actions.resetZoom, { signal });
  }

  showSelectedTool(tool: SelectedTool) {
    for (const button of this.buttonByTool.values()) {
      button.dataset.active = `${button === this.buttonByTool.get(tool)}`;
    }
    this.ui.pusherMenuToggleButton.dataset.active = `${isPusherTool(tool)}`;
    if (isPusherTool(tool)) {
      this.setPusherLibraryOpen(false);
    }
  }

  showGridSnapEnabled(enabled: boolean) {
    this.ui.gridSnapToggleButton.dataset.active = `${enabled}`;
    this.ui.gridSnapToggleButton.ariaChecked = `${enabled}`;
  }

  setPusherLibraryOpen(open: boolean) {
    this.ui.pusherLibrary.hidden = !open;
    this.ui.pusherMenuToggleButton.ariaExpanded = `${open}`;
  }

  private showContextMenu(
    clientX: number,
    clientY: number,
    state: EditorContextState
  ) {
    const selection = state.selectionCount > 0;
    this.ui.contextCanvasSection.hidden = selection;
    this.ui.contextSelectionSection.hidden = !selection;
    this.ui.contextMultiSection.hidden = state.selectionCount < 2;
    const needsCopyableSelection = new Set([
      "duplicate",
      "cut",
      "copy",
      "mirror-left-right",
      "mirror-top-bottom",
      "delete",
    ]);
    for (const button of this.ui.contextActionButtons) {
      const action = button.dataset.contextAction ?? "";
      if (
        button.dataset.contextAction === "paste" ||
        button.dataset.contextAction === "paste-in-place"
      ) {
        button.disabled = !state.canPaste;
      }
      if (button.dataset.contextAction?.startsWith("distribute-")) {
        button.disabled = state.selectionCount < 3;
      }
      if (needsCopyableSelection.has(action)) {
        button.disabled = state.copyableSelectionCount === 0;
      }
    }
    this.ui.contextMenu.hidden = false;
    const rootBounds = this.ui.root.getBoundingClientRect();
    const menuBounds = this.ui.contextMenu.getBoundingClientRect();
    const left = Math.min(
      clientX - rootBounds.left,
      rootBounds.width - menuBounds.width - 8
    );
    const top = Math.min(
      clientY - rootBounds.top,
      rootBounds.height - menuBounds.height - 8
    );
    this.ui.contextMenu.style.left = `${Math.max(8, left)}px`;
    this.ui.contextMenu.style.top = `${Math.max(8, top)}px`;
  }

  private setContextMenuOpen(open: boolean) {
    this.ui.contextMenu.hidden = !open;
    if (!open) {
      this.contextScreenPoint = null;
    }
  }
}
