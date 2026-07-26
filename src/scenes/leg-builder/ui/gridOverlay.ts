import type Stage from "@engine/stage";
import { createGridLayout, type GridWorldBounds } from "@game/level/grid";

export class GridOverlay {
  private majorVisible = true;
  private minorVisible = false;
  private suppressed = false;

  constructor(
    private readonly stage: Stage,
    private readonly majorToggleButton: HTMLButtonElement,
    private readonly minorToggleButton: HTMLButtonElement,
    private readonly overlay: HTMLElement,
    private readonly getWorldBounds?: () => GridWorldBounds
  ) {}

  toggleMajor() {
    this.majorVisible = !this.majorVisible;
    this.update();
  }

  toggleMinor() {
    this.minorVisible = !this.minorVisible;
    this.update();
  }

  setSuppressed(suppressed: boolean) {
    this.suppressed = suppressed;
  }

  update() {
    this.majorToggleButton.ariaChecked = `${this.majorVisible}`;
    this.majorToggleButton.dataset.active = `${this.majorVisible}`;
    this.minorToggleButton.ariaChecked = `${this.minorVisible}`;
    this.minorToggleButton.dataset.active = `${this.minorVisible}`;
    this.overlay.dataset.majorVisible = `${this.majorVisible}`;
    this.overlay.dataset.minorVisible = `${this.minorVisible}`;
    this.overlay.hidden =
      (!this.majorVisible && !this.minorVisible) || this.suppressed;

    const bounds = this.getWorldBounds?.() ?? {
      min: [-this.stage.width / 2, -this.stage.height / 2],
      max: [this.stage.width / 2, this.stage.height / 2],
    };
    const [left, top] = this.stage.camera.worldToScreen(...bounds.min);
    const width = Math.max(0, bounds.max[0] - bounds.min[0]);
    const height = Math.max(0, bounds.max[1] - bounds.min[1]);
    const layout = createGridLayout(bounds);
    const zoom = this.stage.camera.zoom;
    const [stepX, stepY] = layout.step;
    const [majorStepX, majorStepY] = layout.majorStep;

    this.overlay.style.left = `${left}px`;
    this.overlay.style.top = `${top}px`;
    this.overlay.style.width = `${width * zoom}px`;
    this.overlay.style.height = `${height * zoom}px`;
    this.overlay.style.setProperty("--grid-step-x", `${stepX * zoom}px`);
    this.overlay.style.setProperty("--grid-step-y", `${stepY * zoom}px`);
    this.overlay.style.setProperty(
      "--grid-major-step-x",
      `${majorStepX * zoom}px`
    );
    this.overlay.style.setProperty(
      "--grid-major-step-y",
      `${majorStepY * zoom}px`
    );
    this.overlay.style.setProperty(
      "--grid-minor-background-x",
      `${(-stepX * zoom) / 2}px`
    );
    this.overlay.style.setProperty(
      "--grid-minor-background-y",
      `${(-stepY * zoom) / 2}px`
    );
    this.overlay.style.setProperty(
      "--grid-major-background-x",
      `${(-majorStepX * zoom) / 2}px`
    );
    this.overlay.style.setProperty(
      "--grid-major-background-y",
      `${(-majorStepY * zoom) / 2}px`
    );
    this.overlay.style.setProperty(
      "--grid-zoom-opacity",
      `${Math.min(1, Math.max(0.78, zoom))}`
    );
  }
}
