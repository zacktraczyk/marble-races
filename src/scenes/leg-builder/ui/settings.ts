import type { Vec2 } from "@engine/core/transform";
import { MAX_TEAMS } from "@game/race/teams";
import {
  COURSE_STROKE_WIDTH,
  MAX_STAGE_HEIGHT,
  MAX_STAGE_WIDTH,
  MAX_WALL_THICKNESS,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  MIN_WALL_THICKNESS,
  STAGE_SIZE_STEP,
} from "@game/level/constants";
import type { RoundConfiguration } from "@game/race/types";
import type { BuilderUi } from ".";
import { clampInteger, clampStepInteger } from "./input";

export const readCourseSize = (ui: BuilderUi): Vec2 => [
  clampStepInteger(
    ui.courseWidthInput.value,
    MIN_STAGE_WIDTH,
    MAX_STAGE_WIDTH,
    STAGE_SIZE_STEP
  ),
  clampStepInteger(
    ui.courseHeightInput.value,
    MIN_STAGE_HEIGHT,
    MAX_STAGE_HEIGHT,
    STAGE_SIZE_STEP
  ),
];

export const readWallThickness = (ui: BuilderUi) =>
  clampInteger(
    ui.wallThicknessInput.value || `${COURSE_STROKE_WIDTH}`,
    MIN_WALL_THICKNESS,
    MAX_WALL_THICKNESS
  );

export const readRoundConfiguration = (ui: BuilderUi): RoundConfiguration => ({
  teamCount: clampInteger(ui.teamCountInput.value, 2, MAX_TEAMS),
  marblesPerTeam: clampInteger(ui.marblesPerTeamInput.value, 1, 360),
  releaseIntervalMs: clampInteger(ui.releaseIntervalInput.value, 10, 250),
});
