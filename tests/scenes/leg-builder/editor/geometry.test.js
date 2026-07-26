import { describe, expect, test } from "bun:test";
import {
  applyLevelObjectShape,
  getLevelObjectShape,
  hitTestLevelObject,
} from "@game/level/geometry";
import {
  constrainDeltaToAxis,
  findNearestPointIndex,
  getRotationHandle,
  getResizeAnchors,
  moveShape,
  pickLevelObject,
  rotateShape,
  resizeShape,
} from "@scenes/leg-builder/editor/geometry";
import { levelObjectDefinitions } from "@game/prefabs/levelObject";

const wall = (overrides = {}) => ({
  id: "wall",
  prefab: "wall",
  properties: {
    start: [-50, 0],
    end: [50, 0],
    thickness: 40,
    color: [1, 1, 1, 1],
  },
  ...overrides,
});

const finishZone = (overrides = {}) => ({
  id: "finish",
  prefab: "finish-zone",
  transform: { position: [0, 0], rotation: 0 },
  properties: { width: 100, height: 40, color: [1, 1, 1, 1] },
  ...overrides,
});

describe("level editor geometry", () => {
  test("constrains movement to its dominant axis", () => {
    expect(constrainDeltaToAxis([23, 8])).toEqual([23, 0]);
    expect(constrainDeltaToAxis([-4, -19])).toEqual([0, -19]);
    expect(constrainDeltaToAxis([12, -12])).toEqual([12, 0]);
  });

  test("finds the nearest point inside a snapping radius", () => {
    const points = [
      [0, 0],
      [8, 0],
      [12, 0],
    ];

    expect(findNearestPointIndex(points, [7, 1], 10)).toBe(1);
    expect(findNearestPointIndex(points, [30, 0], 10)).toBeNull();
  });

  test("hit-tests rotated authored objects in local coordinates", () => {
    const rotatedWall = wall({
      properties: {
        start: [20, -20],
        end: [20, 80],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });

    expect(hitTestLevelObject(rotatedWall, [20, 75])).toBe(true);
    expect(hitTestLevelObject(rotatedWall, [55, 30])).toBe(false);
  });

  test("picks the last matching authored object as the topmost item", () => {
    const bottom = wall({ id: "bottom" });
    const top = wall({ id: "top" });

    expect(pickLevelObject([bottom, top], [0, 0])?.id).toBe("top");
  });

  test("does not pick locked course objects", () => {
    const boundary = wall({ locked: true });

    expect(hitTestLevelObject(boundary, [0, 0])).toBe(true);
    expect(pickLevelObject([boundary], [0, 0])).toBeNull();
  });

  test("moves objects with optional grid snapping", () => {
    const shape = getLevelObjectShape(wall());

    expect(moveShape(shape, [37, -38], 25).position).toEqual([25, -50]);
    expect(moveShape(shape, [37, -38]).position).toEqual([37, -38]);
  });

  test("resizes a rectangle while keeping the opposite edge fixed", () => {
    const object = finishZone();
    const shape = getLevelObjectShape(object);
    const resized = resizeShape(shape, "e", [82, 0], 5);

    expect(resized).toMatchObject({
      kind: "rectangle",
      position: [15, 0],
      width: 130,
      height: 40,
    });
    applyLevelObjectShape(object, resized);
    expect(object.transform.position).toEqual([15, 0]);
    expect(object.properties.width).toBe(130);
  });

  test("provides eight rectangle anchors and four uniform circle anchors", () => {
    const bumper = {
      id: "bumper",
      prefab: "bumper",
      transform: { position: [0, 0] },
      properties: { radius: 22, color: [1, 1, 1, 1] },
    };

    expect(getResizeAnchors(getLevelObjectShape(wall()))).toHaveLength(8);
    expect(getResizeAnchors(getLevelObjectShape(bumper))).toHaveLength(4);
    expect(
      resizeShape(getLevelObjectShape(bumper), "e", [37, 0], 5)
    ).toMatchObject({ radius: 35 });
  });

  test("positions rotation handles and snaps edited rotation", () => {
    const object = finishZone();
    const shape = getLevelObjectShape(object);

    expect(getRotationHandle(shape, 30)).toEqual({
      connection: [0, -20],
      position: [0, -50],
    });

    const rotated = rotateShape(shape, (47 * Math.PI) / 180, Math.PI / 12);
    applyLevelObjectShape(object, rotated);

    expect(object.transform.rotation).toBeCloseTo(Math.PI / 4);
  });

  test("derives wall transforms from endpoints and writes moved endpoints back", () => {
    const object = wall();
    const shape = getLevelObjectShape(object);

    expect(shape).toMatchObject({
      kind: "rectangle",
      position: [0, 0],
      width: 100,
      height: 40,
      rotation: 0,
    });

    applyLevelObjectShape(object, moveShape(shape, [25, 50]));
    expect(object.properties.start).toEqual([-25, 50]);
    expect(object.properties.end).toEqual([75, 50]);
  });

  test("passes finish-zone rotation into its runtime definition", () => {
    const [definition] = levelObjectDefinitions(
      {
        id: "finish",
        prefab: "finish-zone",
        transform: { position: [25, 30], rotation: Math.PI / 4 },
        properties: {
          width: 120,
          height: 24,
          color: [1, 1, 1, 0.35],
        },
      },
      { wallThickness: 4, marblesPerTeam: 1 }
    );

    expect(definition.transform.rotation).toBeCloseTo(Math.PI / 4);
  });
});
