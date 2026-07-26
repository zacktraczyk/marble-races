import { describe, expect, test } from "bun:test";
import { FINISH_RACK_HEIGHT } from "../src/game/prefabs/finishZone.ts";
import { levelObjectDefinitions } from "../src/game/prefabs/levelObject.ts";
import {
  COURSE_STROKE_WIDTH,
  GRID_MAJOR_INTERVAL,
  GRID_SIZE,
  STAGE_HEIGHT,
  STAGE_SIZE_STEP,
  STAGE_WIDTH,
} from "../src/game/level/constants.ts";
import {
  createCourseBoundaries,
  createDefaultCourse,
} from "../src/game/level/objects.ts";
import { clampStepInteger } from "../src/scenes/leg-builder/ui/fieldInput.ts";

describe("leg builder course boundaries", () => {
  test("uses a larger widescreen default course", () => {
    expect(STAGE_WIDTH).toBe(1440);
    expect(STAGE_HEIGHT).toBe(810);
    expect(STAGE_WIDTH / STAGE_HEIGHT).toBeCloseTo(16 / 9);
    expect(COURSE_STROKE_WIDTH).toBe(15);
  });

  test("locks the full-width finish rack to the bottom edge", () => {
    const width = 2000;
    const height = 3000;
    const [finish] = createCourseBoundaries(width, height);

    expect(finish).toMatchObject({
      prefab: "finish-zone",
      locked: true,
      transform: {
        position: [0, height / 2 - FINISH_RACK_HEIGHT / 2],
      },
      properties: { width, height: FINISH_RACK_HEIGHT },
    });
  });

  test("renders one finish bay for every active team", () => {
    const [finish] = createCourseBoundaries(1440, 810);
    const definitions = levelObjectDefinitions(
      { ...finish, id: "finish" },
      { teamCount: 6, wallThickness: COURSE_STROKE_WIDTH }
    );

    expect(
      definitions.filter((definition) =>
        definition.tags?.includes("finish-rack-divider")
      )
    ).toHaveLength(5);
    expect(
      definitions.filter((definition) =>
        definition.tags?.includes("finish-zone")
      )
    ).toHaveLength(1);
  });

  test("aligns the finish rack frame exactly with the stage edges", () => {
    const [finish] = createCourseBoundaries(STAGE_WIDTH, STAGE_HEIGHT);
    const definitions = levelObjectDefinitions(
      { ...finish, id: "finish" },
      {
        teamCount: 12,
        marblesPerTeam: 100,
        wallThickness: COURSE_STROKE_WIDTH,
      }
    );
    const rackWalls = definitions.filter((definition) =>
      definition.tags?.includes("finish-rack-wall")
    );
    const bottomWall = rackWalls.find(
      (definition) =>
        definition.render?.parts[0].localTransform?.scale?.[0] === STAGE_WIDTH
    );
    const sideWalls = rackWalls.filter(
      (definition) =>
        definition.render?.parts[0].localTransform?.scale?.[0] ===
        COURSE_STROKE_WIDTH
    );

    expect(bottomWall?.transform.position).toEqual([
      0,
      STAGE_HEIGHT / 2 - COURSE_STROKE_WIDTH / 2,
    ]);
    expect(sideWalls.map(({ transform }) => transform.position[0])).toEqual([
      -STAGE_WIDTH / 2 + COURSE_STROKE_WIDTH / 2,
      STAGE_WIDTH / 2 - COURSE_STROKE_WIDTH / 2,
    ]);
  });

  test("adds locked full-height walls on both sides", () => {
    const width = 2000;
    const height = 3000;
    const [, , leftWall, rightWall] = createCourseBoundaries(width, height);

    expect(leftWall).toMatchObject({
      prefab: "wall",
      locked: true,
      properties: {
        start: [-width / 2 + COURSE_STROKE_WIDTH / 2, -height / 2],
        end: [-width / 2 + COURSE_STROKE_WIDTH / 2, height / 2],
      },
    });
    expect(rightWall).toMatchObject({
      prefab: "wall",
      locked: true,
      properties: {
        start: [width / 2 - COURSE_STROKE_WIDTH / 2, -height / 2],
        end: [width / 2 - COURSE_STROKE_WIDTH / 2, height / 2],
      },
    });
  });

  test("keeps a locked full-width wall across the top", () => {
    const width = 2000;
    const height = 3000;
    const [, topWall] = createCourseBoundaries(width, height);
    const y = -height / 2 + COURSE_STROKE_WIDTH / 2;

    expect(topWall).toMatchObject({
      prefab: "wall",
      locked: true,
      properties: {
        start: [-width / 2, y],
        end: [width / 2, y],
      },
    });
  });

  test("derives the shared boundary stroke from one grid cell", () => {
    expect(COURSE_STROKE_WIDTH).toBe(GRID_SIZE);
  });

  test("aligns the playable course edges to complete grid cells", () => {
    const playableWidth = STAGE_WIDTH - COURSE_STROKE_WIDTH * 2;
    const playableHeight =
      STAGE_HEIGHT - COURSE_STROKE_WIDTH - FINISH_RACK_HEIGHT;
    const courseTop = -STAGE_HEIGHT / 2 + COURSE_STROKE_WIDTH;
    const finishTop = STAGE_HEIGHT / 2 - FINISH_RACK_HEIGHT;

    expect(playableWidth % GRID_SIZE).toBe(0);
    expect(playableHeight % GRID_SIZE).toBe(0);
    expect(Math.abs(courseTop % GRID_SIZE)).toBe(0);
    expect(finishTop % GRID_SIZE).toBe(0);

    const majorGridSize = GRID_SIZE * GRID_MAJOR_INTERVAL;
    expect(STAGE_SIZE_STEP).toBe(majorGridSize);
    expect(Math.abs(playableWidth % majorGridSize)).toBe(0);
    expect(Math.abs(playableHeight % majorGridSize)).toBe(0);
  });

  test("snaps typed course dimensions to the major grid", () => {
    expect(clampStepInteger("1437", 480, 3600, STAGE_SIZE_STEP)).toBe(1440);
    expect(clampStepInteger("812", 480, 2700, STAGE_SIZE_STEP)).toBe(810);
  });

  test("keeps the spawn point editable in the default course", () => {
    const objects = createDefaultCourse(STAGE_WIDTH, STAGE_HEIGHT);
    const spawnPoint = objects.find(
      (object) => object.prefab === "spawn-point"
    );

    expect(objects.filter((object) => object.locked)).toHaveLength(4);
    expect(spawnPoint?.locked).not.toBe(true);
  });
});
