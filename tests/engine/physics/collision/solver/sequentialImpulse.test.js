import { describe, expect, test } from "bun:test";
import {
  SATNarrowPhase,
  SequentialImpulseSolver,
} from "@engine/physics/collision";
import { PhysicsEntity } from "@engine/physics/entity";

let nextOwnerId = 10_000;

const circle = (radius = 1) => ({ type: "BoundingCircle", radius });
const box = (halfWidth, halfHeight) => ({
  type: "BoundingConvexPolygon",
  vertices: [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ],
});

const createBody = ({
  type = "dynamic",
  position = [0, 0],
  velocity = [0, 0],
  angularVelocity = 0,
  shape = circle(),
  mass,
  friction = 0,
  restitution = 0,
}) =>
  new PhysicsEntity({
    ownerId: nextOwnerId++,
    type,
    position,
    velocity,
    angularVelocity,
    mass,
    friction,
    restitution,
    boundingShape: { ...shape, position },
  });

const collide = (entity1, entity2) => {
  const collision = new SATNarrowPhase().detectCollision(entity1, entity2);
  if (!collision) {
    throw new Error("Test bodies did not collide");
  }
  return collision;
};

const solve = (collision, options = {}) => {
  const solver = new SequentialImpulseSolver({
    warmStart: false,
    penetrationSlop: 0,
    positionCorrectionPercent: 0,
    ...options,
  });
  solver.solve([collision], 1 / 60);
};

describe("SequentialImpulseSolver", () => {
  test("computes physical inertia for circles and boxes", () => {
    const disk = createBody({ shape: circle(2), mass: 3 });
    const rectangle = createBody({ shape: box(2, 1), mass: 3 });

    expect(disk.inertia).toBeCloseTo(6);
    expect(disk.inverseInertia).toBeCloseTo(1 / 6);
    expect(rectangle.inertia).toBeCloseTo(5);
    expect(rectangle.inverseInertia).toBeCloseTo(1 / 5);
  });

  test("applies configured restitution against an immovable body", () => {
    const moving = createBody({
      position: [0, 0],
      velocity: [10, 0],
      restitution: 1,
    });
    const wall = createBody({
      type: "static",
      position: [1.5, 0],
      restitution: 1,
    });

    solve(collide(moving, wall));

    expect(moving.velocity[0]).toBeCloseTo(-10);
    expect(wall.velocity).toEqual([0, 0]);
  });

  test("does not impulse bodies that are already separating", () => {
    const moving = createBody({
      position: [0, 0],
      velocity: [-10, 0],
      restitution: 1,
    });
    const wall = createBody({
      type: "static",
      position: [1.5, 0],
      restitution: 1,
    });

    solve(collide(moving, wall));

    expect(moving.velocity[0]).toBeCloseTo(-10);
  });

  test("uses inverse mass for unequal-mass dynamic collisions", () => {
    const light = createBody({
      position: [-0.75, 0],
      velocity: [10, 0],
      mass: 1,
      restitution: 1,
    });
    const heavy = createBody({
      position: [0.75, 0],
      velocity: [0, 0],
      mass: 3,
      restitution: 1,
    });

    solve(collide(light, heavy));

    expect(light.velocity[0]).toBeCloseTo(-5);
    expect(heavy.velocity[0]).toBeCloseTo(5);
  });

  test("turns tangential velocity into circle spin through friction", () => {
    const marble = createBody({
      position: [0, 0],
      velocity: [5, 5],
      friction: 1,
      restitution: 0,
    });
    const floor = createBody({
      type: "static",
      position: [0, 1.4],
      shape: box(5, 0.5),
      friction: 1,
      restitution: 0,
    });

    solve(collide(marble, floor));

    expect(marble.velocity[0]).toBeLessThan(5);
    expect(marble.angularVelocity).toBeGreaterThan(0);
    expect(marble.velocity[1]).toBeCloseTo(0);
  });

  test("includes rotating kinematic surface velocity in friction", () => {
    const marble = createBody({
      position: [0, 0],
      velocity: [0, 5],
      friction: 1,
      restitution: 0,
    });
    const pusher = createBody({
      type: "kinematic",
      position: [0, 1.4],
      angularVelocity: 2,
      shape: box(5, 0.5),
      friction: 1,
      restitution: 0,
    });

    solve(collide(marble, pusher));

    expect(marble.velocity[0]).toBeGreaterThan(0);
    expect(pusher.angularVelocity).toBe(2);
  });

  test("corrects penetration once and distributes it by inverse mass", () => {
    const bodyA = createBody({ position: [0, 0] });
    const bodyB = createBody({ position: [1.5, 0] });
    const solver = new SequentialImpulseSolver({
      warmStart: false,
      penetrationSlop: 0,
      positionCorrectionPercent: 1,
    });

    solver.solve([collide(bodyA, bodyB)], 1 / 60);

    expect(bodyA.position[0]).toBeCloseTo(-0.25);
    expect(bodyB.position[0]).toBeCloseTo(1.75);
  });

  test("keeps a symmetric two-point face contact rotationally balanced", () => {
    const fallingBox = createBody({
      position: [0, 0],
      velocity: [0, 5],
      shape: box(2, 1),
      restitution: 0,
    });
    const floor = createBody({
      type: "static",
      position: [0, 1.5],
      shape: box(5, 1),
      restitution: 0,
    });

    solve(collide(fallingBox, floor), { velocityIterations: 20 });

    expect(fallingBox.velocity[1]).toBeCloseTo(0, 4);
    expect(fallingBox.angularVelocity).toBeCloseTo(0, 4);
  });

  test("warm starting does not reapply stale energy", () => {
    const moving = createBody({
      position: [0, 0],
      velocity: [10, 0],
      restitution: 0,
    });
    const wall = createBody({
      type: "static",
      position: [1.5, 0],
      restitution: 0,
    });
    const solver = new SequentialImpulseSolver({
      penetrationSlop: 0,
      positionCorrectionPercent: 0,
    });
    const collision = collide(moving, wall);

    solver.solve([collision], 1 / 60);
    solver.solve([collision], 1 / 60);

    expect(moving.velocity[0]).toBeCloseTo(0);
  });
});
