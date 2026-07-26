import type { LevelObjectData, SerializedLevel } from "./document";
import type { FinishRackFrame, FinishRackRect } from "../prefabs/finishZone";
import {
  FINISH_DARK_COLOR,
  FINISH_LIGHT_COLOR,
  FINISH_RACK_BACKGROUND,
  FINISH_RACK_WALL,
  createFinishRackFrame,
  finishLineCells,
} from "../prefabs/finishZone";
import type { Color } from "@engine/core/color";
import { topSliderSpawnClearance } from "../prefabs/spawnPoint";
import { MAX_MARBLE_RADIUS } from "./constants";

type LevelThumbnailOptions = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  padding?: number;
  background?: string;
  courseBackground?: string;
  border?: string;
  /**
   * Teams racing this leg. When set, finish zones render as the real finish
   * rack (checkered line plus one bay per team) instead of a flat placeholder.
   */
  teamCount?: number;
};

type ObjectDrawSettings = {
  wallThickness: number;
  teamCount?: number;
};

const colorCss = ([red, green, blue, alpha]: Color) =>
  `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(
    blue * 255
  )}, ${alpha})`;

const withTransform = (
  context: CanvasRenderingContext2D,
  object: Extract<LevelObjectData, { transform: unknown }>,
  draw: () => void
) => {
  const { position, rotation = 0, scale = [1, 1] } = object.transform;
  context.save();
  context.translate(position[0], position[1]);
  context.rotate(rotation);
  context.scale(scale[0], scale[1]);
  draw();
  context.restore();
};

const drawMotionGuide = (
  context: CanvasRenderingContext2D,
  object: LevelObjectData,
  wallThickness: number
) => {
  if (!object.motion) {
    return;
  }
  context.save();
  context.strokeStyle = "rgba(34, 211, 238, 0.65)";
  context.lineWidth = Math.max(1, wallThickness * 0.14);
  context.setLineDash([wallThickness * 0.45, wallThickness * 0.35]);
  if (object.motion.type === "oscillate" && object.prefab === "wall") {
    const center = [
      (object.properties.start[0] + object.properties.end[0]) / 2,
      (object.properties.start[1] + object.properties.end[1]) / 2,
    ];
    context.beginPath();
    context.moveTo(
      center[0] - object.motion.vector[0],
      center[1] - object.motion.vector[1]
    );
    context.lineTo(
      center[0] + object.motion.vector[0],
      center[1] + object.motion.vector[1]
    );
    context.stroke();
  } else if (object.prefab === "wall") {
    const start = object.properties.start;
    const end = object.properties.end;
    const pivot =
      object.motion.type === "rotate" && object.motion.pivot === "start"
        ? start
        : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    context.beginPath();
    context.arc(
      pivot[0],
      pivot[1],
      Math.hypot(end[0] - start[0], end[1] - start[1]) / 2,
      0,
      Math.PI * 2
    );
    context.stroke();
  }
  context.restore();
};

const fillRect = (context: CanvasRenderingContext2D, rect: FinishRackRect) => {
  context.fillRect(
    rect.position[0] - rect.width / 2,
    rect.position[1] - rect.height / 2,
    rect.width,
    rect.height
  );
};

