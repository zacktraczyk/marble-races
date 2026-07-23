import {
  isRaceDocument,
  isRaceLibraryDocument,
  RACE_LIBRARY_VERSION,
  RACE_MARBLES_PER_TEAM,
  type RaceDocument,
  type RaceLegDocument,
  type RaceLibraryDocument,
} from "./types";
import { createLocalId } from "./defaults";

const DEFAULT_RACE_STORAGE_KEY = "marble:race-library:v1";
/** Previous brand misspelling — still read once so existing libraries migrate. */
const LEGACY_RACE_STORAGE_KEY = "marbel:race-library:v1";

export interface RaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type RaceRepositoryOptions = {
  storage?: RaceStorage | null;
  storageKey?: string;
  initialRaces?: readonly RaceDocument[] | (() => readonly RaceDocument[]);
  now?: () => Date;
  createId?: () => string;
};

const clone = <Value>(value: Value): Value => structuredClone(value);

const browserStorage = (): RaceStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const emptyLibrary = (): RaceLibraryDocument => ({
  version: RACE_LIBRARY_VERSION,
  races: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const migrateLegacyRaceLibrary = (value: unknown): unknown => {
  if (
    !isRecord(value) ||
    value.version !== RACE_LIBRARY_VERSION ||
    !Array.isArray(value.races)
  ) {
    return value;
  }

  return {
    ...value,
    races: value.races.map((race) => {
      if (!isRecord(race)) {
        return race;
      }
      let migratedRace = race;
      if (!("description" in migratedRace)) {
        migratedRace = { ...migratedRace, description: "" };
      }
      if (!isRecord(migratedRace.rules)) {
        return migratedRace;
      }
      if (migratedRace.rules.eliminatedPerLeg !== 1) {
        return migratedRace;
      }
      const legacyMarbleCount = migratedRace.rules.marblesPerParticipant;
      if (legacyMarbleCount !== 1 && legacyMarbleCount !== 100) {
        return migratedRace;
      }
      const legacyRules = { ...migratedRace.rules };
      delete legacyRules.marblesPerParticipant;
      return {
        ...migratedRace,
        rules: {
          ...legacyRules,
          marblesPerTeam: RACE_MARBLES_PER_TEAM,
        },
      };
    }),
  };
};

const decodeRaceLibrary = (serialized: string): RaceLibraryDocument | null => {
  try {
    const value = migrateLegacyRaceLibrary(JSON.parse(serialized));
    return isRaceLibraryDocument(value) ? clone(value) : null;
  } catch {
    return null;
  }
};

const initialLibrary = (
  initialRaces: RaceRepositoryOptions["initialRaces"]
): RaceLibraryDocument => {
  const races =
    typeof initialRaces === "function" ? initialRaces() : (initialRaces ?? []);
  const clonedRaces = clone([...races]);
  if (!clonedRaces.every(isRaceDocument)) {
    throw new Error("Initial race library contains an invalid race");
  }
  return { version: RACE_LIBRARY_VERSION, races: clonedRaces };
};

export const parseRaceLibrary = (serialized: string): RaceLibraryDocument => {
  return decodeRaceLibrary(serialized) ?? emptyLibrary();
};

/**
 * Browser-local CRUD for authored races. The empty state is persisted rather
 * than represented by a missing key, so deleting the final starter race is
 * durable across reloads.
 */
export class RaceRepository {
  private readonly storage: RaceStorage | null;
  private readonly storageKey: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private memory: RaceLibraryDocument;

  constructor({
    storage = browserStorage(),
    storageKey = DEFAULT_RACE_STORAGE_KEY,
    initialRaces,
    now = () => new Date(),
    createId = createLocalId,
  }: RaceRepositoryOptions = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.createId = createId;
    this.memory = initialLibrary(initialRaces);
    this.initializeStorage();
  }

  list(): RaceDocument[] {
    return clone(this.read().races).sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt)
    );
  }

  get(id: string): RaceDocument | null {
    const race = this.read().races.find((candidate) => candidate.id === id);
    return race ? clone(race) : null;
  }

  create(race: RaceDocument): RaceDocument {
    this.assertValidRace(race);
    const library = this.read();
    if (library.races.some((candidate) => candidate.id === race.id)) {
      throw new Error(`Race already exists: ${race.id}`);
    }
    library.races.push(clone(race));
    this.write(library);
    return clone(race);
  }

  save(race: RaceDocument): RaceDocument {
    this.assertValidRace(race);
    const library = this.read();
    const index = library.races.findIndex(
      (candidate) => candidate.id === race.id
    );
    if (index < 0) {
      throw new Error(`Race not found: ${race.id}`);
    }
    const saved = {
      ...clone(race),
      createdAt: library.races[index].createdAt,
      updatedAt: this.now().toISOString(),
    };
    library.races[index] = saved;
    this.write(library);
    return clone(saved);
  }

  update(
    id: string,
    updater: (race: RaceDocument) => RaceDocument | void
  ): RaceDocument {
    const race = this.require(id);
    const updated = updater(race) ?? race;
    if (updated.id !== id) {
      throw new Error("A race update cannot change its id");
    }
    return this.save(updated);
  }

  delete(id: string): boolean {
    const library = this.read();
    const remaining = library.races.filter((race) => race.id !== id);
    if (remaining.length === library.races.length) {
      return false;
    }
    library.races = remaining;
    this.write(library);
    return true;
  }

  duplicateRace(id: string, name?: string): RaceDocument {
    const source = this.require(id);
    const timestamp = this.now().toISOString();
    const duplicate: RaceDocument = {
      ...clone(source),
      id: this.createId(),
      name: name?.trim() || `${source.name} copy`,
      createdAt: timestamp,
      updatedAt: timestamp,
      participants: source.participants.map((participant) => ({
        ...clone(participant),
        id: this.createId(),
      })),
      legs: source.legs.map((leg) => ({
        ...clone(leg),
        id: this.createId(),
      })),
    };
    return this.create(duplicate);
  }

  addLeg(raceId: string, leg: RaceLegDocument, atIndex?: number): RaceDocument {
    return this.update(raceId, (race) => {
      if (race.legs.some((candidate) => candidate.id === leg.id)) {
        throw new Error(`Leg already exists: ${leg.id}`);
      }
      const index = Math.max(
        0,
        Math.min(atIndex ?? race.legs.length, race.legs.length)
      );
      race.legs.splice(index, 0, clone(leg));
    });
  }

  saveLeg(raceId: string, leg: RaceLegDocument): RaceDocument {
    return this.update(raceId, (race) => {
      const index = race.legs.findIndex((candidate) => candidate.id === leg.id);
      if (index < 0) {
        throw new Error(`Leg not found: ${leg.id}`);
      }
      race.legs[index] = clone(leg);
    });
  }

  deleteLeg(raceId: string, legId: string): RaceDocument {
    return this.update(raceId, (race) => {
      const index = race.legs.findIndex((leg) => leg.id === legId);
      if (index < 0) {
        throw new Error(`Leg not found: ${legId}`);
      }
      race.legs.splice(index, 1);
    });
  }

  duplicateLeg(raceId: string, legId: string, name?: string): RaceDocument {
    return this.update(raceId, (race) => {
      const sourceIndex = race.legs.findIndex((leg) => leg.id === legId);
      if (sourceIndex < 0) {
        throw new Error(`Leg not found: ${legId}`);
      }
      const source = race.legs[sourceIndex];
      race.legs.splice(sourceIndex + 1, 0, {
        ...clone(source),
        id: this.createId(),
        name: name?.trim() || `${source.name} copy`,
      });
    });
  }

  moveLeg(raceId: string, legId: string, toIndex: number): RaceDocument {
    return this.update(raceId, (race) => {
      const fromIndex = race.legs.findIndex((leg) => leg.id === legId);
      if (fromIndex < 0) {
        throw new Error(`Leg not found: ${legId}`);
      }
      if (!Number.isInteger(toIndex)) {
        throw new Error("Leg destination must be an integer");
      }
      const [leg] = race.legs.splice(fromIndex, 1);
      const destination = Math.max(0, Math.min(toIndex, race.legs.length));
      race.legs.splice(destination, 0, leg);
    });
  }

  private require(id: string): RaceDocument {
    const race = this.get(id);
    if (!race) {
      throw new Error(`Race not found: ${id}`);
    }
    return race;
  }

  private assertValidRace(race: RaceDocument) {
    if (!isRaceDocument(race)) {
      throw new Error("Invalid race document");
    }
  }

  private initializeStorage() {
    if (!this.storage) {
      return;
    }
    let stored: string | null;
    try {
      stored = this.storage.getItem(this.storageKey);
      if (stored === null && this.storageKey === DEFAULT_RACE_STORAGE_KEY) {
        stored = this.storage.getItem(LEGACY_RACE_STORAGE_KEY);
        if (stored !== null) {
          // Migrate off the misspelled key so subsequent loads use the current one.
          try {
            this.storage.setItem(this.storageKey, stored);
            this.storage.removeItem?.(LEGACY_RACE_STORAGE_KEY);
          } catch {
            // Keep using the legacy payload from memory if write/remove fails.
          }
        }
      }
    } catch {
      // Keep the initialized in-memory library when browser storage is blocked.
      return;
    }
    if (stored === null) {
      try {
        // Writing the initialized value is what distinguishes first use from a
        // deliberately emptied library on the next page load.
        this.storage.setItem(this.storageKey, JSON.stringify(this.memory));
      } catch {
        // The in-memory copy still supports the current page.
      }
      return;
    }

    const decoded = decodeRaceLibrary(stored);
    this.memory = decoded ?? emptyLibrary();
    if (!decoded || JSON.stringify(decoded) !== stored) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(this.memory));
      } catch {
        // The repaired in-memory copy remains usable for the current page.
      }
    }
  }

  private read(): RaceLibraryDocument {
    if (!this.storage) {
      return clone(this.memory);
    }
    try {
      const stored = this.storage.getItem(this.storageKey);
      if (stored === null) {
        return clone(this.memory);
      }
      this.memory = parseRaceLibrary(stored);
    } catch {
      // Retain the most recent usable in-memory snapshot if storage disappears.
    }
    return clone(this.memory);
  }

  private write(library: RaceLibraryDocument) {
    this.memory = clone(library);
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(library));
    } catch {
      // Storage may be disabled or full; the repository remains usable for the
      // current page through its in-memory snapshot.
    }
  }
}
