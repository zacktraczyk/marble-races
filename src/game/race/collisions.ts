import type { Entity, EntityId } from "@engine/core/entity";
import type { CollisionEvents } from "@engine/physics/physics";
import { teamIndexForMarble } from "./types";

export type FinishCollisionDeps = {
  /** Ids of the marbles currently racing; anything else is ignored. */
  raceMarbleIds: ReadonlySet<EntityId>;
  getEntity: (id: EntityId) => Entity | undefined;
  teamCount: number;
  /**
   * Records one marble crossing the finish line.
   * @returns true when the race froze as a result, ending this sweep.
   */
  onFinish: (marble: Entity, teamIndex: number) => boolean;
};

/**
 * Reports marbles that touched a finish zone during a physics step. Each
 * collision is checked in both directions, since the pair order is arbitrary,
 * and stops early once a finish freezes the race.
 * @param events - the physics step's collision events
 * @param deps - lookups and the finish callback
 */
export const handleFinishCollisions = (
  { entityCollisions }: CollisionEvents,
  deps: FinishCollisionDeps
) => {
  for (const { entity1: firstId, entity2: secondId } of entityCollisions) {
    for (const [marbleId, finishId] of [
      [firstId, secondId],
      [secondId, firstId],
    ]) {
      if (!deps.raceMarbleIds.has(marbleId)) {
        continue;
      }
      const marble = deps.getEntity(marbleId);
      const finish = deps.getEntity(finishId);
      if (
        marble?.hasTag("released-marble") &&
        !marble.markedForDeletion &&
        finish?.hasTag("finish-zone")
      ) {
        const teamIndex = teamIndexForMarble(marble, deps.teamCount);
        if (teamIndex === null) {
          continue;
        }
        if (deps.onFinish(marble, teamIndex)) {
          return;
        }
        break;
      }
    }
  }
};
