import type { PusherKind } from "../../../game/level/objects";

export enum SelectedTool {
  Pan,
  Pointer,
  Wall,
  Slider,
  Spinner,
  Sweeper,
}

export type PusherTool =
  | SelectedTool.Slider
  | SelectedTool.Spinner
  | SelectedTool.Sweeper;

/** Whether the tool creates a pusher obstacle (slider, spinner, or sweeper). */
export const isPusherTool = (tool: SelectedTool): tool is PusherTool =>
  tool === SelectedTool.Slider ||
  tool === SelectedTool.Spinner ||
  tool === SelectedTool.Sweeper;

/** Whether the tool places a new object (a wall or any pusher). */
export const isCreationTool = (tool: SelectedTool) =>
  tool === SelectedTool.Wall || isPusherTool(tool);

/** The pusher kind a given pusher tool creates. */
export const pusherKindFromTool = (tool: PusherTool): PusherKind => {
  switch (tool) {
    case SelectedTool.Slider:
      return "slider";
    case SelectedTool.Spinner:
      return "spinner";
    case SelectedTool.Sweeper:
      return "sweeper";
  }
};
