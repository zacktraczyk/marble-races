import { describe, expect, test } from "bun:test";
import { createDefaultLeg, createDefaultRace } from "../src/races/defaults.ts";
import { parseRaceLibrary, RaceRepository } from "../src/races/repository.ts";
import { isRacePlayable } from "../src/races/types.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const ids = () => {
  let index = 0;
  return () => `id-${++index}`;
};

describe("race repository", () => {
  test("persists stable teams with the default marbles per team", () => {
    const createId = ids();
    const race = createDefaultRace({
      id: "race",
      participantCount: 4,
      legCount: 3,
      createId,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(new Set(race.participants.map(({ id }) => id)).size).toBe(4);
    expect(race.rules).toEqual({
      marblesPerTeam: 60,
      eliminatedPerLeg: 1,
    });
    expect(race.releaseIntervalMs).toBe(15);
    expect(race.description).toBe("");
    expect(isRacePlayable(race)).toBe(true);
  });

  test("does not resurrect starter races after the final deletion", () => {
    const storage = new MemoryStorage();
    const starter = createDefaultRace({ id: "starter", createId: ids() });
    const firstLoad = new RaceRepository({
      storage,
      storageKey: "test",
      initialRaces: [starter],
    });

    expect(firstLoad.list()).toHaveLength(1);
    expect(firstLoad.delete("starter")).toBe(true);
    expect(firstLoad.list()).toEqual([]);

    const reload = new RaceRepository({
      storage,
      storageKey: "test",
      initialRaces: [starter],
    });
    expect(reload.list()).toEqual([]);
  });

  test("recovers from malformed storage with an empty library", () => {
    expect(parseRaceLibrary("not json")).toEqual({ version: 1, races: [] });
    expect(parseRaceLibrary('{"version":99,"races":[]}')).toEqual({
      version: 1,
      races: [],
    });
  });

  test("stores capped descriptions and migrates races without one", () => {
    const storage = new MemoryStorage();
    const race = createDefaultRace({
      id: "described",
      description: "  A fast final.  ",
      createId: ids(),
    });
    expect(race.description).toBe("A fast final.");
    expect(() =>
      createDefaultRace({ description: "x".repeat(501), createId: ids() })
    ).toThrow("500 characters or fewer");

    delete race.description;
    storage.setItem("test", JSON.stringify({ version: 1, races: [race] }));
    const repository = new RaceRepository({ storage, storageKey: "test" });
    expect(repository.get("described")?.description).toBe("");
  });

  test("upgrades one-marble MVP races to one hundred marbles per team", () => {
    const storage = new MemoryStorage();
    const legacyRace = createDefaultRace({ id: "legacy", createId: ids() });
    legacyRace.rules = {
      marblesPerParticipant: 1,
      eliminatedPerLeg: 1,
    };
    storage.setItem(
      "test",
      JSON.stringify({ version: 1, races: [legacyRace] })
    );

    const repository = new RaceRepository({ storage, storageKey: "test" });

    expect(repository.get("legacy")?.rules.marblesPerTeam).toBe(100);
    expect(JSON.parse(storage.getItem("test")).races[0].rules).toEqual({
      marblesPerTeam: 100,
      eliminatedPerLeg: 1,
    });
  });

  test("adds and reorders embedded level documents", () => {
    const storage = new MemoryStorage();
    const repository = new RaceRepository({ storage, storageKey: "test" });
    repository.create(
      createDefaultRace({ id: "race", legCount: 1, createId: ids() })
    );
    const secondLeg = createDefaultLeg({ id: "second", name: "Second" });
    const thirdLeg = createDefaultLeg({ id: "third", name: "Third" });

    repository.addLeg("race", secondLeg);
    repository.addLeg("race", thirdLeg);
    repository.moveLeg("race", "third", 0);

    expect(repository.get("race")?.legs.map(({ id }) => id)).toEqual([
      "third",
      expect.any(String),
      "second",
    ]);
  });

  test("duplicates races and legs with fresh stable ids", () => {
    const createId = ids();
    const repository = new RaceRepository({
      storage: null,
      createId,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    repository.create(
      createDefaultRace({ id: "race", legCount: 1, createId: ids() })
    );

    const duplicate = repository.duplicateRace("race");
    const duplicateLeg = repository.duplicateLeg(
      "race",
      repository.get("race").legs[0].id
    );

    expect(duplicate.id).not.toBe("race");
    expect(duplicate.participants.map(({ id }) => id)).not.toEqual(
      repository.get("race").participants.map(({ id }) => id)
    );
    expect(duplicate.legs[0].id).not.toBe(repository.get("race").legs[0].id);
    expect(duplicateLeg.legs).toHaveLength(2);
    expect(duplicateLeg.legs[0].id).not.toBe(duplicateLeg.legs[1].id);
  });

  test("returns clones so callers cannot mutate stored races accidentally", () => {
    const repository = new RaceRepository({ storage: null });
    repository.create(
      createDefaultRace({ id: "race", name: "Original", createId: ids() })
    );
    const race = repository.get("race");
    race.name = "Mutated";
    race.participants[0].name = "Also mutated";

    expect(repository.get("race")?.name).toBe("Original");
    expect(repository.get("race")?.participants[0].name).not.toBe(
      "Also mutated"
    );
  });

  test("migrates the legacy marbel storage key to marble", () => {
    const storage = new MemoryStorage();
    const race = createDefaultRace({ id: "legacy", createId: ids() });
    storage.setItem(
      "marbel:race-library:v1",
      JSON.stringify({ version: 1, races: [race] })
    );

    const repository = new RaceRepository({ storage });
    expect(repository.get("legacy")?.id).toBe("legacy");
    expect(storage.getItem("marble:race-library:v1")).toContain("legacy");
    expect(storage.getItem("marbel:race-library:v1")).toBeNull();
  });
});
