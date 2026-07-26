import type { EntityDefinition } from "@engine/stage";
import type { LevelObjectData } from "../level/document";
import { getLevelObjectMotionPose } from "../level/motion";
import { marbleDefinition } from "../prefabs/marble";
import { DEFAULT_SPAWN_DIRECTION_VARIANCE, randomSpawnAngle } from "./spawn";
import { TEAM_COLORS } from "./teams";

export type SpawnPoint = Extract<LevelObjectData, { prefab: "spawn-point" }>;

/**
 * Where marbles emerge right now. A spawn point can be mounted on an
 * oscillating slider, so its live pose is derived from the round's elapsed
 * motion time rather than its authored transform.
 * @param spawnPoint - the course's spawn point
 * @param wallThickness - the level's wall thickness, needed to derive the pose
 * @param motionElapsedMs - elapsed motion time for this round
 * @returns the current world-space spawn position
 */
export const currentSpawnPosition = (
  spawnPoint: SpawnPoint,
  wallThickness: number,
  motionElapsedMs: number
): [number, number] => {
  if (!spawnPoint.motion) {
    return [...spawnPoint.transform.position];
  }
  const pose = getLevelObjectMotionPose(
    spawnPoint,
    wallThickness,
    motionElapsedMs
  );
  return [...pose.position];
};

/**
 * Builds the definition for one marble entering the race. The offset is given
 * in the spawn point's own frame and rotated into world space, so a rotated
 * spawn point scatters its wave along its own axis.
 * @param options.spawnPoint - the course's spawn point, for launch parameters
 * @param options.spawnPosition - the spawn point's current world position
 * @param options.spawnOffset - this marble's offset within the spawn area
 * @param options.teamIndex - the racing team's local index
 * @param options.stableTeamIndex - that team's stable index, which picks colour
 * @param options.radius - the round's marble radius
 * @returns a physical marble definition tagged `race-marble` and `released-marble`
 */
export const releasedMarbleDefinition = ({
  spawnPoint,
  spawnPosition,
  spawnOffset,
  teamIndex,
  stableTeamIndex,
  radius,
}: {
  spawnPoint: SpawnPoint;
  spawnPosition: [number, number];
  spawnOffset: [number, number];
  teamIndex: number;
  stableTeamIndex: number;
  radius: number;
}): EntityDefinition => {
  const spawnRotation = spawnPoint.transform.rotation ?? 0;
  const angle = randomSpawnAngle(
    spawnRotation,
    spawnPoint.properties.directionVariance ?? DEFAULT_SPAWN_DIRECTION_VARIANCE
  );
  const cosine = Math.cos(spawnRotation);
  const sine = Math.sin(spawnRotation);
  return marbleDefinition({
    position: [
      spawnPosition[0] + spawnOffset[0] * cosine - spawnOffset[1] * sine,
      spawnPosition[1] + spawnOffset[0] * sine + spawnOffset[1] * cosine,
    ],
    radius,
    color: TEAM_COLORS[stableTeamIndex],
    team: `${teamIndex + 1}`,
    tags: ["race-marble", "released-marble"],
    velocity: [
      Math.cos(angle) * spawnPoint.properties.launchSpeed,
      Math.sin(angle) * spawnPoint.properties.launchSpeed,
    ],
    restitution: 0.15,
    friction: 0.55,
  });
};
