import type Stage from "../../../../engine/stage";
import type { LevelObjectData } from "../../../../game/level/document";
import {
  getLevelObjectMotionPose,
  getOscillationEndpoints,
  getRotationPivot,
  getSliderSpeed,
} from "../../../../game/level/motion";
import {
  getLevelObjectShape,
  getRectangleCorners,
  getWallEndpoints,
  isLevelObjectRotatable,
  isLevelObjectResizable,
  type LevelObjectShape,
  type RectangleLevelShape,
} from "../../../../game/level/geometry";
import { getRotationHandle, getResizeAnchors } from "../geometry";
import { getSelectionBounds } from "./selection";
import type {
  SelectionMarquee,
  WallDraft,
  WallEndpointFeedback,
} from "./gestures";

export type EditorOverlayState = {
  active: boolean;
  readOnly: boolean;
  defaultWallThickness: number;
  hoveredObject: LevelObjectData | null;
  selectedObjects: readonly LevelObjectData[];
  wallDraft: WallDraft | null;
  pusherDraft: LevelObjectData | null;
  wallEndpointFeedback: WallEndpointFeedback | null;
  selectionMarquee: SelectionMarquee | null;
};

const wallDraftShape = ({
  start,
  end,
  thickness,
}: WallDraft): RectangleLevelShape => ({
  kind: "rectangle",
  position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
  rotation: Math.atan2(end[1] - start[1], end[0] - start[0]),
  width: Math.hypot(end[0] - start[0], end[1] - start[1]),
  height: thickness,
});

