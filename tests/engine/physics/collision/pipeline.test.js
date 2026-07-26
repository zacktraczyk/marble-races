import { describe, expect, test } from "bun:test";
import { createTransform } from "@engine/core/transform";
import {
  NaiveAabbBroadPhase,
  computeWorldAabb,
  createCollision,
} from "@engine/physics/collision";
import { PhysicsEntity } from "@engine/physics/entity";
import Physics from "@engine/physics/physics";

const createBody = (
  ownerId,
  { position = [0, 0], rotation = 0, shape } = {}
) => {
  const boundingShape = shape ?? {
    type: "BoundingCircle",
    radius: 1,
  };
  return new PhysicsEntity({
    ownerId,
    type: "static",
    position,
    rotation,
    boundingShape: {
      ...boundingShape,
      position,
    },
  });
};

describe("collision pipeline", () => {
  test("broad phase returns every overlapping pair exactly once", () => {
    const bodies = [createBody(1), createBody(2), createBody(3), createBody(4)];

    const pairs = new NaiveAabbBroadPhase().findPairs(bodies);

    expect(
      pairs.map(([entity1, entity2]) => [entity1.ownerId, entity2.ownerId])
    ).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
  });

  test("AABB broad phase rejects separated bounds before the narrow phase", () => {
    const bodies = [
      createBody(1, { position: [0, 0] }),
      createBody(2, { position: [1.5, 0] }),
      createBody(3, { position: [5, 0] }),
    ];

    const pairs = new NaiveAabbBroadPhase().findPairs(bodies);

    expect(
      pairs.map(([entity1, entity2]) => [entity1.ownerId, entity2.ownerId])
    ).toEqual([[1, 2]]);
  });

  test("computes polygon AABBs from their world rotation", () => {
    const rectangle = createBody(1, {
      rotation: Math.PI / 2,
      shape: {
        type: "BoundingConvexPolygon",
        vertices: [
          [-2, -0.5],
          [2, -0.5],
          [2, 0.5],
          [-2, 0.5],
        ],
      },
    });

    const aabb = computeWorldAabb(rectangle);

    expect(aabb.minX).toBeCloseTo(-0.5);
    expect(aabb.maxX).toBeCloseTo(0.5);
    expect(aabb.minY).toBeCloseTo(-2);
    expect(aabb.maxY).toBeCloseTo(2);
  });

  test("physics sends broad-phase candidates through the narrow phase and solver", () => {
    const narrowPhasePairs = [];
    const solverCalls = [];
    const physics = new Physics({
      broadPhase: {
        findPairs: (entities) => [[entities[0], entities[2]]],
      },
      narrowPhase: {
        detectCollision: (entity1, entity2) => {
          narrowPhasePairs.push([entity1.ownerId, entity2.ownerId]);
          return createCollision({
            entity1,
            entity2,
            manifold: {
              normal: [1, 0],
              penetrationDepth: 0.25,
              points: [
                {
                  position: [0, 0],
                  separation: -0.25,
                  featureId: "test-contact",
                },
              ],
            },
          });
        },
      },
      contactSolver: {
        solve: (collisions, deltaSeconds) => {
          solverCalls.push({ collisions, deltaSeconds });
        },
      },
    });
    for (let ownerId = 1; ownerId <= 3; ownerId++) {
      physics.addEntity(ownerId, createTransform({ position: [0, 0] }), {
        type: "static",
        collider: { type: "circle", radius: 1 },
      });
    }

    physics.update(10);

    expect(narrowPhasePairs).toEqual([[1, 3]]);
    expect(solverCalls).toHaveLength(1);
    expect(solverCalls[0].collisions).toHaveLength(1);
    expect(solverCalls[0].collisions[0].manifold.points[0].featureId).toBe(
      "test-contact"
    );
    expect(solverCalls[0].deltaSeconds).toBeCloseTo(0.08);
  });

  test("physics uses AABB filtering by default", () => {
    const narrowPhasePairs = [];
    const solverCalls = [];
    const physics = new Physics({
      narrowPhase: {
        detectCollision: (entity1, entity2) => {
          narrowPhasePairs.push([entity1.ownerId, entity2.ownerId]);
          return null;
        },
      },
      contactSolver: {
        solve: (collisions) => solverCalls.push(collisions),
      },
    });
    const positions = [
      [0, 0],
      [1.5, 0],
      [10, 0],
    ];
    for (let index = 0; index < positions.length; index++) {
      physics.addEntity(
        index + 1,
        createTransform({ position: positions[index] }),
        {
          type: "static",
          collider: { type: "circle", radius: 1 },
        }
      );
    }

    physics.update(10);

    expect(narrowPhasePairs).toEqual([[1, 2]]);
    expect(solverCalls).toEqual([[]]);
  });
});
