import { describe, expect, test } from "bun:test";
import { LegHistory } from "@scenes/leg-builder/legHistory";

const level = (name, wallThickness = 25) => ({
  version: 3,
  name,
  size: [800, 800],
  settings: { wallThickness },
  objects: [],
});

describe("level history", () => {
  test("undoes and redoes committed snapshots", () => {
    const history = new LegHistory(level("Initial"));
    history.record(level("Edited", 30));

    expect(history.canUndo).toBe(true);
    expect(history.undo()).toMatchObject({
      name: "Initial",
      settings: { wallThickness: 25 },
    });
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toMatchObject({
      name: "Edited",
      settings: { wallThickness: 30 },
    });
  });

  test("drops the redo branch after a new edit", () => {
    const history = new LegHistory(level("Initial"));
    history.record(level("Second"));
    history.record(level("Third"));
    history.undo();
    history.record(level("Replacement"));

    expect(history.canRedo).toBe(false);
    expect(history.undo()?.name).toBe("Second");
  });

  test("ignores duplicate snapshots", () => {
    const history = new LegHistory(level("Initial"));

    expect(history.record(level("Initial"))).toBe(false);
    expect(history.canUndo).toBe(false);
  });
});
