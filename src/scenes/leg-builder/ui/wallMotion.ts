import type { LevelObjectMotion } from "@game/level/document";

/** The builder's wall-motion vocabulary, distinct from the raw motion `type`. */
export type WallMotionType = "none" | "slide" | "spin" | "sweep";

/** Classifies a wall's motion into the slide/spin/sweep/none vocabulary. */
export const wallMotionType = (
  motion: LevelObjectMotion | undefined
): WallMotionType =>
  motion?.type === "oscillate"
    ? "slide"
    : motion?.type === "rotate" && motion.pivot === "start"
      ? "sweep"
      : motion?.type === "rotate"
        ? "spin"
        : "none";

const WALL_MOTION_LABELS: Record<WallMotionType, string> = {
  none: "Wall",
  slide: "Slider",
  spin: "Spinner",
  sweep: "Sweeper",
};

/** Object-inspector title for a wall, derived from its motion. */
export const wallMotionLabel = (
  motion: LevelObjectMotion | undefined
): string => WALL_MOTION_LABELS[wallMotionType(motion)];
