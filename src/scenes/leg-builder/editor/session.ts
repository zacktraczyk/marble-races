import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "@game/level/document";
import { isCreationTool, SelectedTool } from "../tools";
import type { EditorGesture, WallEndpointFeedback } from "./gestures";
import type { WallEndpointTarget } from "./hitTest";
import { LegEditorSelection } from "./selection";

export class EditorSession {
  gesture: EditorGesture | null = null;
  wallAnchor: Vec2 | null = null;
  wallPreviewEnd: Vec2 | null = null;
  endpointFeedback: WallEndpointFeedback | null = null;
  placementPreviewPosition: Vec2 | null = null;
  lastPointerScreen: Vec2 | null = null;
  repeatDuplicateDelta: Vec2 | null = null;
  activeTool = SelectedTool.Pointer;
  readOnly = false;
  selection: LegEditorSelection;

  constructor(getObjects: () => readonly LevelObjectData[]) {
    this.selection = new LegEditorSelection(getObjects);
  }

  get creationToolActive() {
    return isCreationTool(this.activeTool);
  }

  isTemporarySelection(modifier: { metaKey: boolean; ctrlKey: boolean }) {
    return this.creationToolActive && (modifier.metaKey || modifier.ctrlKey);
  }

  clearWallAnchor() {
    this.wallAnchor = null;
    this.wallPreviewEnd = null;
    this.endpointFeedback = null;
  }

  setEndpointFeedback(
    target: WallEndpointTarget | null,
    kind: WallEndpointFeedback["kind"]
  ) {
    this.endpointFeedback = target
      ? {
          objectId: target.objectId,
          endpoint: target.endpoint,
          position: [...target.position],
          kind,
        }
      : null;
  }
}