const drawFinishZone = (
  context: CanvasRenderingContext2D,
  object: Extract<LevelObjectData, { prefab: "finish-zone" }>,
  { wallThickness, teamCount }: ObjectDrawSettings
) => {
  const { width, height } = object.properties;
  let frame: FinishRackFrame | null = null;
  if (teamCount !== undefined) {
    try {
      frame = createFinishRackFrame({
        width,
        height,
        wallThickness,
        teamCount,
      });
    } catch {
      // The rack cannot fit this team count; fall back to the placeholder.
    }
  }
  withTransform(context, object, () => {
    if (!frame) {
      context.fillStyle = colorCss(object.properties.color);
      context.globalAlpha = 0.7;
      context.fillRect(-width / 2, -height / 2, width, height);
      context.globalAlpha = 1;
      return;
    }
    context.fillStyle = colorCss(FINISH_RACK_BACKGROUND);
    context.fillRect(-width / 2, -height / 2, width, height);
    context.fillStyle = colorCss(FINISH_RACK_WALL);
    for (const rect of [
      frame.bottomWall,
      ...frame.sideWalls,
      ...frame.dividers,
    ]) {
      fillRect(context, rect);
    }
    context.save();
    context.translate(...frame.finishLine.position);
    for (const cell of finishLineCells(frame.finishLine)) {
      context.fillStyle = colorCss(
        cell.light ? FINISH_LIGHT_COLOR : FINISH_DARK_COLOR
      );
      fillRect(context, cell);
    }
    context.restore();
  });
};

