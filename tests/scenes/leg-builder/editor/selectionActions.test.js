import { describe, expect, test } from "bun:test";
import { createGridLayout } from "@game/level/grid";
import { LegEditorSelection } from "@scenes/leg-builder/editor/selection";
import {
  copySelectedObjects,
  duplicateSelectedObjects,
  pasteClipboardObjects,
} from "@scenes/leg-builder/editor/selectionActions";

const wall = (id, start = [0, 0], end = [60, 0]) => ({
  id,
  prefab: "wall",
  properties: {
    start,
    end,
    thickness: 20,
    color: [1, 1, 1, 1],
  },
});

const createHost = (initial) => {
  const objects = [...initial];
  const selection = new LegEditorSelection(() => objects);
  selection.replaceAll(objects.map((object) => object.id));
  let nextId = 1;
  const commits = [];
  const session = {
    readOnly: false,
    selection,
    activeTool: 1,
    gesture: null,
    wallAnchor: null,
    get creationToolActive() {
      return false;
    },
  };
  const env = {
    getObjects: () => objects,
    getDefaultWallThickness: () => 20,
    getGridLayout: () =>
      createGridLayout({ min: [-300, -300], max: [300, 300] }),
    callbacks: {
      onDelete: () => {},
      onInsert: (copies) => {
        const inserted = copies.map((copy) => ({
          ...structuredClone(copy),
          id: `inserted-${nextId++}`,
        }));
        objects.push(...inserted);
        return inserted;
      },
      onDiscard: () => {},
      onObjectsChange: () => {},
      onObjectsCommit: (changed) => commits.push([...changed]),
      onToolRequest: () => {},
      onFocus: () => {},
    },
  };
  return { session, env, objects, selection, commits };
};

describe("leg editor selection actions", () => {
  test("duplicates with fresh ids and a grid-step offset in one commit", () => {
    const source = wall("source");
    const { session, env, objects, selection, commits } = createHost([source]);
    const [stepX, stepY] = env.getGridLayout().step;

    expect(duplicateSelectedObjects(session, env)).toBe(true);

    expect(objects).toHaveLength(2);
    expect(objects[1].id).not.toBe(source.id);
    expect(objects[1].properties.start).toEqual([stepX, stepY]);
    expect(objects[1].properties.end).toEqual([60 + stepX, stepY]);
    expect(selection.selectedObjects).toEqual([objects[1]]);
    expect(commits).toEqual([[objects[1]]]);
  });

  test("duplicates with an explicit offset so Alt-drag spacing can repeat", () => {
    const source = wall("source");
    const { session, env, objects } = createHost([source]);

    expect(duplicateSelectedObjects(session, env, [75, -25])).toBe(true);

    expect(objects[1].properties.start).toEqual([75, -25]);
    expect(objects[1].properties.end).toEqual([135, -25]);
  });

  test("pastes a copied multi-selection around an exact target point", () => {
    const first = wall("first", [0, 0], [20, 0]);
    const second = wall("second", [80, 0], [100, 0]);
    const source = createHost([first, second]);
    expect(copySelectedObjects(source.session, source.env)).toBe(true);

    const destination = createHost([]);
    expect(
      pasteClipboardObjects(destination.session, destination.env, {
        at: [300, 200],
      })
    ).toBe(true);

    const inserted = destination.selection.selectedObjects;
    expect(inserted).toHaveLength(2);
    const centerX =
      (inserted[0].properties.start[0] + inserted[1].properties.end[0]) / 2;
    expect(centerX).toBeCloseTo(300);
    expect(inserted[0].properties.start[1]).toBeCloseTo(200);
    expect(destination.commits).toHaveLength(1);
  });
});
