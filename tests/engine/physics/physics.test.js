import { describe, expect, test } from "bun:test";
import { createTransform } from "@engine/core/transform";
import Physics from "@engine/physics/physics";

const collider = { type: "circle", radius: 1 };

describe("Physics integration", () => {
  test("integrates dynamic and kinematic rotation while keeping static bodies fixed", () => {
    const steps = [];
    let resolverCleared = false;
    const physics = new Physics({
      broadPhase: {
        findPairs: () => [],
      },
      contactSolver: {
        solve: (collisions, deltaSeconds) => {
          expect(collisions).toEqual([]);
          steps.push(deltaSeconds);
        },
        clear: () => {
          resolverCleared = true;
        },
      },
    });

    const staticTransform = createTransform({ position: [0, 0] });
    const kinematicTransform = createTransform({ position: [0, 0] });
    const dynamicTransform = createTransform({ position: [0, 0] });
    physics.addEntity(1, staticTransform, {
      type: "static",
      velocity: [10, 0],
      angularVelocity: 2,
      collider,
    });
    const kinematic = physics.addEntity(2, kinematicTransform, {
      type: "kinematic",
      velocity: [10, 0],
      acceleration: [5, 0],
      angularVelocity: 2,
      collider,
    });
    physics.addEntity(3, dynamicTransform, {
      type: "dynamic",
      velocity: [10, 0],
      angularVelocity: 2,
      collider,
    });

    physics.update(10);

    expect(staticTransform.position).toEqual([0, 0]);
    expect(staticTransform.rotation).toBe(0);
    expect(kinematic.velocity[0]).toBeCloseTo(10.4);
    expect(kinematicTransform.position[0]).toBeCloseTo(0.832);
    expect(kinematicTransform.rotation).toBeCloseTo(0.16);
    expect(dynamicTransform.position[0]).toBeCloseTo(0.8);
    expect(dynamicTransform.position[1]).toBeCloseTo(0.06272);
    expect(dynamicTransform.rotation).toBeCloseTo(0.16);
    expect(steps).toEqual([0.08]);

    physics.dispose();
    expect(resolverCleared).toBe(true);
  });

  test("rejects non-finite frame durations and ignores zero-duration updates", () => {
    let solveCount = 0;
    const physics = new Physics({
      broadPhase: {
        findPairs: () => [],
      },
      contactSolver: {
        solve: () => {
          solveCount++;
        },
      },
    });

    physics.update(0);

    expect(solveCount).toBe(0);
    expect(() => physics.update(Number.NaN)).toThrow();
  });

  test("reports sensor overlaps without sending them to the contact solver", () => {
    let observed;
    let solvedCollisions;
    const physics = new Physics({
      broadPhase: {
        findPairs: (entities) => [[entities[0], entities[1]]],
      },
      narrowPhase: {
        detectCollision: (entity1, entity2) => ({
          entity1,
          entity2,
          manifold: {
            normal: [1, 0],
            penetrationDepth: 1,
            points: [
              {
                position: [0, 0],
                separation: -1,
                featureId: "sensor-overlap",
              },
            ],
          },
        }),
      },
      contactSolver: {
        solve: (collisions) => {
          solvedCollisions = collisions;
        },
      },
    });
    physics.register((events) => {
      observed = events;
    });
    physics.addEntity(1, createTransform({ position: [0, 0] }), {
      type: "kinematic",
      sensor: true,
      collider,
    });
    physics.addEntity(2, createTransform({ position: [0, 0] }), {
      type: "dynamic",
      collider,
    });

    physics.update(10);

    expect(observed.entityCollisions).toHaveLength(1);
    expect(solvedCollisions).toEqual([]);
  });
});
