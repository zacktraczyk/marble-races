import type {
  LevelObjectData,
  LevelObjectMotion,
  NewLevelObjectData,
  SliderRepeat,
} from "./document";
import { getSliderSpeed, oscillationPeriodForPeakSpeed } from "./motion";
import type { Vec2 } from "@engine/core/transform";
import { FINISH_RACK_HEIGHT } from "../prefabs/finishZone";
import { finishRackHeightFor } from "../race/finishGrid";
import {
  DEFAULT_SPAWN_DIRECTION_VARIANCE,
  spawnAreaRadius,
} from "../race/spawn";
import { topSliderSpawnClearance } from "../prefabs/spawnPoint";
import { MAX_TEAMS } from "../race/teams";
import {
  COURSE_STROKE_WIDTH,
  DEFAULT_LAUNCH_SPEED,
  FINISH_COLOR,
  MAX_MARBLE_RADIUS,
  MIN_MARBLE_RADIUS,
  SPAWN_COLOR,
  STAGING_MARBLE_GAP,
  WALL_COLOR,
} from "./constants";
/** Domain kind for a moving pusher wall (independent of editor tool UX). */
export type PusherKind = "slider" | "spinner" | "sweeper";

const PUSHER_WALL_LENGTH = 120;
export const PUSHER_DEFAULT_RANGE = 90;
export const PUSHER_LINEAR_SPEEDS = {
  slow: 120,
  medium: 360,
  fast: 600,
} as const;
export const PUSHER_PERIODS = {
  slow: 9000,
  medium: 6500,
  fast: 4500,
} as const;

export type PusherSpeed = keyof typeof PUSHER_LINEAR_SPEEDS;

export type SliderPlacementDefaults = {
  repeat?: SliderRepeat;
  speed?: PusherSpeed;
  rotation?: number;
};

export const sliderPeriodForRange = (range: number, speed: PusherSpeed) =>
  oscillationPeriodForPeakSpeed(range, PUSHER_LINEAR_SPEEDS[speed]);

export const loopPeriodForRange = (range: number, speed: PusherSpeed) =>
  (Math.max(0, range) * 1000) / PUSHER_LINEAR_SPEEDS[speed];

export const pusherPeriodForSpeed = (
  motion: LevelObjectMotion,
  speed: PusherSpeed
) =>
  motion.type === "oscillate"
    ? (motion.repeat ?? "ping-pong") === "loop"
      ? loopPeriodForRange(Math.hypot(...motion.vector), speed)
      : sliderPeriodForRange(Math.hypot(...motion.vector), speed)
    : PUSHER_PERIODS[speed];

export const pusherSpeedForMotion = (
  motion: LevelObjectMotion
): PusherSpeed => {
  const speeds = Object.keys(PUSHER_LINEAR_SPEEDS) as PusherSpeed[];
  if (motion.type === "oscillate") {
    const linearSpeed = getSliderSpeed(motion);
    return speeds.reduce((nearest, candidate) =>
      Math.abs(PUSHER_LINEAR_SPEEDS[candidate] - linearSpeed) <
      Math.abs(PUSHER_LINEAR_SPEEDS[nearest] - linearSpeed)
        ? candidate
        : nearest
    );
  }
  return speeds.reduce((nearest, candidate) =>
    Math.abs(PUSHER_PERIODS[candidate] - motion.periodMs) <
    Math.abs(PUSHER_PERIODS[nearest] - motion.periodMs)
      ? candidate
      : nearest
  );
};

const pusherMotion = (
  kind: PusherKind,
  sliderDefaults?: SliderPlacementDefaults
): LevelObjectMotion => {
  const shared = {
    phase: 0,
    direction: 1 as const,
  };
  if (kind === "slider") {
    const repeat = sliderDefaults?.repeat ?? "ping-pong";
    const speed = sliderDefaults?.speed ?? "medium";
    const motion: LevelObjectMotion = {
      type: "oscillate",
      vector: [PUSHER_DEFAULT_RANGE, 0],
      repeat,
      periodMs: 1,
      ...shared,
    };
    motion.periodMs = pusherPeriodForSpeed(motion, speed);
    return {
      ...motion,
    };
  }
  return {
    type: "rotate",
    pivot: kind === "sweeper" ? "start" : "center",
    periodMs: PUSHER_PERIODS.medium,
    ...shared,
  };
};

export const createWall = (
  start: Vec2,
  end: Vec2,
  thickness?: number
): NewLevelObjectData => ({
  prefab: "wall",
  properties: {
    start: [...start],
    end: [...end],
    ...(thickness === undefined ? {} : { thickness }),
    color: [...WALL_COLOR],
  },
});

