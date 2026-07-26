import type { Vec2 } from "@engine/core/transform";
import type { PusherTool } from "../tools";
import type { LevelObjectData, LevelObjectMotion } from "@game/level/document";
import type { LevelObjectShape } from "@game/level/geometry";
import type { ResizeHandle } from "./geometry";

type PanGesture = {
  kind: "pan";
  pointerId: number;
  lastScreen: Vec2;
};

type MoveGesture = {
  kind: "move";
  pointerId: number;
  startWorld: Vec2;
  startScreen: Vec2;
  originals: Map<string, LevelObjectData>;
  inserted: boolean;
  sourceSelection: string[];
  changed: boolean;
};

export type TransformGesture = {
  kind: "resize" | "rotate";
  pointerId: number;
  objectId: string;
  handle?: ResizeHandle;
  startShape: LevelObjectShape;
  startWorld: Vec2;
  startScreen: Vec2;
  changed: boolean;
};

type WallEndpointGesture = {
  kind: "wall-endpoint";
  pointerId: number;
  objectId: string;
  endpoint: "start" | "end";
  start: Vec2;
  end: Vec2;
  startScreen: Vec2;
  changed: boolean;
};

type WallGesture = {
  kind: "wall";
  pointerId: number;
  start: Vec2;
  end: Vec2;
  startScreen: Vec2;
  anchored: boolean;
  changed: boolean;
};

type PlaceGesture = {
  kind: "place";
  pointerId: number;
  tool: PusherTool;
  startScreen: Vec2;
};

type MotionRangeGesture = {
  kind: "motion-range";
  pointerId: number;
  objectId: string;
  startMotion: LevelObjectMotion;
  startScreen: Vec2;
  changed: boolean;
};

type MarqueeGesture = {
  kind: "marquee";
  pointerId: number;
  startWorld: Vec2;
  currentWorld: Vec2;
  startScreen: Vec2;
  additive: boolean;
  initialSelection: Set<string>;
  changed: boolean;
};

export type EditorGesture =
  | PanGesture
  | MoveGesture
  | TransformGesture
  | WallEndpointGesture
  | WallGesture
  | PlaceGesture
  | MotionRangeGesture
  | MarqueeGesture;

export type WallDraft = { start: Vec2; end: Vec2; thickness: number };
export type SelectionMarquee = { start: Vec2; end: Vec2 };
export type WallEndpointFeedback = {
  objectId: string;
  endpoint: "start" | "end";
  position: Vec2;
  kind: "snap" | "edit";
};
export type PusherPlacementPreview = { tool: PusherTool; position: Vec2 };
