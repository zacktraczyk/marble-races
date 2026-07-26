import type { Camera2D } from "@engine/camera/camera2d";
import type { Entity } from "@engine/core/entity";

export type DraggableEntity = {
  entity: Entity;
  grabHandleRadius: number;
};

export type EntityDragControllerOptions = {
  signal: AbortSignal;
  getEntities: () => readonly DraggableEntity[];
};

/** Optional direct-manipulation controller used by interactive engine demos. */
export class EntityDragController {
  private dragging: Entity | null = null;
  private pointerId: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera2D,
    { signal, getEntities }: EntityDragControllerOptions
  ) {
    this.getEntities = getEntities;
    canvas.addEventListener("pointerdown", this.pointerDown, { signal });
    canvas.addEventListener("pointermove", this.pointerMove, { signal });
    canvas.addEventListener("pointerup", this.pointerUp, { signal });
    canvas.addEventListener("pointercancel", this.pointerUp, { signal });
    signal.addEventListener("abort", this.cancel, { once: true });
  }

  private readonly getEntities: () => readonly DraggableEntity[];

  private readonly pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const position = this.worldPosition(event);
    const target = [...this.getEntities()]
      .reverse()
      .find(
        ({ entity, grabHandleRadius }) =>
          !entity.markedForDeletion &&
          Math.hypot(
            entity.position[0] - position[0],
            entity.position[1] - position[1]
          ) < grabHandleRadius
      );
    if (!target) {
      return;
    }
    this.dragging = target.entity;
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId || !this.dragging) {
      return;
    }
    this.dragging.position = this.worldPosition(event);
    event.preventDefault();
  };

  private readonly pointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.dragging = null;
    this.pointerId = null;
  };

  private readonly cancel = () => {
    if (
      this.pointerId !== null &&
      this.canvas.hasPointerCapture(this.pointerId)
    ) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.dragging = null;
    this.pointerId = null;
  };

  private worldPosition(event: PointerEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    return this.camera.screenToWorld(
      event.clientX - bounds.left,
      event.clientY - bounds.top
    );
  }
}