export const createPusher = (
  kind: PusherKind,
  position: Vec2,
  sliderDefaults?: SliderPlacementDefaults
): NewLevelObjectData => {
  const halfLength = PUSHER_WALL_LENGTH / 2;
  const sliderRotation = sliderDefaults?.rotation ?? Math.PI / 2;
  const sliderAxis: Vec2 = [
    Math.abs(Math.cos(sliderRotation)) < 1e-12 ? 0 : Math.cos(sliderRotation),
    Math.abs(Math.sin(sliderRotation)) < 1e-12 ? 0 : Math.sin(sliderRotation),
  ];
  const start: Vec2 =
    kind === "sweeper"
      ? [...position]
      : kind === "slider"
        ? [
            position[0] - sliderAxis[0] * halfLength,
            position[1] - sliderAxis[1] * halfLength,
          ]
        : [position[0] - halfLength, position[1]];
  const end: Vec2 =
    kind === "sweeper"
      ? [position[0] + PUSHER_WALL_LENGTH, position[1]]
      : kind === "slider"
        ? [
            position[0] + sliderAxis[0] * halfLength,
            position[1] + sliderAxis[1] * halfLength,
          ]
        : [position[0] + halfLength, position[1]];
  return {
    ...createWall(start, end),
    motion: pusherMotion(kind, sliderDefaults),
  } as NewLevelObjectData;
};

/**
 * Pins a top-slider spawn to its track just below the top wall: centered
 * horizontally, oscillating wall-to-wall. The phase starts the sweep at the
 * top-left edge. Existing phase/direction survive so playback stays smooth.
 * Position and color are fully re-derived so saves from older layouts heal.
 */
export const applyTopSliderSpawnLayout = (
  spawnPoint: Extract<LevelObjectData, { prefab: "spawn-point" }>,
  [stageWidth, stageHeight]: Vec2,
  wallThickness: number,
  [originX, originY]: Vec2 = [0, 0]
) => {
  const clearance = topSliderSpawnClearance(
    spawnPoint.properties.radius,
    MAX_MARBLE_RADIUS
  );
  const halfSpan = Math.max(0, stageWidth / 2 - wallThickness - clearance);
  spawnPoint.transform.position = [
    originX,
    originY - stageHeight / 2 + wallThickness + clearance,
  ];
  spawnPoint.transform.rotation = Math.PI / 2;
  spawnPoint.properties.color = [...SPAWN_COLOR];
  spawnPoint.motion = {
    type: "oscillate",
    vector: [halfSpan, 0] as Vec2,
    periodMs: sliderPeriodForRange(halfSpan, "medium"),
    phase: spawnPoint.motion?.phase ?? 0.75,
    direction: spawnPoint.motion?.direction ?? 1,
  };
};

export const createSpawnPoint = (position: Vec2): NewLevelObjectData => ({
  prefab: "spawn-point",
  transform: { position, rotation: Math.PI / 2 },
  properties: {
    radius: spawnAreaRadius(
      MAX_MARBLE_RADIUS * 2.5,
      MAX_TEAMS,
      MAX_MARBLE_RADIUS
    ),
    color: [...SPAWN_COLOR],
    launchSpeed: DEFAULT_LAUNCH_SPEED,
    directionVariance: DEFAULT_SPAWN_DIRECTION_VARIANCE,
  },
});

/** Sizes the finish rack for a perfect-fill marble grid. */
type CourseFinishOptions = {
  teamCount: number;
  marblesPerTeam: number;
};

const courseFinishRackHeight = (
  stageWidth: number,
  wallThickness: number,
  finish?: CourseFinishOptions
) => {
  if (!finish) {
    return FINISH_RACK_HEIGHT;
  }
  try {
    return finishRackHeightFor({
      width: stageWidth,
      wallThickness,
      bayCount: finish.teamCount,
      marblesPerTeam: finish.marblesPerTeam,
      marbleRadius: MAX_MARBLE_RADIUS,
      minimumRadius: MIN_MARBLE_RADIUS,
      gap: STAGING_MARBLE_GAP,
    });
  } catch {
    // An impossible combination (e.g. mid-edit) keeps the legacy height so
    // the course stays editable; play-time layout re-derives the real value.
    return FINISH_RACK_HEIGHT;
  }
};

export const createDefaultCourse = (
  stageWidth: number,
  stageHeight: number,
  wallThickness = COURSE_STROKE_WIDTH,
  finish?: CourseFinishOptions
): NewLevelObjectData[] => [
  ...createCourseBoundaries(stageWidth, stageHeight, wallThickness, finish),
  createSpawnPoint([0, -stageHeight / 2 + MAX_MARBLE_RADIUS * 10]),
];

export const createCourseBoundaries = (
  stageWidth: number,
  stageHeight: number,
  wallThickness = COURSE_STROKE_WIDTH,
  finish?: CourseFinishOptions
): NewLevelObjectData[] => {
  const finishRackHeight = courseFinishRackHeight(
    stageWidth,
    wallThickness,
    finish
  );
  const sideWall = (x: number): NewLevelObjectData => ({
    prefab: "wall",
    locked: true,
    properties: {
      start: [x, -stageHeight / 2],
      end: [x, stageHeight / 2],
      color: [...WALL_COLOR],
    },
  });
  const topWallY = -stageHeight / 2 + wallThickness / 2;

  return [
    {
      prefab: "finish-zone",
      locked: true,
      transform: {
        position: [0, stageHeight / 2 - finishRackHeight / 2],
      },
      properties: {
        width: stageWidth,
        height: finishRackHeight,
        color: [...FINISH_COLOR],
      },
    },
    {
      prefab: "wall",
      locked: true,
      properties: {
        start: [-stageWidth / 2, topWallY],
        end: [stageWidth / 2, topWallY],
        color: [...WALL_COLOR],
      },
    },
    sideWall(-stageWidth / 2 + wallThickness / 2),
    sideWall(stageWidth / 2 - wallThickness / 2),
  ];
};
