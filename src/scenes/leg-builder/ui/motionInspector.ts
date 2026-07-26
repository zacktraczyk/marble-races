import { getLevelObjectShape } from "@game/level/geometry";
import type { LegEditorController } from "../editor/legEditor";
import type {
  LevelObjectData,
  LevelObjectMotion,
  SliderRepeat,
} from "@game/level/document";
import type { Vec2 } from "@engine/core/transform";
import {
  pusherPeriodForSpeed,
  pusherSpeedForMotion,
  PUSHER_DEFAULT_RANGE,
  PUSHER_PERIODS,
  type PusherSpeed,
} from "@game/level/objects";
import type { AuthoredLevel } from "@game/level/authoredLevel";
import type { BuilderUi } from ".";
import { clampInteger } from "./fieldInput";

/** Owns editing of motion properties for the currently selected wall. */
export class MotionInspectorController {
  constructor(
    private readonly ui: BuilderUi,
    private readonly editor: LegEditorController,
    private readonly level: AuthoredLevel,
    private readonly isReadOnly: () => boolean,
    private readonly commit: () => void
  ) {}

  changeType = () => {
    const value = this.ui.motionTypeSelect.value;
    this.updateSelectedMotion((object) => {
      if (value === "none") {
        delete object.motion;
        return;
      }
      const current = object.motion;
      const speed = current ? pusherSpeedForMotion(current) : "medium";
      const shared = {
        phase: current?.phase ?? 0,
        direction: current?.direction ?? (1 as const),
      };
      let motion: LevelObjectMotion;
      if (value === "slide") {
        const shape = getLevelObjectShape(object, this.level.wallThickness);
        const rotation = shape.kind === "rectangle" ? shape.rotation : 0;
        const vector: Vec2 =
          current?.type === "oscillate"
            ? [...current.vector]
            : [
                -Math.sin(rotation) * PUSHER_DEFAULT_RANGE,
                Math.cos(rotation) * PUSHER_DEFAULT_RANGE,
              ];
        motion = {
          type: "oscillate",
          vector,
          repeat:
            current?.type === "oscillate"
              ? (current.repeat ?? "ping-pong")
              : "ping-pong",
          periodMs: pusherPeriodForSpeed(
            {
              type: "oscillate",
              vector,
              periodMs: 1,
              ...shared,
            },
            speed
          ),
          ...shared,
        };
      } else {
        motion = {
          type: "rotate",
          pivot: value === "sweep" ? "start" : "center",
          periodMs: PUSHER_PERIODS[speed],
          ...shared,
        };
      }
      object.motion = motion;
    });
  };

  inputRange = () => {
    const range = clampInteger(this.ui.motionRangeInput.value, 15, 240);
    this.ui.motionRangeOutput.value = `${range}`;
    this.updateSelectedMotion((object) => {
      if (object.motion?.type !== "oscillate") {
        return;
      }
      const speed = pusherSpeedForMotion(object.motion);
      const magnitude = Math.hypot(...object.motion.vector);
      const direction: Vec2 =
        magnitude > Number.EPSILON
          ? [
              object.motion.vector[0] / magnitude,
              object.motion.vector[1] / magnitude,
            ]
          : [1, 0];
      object.motion.vector = [direction[0] * range, direction[1] * range];
      object.motion.periodMs = pusherPeriodForSpeed(object.motion, speed);
    }, false);
  };

  commitRange = () => {
    this.inputRange();
    this.commit();
  };

  reverse = () => {
    this.updateSelectedMotion((object) => {
      if (object.motion) {
        object.motion.direction = object.motion.direction === 1 ? -1 : 1;
      }
    });
  };

  setRepeat = (repeat: SliderRepeat) => {
    this.updateSelectedMotion((object) => {
      if (object.motion?.type !== "oscillate") {
        return;
      }
      const speed = pusherSpeedForMotion(object.motion);
      object.motion.repeat = repeat;
      object.motion.periodMs = pusherPeriodForSpeed(object.motion, speed);
    });
  };

  setSpeed = (speed: PusherSpeed) => {
    this.updateSelectedMotion((object) => {
      if (object.motion) {
        object.motion.periodMs = pusherPeriodForSpeed(object.motion, speed);
      }
    });
  };

  private getSelectedEditableWall() {
    const object = this.editor.selectedObject;
    return object?.prefab === "wall" && !object.locked ? object : null;
  }

  private updateSelectedMotion(
    update: (object: Extract<LevelObjectData, { prefab: "wall" }>) => void,
    commit = true
  ) {
    const object = this.getSelectedEditableWall();
    if (!object || this.isReadOnly()) {
      return;
    }
    update(object);
    this.level.refresh(object);
    if (commit) {
      this.commit();
    }
  }
}
