import { describe, expect, test } from "bun:test";
import { TEAM_COLORS } from "@game/race/teams";
import { RaceController } from "@game/race/controller";

describe("race controller", () => {
  test("places an out-of-bounds marble into the leftmost unclaimed bay", () => {
    const spawned = [];
    let cleared = false;
    const marble = {
      tags: new Set(["team:2"]),
      hasTag: (tag) => tag === "released-marble",
      delete: () => {
        cleared = true;
      },
    };
    const stage = {
      physicsEnabled: false,
      registerPhysicsObserver: () => {},
      update: () => {},
      clearOutOfBoundsEntities: () => [marble],
      spawn: (definition) => {
        spawned.push(definition);
        return { delete: () => {} };
      },
    };
    const level = {
      has: () => true,
    };
    const race = new RaceController(stage, level, {
      teamCount: 2,
      marblesPerTeam: 2,
      releaseIntervalMs: 100,
    });
    race.finishPlacements = [
      { bayIndex: 0, slotIndex: 0, position: [10, 10] },
      { bayIndex: 0, slotIndex: 1, position: [20, 10] },
      { bayIndex: 1, slotIndex: 0, position: [10, 20] },
      { bayIndex: 1, slotIndex: 1, position: [20, 20] },
    ];

    race.fixedUpdate(1000 / 60);

    expect(cleared).toBe(true);
    expect(race.snapshot).toMatchObject({
      finishedMarbles: 1,
      remainingMarbles: 3,
      outOfBoundsMarbles: 1,
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      transform: { position: [10, 10] },
      tags: expect.arrayContaining(["finished-marble", "team:2"]),
      physics: undefined,
    });
  });

  test("maps stable colors and elimination identity through claimed bays", () => {
    const spawned = [];
    const marble = {
      tags: new Set(["team:2"]),
      hasTag: (tag) => tag === "released-marble",
      delete: () => {},
    };
    const stage = {
      physicsEnabled: false,
      registerPhysicsObserver: () => {},
      update: () => {},
      clearOutOfBoundsEntities: () => [marble],
      spawn: (definition) => {
        spawned.push(definition);
        return { delete: () => {} };
      },
    };
    const level = {
      has: () => true,
    };
    const race = new RaceController(
      stage,
      level,
      {
        teamCount: 2,
        marblesPerTeam: 2,
        releaseIntervalMs: 100,
      },
      { stableTeamIndices: [5, 2] }
    );
    race.finishPlacements = [
      { bayIndex: 0, slotIndex: 0, position: [10, 10] },
      { bayIndex: 0, slotIndex: 1, position: [20, 10] },
      { bayIndex: 1, slotIndex: 0, position: [10, 20] },
      { bayIndex: 1, slotIndex: 1, position: [20, 20] },
    ];

    race.fixedUpdate(1000 / 60);
    race.finishTracker.record(0);
    race.finishTracker.record(0);

    expect(spawned[0]).toMatchObject({
      transform: { position: [10, 10] },
      render: { parts: [{ color: TEAM_COLORS[2] }] },
      tags: expect.arrayContaining(["finished-marble", "team:2"]),
    });
    expect(race.snapshot.eliminatedTeamIndex).toBe(2);
  });

  test("completes when every moving marble belongs to one team", () => {
    const stage = {
      physicsEnabled: true,
      registerPhysicsObserver: () => {},
    };
    const level = { has: () => true };
    const race = new RaceController(stage, level, {
      teamCount: 2,
      marblesPerTeam: 5,
      releaseIntervalMs: 100,
    });
    race.phase = "running";
    race.releaseQueue = { remaining: 0 };

    for (let index = 0; index < 5; index++) {
      race.finishTracker.record(1);
    }

    expect(race.freezeIfSingleTeamRemains()).toBe(true);
    expect(race.snapshot).toMatchObject({
      phase: "complete",
      remainingMarbles: 5,
      eliminatedTeamIndex: 0,
    });
    expect(stage.physicsEnabled).toBe(false);
  });

  test("freezes every remaining marble when external mode completes", () => {
    const spawned = [];
    const makeMarble = (id) => ({
      id,
      tags: new Set(["team:1", "race-marble", "released-marble"]),
      hasTag: (tag) => tag !== undefined,
      markedForDeletion: false,
      position: [id, id],
      delete() {
        this.markedForDeletion = true;
      },
    });
    const stage = {
      registerPhysicsObserver: () => {},
      spawn: (definition) => {
        spawned.push(definition);
        return { delete: () => {} };
      },
    };
    const race = new RaceController(
      stage,
      { has: () => true },
      { teamCount: 2, marblesPerTeam: 5, releaseIntervalMs: 100 },
      { external: { bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 } } }
    );
    race.phase = "running";
    race.releaseQueue = { remaining: 0 };
    race.raceMarbles.push(
      ...Array.from({ length: 5 }, (_, id) => makeMarble(id))
    );
    for (let index = 0; index < 5; index++) {
      race.finishTracker.record(1);
    }

    expect(race.freezeIfSingleTeamRemains()).toBe(true);
    expect(spawned).toHaveLength(5);
    expect(
      spawned.every((definition) => definition.physics === undefined)
    ).toBe(true);
    expect(race.raceMarbles.every((marble) => marble.markedForDeletion)).toBe(
      true
    );
  });

  test("uses stable colors for released marbles while retaining local team tags", () => {
    const spawned = [];
    const stage = {
      registerPhysicsObserver: () => {},
      spawn: (definition) => {
        spawned.push(definition);
        return { delete: () => {} };
      },
    };
    const level = {
      find: () => ({
        transform: { position: [0, 0], rotation: 0 },
        properties: { directionVariance: 0, launchSpeed: 0 },
      }),
    };
    const race = new RaceController(
      stage,
      level,
      {
        teamCount: 2,
        marblesPerTeam: 1,
        releaseIntervalMs: 100,
      },
      { stableTeamIndices: [5, 2] }
    );
    race.releaseQueue = {
      takeNext: () => ({ teamIndex: 0 }),
    };

    race.releaseNextMarble([0, 0]);

    expect(spawned[0]).toMatchObject({
      render: { parts: [{ color: TEAM_COLORS[5] }] },
      tags: expect.arrayContaining(["race-marble", "team:1"]),
    });
  });

  test("external mode culls own marbles outside its bounds through the finish path", () => {
    const spawned = [];
    const marble = {
      id: 7,
      tags: new Set(["team:2", "race-marble", "released-marble"]),
      hasTag: (tag) => marble.tags.has(tag),
      markedForDeletion: false,
      position: [9999, 0],
      delete: () => {
        marble.markedForDeletion = true;
      },
    };
    const stage = {
      registerPhysicsObserver: () => {},
      spawn: (definition) => {
        spawned.push(definition);
        return { delete: () => {} };
      },
    };
    const level = { has: () => true };
    const race = new RaceController(
      stage,
      level,
      { teamCount: 2, marblesPerTeam: 2, releaseIntervalMs: 100 },
      { external: { bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 } } }
    );
    race.finishPlacements = [
      { bayIndex: 0, slotIndex: 0, position: [10, 10] },
      { bayIndex: 0, slotIndex: 1, position: [20, 10] },
      { bayIndex: 1, slotIndex: 0, position: [10, 20] },
      { bayIndex: 1, slotIndex: 1, position: [20, 20] },
    ];
    race.raceMarbles.push(marble);

    race.fixedUpdate(1000 / 60);

    expect(marble.markedForDeletion).toBe(true);
    expect(race.snapshot).toMatchObject({
      finishedMarbles: 1,
      outOfBoundsMarbles: 1,
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      transform: { position: [10, 10] },
      physics: undefined,
    });
  });

  test("external mode reports released marbles with their stable team index", () => {
    const released = [];
    const stage = {
      registerPhysicsObserver: () => {},
      spawn: () => ({ id: 1, delete: () => {} }),
    };
    const level = {
      find: () => ({
        transform: { position: [0, 0], rotation: 0 },
        properties: { directionVariance: 0, launchSpeed: 0 },
      }),
    };
    const race = new RaceController(
      stage,
      level,
      { teamCount: 2, marblesPerTeam: 1, releaseIntervalMs: 100 },
      {
        stableTeamIndices: [5, 2],
        external: {
          bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
          onMarbleReleased: (stableTeamIndex) => released.push(stableTeamIndex),
        },
      }
    );
    race.releaseQueue = { takeNext: () => ({ teamIndex: 1 }) };

    race.releaseNextMarble([0, 0]);

    expect(released).toEqual([2]);
  });

  test("external abandon freezes live marbles and removeFinishedMarble drains them", () => {
    const spawned = [];
    const makeMarble = (id, team) => ({
      id,
      tags: new Set([`team:${team}`, "race-marble", "released-marble"]),
      hasTag: (tag) => tag !== undefined,
      markedForDeletion: false,
      position: [id, id],
      delete: () => {},
    });
    const stage = {
      registerPhysicsObserver: () => {},
      spawn: (definition) => {
        const entity = { definition, deleted: false, delete: () => {} };
        entity.delete = () => {
          entity.deleted = true;
        };
        spawned.push(entity);
        return entity;
      },
    };
    const level = { has: () => true };
    const race = new RaceController(
      stage,
      level,
      { teamCount: 2, marblesPerTeam: 2, releaseIntervalMs: 100 },
      {
        stableTeamIndices: [5, 2],
        external: { bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } },
      }
    );
    race.raceMarbles.push(makeMarble(1, 1), makeMarble(2, 2));

    race.abandon();

    expect(spawned).toHaveLength(2);
    expect(spawned.map((entity) => entity.definition.physics)).toEqual([
      undefined,
      undefined,
    ]);
    expect(race.removeFinishedMarble(5)).toBe(true);
    expect(race.removeFinishedMarble(5)).toBe(false);
    expect(race.removeFinishedMarble(2)).toBe(true);
    expect(race.removeFinishedMarble(2)).toBe(false);
  });

  test("rejects invalid stable team mappings", () => {
    const stage = {
      registerPhysicsObserver: () => {},
    };
    const level = {};
    const configuration = {
      teamCount: 2,
      marblesPerTeam: 1,
      releaseIntervalMs: 100,
    };
    const createRace = (stableTeamIndices) =>
      new RaceController(stage, level, configuration, { stableTeamIndices });

    expect(() => createRace([0])).toThrow("exactly 2 teams");
    expect(() => createRace([0, TEAM_COLORS.length])).toThrow(
      "Unknown stable team index"
    );
    expect(() => createRace([0, 0])).toThrow("Duplicate stable team index");
  });
});
