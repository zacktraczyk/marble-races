import type { Vec2 } from "@engine/core/transform";
import { GRID_DOT_MAJOR_INTERVAL, GRID_SIZE } from "./constants";

export type GridWorldBounds = {
  min: Vec2;
  max: Vec2;
};

export type GridLayout = {
  bounds: GridWorldBounds;
  columns: number;
  rows: number;
  step: Vec2;
  majorStep: Vec2;
};

const alignedIntervalCount = (length: number) =>
  Math.max(
    GRID_DOT_MAJOR_INTERVAL,
    Math.round(length / GRID_SIZE / GRID_DOT_MAJOR_INTERVAL) *
      GRID_DOT_MAJOR_INTERVAL
  );

/** Builds one grid shared by the visual dots and editor snapping. */
export const createGridLayout = (bounds: GridWorldBounds): GridLayout => {
  const width = Math.max(0, bounds.max[0] - bounds.min[0]);
  const height = Math.max(0, bounds.max[1] - bounds.min[1]);
  const columns = alignedIntervalCount(width);
  const rows = alignedIntervalCount(height);
  const step: Vec2 = [width / columns, height / rows];

  return {
    bounds,
    columns,
    rows,
    step,
    majorStep: [
      step[0] * GRID_DOT_MAJOR_INTERVAL,
      step[1] * GRID_DOT_MAJOR_INTERVAL,
    ],
  };
};

const snap = (value: number, origin: number, step: number) =>
  step > 0 ? origin + Math.round((value - origin) / step) * step : value;

/**
 * Snaps a world-space point to the nearest grid intersection.
 * @param point - world-space point
 * @param layout - grid to snap against
 * @returns the snapped world-space point
 */
export const snapPointToGrid = (
  [x, y]: Vec2,
  { bounds, step }: GridLayout
): Vec2 => [snap(x, bounds.min[0], step[0]), snap(y, bounds.min[1], step[1])];

/**
 * Snaps a world-space movement delta to a whole number of grid steps (snaps
 * the offset itself, not an absolute position).
 * @param delta - world-space offset
 * @param layout - grid supplying the step size
 * @returns the snapped delta
 */
export const snapDeltaToGrid = ([x, y]: Vec2, { step }: GridLayout): Vec2 => [
  snap(x, 0, step[0]),
  snap(y, 0, step[1]),
];
