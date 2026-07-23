import { LevelDocument } from "../game/level/document";
import type { Color } from "../engine/core/color";
import { TEAM_COLORS, TEAM_NAMES } from "../game/race/teams";
import {
  COURSE_STROKE_WIDTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "../game/level/constants";
import { createDefaultCourse } from "../game/level/objects";
import type { RaceDocument, RaceLegDocument, RaceParticipant } from "./types";
import {
  MAX_RACE_DESCRIPTION_LENGTH,
  RACE_DOCUMENT_VERSION,
  isValidMarblesPerTeam,
} from "./types";

export const DEFAULT_PARTICIPANT_COUNT = 4;
export const DEFAULT_MARBLES_PER_TEAM = 60;
const DEFAULT_RELEASE_INTERVAL_MS = 15;
export const MAX_RACE_PARTICIPANTS = TEAM_COLORS.length;

export type RaceFactoryDependencies = {
  createId?: () => string;
  now?: () => Date;
};

let fallbackId = 0;

/** A unique id for local (unsynced) documents; prefers `crypto.randomUUID`. */
export const createLocalId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackId += 1;
  return `local-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
};

const copyColor = (color: readonly number[]): Color => [
  color[0],
  color[1],
  color[2],
  color[3],
];

/**
 * Builds `count` teams seeded with the default names and colors.
 * @param count Number of teams; an integer in `2..MAX_RACE_PARTICIPANTS`.
 * @param createId Factory for participant ids (override for deterministic tests).
 * @returns Fresh participants, each with an independently copied color.
 * @throws If `count` falls outside the supported range.
 */
export const createDefaultParticipants = (
  count = DEFAULT_PARTICIPANT_COUNT,
  createId = createLocalId
): RaceParticipant[] => {
  if (!Number.isInteger(count) || count < 2 || count > MAX_RACE_PARTICIPANTS) {
    throw new Error(
      `Team count must be between 2 and ${MAX_RACE_PARTICIPANTS}`
    );
  }

  return Array.from({ length: count }, (_, index) => ({
    id: createId(),
    name: TEAM_NAMES[index] ?? `Team ${index + 1}`,
    color: copyColor(TEAM_COLORS[index]),
  }));
};

export type DefaultLegOptions = RaceFactoryDependencies & {
  id?: string;
  name?: string;
  index?: number;
};

/**
 * Builds a leg backed by a fresh default course (walls, spawn, finish zone).
 * @param options Optional id/name/index and factory overrides; `index` seeds
 *   the fallback name `Leg N`.
 * @returns The serialized leg document.
 */
export const createDefaultLeg = ({
  id,
  name,
  index = 0,
  createId = createLocalId,
}: DefaultLegOptions = {}): RaceLegDocument => {
  const legName = name?.trim() || `Leg ${index + 1}`;
  const document = new LevelDocument(legName, [STAGE_WIDTH, STAGE_HEIGHT], {
    wallThickness: COURSE_STROKE_WIDTH,
  });
  for (const object of createDefaultCourse(
    STAGE_WIDTH,
    STAGE_HEIGHT,
    COURSE_STROKE_WIDTH
  )) {
    document.add(object);
  }

  return {
    id: id ?? createId(),
    name: legName,
    level: document.serialize(),
  };
};

export type DefaultRaceOptions = RaceFactoryDependencies & {
  id?: string;
  name?: string;
  description?: string;
  participantCount?: number;
  legCount?: number;
  releaseIntervalMs?: number;
  marblesPerTeam?: number;
};

/** Creates a new editable race. Legs start empty so the builder can guide the first add. */
export const createDefaultRace = ({
  id,
  name,
  description = "",
  participantCount = DEFAULT_PARTICIPANT_COUNT,
  legCount = 0,
  releaseIntervalMs = DEFAULT_RELEASE_INTERVAL_MS,
  marblesPerTeam = DEFAULT_MARBLES_PER_TEAM,
  createId = createLocalId,
  now = () => new Date(),
}: DefaultRaceOptions = {}): RaceDocument => {
  if (!Number.isInteger(legCount) || legCount < 0) {
    throw new Error("Leg count must be a non-negative integer");
  }
  if (!Number.isFinite(releaseIntervalMs) || releaseIntervalMs <= 0) {
    throw new Error("Release interval must be positive");
  }
  if (!isValidMarblesPerTeam(marblesPerTeam)) {
    throw new Error("Marbles per team must be one of the supported counts");
  }
  if (description.length > MAX_RACE_DESCRIPTION_LENGTH) {
    throw new Error(
      `Race description must be ${MAX_RACE_DESCRIPTION_LENGTH} characters or fewer`
    );
  }

  const timestamp = now().toISOString();
  return {
    version: RACE_DOCUMENT_VERSION,
    id: id ?? createId(),
    name: name?.trim() || "Untitled race",
    description: description.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    releaseIntervalMs,
    rules: {
      marblesPerTeam,
      eliminatedPerLeg: 1,
    },
    participants: createDefaultParticipants(participantCount, createId),
    legs: Array.from({ length: legCount }, (_, index) =>
      createDefaultLeg({ index, createId })
    ),
  };
};
