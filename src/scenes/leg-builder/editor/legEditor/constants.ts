import { GRID_SIZE } from "../../../../game/level/constants";

export const SIZE_SNAP_STEP = GRID_SIZE / 5;
export const ROTATION_SNAP_STEP = Math.PI / 12;
export const ROTATION_HANDLE_OFFSET = 28;
export const HANDLE_HIT_RADIUS = 8;
export const ENDPOINT_SNAP_RADIUS = 12;
export const DRAG_THRESHOLD = 3;
export const MIN_OBJECT_SIZE = GRID_SIZE * 0.4;
export const MIN_WALL_LENGTH = GRID_SIZE * 0.4;
