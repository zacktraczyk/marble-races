import type { LevelObjectData } from "@game/level/document";
import { getLevelObjectBounds } from "@game/level/geometry";
import type { GridWorldBounds } from "@game/level/grid";

/** Interior playfield bounds from locked walls and finish zone. */
export const computeCourseGridWorldBounds = ({
  objects,
  wallThickness,
  stageWidth,
  stageHeight,
}: {
  objects: readonly LevelObjectData[];
  wallThickness: number;
  stageWidth: number;
  stageHeight: number;
}): GridWorldBounds => {
  const boundaryWalls = objects
    .filter(
      (object): object is Extract<LevelObjectData, { prefab: "wall" }> =>
        object.prefab === "wall" && Boolean(object.locked)
    )
    .map((object) => ({
      object,
      bounds: getLevelObjectBounds(object, wallThickness),
    }));
  const boundaryWallBounds = boundaryWalls
    .filter(({ object }) => {
      const { start, end } = object.properties;
      return Math.abs(end[1] - start[1]) >= Math.abs(end[0] - start[0]);
    })
    .map(({ bounds }) => bounds)
    .sort((first, second) => first.min[0] - second.min[0]);
  const topWall = boundaryWalls
    .filter(({ object }) => {
      const { start, end } = object.properties;
      return Math.abs(end[0] - start[0]) > Math.abs(end[1] - start[1]);
    })
    .map(({ bounds }) => bounds)
    .sort((first, second) => first.min[1] - second.min[1])[0];
  const leftWall = boundaryWallBounds[0];
  const rightWall = boundaryWallBounds[boundaryWallBounds.length - 1];
  const finish = objects.find((object) => object.prefab === "finish-zone");
  const finishBounds = finish
    ? getLevelObjectBounds(finish, wallThickness)
    : null;

  return {
    min: [
      leftWall?.max[0] ?? -stageWidth / 2,
      topWall?.max[1] ?? -stageHeight / 2,
    ],
    max: [
      rightWall?.min[0] ?? stageWidth / 2,
      finishBounds?.min[1] ?? stageHeight / 2,
    ],
  };
};
