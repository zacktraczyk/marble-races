import { describe, expect, test } from "bun:test";
import {
  cancelGesture,
  rollbackGesture,
} from "@scenes/leg-builder/editor/input/rollback";

const wall = (id, start, end) => ({
  id,
  prefab: "wall",
  properties: { start: [...start], end: [...end], color: [1, 1, 1, 1] },
});

/**
 * A session/env pair carrying only what rollback and the cursor update read.
 * `calls` records the editor callbacks so tests can assert what was reported.
 */
const createEditor = (objects = []) => {
  const calls = { discarded: [], changed: [], released: [], cursors: [] };
  const session = {
    gesture: null,
    endpointFeedback: { objectId: "stale" },
    activeTool: "pointer",
    creationToolActive: false,
    readOnly: false,
    selection: {
      replaced: null,
      replaceAll(ids) {
        this.replaced = [...ids];
      },
      setHovered() {},
    },
  };
  const env = {
    keyboard: { spaceHeld: false, selectionModifierHeld: false },
    getObjects: () => objects,
    callbacks: {
      onDiscard: (discarded) => calls.discarded.push(discarded),
      onObjectsChange: (changed) => calls.changed.push(changed),
    },
    releasePointer: (pointerId) => calls.released.push(pointerId),
    setCursor: (cursor) => calls.cursors.push(cursor),
  };
  return { session, env, calls, objects };
};

const moveGesture = (overrides = {}) => ({
  kind: "move",
  pointerId: 1,
  startWorld: [0, 0],
  startScreen: [0, 0],
  originals: new Map(),
  inserted: false,
  sourceSelection: [],
  changed: false,
  ...overrides,
});

describe("rollbackGesture", () => {
  test("restores the pre-drag geometry of moved objects", () => {
    const moved = wall("w1", [50, 50], [70, 50]);
    const { session, env, calls } = createEditor([moved]);

    rollbackGesture(
      session,
      env,
      moveGesture({
        changed: true,
        originals: new Map([["w1", wall("w1", [0, 0], [20, 0])]]),
      })
    );

    expect(moved.properties.start).toEqual([0, 0]);
    expect(moved.properties.end).toEqual([20, 0]);
    expect(calls.changed).toEqual([[moved]]);
  });

  test("discards inserted objects and restores the prior selection", () => {
    const inserted = wall("new", [0, 0], [10, 0]);
    const { session, env, calls } = createEditor([inserted]);

    rollbackGesture(
      session,
      env,
      moveGesture({
        changed: true,
        inserted: true,
        originals: new Map([["new", inserted]]),
        sourceSelection: ["previous"],
      })
    );

    expect(calls.discarded).toEqual([[inserted]]);
    expect(calls.changed).toEqual([]);
    expect(session.selection.replaced).toEqual(["previous"]);
  });

  test("discards an insert that never moved", () => {
    const inserted = wall("new", [0, 0], [10, 0]);
    const { session, env, calls } = createEditor([inserted]);

    rollbackGesture(
      session,
      env,
      moveGesture({
        changed: false,
        inserted: true,
        originals: new Map([["new", inserted]]),
        sourceSelection: [],
      })
    );

    expect(calls.discarded).toEqual([[inserted]]);
  });

  test("leaves an unchanged move alone", () => {
    const untouched = wall("w1", [5, 5], [15, 5]);
    const { session, env, calls } = createEditor([untouched]);

    rollbackGesture(
      session,
      env,
      moveGesture({ originals: new Map([["w1", wall("w1", [0, 0], [1, 1])]]) })
    );

    expect(untouched.properties.start).toEqual([5, 5]);
    expect(calls.changed).toEqual([]);
    expect(calls.discarded).toEqual([]);
  });

  test("skips objects that no longer exist", () => {
    const { session, env, calls } = createEditor([]);

    rollbackGesture(
      session,
      env,
      moveGesture({
        changed: true,
        originals: new Map([["gone", wall("gone", [0, 0], [1, 1])]]),
      })
    );

    expect(calls.changed).toEqual([[]]);
  });

  test("restores wall endpoints", () => {
    const dragged = wall("w1", [99, 99], [120, 99]);
    const { session, env, calls } = createEditor([dragged]);

    rollbackGesture(session, env, {
      kind: "wall-endpoint",
      pointerId: 1,
      objectId: "w1",
      endpoint: "start",
      start: [0, 0],
      end: [20, 0],
      startScreen: [0, 0],
      changed: true,
    });

    expect(dragged.properties.start).toEqual([0, 0]);
    expect(dragged.properties.end).toEqual([20, 0]);
    expect(calls.changed).toEqual([[dragged]]);
  });

  test("restores an oscillation's motion", () => {
    const slider = {
      ...wall("w1", [0, 0], [20, 0]),
      motion: { type: "oscillate", range: 999 },
    };
    const { session, env, calls } = createEditor([slider]);

    rollbackGesture(session, env, {
      kind: "motion-range",
      pointerId: 1,
      objectId: "w1",
      startMotion: { type: "oscillate", range: 40 },
      startScreen: [0, 0],
      changed: true,
    });

    expect(slider.motion).toEqual({ type: "oscillate", range: 40 });
    expect(calls.changed).toEqual([[slider]]);
  });

  test("restores the selection a marquee replaced", () => {
    const { session, env } = createEditor([]);

    rollbackGesture(session, env, {
      kind: "marquee",
      pointerId: 1,
      startWorld: [0, 0],
      currentWorld: [10, 10],
      startScreen: [0, 0],
      additive: false,
      initialSelection: new Set(["a", "b"]),
      changed: true,
    });

    expect(session.selection.replaced).toEqual(["a", "b"]);
  });
});

describe("cancelGesture", () => {
  test("rolls back, releases the pointer, and clears gesture state", () => {
    const moved = wall("w1", [50, 50], [70, 50]);
    const { session, env, calls } = createEditor([moved]);
    session.gesture = moveGesture({
      pointerId: 7,
      changed: true,
      originals: new Map([["w1", wall("w1", [0, 0], [20, 0])]]),
    });

    cancelGesture(session, env);

    expect(moved.properties.start).toEqual([0, 0]);
    expect(calls.released).toEqual([7]);
    expect(session.gesture).toBeNull();
    expect(session.endpointFeedback).toBeNull();
    expect(calls.cursors).toEqual(["default"]);
  });

  test("is safe when no gesture is active", () => {
    const { session, env, calls } = createEditor([]);

    cancelGesture(session, env);

    expect(calls.released).toEqual([]);
    expect(session.gesture).toBeNull();
    expect(session.endpointFeedback).toBeNull();
    expect(calls.cursors).toEqual(["default"]);
  });
});
