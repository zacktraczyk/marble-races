import type { LegEditorController } from "../editor/legEditor";
import type { EditorContextAction } from "../editor/legEditor";
import { MIN_OBJECT_SIZE } from "../editor/legEditor/constants";
import {
  getLevelObjectShape,
  getWallThickness,
  type LevelObjectShape,
} from "../../../game/level/geometry";
import {
  MAX_WALL_THICKNESS,
  MIN_WALL_THICKNESS,
} from "../../../game/level/constants";
import { wallMotionLabel } from "./wallMotion";
import type { BuilderUi } from ".";

const degrees = (radians: number) => (radians * 180) / Math.PI;
const radians = (degreesValue: number) => (degreesValue * Math.PI) / 180;
const rounded = (value: number) => `${Math.round(value * 100) / 100}`;

const finiteInput = (input: HTMLInputElement, fallback: number) => {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
};

type TransformAction =
  | "rotate-clockwise"
  | "flip-left-right"
  | "flip-top-bottom";

/** Owns numeric geometry editing and multi-selection arrange controls. */
export class TransformInspectorController {
  constructor(
    private readonly ui: BuilderUi,
    private readonly editor: LegEditorController,
    private readonly getDefaultWallThickness: () => number,
    private readonly isReadOnly: () => boolean,
    signal: AbortSignal
  ) {
    for (const input of this.inputs) {
      input.addEventListener("change", this.commitInputs, { signal });
    }
    for (const button of ui.transformActionButtons) {
      button.addEventListener(
        "click",
        () => {
          const action = button.dataset.transformAction as
            | TransformAction
            | undefined;
          if (action === "rotate-clockwise") {
            this.rotateClockwise();
          } else if (action) {
            this.editor.performContextAction(action);
          }
        },
        { signal }
      );
    }
    for (const button of ui.arrangeButtons) {
      button.addEventListener(
        "click",
        () => {
          const action = button.dataset.arrangeAction as
            | EditorContextAction
            | undefined;
          if (action) {
            this.editor.performContextAction(action);
          }
        },
        { signal }
      );
    }
  }

  update() {
    const selected = this.editor.selectedObjects;
    const readOnly = this.isReadOnly();
    const showObjectOptions = selected.length > 0 && !readOnly;
    this.ui.sceneOptions.hidden = showObjectOptions;
    this.ui.objectInspector.hidden = !showObjectOptions;
    if (!showObjectOptions) {
      return;
    }

    const multi = selected.length > 1;
    this.ui.transformControls.hidden = multi;
    this.ui.multiSelectionControls.hidden = !multi;
    this.ui.motionInspector.hidden = multi || selected[0].prefab !== "wall";
    this.ui.selectionCountOutput.textContent = multi
      ? `${selected.length} selected`
      : "";
    this.ui.objectKindBadge.textContent = multi ? "Selection" : "Object";
    for (const button of this.ui.arrangeButtons) {
      button.disabled =
        button.dataset.arrangeAction?.startsWith("distribute-") === true &&
        selected.length < 3;
    }
    if (multi) {
      this.ui.objectInspectorTitle.textContent = `${selected.length} objects`;
      return;
    }

    const object = selected[0];
    const shape = getLevelObjectShape(object, this.getDefaultWallThickness());
    this.ui.objectInspectorTitle.textContent =
      object.prefab === "wall"
        ? wallMotionLabel(object.motion)
        : object.prefab === "spawn-point"
          ? "Spawn point"
          : object.prefab === "finish-zone"
            ? "Finish zone"
            : object.prefab === "bumper"
              ? "Bumper"
              : "Object";
    this.setUnlessEditing(this.ui.transformXInput, shape.position[0]);
    this.setUnlessEditing(this.ui.transformYInput, shape.position[1]);
    this.setUnlessEditing(
      this.ui.transformRotationInput,
      degrees(shape.rotation)
    );

    if (shape.kind === "circle") {
      this.ui.transformPrimaryLabel.textContent = "Diameter";
      this.ui.transformSecondaryRow.hidden = true;
      this.setUnlessEditing(this.ui.transformPrimaryInput, shape.radius * 2);
    } else {
      this.ui.transformPrimaryLabel.textContent =
        object.prefab === "wall" ? "Length" : "Width";
      this.ui.transformSecondaryLabel.textContent =
        object.prefab === "wall" ? "Thickness" : "Height";
      this.ui.transformSecondaryRow.hidden = false;
      this.setUnlessEditing(this.ui.transformPrimaryInput, shape.width);
      this.setUnlessEditing(
        this.ui.transformSecondaryInput,
        object.prefab === "wall"
          ? getWallThickness(object, this.getDefaultWallThickness())
          : shape.height
      );
    }
  }

  private get inputs() {
    return [
      this.ui.transformXInput,
      this.ui.transformYInput,
      this.ui.transformRotationInput,
      this.ui.transformPrimaryInput,
      this.ui.transformSecondaryInput,
    ];
  }

  private setUnlessEditing(input: HTMLInputElement, value: number) {
    if (document.activeElement !== input) {
      input.value = rounded(value);
    }
  }

  private rotateClockwise() {
    const object = this.editor.selectedObject;
    if (!object || this.isReadOnly()) {
      return;
    }
    const shape = getLevelObjectShape(object, this.getDefaultWallThickness());
    this.editor.updateSelectedShape({
      ...shape,
      rotation: shape.rotation + Math.PI / 2,
    });
  }

  private readonly commitInputs = () => {
    const object = this.editor.selectedObject;
    if (!object || this.isReadOnly()) {
      return;
    }
    const current = getLevelObjectShape(object, this.getDefaultWallThickness());
    const position: [number, number] = [
      finiteInput(this.ui.transformXInput, current.position[0]),
      finiteInput(this.ui.transformYInput, current.position[1]),
    ];
    const rotation = radians(
      finiteInput(this.ui.transformRotationInput, degrees(current.rotation))
    );
    let shape: LevelObjectShape;
    let wallThickness: number | undefined;
    if (current.kind === "circle") {
      shape = {
        ...current,
        position,
        rotation,
        radius: Math.max(
          MIN_OBJECT_SIZE / 2,
          finiteInput(this.ui.transformPrimaryInput, current.radius * 2) / 2
        ),
      };
    } else {
      shape = {
        ...current,
        position,
        rotation,
        width: Math.max(
          MIN_OBJECT_SIZE,
          finiteInput(this.ui.transformPrimaryInput, current.width)
        ),
        height: Math.max(
          MIN_OBJECT_SIZE,
          finiteInput(this.ui.transformSecondaryInput, current.height)
        ),
      };
      if (object.prefab === "wall") {
        wallThickness = Math.min(
          MAX_WALL_THICKNESS,
          Math.max(
            MIN_WALL_THICKNESS,
            finiteInput(
              this.ui.transformSecondaryInput,
              getWallThickness(object, this.getDefaultWallThickness())
            )
          )
        );
      }
    }
    this.editor.updateSelectedShape(shape, wallThickness);
  };
}
