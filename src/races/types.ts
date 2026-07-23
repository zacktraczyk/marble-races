import type { SerializedLevel } from "../game/level/document";
import type { Color } from "../engine/core/color";

export const RACE_DOCUMENT_VERSION = 1 as const;
export const RACE_LIBRARY_VERSION = 1 as const;
export const MAX_RACE_DESCRIPTION_LENGTH = 500 as const;
/** Legacy marble count — older documents predate the selectable ladder. */
export const RACE_MARBLES_PER_TEAM = 100 as const;
/**
 * Selectable starting marbles-per-team values (the slider's stops). Later
 * legs redistribute eliminated teams' marbles, rounding each leg's count to
 * whole finish-grid rows, so any starting value yields perfect grids.
 */
export const MARBLES_PER_TEAM_OPTIONS = [
  6, 12, 24, 36, 48, 60, 72, 96, 120, 150, 180, 240, 300, 360,
] as const;

/** Type guard: accepts a supported ladder value or the legacy 100 count. */
export const isValidMarblesPerTeam = (value: unknown): value is number =>
  typeof value === "number" &&
  (MARBLES_PER_TEAM_OPTIONS.includes(
    value as (typeof MARBLES_PER_TEAM_OPTIONS)[number]
  ) ||
    value === RACE_MARBLES_PER_TEAM);

export type RaceParticipant = {
  /** Stable across every leg, even as other participants are eliminated. */
  id: string;
  name: string;
  color: Color;
};

export type RaceLegDocument = {
  id: string;
  name: string;
  level: SerializedLevel;
};

export type RaceRules = {
  /** Every active team starts each leg with the same full field. */
  marblesPerTeam: number;
  /** The final team with marbles left on the course is eliminated. */
  eliminatedPerLeg: 1;
};

export type RaceDocument = {
  version: typeof RACE_DOCUMENT_VERSION;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  releaseIntervalMs: number;
  rules: RaceRules;
  participants: RaceParticipant[];
  legs: RaceLegDocument[];
};

export type RaceLibraryDocument = {
  version: typeof RACE_LIBRARY_VERSION;
  races: RaceDocument[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isColor = (value: unknown): value is Color =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(
    (channel) => isFiniteNumber(channel) && channel >= 0 && channel <= 1
  );

const isVec2 = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((component) => isFiniteNumber(component));

/**
 * Checks only the stable serialized-level boundary. Object-specific validation
 * remains owned by the level editor as that format evolves.
 */
const isSerializedLevel = (value: unknown): value is SerializedLevel =>
  isRecord(value) &&
  value.version === 3 &&
  typeof value.name === "string" &&
  isVec2(value.size) &&
  value.size.every((component) => component > 0) &&
  isRecord(value.settings) &&
  isFiniteNumber(value.settings.wallThickness) &&
  value.settings.wallThickness > 0 &&
  Array.isArray(value.objects);

const isRaceParticipant = (value: unknown): value is RaceParticipant =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isColor(value.color);

const isRaceLegDocument = (value: unknown): value is RaceLegDocument =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isSerializedLevel(value.level);

const hasUniqueIds = (items: readonly { id: string }[]) =>
  new Set(items.map(({ id }) => id)).size === items.length;

/** Type guard validating an unknown value against the race document schema. */
export const isRaceDocument = (value: unknown): value is RaceDocument => {
  if (
    !isRecord(value) ||
    value.version !== RACE_DOCUMENT_VERSION ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    typeof value.description !== "string" ||
    value.description.length > MAX_RACE_DESCRIPTION_LENGTH ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isFiniteNumber(value.releaseIntervalMs) ||
    value.releaseIntervalMs <= 0 ||
    !isRecord(value.rules) ||
    !isValidMarblesPerTeam(value.rules.marblesPerTeam) ||
    value.rules.eliminatedPerLeg !== 1 ||
    !Array.isArray(value.participants) ||
    value.participants.length < 2 ||
    !value.participants.every(isRaceParticipant) ||
    !hasUniqueIds(value.participants) ||
    !Array.isArray(value.legs) ||
    !value.legs.every(isRaceLegDocument) ||
    !hasUniqueIds(value.legs)
  ) {
    return false;
  }

  return true;
};

/** Type guard validating an unknown value against the race library schema. */
export const isRaceLibraryDocument = (
  value: unknown
): value is RaceLibraryDocument =>
  isRecord(value) &&
  value.version === RACE_LIBRARY_VERSION &&
  Array.isArray(value.races) &&
  value.races.every(isRaceDocument) &&
  hasUniqueIds(value.races);

/** Legs a race needs to run: one elimination per leg, i.e. teams minus one. */
export const requiredLegCount = (race: Pick<RaceDocument, "participants">) =>
  Math.max(0, race.participants.length - 1);

/** Whether a race has enough teams and exactly the required number of legs. */
export const isRacePlayable = (
  race: Pick<RaceDocument, "participants" | "legs">
) =>
  race.participants.length >= 2 && race.legs.length === requiredLegCount(race);
