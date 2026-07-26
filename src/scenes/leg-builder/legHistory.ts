import type { SerializedLevel } from "@game/level/document";

const cloneLevel = (level: SerializedLevel) => structuredClone(level);
const fingerprint = (level: SerializedLevel) => JSON.stringify(level);

export class LegHistory {
  private entries: SerializedLevel[] = [];
  private index = -1;

  constructor(initialLevel: SerializedLevel) {
    this.record(initialLevel);
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  record(level: SerializedLevel) {
    const current = this.entries[this.index];
    if (current && fingerprint(current) === fingerprint(level)) {
      return false;
    }
    this.entries.splice(this.index + 1);
    this.entries.push(cloneLevel(level));
    this.index = this.entries.length - 1;
    return true;
  }

  undo() {
    if (!this.canUndo) {
      return null;
    }
    this.index--;
    return cloneLevel(this.entries[this.index]);
  }

  redo() {
    if (!this.canRedo) {
      return null;
    }
    this.index++;
    return cloneLevel(this.entries[this.index]);
  }
}
