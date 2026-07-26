import type { Entity } from "@engine/core/entity";
import type { EntityDefinition } from "@engine/stage";
import { marbleDefinition } from "../prefabs/marble";
import type { FinishMarblePlacement } from "./finishGrid";
import { TEAM_COLORS } from "./teams";
import type { ExternalRaceMode, FinishedMarble } from "./types";

/**
 * Resolves where a marble parks in the finish rack. Placements are stored in
 * bay-major order, and the entry is only used when it agrees with the requested
 * bay and slot — a rack rebuilt for a different team count will not.
 * @param placements - the round's packed finish placements
 * @param marblesPerTeam - slots per bay, used to index the flat list
 * @param bayIndex - the team's bay
 * @param slotIndex - the marble's slot within that bay
 * @returns the world-space position, or null when the slot is not in the rack
 */
export const finishPlacementAt = (
  placements: readonly FinishMarblePlacement[],
  marblesPerTeam: number,
  bayIndex: number,
  slotIndex: number
): [number, number] | null => {
  const placement = placements[bayIndex * marblesPerTeam + slotIndex];
  return placement?.bayIndex === bayIndex && placement.slotIndex === slotIndex
    ? placement.position
    : null;
};

/**
 * Builds the definition for the static marble that marks a finished racer.
 * @param position - where the marble parks
 * @param teamIndex - the racing team's local index
 * @param stableTeamIndex - that team's stable index, which picks the colour
 * @param radius - the round's marble radius
 * @returns a non-physical marble definition tagged `finished-marble`
 */
export const finishedMarbleDefinition = (
  position: [number, number],
  teamIndex: number,
  stableTeamIndex: number,
  radius: number
): EntityDefinition =>
  marbleDefinition({
    position,
    radius,
    color: TEAM_COLORS[stableTeamIndex],
    team: `${teamIndex + 1}`,
    tags: ["finished-marble"],
    physical: false,
  });

/**
 * Selects released marbles that have left the externally supplied bounds.
 * Marbles already scheduled for deletion, and those never released, are skipped.
 * @param marbles - the marbles currently racing
 * @param bounds - the external race bounds, or undefined when locally driven
 * @returns the marbles now out of bounds, in race order
 */
export const findOutOfBoundsMarbles = (
  marbles: readonly Entity[],
  bounds: ExternalRaceMode["bounds"] | undefined
): Entity[] => {
  if (!bounds) {
    return [];
  }
  return marbles.filter((marble) => {
    if (marble.markedForDeletion || !marble.hasTag("released-marble")) {
      return false;
    }
    const [x, y] = marble.position;
    return (
      x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY
    );
  });
};

/**
 * Removes one finished marble belonging to a team, newest first, and deletes
 * its entity. Used when a later leg reclaims a slot from the rack.
 * @param finishMarbles - the rack, mutated in place
 * @param stableTeamIndex - whose marble to reclaim
 * @returns true when a marble was found and removed
 */
export const removeFinishedMarbleFor = (
  finishMarbles: FinishedMarble[],
  stableTeamIndex: number
): boolean => {
  for (let index = finishMarbles.length - 1; index >= 0; index--) {
    if (finishMarbles[index].stableTeamIndex === stableTeamIndex) {
      const [removed] = finishMarbles.splice(index, 1);
      removed.entity.delete();
      return true;
    }
  }
  return false;
};
