import { CameraResizeController } from "@engine/camera/resizeController";
import type { CameraFitInsets } from "@engine/camera/fit";
import type { Vec2 } from "@engine/core/transform";
import type Stage from "@engine/stage";
import type { BuilderUi } from ".";
import type { LevelObjectData } from "@game/level/document";
import { getSelectionBounds, selectionCenter } from "../editor/selection";
import { calculateCameraFitForRect } from "@engine/camera/fit";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

/** Owns builder camera policy, controls, and UI-aware viewport fitting. */
export class BuilderCameraController {
  private readonly resizeController: CameraResizeController;

  constructor(
    private readonly stage: Stage,
    private readonly ui: BuilderUi,
    signal: AbortSignal
  ) {
    this.resizeController = new CameraResizeController(
      stage.canvas,
      stage.camera,
      {
        getContentSize: () => [stage.width, stage.height],
        insets: this.getFitInsets,
        signal,
      }
    );
  }

  adjustZoom(delta: number) {
    this.setZoomAtCanvasCenter(
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.stage.camera.zoom + delta))
    );
  }

  resetZoom() {
    this.setZoomAtCanvasCenter(1);
  }

  panByScreen(deltaX: number, deltaY: number) {
    this.stage.camera.panByScreen(deltaX, deltaY);
  }

  handleWheel(screenPoint: Vec2, event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          this.stage.camera.zoom * Math.exp(-event.deltaY * 0.002)
        )
      );
      this.stage.camera.zoomAtScreenPoint(...screenPoint, zoom);
    } else {
      this.stage.camera.panByScreen(-event.deltaX, -event.deltaY);
    }
  }

  fitStage() {
    this.resizeController.fit();
  }

  focusObjects(
    objects: readonly LevelObjectData[],
    defaultWallThickness: number
  ) {
    const bounds = getSelectionBounds(objects, defaultWallThickness);
    if (!bounds) {
      return;
    }
    const center = selectionCenter(bounds);
    const padding = 48;
    const baseInsets = this.getFitInsets();
    const insets = {
      top: baseInsets.top + padding,
      right: baseInsets.right + padding,
      bottom: baseInsets.bottom + padding,
      left: baseInsets.left + padding,
    };
    const fit = calculateCameraFitForRect({
      viewportWidth: this.stage.canvas.clientWidth,
      viewportHeight: this.stage.canvas.clientHeight,
      rect: {
        center,
        width: Math.max(20, bounds.max[0] - bounds.min[0]),
        height: Math.max(20, bounds.max[1] - bounds.min[1]),
      },
      insets,
    });
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit.zoom));
    const availableWidth =
      this.stage.canvas.clientWidth - insets.left - insets.right;
    const availableHeight =
      this.stage.canvas.clientHeight - insets.top - insets.bottom;
    this.stage.camera.zoom = zoom;
    this.stage.camera.position = [
      insets.left + availableWidth / 2 - center[0] * zoom,
      insets.top + availableHeight / 2 - center[1] * zoom,
    ];
  }

  updateControls() {
    this.ui.zoomLevelOutput.value = `${Math.round(this.stage.camera.zoom * 100)}%`;
    this.ui.zoomOutButton.disabled = this.stage.camera.zoom <= MIN_ZOOM;
    this.ui.zoomInButton.disabled = this.stage.camera.zoom >= MAX_ZOOM;
  }

  private readonly getFitInsets = (): CameraFitInsets => {
    const canvasBounds = this.stage.canvas.getBoundingClientRect();
    const toolbarBounds = this.ui.toolbar.getBoundingClientRect();
    const toolHintBounds = this.ui.toolHintOutput.getBoundingClientRect();
    const raceControlBounds = this.ui.raceControls.getBoundingClientRect();
    const margin = Math.max(0, toolbarBounds.top - canvasBounds.top);
    const toolbarInset = margin + toolbarBounds.height + margin;
    const toolHintInset = toolHintBounds.bottom - canvasBounds.top + margin;
    const topInset = Math.max(toolbarInset, toolHintInset);
    const bottomInset = margin + raceControlBounds.height + margin;
    const verticalInset = Math.max(topInset, bottomInset);
    const sidebarOpen = this.ui.root.dataset.sidebarOpen === "true";
    const maximumSidebarWidth = Number.parseFloat(
      getComputedStyle(this.ui.optionsCard).maxWidth
    );
    const sidebarWidth = sidebarOpen
      ? Math.min(
          Number.isFinite(maximumSidebarWidth)
            ? maximumSidebarWidth
            : this.ui.optionsCard.getBoundingClientRect().width,
          Math.max(0, canvasBounds.width - margin * 2)
        )
      : 0;
    const horizontalInset = margin + sidebarWidth + (sidebarOpen ? margin : 0);

    return {
      top: verticalInset,
      right: horizontalInset,
      bottom: verticalInset,
      left: horizontalInset,
    };
  };

  private setZoomAtCanvasCenter(zoom: number) {
    this.stage.camera.zoomAtScreenPoint(
      this.stage.canvas.clientWidth / 2,
      this.stage.canvas.clientHeight / 2,
      zoom
    );
  }
}
