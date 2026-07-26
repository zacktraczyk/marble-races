import type { EntityDefinition } from "@engine/stage";
import type { LevelObjectData } from "../level/document";
import { getLevelObjectShape } from "../level/geometry";
import { finishRackDefinitions } from "./finishZone";
import { circleDefinition } from "./primitives/circle";
import { rectangleDefinition } from "./primitives/rectangle";
import { spawnPointDefinition } from "./spawnPoint";

/** Converts serializable editor data into runtime-only component definitions. */
export const levelObjectDefinitions = (
  object: LevelObjectData,
  {
    teamCount = 1,
    marblesPerTeam = 1,
    wallThickness = 15,
    maximumMarbleRadius = 4.8,
    minimumMarbleRadius = 1.2,
    marbleGap = 0.6,
    raceMarbleRadius = maximumMarbleRadius,
  }: {
    teamCount?: number;
    marblesPerTeam?: number;
    wallThickness?: number;
    maximumMarbleRadius?: number;
    minimumMarbleRadius?: number;
    marbleGap?: number;
    raceMarbleRadius?: number;
  } = {}
): EntityDefinition[] => {
  let definitions: EntityDefinition[];

  switch (object.prefab) {
    case "wall": {
      const shape = getLevelObjectShape(object, wallThickness);
      if (shape.kind !== "rectangle") {
        return [];
      }
      definitions = [
        rectangleDefinition({
          position: shape.position,
          rotation: shape.rotation,
          width: shape.width,
          height: shape.height,
          color: object.properties.color,
          bodyType: object.motion ? "kinematic" : "static",
        }),
      ];
      break;
    }
    case "bumper":
      definitions = [
        circleDefinition({
          position: object.transform.position,
          bodyType: object.motion ? "kinematic" : "static",
          ...object.properties,
        }),
      ];
      break;
    case "finish-zone":
      definitions = finishRackDefinitions({
        position: object.transform.position,
        rotation: object.transform.rotation,
        wallThickness,
        teamCount,
        marblesPerTeam,
        maximumMarbleRadius,
        minimumMarbleRadius,
        marbleGap,
        ...object.properties,
      });
      break;
    case "spawn-point":
      definitions = [
        spawnPointDefinition({
          position: object.transform.position,
          rotation: object.transform.rotation,
          marbleCount: teamCount,
          marbleRadius: raceMarbleRadius,
          maximumMarbleRadius,
          ...object.properties,
        }),
      ];
      break;
  }

  return definitions.map((definition) => ({
    ...definition,
    tags: [
      ...(definition.tags ?? []),
      "level-object",
      `level-object:${object.id}`,
    ],
  }));
};
