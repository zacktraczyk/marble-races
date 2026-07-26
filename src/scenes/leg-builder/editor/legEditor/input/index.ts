// Public surface of the editor's input handling. The gesture entry points
// (beginPan/beginMove/beginTransform) stay private to pointer.ts.

export {
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
} from "./pointer";
export type { DragDepsBase, DragUpdateResult } from "./drag";
export { updateCursor, updateIdleState } from "./idleCursor";
export { LegEditorKeyboard } from "./keyboard";
export type { LegEditorKeyboardActions } from "./keyboard";
export { cancelGesture, rollbackGesture } from "./rollback";
