import type { Entity } from "@engine/core/entity";

export type RacePhase = "ready" | "running" | "paused" | "complete";

/** Layout for one leg's finish rack, precomputed for the whole race. */
export type FinishRackPlan = {
  rackHeight: number;
  /** Race-wide marble radius, scaled from the starting field size. */
  marbleRadius: number;
};

export type RoundConfiguration = {
  teamCount: number;
  marblesPerTeam: number;
  releaseIntervalMs: number;
  /** Set by the race player; the leg builder derives layout from teamCount. */
  finishPlan?: FinishRackPlan;
};

export type RaceSnapshot = {
  phase: RacePhase;
  teamCount: number;
  totalMarbles: number;
  queuedMarbles: number;
  releasedMarbles: number;
  finishedMarbles: number;
  remainingMarbles: number;
  eliminatedTeamIndex: number | null;
  outOfBoundsMarbles: number;
  courseIssue: string | null;
};

export type ExternalRaceMode = {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  onMarbleReleased?: (stableTeamIndex: number) => void;
};

export type RaceControllerOptions = {
  stableTeamIndices?: readonly number[];
  external?: ExternalRaceMode;
};

export type FinishedMarble = {
  entity: Entity;
  stableTeamIndex: number;
};

export type PendingMarble = {
  teamIndex: number;
};

/** Reads the 1-based `team:N` tag from a marble entity. */
export const teamIndexForMarble = (
  marble: Entity,
  teamCount: number
): number | null => {
  for (const tag of marble.tags) {
    if (!tag.startsWith("team:")) {
      continue;
    }
    const teamIndex = Number(tag.slice("team:".length)) - 1;
    if (
      Number.isInteger(teamIndex) &&
      teamIndex >= 0 &&
      teamIndex < teamCount
    ) {
      return teamIndex;
    }
  }
  return null;
};

export const resolveStableTeamIndices = (
  teamCount: number,
  colorCount: number,
  stableTeamIndices?: readonly number[]
) => {
  const indices =
    stableTeamIndices ?? Array.from({ length: teamCount }, (_, index) => index);
  if (indices.length !== teamCount) {
    throw new Error(
      `Stable team indices must include exactly ${teamCount} teams`
    );
  }

  const uniqueIndices = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= colorCount) {
      throw new Error(`Unknown stable team index: ${index}`);
    }
    if (uniqueIndices.has(index)) {
      throw new Error(`Duplicate stable team index: ${index}`);
    }
    uniqueIndices.add(index);
  }
  return [...indices];
};
