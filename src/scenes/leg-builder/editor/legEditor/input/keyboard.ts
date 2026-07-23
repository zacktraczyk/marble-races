import type { Vec2 } from "../../../../../engine/core/transform";
import { SelectedTool } from "../../tools";

export type LegEditorKeyboardActions = {
  undo(): void;
  redo(): void;
  copy(): boolean;
  cut(): boolean;
  paste(inPlace: boolean): boolean;
  duplicate(): boolean;
  focusSelection(): boolean;
  selectAll(): boolean;
  escape(): boolean;
  finishWall(): boolean;
  reset(): boolean;
  requestTool(tool: SelectedTool): void;
  deleteSelection(): boolean;
  nudgeSelection(direction: Vec2, distance: number): boolean;
  modifierChanged(held: boolean): void;
  spaceChanged(held: boolean): void;
  blur(): void;
};

const isKeyboardControlTarget = (
  target: EventTarget | null
): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.matches(
      'button, a[href], input, textarea, select, summary, [role="button"], [role="menuitem"]'
    ));

const isTextEditingTarget = (
  target: EventTarget | null
): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

const releaseKeyboardControlFocus = (target: EventTarget | null) => {
  if (isKeyboardControlTarget(target)) {
    target.blur();
  }
};

/** Owns keyboard state and maps browser key events to editor commands. */
export class LegEditorKeyboard {
  spaceHeld = false;
  selectionModifierHeld = false;

  constructor(
    private readonly actions: LegEditorKeyboardActions,
    signal: AbortSignal
  ) {
    window.addEventListener("keydown", this.keyDown, { signal });
    window.addEventListener("keyup", this.keyUp, { signal });
    window.addEventListener("blur", this.windowBlur, { signal });
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      releaseKeyboardControlFocus(event.target);
      if (this.actions.escape()) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (isTextEditingTarget(event.target)) {
        return;
      }
      releaseKeyboardControlFocus(event.target);
      if (this.actions.deleteSelection()) {
        event.preventDefault();
      }
      return;
    }

    if (isKeyboardControlTarget(event.target)) {
      return;
    }

    if ((event.key === "Meta" || event.key === "Control") && !event.repeat) {
      this.selectionModifierHeld = true;
      this.actions.modifierChanged(true);
      return;
    }
    if (event.key === " " && !event.repeat) {
      this.spaceHeld = true;
      this.actions.spaceChanged(true);
      event.preventDefault();
      return;
    }

    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "z") {
      if (event.shiftKey) {
        this.actions.redo();
      } else {
        this.actions.undo();
      }
      event.preventDefault();
      return;
    }
    if (modifier && key === "y") {
      this.actions.redo();
      event.preventDefault();
      return;
    }
    if (modifier && key === "a") {
      if (this.actions.selectAll()) {
        event.preventDefault();
      }
      return;
    }
    if (modifier && key === "c") {
      if (this.actions.copy()) {
        event.preventDefault();
      }
      return;
    }
    if (modifier && key === "x") {
      if (this.actions.cut()) {
        event.preventDefault();
      }
      return;
    }
    if (modifier && key === "v") {
      if (this.actions.paste(event.shiftKey)) {
        event.preventDefault();
      }
      return;
    }
    if (modifier && key === "d") {
      if (this.actions.duplicate()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Enter") {
      if (this.actions.finishWall()) {
        event.preventDefault();
      }
      return;
    }

    if (!modifier && !event.altKey) {
      if (key === "r" && this.actions.reset()) {
        event.preventDefault();
        return;
      }
      if (key === "f" && this.actions.focusSelection()) {
        event.preventDefault();
        return;
      }
      const toolByKey: Partial<Record<string, SelectedTool>> = {
        "1": SelectedTool.Pan,
        "2": SelectedTool.Pointer,
        "3": SelectedTool.Wall,
        v: SelectedTool.Pointer,
        h: SelectedTool.Pan,
        w: SelectedTool.Wall,
        l: SelectedTool.Wall,
      };
      const requestedTool = toolByKey[key];
      if (requestedTool !== undefined) {
        this.actions.requestTool(requestedTool);
        event.preventDefault();
        return;
      }
    }

    const directionByKey: Partial<Record<string, Vec2>> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directionByKey[event.key];
    if (
      direction &&
      this.actions.nudgeSelection(direction, event.shiftKey ? 10 : 1)
    ) {
      event.preventDefault();
    }
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    if (event.key === "Meta" || event.key === "Control") {
      this.selectionModifierHeld = false;
      this.actions.modifierChanged(false);
      return;
    }
    if (event.key === " ") {
      if (isKeyboardControlTarget(event.target)) {
        return;
      }
      this.spaceHeld = false;
      this.actions.spaceChanged(false);
      event.preventDefault();
    }
  };

  private readonly windowBlur = () => {
    this.spaceHeld = false;
    this.selectionModifierHeld = false;
    this.actions.blur();
  };
}