const drawObject = (
  context: CanvasRenderingContext2D,
  object: LevelObjectData,
  settings: ObjectDrawSettings
) => {
  if (object.prefab === "wall") {
    context.beginPath();
    context.moveTo(...object.properties.start);
    context.lineTo(...object.properties.end);
    context.strokeStyle = colorCss(object.properties.color);
    context.lineWidth = object.properties.thickness ?? settings.wallThickness;
    context.lineCap = "round";
    context.stroke();
    return;
  }

  if (object.prefab === "bumper") {
    withTransform(context, object, () => {
      context.beginPath();
      context.arc(0, 0, object.properties.radius, 0, Math.PI * 2);
      context.fillStyle = colorCss(object.properties.color);
      context.fill();
    });
    return;
  }

  if (object.prefab === "finish-zone") {
    drawFinishZone(context, object, settings);
    return;
  }

  if (
    object.prefab === "spawn-point" &&
    object.properties.variant === "top-slider"
  ) {
    // Axis-aligned solid triangle, top edge flush against the top wall; the
    // authored rotation only aims the marbles.
    const radius = object.properties.radius;
    const topEdge = -topSliderSpawnClearance(radius, MAX_MARBLE_RADIUS);
    context.save();
    context.translate(...object.transform.position);
    context.fillStyle = colorCss(object.properties.color);
    context.globalAlpha = 0.82;
    context.beginPath();
    context.moveTo(-radius, topEdge);
    context.lineTo(radius, topEdge);
    context.lineTo(0, radius * 0.55);
    context.closePath();
    context.fill();
    context.restore();
    return;
  }

  withTransform(context, object, () => {
    context.fillStyle = colorCss(object.properties.color);
    if (object.prefab === "spawn-point") {
      context.globalAlpha = 0.82;
      context.beginPath();
      context.arc(0, 0, object.properties.radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = Math.max(1.5, object.properties.radius * 0.12);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(object.properties.radius * 1.4, 0);
      context.stroke();
      return;
    }
  });
};

const drawLevelObjects = (
  context: CanvasRenderingContext2D,
  level: SerializedLevel,
  settings: ObjectDrawSettings
) => {
  for (const object of level.objects) {
    drawMotionGuide(context, object, settings.wallThickness);
  }
  for (const object of level.objects) {
    drawObject(context, object, settings);
  }
};

const drawLevelThumbnail = (
  context: CanvasRenderingContext2D,
  level: SerializedLevel,
  options: LevelThumbnailOptions = {}
) => {
  const pixelRatio = options.pixelRatio ?? 1;
  const width = options.width ?? context.canvas.width / pixelRatio;
  const height = options.height ?? context.canvas.height / pixelRatio;
  const padding = options.padding ?? Math.min(width, height) * 0.06;
  const background = options.background ?? "#18181b";
  const courseBackground = options.courseBackground ?? "#27272a";
  const border = options.border ?? "#52525b";
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const scale = Math.max(
    0.0001,
    Math.min(
      (width - padding * 2) / level.size[0],
      (height - padding * 2) / level.size[1]
    )
  );
  context.translate(width / 2, height / 2);
  context.scale(scale, scale);

  context.fillStyle = courseBackground;
  context.fillRect(
    -level.size[0] / 2,
    -level.size[1] / 2,
    level.size[0],
    level.size[1]
  );
  context.strokeStyle = border;
  context.lineWidth = 1 / scale;
  context.strokeRect(
    -level.size[0] / 2,
    -level.size[1] / 2,
    level.size[0],
    level.size[1]
  );

  drawLevelObjects(context, level, {
    wallThickness: level.settings.wallThickness,
    teamCount: options.teamCount,
  });
  context.restore();
};

/**
 * Sizes `canvas` to the requested (or measured) dimensions and draws the level
 * preview into its 2D context.
 * @returns `true` on success, `false` when a 2D context is unavailable.
 */
export const renderLevelThumbnail = (
  canvas: HTMLCanvasElement,
  level: SerializedLevel,
  options: LevelThumbnailOptions = {}
) => {
  const width = options.width ?? (canvas.clientWidth || canvas.width || 320);
  const height =
    options.height ?? (canvas.clientHeight || canvas.height || 180);
  const pixelRatio =
    options.pixelRatio ??
    (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  drawLevelThumbnail(context, level, {
    ...options,
    width,
    height,
    pixelRatio,
  });
  return true;
};

type RaceThumbnailLeg = {
  level: SerializedLevel;
  teamCount?: number;
};

type RaceThumbnailOptions = {
  width?: number;
  /** Canvas height; short stacks center vertically in the extra space. */
  height?: number;
  /** Never render shorter than this, so the background fills the frame. */
  minHeight?: number;
  pixelRatio?: number;
  padding?: number;
  background?: string;
  courseBackground?: string;
  border?: string;
};

/** Fraction of the canvas width kept as a dark frame around the stack. */
const RACE_THUMBNAIL_PADDING_RATIO = 0.06;

/** Browsers cap canvas dimensions; stay comfortably under the common limit. */
const MAX_CANVAS_DIMENSION = 8192;

/**
 * Legs stacked edge-to-edge along +Y, horizontally centered — the same
 * layout the race player uses (see `scenes/race-player/legStack.ts`, the
 * canonical playback version; thumbnails skip its finish-rack resizing,
 * which is invisible at this scale).
 */
const computeRaceStackLayout = (legs: readonly RaceThumbnailLeg[]) => {
  const tops: number[] = [];
  let stackWidth = 0;
  let totalHeight = 0;
  for (const leg of legs) {
    tops.push(totalHeight);
    stackWidth = Math.max(stackWidth, leg.level.size[0]);
    totalHeight += leg.level.size[1];
  }
  return { stackWidth, totalHeight, tops };
};

/**
 * Draws a whole race as one continuous course: every leg stacked
 * edge-to-edge with a single shared track background, so leg boundaries
 * read as one race rather than separate tiles. Scale is width-driven; the
 * canvas is as tall as the stack needs and the caller crops the overflow.
 */
const drawRaceThumbnail = (
  context: CanvasRenderingContext2D,
  legs: readonly RaceThumbnailLeg[],
  options: RaceThumbnailOptions = {}
) => {
  const pixelRatio = options.pixelRatio ?? 1;
  const width = options.width ?? context.canvas.width / pixelRatio;
  const padding = options.padding ?? width * RACE_THUMBNAIL_PADDING_RATIO;
  const background = options.background ?? "#18181b";
  const courseBackground = options.courseBackground ?? "#27272a";
  const border = options.border ?? "#52525b";

  const { stackWidth, totalHeight, tops } = computeRaceStackLayout(legs);
  const scale = Math.max(0.0001, (width - padding * 2) / stackWidth);
  const height = options.height ?? padding * 2 + totalHeight * scale;
  // A stack shorter than the canvas floats centered in the extra space.
  const originY = Math.max(padding, (height - totalHeight * scale) / 2);

  const legLeft = (leg: RaceThumbnailLeg) =>
    width / 2 - (leg.level.size[0] * scale) / 2;
  const legTop = (index: number) => originY + tops[index] * scale;

  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  // First the continuous track background for every leg, then the objects:
  // a later leg's background must never paint over the previous leg's
  // finish rack. Rects after the first reach slightly up into the previous
  // one so antialiasing can't leave a hairline seam at the boundary.
  const seam = 0.5 / pixelRatio;
  context.fillStyle = courseBackground;
  legs.forEach((leg, index) => {
    const overlap = index > 0 ? seam : 0;
    context.fillRect(
      legLeft(leg),
      legTop(index) - overlap,
      leg.level.size[0] * scale,
      leg.level.size[1] * scale + overlap
    );
  });

  legs.forEach((leg, index) => {
    context.save();
    context.translate(
      width / 2,
      legTop(index) + (leg.level.size[1] / 2) * scale
    );
    context.scale(scale, scale);
    drawLevelObjects(context, leg.level, {
      wallThickness: leg.level.settings.wallThickness,
      teamCount: leg.teamCount,
    });
    context.restore();
  });

  // Border only along the stack's outer perimeter — never across internal
  // leg boundaries, so the course reads as one continuous track. Ledge
  // segments appear only where adjacent legs differ in width.
  context.strokeStyle = border;
  context.lineWidth = 1;
  context.beginPath();
  legs.forEach((leg, index) => {
    const left = legLeft(leg);
    const right = left + leg.level.size[0] * scale;
    const top = legTop(index);
    const bottom = top + leg.level.size[1] * scale;
    context.moveTo(left, top);
    context.lineTo(left, bottom);
    context.moveTo(right, top);
    context.lineTo(right, bottom);
    if (index === 0) {
      context.moveTo(left, top);
      context.lineTo(right, top);
    }
    if (index === legs.length - 1) {
      context.moveTo(left, bottom);
      context.lineTo(right, bottom);
    }
    if (index > 0) {
      const previous = legs[index - 1];
      const previousLeft = legLeft(previous);
      const previousRight = previousLeft + previous.level.size[0] * scale;
      for (const [from, to] of [
        [previousLeft, left],
        [previousRight, right],
      ]) {
        if (Math.abs(from - to) > 0.01) {
          context.moveTo(from, top);
          context.lineTo(to, top);
        }
      }
    }
  });
  context.stroke();
  context.restore();
};

/**
 * Sizes `canvas` to the race stack's aspect ratio (width from layout,
 * height derived) and draws the continuous race preview into it.
 * @returns `true` on success, `false` for empty `legs` or no 2D context.
 */
export const renderRaceThumbnail = (
  canvas: HTMLCanvasElement,
  legs: readonly RaceThumbnailLeg[],
  options: RaceThumbnailOptions = {}
) => {
  if (legs.length === 0) {
    return false;
  }
  const { stackWidth, totalHeight } = computeRaceStackLayout(legs);
  const width = options.width ?? (canvas.clientWidth || canvas.width || 320);
  const padding = options.padding ?? width * RACE_THUMBNAIL_PADDING_RATIO;
  const scale = Math.max(0.0001, (width - padding * 2) / stackWidth);
  const height = Math.max(
    options.minHeight ?? 0,
    padding * 2 + totalHeight * scale
  );
  canvas.style.aspectRatio = `${width} / ${height}`;
  const devicePixels =
    options.pixelRatio ??
    (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  // Many-leg stacks get tall; keep the backing store within canvas limits.
  const pixelRatio = Math.min(
    devicePixels,
    MAX_CANVAS_DIMENSION / width,
    MAX_CANVAS_DIMENSION / height
  );
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  drawRaceThumbnail(context, legs, {
    ...options,
    width,
    height,
    padding,
    pixelRatio,
  });
  return true;
};
