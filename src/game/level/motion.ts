import type { Vec2 } from "@engine/core/transform";
import { applyTransform } from "@engine/core/transform";
import type { LevelObjectData } from "./document";
import { getLevelObjectShape, type LevelObjectShape } from "./geometry";

type OscillationMotion = Extract<
  NonNullable<LevelObjectData["motion"]>,
  { type: "oscillate" }
>;

export type LevelObjectPose = {
  position: Vec2;
  rotation: number;
};

const rotateVector = (vector: Vec2, angle: number): Vec2 =>
  applyTransform([0, 0], angle, vector);

const getBasePose = (
  object: LevelObjectData,
  defaultWallThickness: number
): { pose: LevelObjectPose; shape: LevelObjectShape } => {
  const shape = getLevelObjectShape(object, defaultWallThickness);
  return {
    pose: {
      position: [...shape.position],
      rotation: shape.kind === "rectangle" ? shape.rotation : 0,
    },
    shape,
  };
};

/**
 * Oscillation period that makes a sinusoidal slider reach a given peak speed
 * over the given travel range.
 * @param range - one-way travel distance in world units
 * @param peakSpeed - desired peak speed in world units per second
 * @returns the period in milliseconds
 */
export const oscillationPeriodForPeakSpeed = (
  range: number,
  peakSpeed: number
) => (Math.PI * 2 * Math.max(0, range) * 1000) / peakSpeed;

/**
 * Peak speed of a sinusoidal (ping-pong) slider.
 * @param motion - the oscillate motion
 * @returns peak speed in world units per second (0 when the period is non-positive)
 */
export const getOscillationPeakSpeed = (motion: OscillationMotion) => {
  const range = Math.hypot(...motion.vector);
  return motion.periodMs > 0
    ? (Math.PI * 2 * range * 1000) / motion.periodMs
    : 0;
};

/**
 * Representative speed of a slider: peak speed for ping-pong, or constant
 * speed for a looping slider.
 * @param motion - the oscillate motion
 * @returns speed in world units per second
 */
export const getSliderSpeed = (motion: OscillationMotion) => {
  if ((motion.repeat ?? "ping-pong") === "ping-pong") {
    return getOscillationPeakSpeed(motion);
  }
  const pathLength = Math.hypot(...motion.vector);
  return motion.periodMs > 0 ? (pathLength * 1000) / motion.periodMs : 0;
};

/**
 * Rescales a slider's period so its speed stays constant when the travel
 * range changes.
 * @param motion - the current oscillate motion
 * @param nextRange - the new one-way travel distance in world units
 * @returns the adjusted period in milliseconds
 */
export const oscillationPeriodForRange = (
  motion: OscillationMotion,
  nextRange: number
) => {
  const currentRange = Math.hypot(...motion.vector);
  return currentRange > Number.EPSILON
    ? motion.periodMs * (nextRange / currentRange)
    : motion.periodMs;
};

/**
 * World-space pose of an object at a point in time, applying its oscillate or
 * rotate motion; returns the resting pose when the object has no motion.
 * @param object - the level object
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @param elapsedMs - elapsed time in milliseconds
 * @returns world position and rotation (radians) at that time
 */
export const getLevelObjectMotionPose = (
  object: LevelObjectData,
  defaultWallThickness: number,
  elapsedMs: number
): LevelObjectPose => {
  const { pose: base, shape } = getBasePose(object, defaultWallThickness);
  const motion = object.motion;
  if (!motion) {
    return base;
  }

  const periodMs = Math.max(1, motion.periodMs);
  const cycle = elapsedMs / periodMs + motion.phase;
  const direction = motion.direction;

  if (motion.type === "oscillate") {
    if ((motion.repeat ?? "ping-pong") === "loop") {
      const progress = cycle - Math.floor(cycle);
      const pathProgress = progress * direction;
      return {
        position: [
          base.position[0] + motion.vector[0] * pathProgress,
          base.position[1] + motion.vector[1] * pathProgress,
        ],
        rotation: base.rotation,
      };
    }
    const progress = Math.sin(cycle * Math.PI * 2) * direction;
    return {
      position: [
        base.position[0] + motion.vector[0] * progress,
        base.position[1] + motion.vector[1] * progress,
      ],
      rotation: base.rotation,
    };
  }

  const pivotOffset: Vec2 =
    motion.pivot === "start" && shape.kind === "rectangle"
      ? [-shape.width / 2, 0]
      : [0, 0];
  const pivotOffsetAtRest = rotateVector(pivotOffset, base.rotation);
  const pivot: Vec2 = [
    base.position[0] + pivotOffsetAtRest[0],
    base.position[1] + pivotOffsetAtRest[1],
  ];
  const rotation = base.rotation + cycle * Math.PI * 2 * direction;
  const rotatedPivotOffset = rotateVector(pivotOffset, rotation);

  return {
    position: [
      pivot[0] - rotatedPivotOffset[0],
      pivot[1] - rotatedPivotOffset[1],
    ],
    rotation,
  };
};

/**
 * Whether a looping slider wraps back to its start between two times (it
 * teleports at each cycle boundary). Always false for ping-pong sliders.
 * @param motion - the oscillate motion
 * @param elapsedMs - start time in milliseconds
 * @param nextElapsedMs - end time in milliseconds
 * @returns true when a loop reset occurs within the interval
 */
export const doesSliderLoopResetBetween = (
  motion: OscillationMotion,
  elapsedMs: number,
  nextElapsedMs: number
) => {
  if ((motion.repeat ?? "ping-pong") !== "loop") {
    return false;
  }
  const periodMs = Math.max(1, motion.periodMs);
  const cycleAt = (timeMs: number) => timeMs / periodMs + motion.phase;
  return Math.floor(cycleAt(elapsedMs)) !== Math.floor(cycleAt(nextElapsedMs));
};

/**
 * The two world-space endpoints of an oscillating object's travel path.
 * @param object - the level object
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns the `[start, end]` world points, or null when the object does not oscillate
 */
export const getOscillationEndpoints = (
  object: LevelObjectData,
  defaultWallThickness: number
): [Vec2, Vec2] | null => {
  if (object.motion?.type !== "oscillate") {
    return null;
  }
  const { position } = getBasePose(object, defaultWallThickness).pose;
  const { vector } = object.motion;
  if ((object.motion.repeat ?? "ping-pong") === "loop") {
    return [
      [...position],
      [
        position[0] + vector[0] * object.motion.direction,
        position[1] + vector[1] * object.motion.direction,
      ],
    ];
  }
  return [
    [position[0] - vector[0], position[1] - vector[1]],
    [position[0] + vector[0], position[1] + vector[1]],
  ];
};

/**
 * World-space point a rotating object turns about (its center, or a rectangle
 * end when the motion pivots there).
 * @param object - the level object
 * @param defaultWallThickness - wall thickness (world units) when a wall sets none
 * @returns the pivot in world space, or null when the object does not rotate
 */
export const getRotationPivot = (
  object: LevelObjectData,
  defaultWallThickness: number
): Vec2 | null => {
  if (object.motion?.type !== "rotate") {
    return null;
  }
  const { pose, shape } = getBasePose(object, defaultWallThickness);
  if (object.motion.pivot === "center" || shape.kind !== "rectangle") {
    return [...pose.position];
  }
  const offset = rotateVector([-shape.width / 2, 0], pose.rotation);
  return [pose.position[0] + offset[0], pose.position[1] + offset[1]];
};
