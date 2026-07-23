import {
  computeEraSchedule,
  type EraScheduleLeg,
  type LegFinishPlan,
} from "../game/race/eraSchedule";
import type { RaceDocument, RaceLegDocument } from "./types";

/** Maps a race's legs to the `{ width, wallThickness }` inputs era planning needs. */
export const legScheduleInputs = (
  legs: readonly RaceLegDocument[]
): EraScheduleLeg[] =>
  legs.map((leg) => ({
    width: leg.level.size[0],
    wallThickness: leg.level.settings.wallThickness,
  }));

/**
 * Era finish schedule for a race, or null when it is not yet complete (one leg
 * per elimination) or the geometry can't be planned. With a complete race the
 * schedule is deterministic, so callers can render each leg's true finish rack.
 */
export const eraScheduleForRace = (
  race: RaceDocument
): LegFinishPlan[] | null => {
  if (race.legs.length !== race.participants.length - 1) {
    return null;
  }
  try {
    return computeEraSchedule({
      participantCount: race.participants.length,
      marblesPerTeam: race.rules.marblesPerTeam,
      legs: legScheduleInputs(race.legs),
    });
  } catch {
    return null;
  }
};