export class EditorOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly stage: Stage;

  constructor(canvas: HTMLCanvasElement, stage: Stage) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to initialize the level editor overlay");
    }
    this.canvas = canvas;
    this.context = context;
    this.stage = stage;
  }

  render({
    active,
    readOnly,
    defaultWallThickness,
    hoveredObject,
    selectedObjects,
    wallDraft,
    pusherDraft,
    wallEndpointFeedback,
    selectionMarquee,
  }: EditorOverlayState) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);

    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.context.clearRect(0, 0, width, height);
    if (!active) {
      return;
    }

    const selectedIds = new Set(selectedObjects.map((object) => object.id));
    if (hoveredObject && !selectedIds.has(hoveredObject.id)) {
      this.strokeObject(
        hoveredObject,
        defaultWallThickness,
        "rgb(244 244 245 / 88%)",
        1.5,
        [5, 4]
      );
    }

    for (const object of selectedObjects) {
      if (object.motion) {
        this.drawMotionGuide(object, defaultWallThickness, false);
      }
      this.strokeObject(object, defaultWallThickness, "rgb(34 211 238)", 2, []);
    }

    if (pusherDraft) {
      this.drawMotionGuide(pusherDraft, defaultWallThickness, true);
    }

    if (selectedObjects.length > 1) {
      this.drawSelectionBounds(selectedObjects, defaultWallThickness);
    } else if (selectedObjects.length === 1 && !readOnly) {
      const selectedObject = selectedObjects[0];
      if (selectedObject.prefab === "wall") {
        this.drawWallEndpoints(selectedObject);
      } else {
        const shape = getLevelObjectShape(selectedObject, defaultWallThickness);
        if (isLevelObjectResizable(selectedObject)) {
          this.drawResizeAnchors(shape);
        }
        if (isLevelObjectRotatable(selectedObject)) {
          this.drawRotationHandle(shape);
        }
      }
    }

    if (wallDraft) {
      this.drawWallDraft(wallDraft);
    }
    if (selectionMarquee) {
      this.drawMarquee(selectionMarquee);
    }
    if (wallEndpointFeedback) {
      this.drawWallEndpointFeedback(wallEndpointFeedback);
    }
  }

  private strokeObject(
    object: LevelObjectData,
    defaultWallThickness: number,
    color: string,
    lineWidth: number,
    dash: number[]
  ) {
    this.strokeShape(
      getLevelObjectShape(object, defaultWallThickness),
      color,
      lineWidth,
      dash
    );
  }

  private strokeShape(
    shape: LevelObjectShape,
    color: string,
    lineWidth: number,
    dash: number[]
  ) {
    const context = this.context;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.setLineDash(dash);
    context.beginPath();

    if (shape.kind === "circle") {
      const [centerX, centerY] = this.stage.camera.worldToScreen(
        ...shape.position
      );
      context.arc(
        centerX,
        centerY,
        Math.abs(shape.radius * this.stage.camera.zoom),
        0,
        Math.PI * 2
      );
    } else {
      const corners = getRectangleCorners(shape).map((corner) =>
        this.stage.camera.worldToScreen(...corner)
      );
      context.moveTo(corners[0][0], corners[0][1]);
      for (let index = 1; index < corners.length; index++) {
        context.lineTo(corners[index][0], corners[index][1]);
      }
      context.closePath();
    }

    context.stroke();
    context.restore();
  }

  private drawMotionGuide(
    object: LevelObjectData,
    defaultWallThickness: number,
    draft: boolean
  ) {
    const motion = object.motion;
    if (!motion) {
      return;
    }
    const baseShape = getLevelObjectShape(object, defaultWallThickness);
    const color = "rgb(34 211 238)";
    const ghostColor = "rgb(34 211 238 / 55%)";

    if (draft) {
      this.fillShape(baseShape, "rgb(34 211 238 / 24%)");
      this.strokeShape(baseShape, color, 2, []);
    }

    if (motion.type === "oscillate") {
      const endpoints = getOscillationEndpoints(object, defaultWallThickness);
      if (!endpoints) {
        return;
      }
      const [first, second] = endpoints;
      for (const position of endpoints) {
        this.strokeShape({ ...baseShape, position }, ghostColor, 1.5, [5, 4]);
      }
      const firstScreen = this.stage.camera.worldToScreen(...first);
      const secondScreen = this.stage.camera.worldToScreen(...second);
      const context = this.context;
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      context.beginPath();
      context.moveTo(...firstScreen);
      context.lineTo(...secondScreen);
      context.stroke();
      context.setLineDash([]);
      if ((motion.repeat ?? "ping-pong") === "loop") {
        this.drawMotionArrow(firstScreen, secondScreen, 0.62, color);
      } else {
        this.drawMotionArrow(firstScreen, secondScreen, 0.38, color);
        this.drawMotionArrow(secondScreen, firstScreen, 0.38, color);
      }
      context.fillStyle = "rgb(24 24 27)";
      context.strokeStyle = color;
      context.beginPath();
      context.arc(
        secondScreen[0],
        secondScreen[1],
        draft ? 4 : 6,
        0,
        Math.PI * 2
      );
      context.fill();
      context.stroke();
      context.restore();
      this.drawMotionLabel(
        [
          (firstScreen[0] + secondScreen[0]) / 2,
          (firstScreen[1] + secondScreen[1]) / 2,
        ],
        `SLIDE · ${Math.round(getSliderSpeed(motion))} u/s`,
        color
      );
      return;
    }

    const pivot = getRotationPivot(object, defaultWallThickness);
    if (!pivot || baseShape.kind !== "rectangle") {
      return;
    }
    const radiusWorld =
      motion.pivot === "start" ? baseShape.width : baseShape.width / 2;
    const [pivotX, pivotY] = this.stage.camera.worldToScreen(...pivot);
    const radius = Math.max(18, Math.abs(radiusWorld * this.stage.camera.zoom));
    const context = this.context;

    for (const progress of [0.25, 0.75]) {
      const pose = getLevelObjectMotionPose(
        object,
        defaultWallThickness,
        motion.periodMs * progress
      );
      this.strokeShape(
        { ...baseShape, position: pose.position, rotation: pose.rotation },
        ghostColor,
        1.5,
        [5, 4]
      );
    }

    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.arc(pivotX, pivotY, radius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    const arrowAngle =
      motion.direction === 1 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
    const tangentAngle =
      arrowAngle + (motion.direction === 1 ? Math.PI / 2 : -Math.PI / 2);
    const arrowPoint: [number, number] = [
      pivotX + Math.cos(arrowAngle) * radius,
      pivotY + Math.sin(arrowAngle) * radius,
    ];
    const arrowFrom: [number, number] = [
      arrowPoint[0] - Math.cos(tangentAngle) * 18,
      arrowPoint[1] - Math.sin(tangentAngle) * 18,
    ];
    this.drawMotionArrow(arrowFrom, arrowPoint, 1, color);
    context.fillStyle = "rgb(24 24 27)";
    context.strokeStyle = color;
    context.beginPath();
    context.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    this.drawMotionLabel(
      [pivotX, pivotY - radius],
      `${motion.pivot === "start" ? "SWEEP" : "SPIN"} · ${(motion.periodMs / 1000).toFixed(1)}s`,
      color
    );
  }

  private fillShape(shape: LevelObjectShape, color: string) {
    const context = this.context;
    context.save();
    context.fillStyle = color;
    context.beginPath();
    if (shape.kind === "circle") {
      const [x, y] = this.stage.camera.worldToScreen(...shape.position);
      context.arc(
        x,
        y,
        Math.abs(shape.radius * this.stage.camera.zoom),
        0,
        Math.PI * 2
      );
    } else {
      const corners = getRectangleCorners(shape).map((corner) =>
        this.stage.camera.worldToScreen(...corner)
      );
      context.moveTo(...corners[0]);
      for (const corner of corners.slice(1)) {
        context.lineTo(...corner);
      }
      context.closePath();
    }
    context.fill();
    context.restore();
  }

  private drawMotionArrow(
    from: [number, number],
    to: [number, number],
    progress: number,
    color: string
  ) {
    const x = from[0] + (to[0] - from[0]) * progress;
    const y = from[1] + (to[1] - from[1]) * progress;
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const context = this.context;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(
      x - Math.cos(angle - 0.65) * 8,
      y - Math.sin(angle - 0.65) * 8
    );
    context.lineTo(x, y);
    context.lineTo(
      x - Math.cos(angle + 0.65) * 8,
      y - Math.sin(angle + 0.65) * 8
    );
    context.stroke();
    context.restore();
  }

  private drawMotionLabel(
    position: [number, number],
    label: string,
    color: string
  ) {
    const context = this.context;
    context.save();
    context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    const width = context.measureText(label).width + 10;
    context.fillStyle = "rgb(24 24 27 / 92%)";
    context.fillRect(position[0] - width / 2, position[1] - 25, width, 18);
    context.fillStyle = color;
    context.fillText(label, position[0], position[1] - 11);
    context.restore();
  }

  private drawWallEndpoints(
    object: Extract<LevelObjectData, { prefab: "wall" }>
  ) {
    const { start, end } = getWallEndpoints(object);
    const context = this.context;
    context.save();
    context.fillStyle = "rgb(24 24 27)";
    context.strokeStyle = "rgb(34 211 238)";
    context.lineWidth = 2;
    for (const endpoint of [start, end]) {
      const [x, y] = this.stage.camera.worldToScreen(...endpoint);
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  private drawSelectionBounds(
    objects: readonly LevelObjectData[],
    defaultWallThickness: number
  ) {
    const bounds = getSelectionBounds(objects, defaultWallThickness);
    if (!bounds) {
      return;
    }
    const [left, top] = this.stage.camera.worldToScreen(...bounds.min);
    const [right, bottom] = this.stage.camera.worldToScreen(...bounds.max);
    this.context.save();
    this.context.strokeStyle = "rgb(34 211 238 / 75%)";
    this.context.lineWidth = 1;
    this.context.setLineDash([5, 4]);
    this.context.strokeRect(left, top, right - left, bottom - top);
    this.context.restore();
  }

  private drawWallDraft(draft: WallDraft) {
    const shape = wallDraftShape(draft);
    const context = this.context;
    context.save();
    context.strokeStyle = "rgb(34 211 238)";
    context.lineWidth = 2;

    if (shape.width < 1) {
      const [x, y] = this.stage.camera.worldToScreen(...draft.start);
      context.beginPath();
      context.fillStyle = "rgb(24 24 27)";
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
      return;
    }

    const corners = getRectangleCorners(shape).map((corner) =>
      this.stage.camera.worldToScreen(...corner)
    );
    context.fillStyle = "rgb(34 211 238 / 22%)";
    context.beginPath();
    context.moveTo(corners[0][0], corners[0][1]);
    for (let index = 1; index < corners.length; index++) {
      context.lineTo(corners[index][0], corners[index][1]);
    }
    context.closePath();
    context.fill();
    context.stroke();

    for (const endpoint of [draft.start, draft.end]) {
      const [x, y] = this.stage.camera.worldToScreen(...endpoint);
      context.beginPath();
      context.fillStyle = "rgb(24 24 27)";
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    const midpoint = this.stage.camera.worldToScreen(...shape.position);
    const angle = Math.round((shape.rotation * 180) / Math.PI);
    const label = `${Math.round(shape.width)} · ${angle}°`;
    context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    const labelWidth = context.measureText(label).width + 12;
    context.fillStyle = "rgb(24 24 27 / 92%)";
    context.fillRect(
      midpoint[0] - labelWidth / 2,
      midpoint[1] - 30,
      labelWidth,
      20
    );
    context.fillStyle = "rgb(165 243 252)";
    context.fillText(label, midpoint[0], midpoint[1] - 15);
    context.restore();
  }

  private drawWallEndpointFeedback({ position, kind }: WallEndpointFeedback) {
    const [x, y] = this.stage.camera.worldToScreen(...position);
    const context = this.context;
    const color = kind === "snap" ? "rgb(250 204 21)" : "rgb(34 211 238)";
    const label = kind === "snap" ? "Snap to endpoint" : "Edit endpoint";

    context.save();
    context.fillStyle = "rgb(24 24 27 / 92%)";
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.fillStyle = color;
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();

    context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const labelWidth = context.measureText(label).width + 10;
    context.fillStyle = "rgb(24 24 27 / 92%)";
    context.fillRect(x + 12, y - 11, labelWidth, 20);
    context.fillStyle = color;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(label, x + 17, y - 1);
    context.restore();
  }

  private drawMarquee({ start, end }: SelectionMarquee) {
    const startScreen = this.stage.camera.worldToScreen(...start);
    const endScreen = this.stage.camera.worldToScreen(...end);
    const left = Math.min(startScreen[0], endScreen[0]);
    const top = Math.min(startScreen[1], endScreen[1]);
    const width = Math.abs(endScreen[0] - startScreen[0]);
    const height = Math.abs(endScreen[1] - startScreen[1]);
    this.context.save();
    this.context.fillStyle = "rgb(34 211 238 / 10%)";
    this.context.strokeStyle = "rgb(34 211 238 / 80%)";
    this.context.lineWidth = 1;
    this.context.fillRect(left, top, width, height);
    this.context.strokeRect(left, top, width, height);
    this.context.restore();
  }

  private drawResizeAnchors(shape: LevelObjectShape) {
    const context = this.context;
    const size = 8;
    context.save();
    context.fillStyle = "rgb(24 24 27)";
    context.strokeStyle = "rgb(34 211 238)";
    context.lineWidth = 2;
    for (const anchor of getResizeAnchors(shape)) {
      const [x, y] = this.stage.camera.worldToScreen(...anchor.position);
      context.fillRect(x - size / 2, y - size / 2, size, size);
      context.strokeRect(x - size / 2, y - size / 2, size, size);
    }
    context.restore();
  }

  private drawRotationHandle(shape: LevelObjectShape) {
    const context = this.context;
    const offset = 28 / Math.max(Math.abs(this.stage.camera.zoom), 0.001);
    const handle = getRotationHandle(shape, offset);
    const [connectionX, connectionY] = this.stage.camera.worldToScreen(
      ...handle.connection
    );
    const [handleX, handleY] = this.stage.camera.worldToScreen(
      ...handle.position
    );

    context.save();
    context.strokeStyle = "rgb(34 211 238)";
    context.fillStyle = "rgb(24 24 27)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(connectionX, connectionY);
    context.lineTo(handleX, handleY);
    context.stroke();
    context.beginPath();
    context.arc(handleX, handleY, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
}
