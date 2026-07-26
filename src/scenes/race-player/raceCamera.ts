import type { Vec2 } from "@engine/core/transform";
import type { Camera2D } from "@engine/camera/camera2d";
import {
  calculateCameraFitForRect,
  visibleVerticalFraction,
  type CameraFitInsets,
  type WorldRect,
} from "@engine/camera/fit";

/** Lower bound on a glide's duration, in milliseconds. */
export const GLIDE_MIN_DURATION_MS = 900;
/** Upper bound on a glide's duration, in milliseconds. */
export const GLIDE_MAX_DURATION_MS = 1800;
/**
 * Milliseconds of glide per world unit of on-screen scroll distance. A single
 * leg-to-leg scroll (~810 world units) lands near the middle of the clamped
 * range; shorter/longer scrolls clamp to the bounds above.
 */
export const GLIDE_MS_PER_WORLD_UNIT = 1.8;

/** Reads its viewport from a canvas the same way `CameraResizeController` does. */
type ViewportSource = Pick<HTMLCanvasElement, "clientWidth" | "clientHeight">;

/** A concrete camera pose: where world (0,0) lands on screen, and the scale. */
type CameraPose = { position: Vec2; zoom: number };

type GlideState = {
  startPose: CameraPose;
  durationMs: number;
  elapsedMs: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Time-based smoothstep easing: eases in and out symmetrically. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Frames a single "active rect" (the race leg currently on screen) and, on
 * request, glides smoothly to a new one. The target fit is recomputed from the
 * live canvas size on every `update()`, so viewport resizes are handled for
 * free both while idle and mid-glide. Purely driven by `update()` calls — no
 * event listeners, timers, or tween libraries.
 */
export class RaceCameraController {
  private rect: WorldRect | null = null;
  private glideState: GlideState | null = null;

  constructor(
    private readonly canvas: ViewportSource,
    private readonly camera: Camera2D,
    private readonly options: { insets: CameraFitInsets }
  ) {}

  /** Sets the active rect and snaps the camera to its fit immediately. */
  snapTo(rect: WorldRect): void {
    this.rect = rect;
    this.glideState = null;
    this.applyPose(this.computeTargetFit(rect));
  }

  /** Begins an eased scroll from the current camera pose to `rect`'s fit. */
  glideTo(rect: WorldRect): void {
    const startPose: CameraPose = {
      position: [this.camera.position[0], this.camera.position[1]],
      zoom: this.camera.zoom,
    };
    this.rect = rect;

    const target = this.computeTargetFit(rect);
    const distance = this.scrollDistance(startPose, target);
    const durationMs = clamp(
      distance * GLIDE_MS_PER_WORLD_UNIT,
      GLIDE_MIN_DURATION_MS,
      GLIDE_MAX_DURATION_MS
    );

    this.glideState = { startPose, durationMs, elapsedMs: 0 };
  }

  /** Jump-cut: applies the target fit and ends any active glide. */
  completeGlide(): void {
    if (!this.glideState || !this.rect) {
      return;
    }
    this.applyPose(this.computeTargetFit(this.rect));
    this.glideState = null;
  }

  /**
   * Recomputes the target fit from the live canvas size and drives the camera.
   * When idle, snaps to the active rect's fresh fit (handling resize). When
   * gliding, eases from the captured start pose toward the fresh target.
   *
   * With `advance: false` (used while the game is paused) the glide's elapsed
   * time is frozen: the pose is re-evaluated against the fresh target at the
   * same eased `t`, so a resize still tracks but progress does not advance.
   */
  update(deltaMs: number, options: { advance?: boolean } = {}): void {
    if (!this.rect) {
      return;
    }

    const target = this.computeTargetFit(this.rect);

    if (!this.glideState) {
      this.applyPose(target);
      return;
    }

    const advance = options.advance ?? true;
    if (advance) {
      this.glideState.elapsedMs = Math.min(
        this.glideState.durationMs,
        this.glideState.elapsedMs + Math.max(0, deltaMs)
      );
    }

    const rawT =
      this.glideState.durationMs <= 0
        ? 1
        : this.glideState.elapsedMs / this.glideState.durationMs;

    if (rawT >= 1) {
      this.applyPose(target);
      this.glideState = null;
      return;
    }

    const easedT = smoothstep(rawT);
    this.applyPose(interpolatePose(this.glideState.startPose, target, easedT));
  }

  get gliding(): boolean {
    return this.glideState !== null;
  }

  /** Fraction (0..1) of `rect` vertically inside the live viewport right now. */
  visibleFractionOf(rect: WorldRect): number {
    return visibleVerticalFraction(this.camera, this.canvas.clientHeight, rect);
  }

  private computeTargetFit(rect: WorldRect): CameraPose {
    return calculateCameraFitForRect({
      viewportWidth: this.canvas.clientWidth,
      viewportHeight: this.canvas.clientHeight,
      rect,
      insets: this.options.insets,
    });
  }

  private applyPose(pose: CameraPose): void {
    this.camera.position = [pose.position[0], pose.position[1]];
    this.camera.zoom = pose.zoom;
  }

  /** World-space distance between the points a pose frames at viewport center. */
  private scrollDistance(a: CameraPose, b: CameraPose): number {
    const [ax, ay] = this.worldCenter(a);
    const [bx, by] = this.worldCenter(b);
    return Math.hypot(bx - ax, by - ay);
  }

  private worldCenter(pose: CameraPose): Vec2 {
    const halfWidth = this.canvas.clientWidth / 2;
    const halfHeight = this.canvas.clientHeight / 2;
    return [
      (halfWidth - pose.position[0]) / pose.zoom,
      (halfHeight - pose.position[1]) / pose.zoom,
    ];
  }
}

/** Position lerps with the eased t; zoom interpolates in log space. */
const interpolatePose = (
  start: CameraPose,
  end: CameraPose,
  t: number
): CameraPose => ({
  position: [
    lerp(start.position[0], end.position[0], t),
    lerp(start.position[1], end.position[1], t),
  ],
  zoom: Math.exp(lerp(Math.log(start.zoom), Math.log(end.zoom), t)),
});
