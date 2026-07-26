import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData } from "@game/level/document";
import { hitTestLevelObject } from "@game/level/geometry";
import { applyTopSliderSpawnLayout } from "@game/level/objects";

type SpawnPoint = Extract<LevelObjectData, { prefab: "spawn-point" }>;

/**
 * Keeps the spawn point on the course: clamps it inside the boundary walls
 * and rejects positions that overlap an authored wall.
 * Returns the updated last-valid position for drag rollback.
 */
export const constrainSpawnPoint = ({
  spawnPoint,
  objects,
  wallThickness,
  stageSize,
  lastValidSpawnPosition,
}: {
  spawnPoint: SpawnPoint;
  objects: readonly LevelObjectData[];
  wallThickness: number;
  stageSize: Vec2;
  lastValidSpawnPosition: Vec2 | null;
}): Vec2 | null => {
  if ((spawnPoint.properties.variant ?? "point") === "top-slider") {
    // The slider owns its layout; any drag or rotation snaps back to it.
    applyTopSliderSpawnLayout(spawnPoint, stageSize, wallThickness);
    return lastValidSpawnPosition;
  }

  const radius = spawnPoint.properties.radius;
  const [stageWidth, stageHeight] = stageSize;
  const maxX = Math.max(0, stageWidth / 2 - wallThickness - radius);
  const minY = -stageHeight / 2 + wallThickness + radius;
  const maxY = stageHeight / 2 - radius;
  const [x, y] = spawnPoint.transform.position;
  const clamped: Vec2 = [
    Math.min(Math.max(x, -maxX), maxX),
    Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  ];
  const overlapsWall = objects.some(
    (object) =>
      object.prefab === "wall" &&
      !object.locked &&
      hitTestLevelObject(object, clamped, radius, wallThickness)
  );
  if (overlapsWall && lastValidSpawnPosition) {
    spawnPoint.transform.position = [...lastValidSpawnPosition];
    return lastValidSpawnPosition;
  }
  spawnPoint.transform.position = clamped;
  return [...clamped];
};
