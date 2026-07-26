import { beforeEach, describe, expect, test } from "bun:test";
import { AuthoredLevel } from "@game/level/authoredLevel";

/**
 * A stage stub that records every spawned entity so tests can assert on the
 * runtime entities a level creates and destroys.
 */
const createStage = () => {
  const spawned = [];
  return {
    width: 200,
    height: 300,
    spawned,
    flushes: 0,
    spawn() {
      const entity = { scale: [1, 1], deleted: false };
      entity.delete = () => {
        entity.deleted = true;
      };
      spawned.push(entity);
      return entity;
    },
    world: {
      flushDestruction() {
        this.flushes += 1;
      },
    },
  };
};

const wall = (overrides = {}) => ({
  prefab: "wall",
  properties: { start: [-10, 0], end: [10, 0], color: [1, 1, 1, 1] },
  ...overrides,
});

/** Adds a wall and returns the id the document generated for it. */
const addWall = (level, overrides = {}) => level.add(wall(overrides)).id;

const createLevel = (stage) =>
  new AuthoredLevel(stage, { teamCount: 2, marblesPerTeam: 2 }, 5);

describe("authored level", () => {
  let stage;
  let level;

  beforeEach(() => {
    stage = createStage();
    level = createLevel(stage);
  });

  test("adds an object to the document and spawns its entities", () => {
    const object = level.add(wall());

    expect(level.objects).toHaveLength(1);
    expect(level.has("wall")).toBe(true);
    expect(object).toMatchObject({ id: expect.any(String), prefab: "wall" });
    expect(level.find("wall")).toBe(object);
    expect(stage.spawned.length).toBeGreaterThan(0);
  });

  test("has and find report absent prefabs without throwing", () => {
    expect(level.has("spawn-point")).toBe(false);
    expect(level.find("spawn-point")).toBeNull();
  });

  test("remove deletes the runtime entities and drops the object", () => {
    const id = addWall(level);
    const spawnedForWall = [...stage.spawned];

    level.remove(id);

    expect(level.objects).toHaveLength(0);
    expect(level.has("wall")).toBe(false);
    expect(spawnedForWall.every((entity) => entity.deleted)).toBe(true);
  });

  test("setVisible collapses and restores entity scale", () => {
    const id = addWall(level);
    const entities = [...stage.spawned];

    level.setVisible(id, false);
    expect(entities.every((entity) => entity.scale)).toBeTruthy();
    expect(entities.map((entity) => entity.scale)).toEqual(
      entities.map(() => [0, 0])
    );

    level.setVisible(id, true);
    expect(entities.map((entity) => entity.scale)).toEqual(
      entities.map(() => [1, 1])
    );
  });

  test("an object hidden before it respawns comes back hidden", () => {
    const id = addWall(level);
    level.setVisible(id, false);
    const beforeRefresh = stage.spawned.length;

    level.refresh(level.find("wall"));

    const respawned = stage.spawned.slice(beforeRefresh);
    expect(respawned.length).toBeGreaterThan(0);
    expect(respawned.map((entity) => entity.scale)).toEqual(
      respawned.map(() => [0, 0])
    );
  });

  test("setWallThickness updates settings and respawns walls", () => {
    addWall(level);
    const beforeThickness = stage.spawned.length;

    level.setWallThickness(12);

    expect(level.wallThickness).toBe(12);
    expect(stage.spawned.length).toBeGreaterThan(beforeThickness);
  });

  test("resize drops locked objects, resizes, and adds the new boundaries", () => {
    const lockedId = addWall(level, { locked: true });
    const freeId = addWall(level);

    level.resize([400, 500], [wall({ locked: true })]);

    expect(level.document.size).toEqual([400, 500]);
    const ids = level.objects.map((object) => object.id);
    expect(ids).toContain(freeId);
    expect(ids).not.toContain(lockedId);
    expect(level.objects).toHaveLength(2);
    expect(level.objects.at(-1)).toMatchObject({ locked: true });
  });

  test("dispose deletes every runtime entity but keeps the document", () => {
    addWall(level);
    addWall(level);
    const entities = [...stage.spawned];

    level.dispose();

    expect(entities.every((entity) => entity.deleted)).toBe(true);
    expect(level.objects).toHaveLength(2);
  });

  test("restore replaces the document contents and respawns from it", () => {
    addWall(level);
    const stale = [...stage.spawned];

    level.restore({
      version: 3,
      name: "restored",
      size: [120, 140],
      settings: { wallThickness: 8 },
      objects: [{ ...wall(), id: "fresh" }],
    });

    expect(stale.every((entity) => entity.deleted)).toBe(true);
    expect(level.objects.map((object) => object.id)).toEqual(["fresh"]);
    expect(level.wallThickness).toBe(8);
    expect(level.document.size).toEqual([120, 140]);
  });

  test("restore clears hidden state so a reused id is visible again", () => {
    const id = addWall(level);
    level.setVisible(id, false);
    const beforeRestore = stage.spawned.length;

    level.restore({
      version: 3,
      name: "restored",
      size: [120, 140],
      settings: { wallThickness: 5 },
      objects: [{ ...wall(), id }],
    });

    const respawned = stage.spawned.slice(beforeRestore);
    expect(respawned.map((entity) => entity.scale)).toEqual(
      respawned.map(() => [1, 1])
    );
  });
});
