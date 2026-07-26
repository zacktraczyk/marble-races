import { describe, expect, test } from "bun:test";
import { SATNarrowPhase } from "@engine/physics/collision";
import { PhysicsEntity } from "@engine/physics/entity";

let nextOwnerId = 1;

const createBody = ({
  position = [0, 0],
  rotation = 0,
  velocity = [0, 0],
  shape,
}) =>
  new PhysicsEntity({
    ownerId: nextOwnerId++,
    type: "dynamic",
    position,
    rotation,
    velocity,
    boundingShape: { ...shape, position },
  });

const circle = (radius) => ({ type: "BoundingCircle", radius });

const box = (halfWidth, halfHeight) => ({
  type: "BoundingConvexPolygon",
  vertices: [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ],
});

const expectFiniteManifold = (manifold) => {
  expect(Number.isFinite(manifold.normal[0])).toBe(true);
  expect(Number.isFinite(manifold.normal[1])).toBe(true);
  expect(Math.hypot(...manifold.normal)).toBeCloseTo(1);
  expect(Number.isFinite(manifold.penetrationDepth)).toBe(true);
  expect(manifold.points.length).toBeGreaterThan(0);
  for (const point of manifold.points) {
    expect(Number.isFinite(point.position[0])).toBe(true);
    expect(Number.isFinite(point.position[1])).toBe(true);
    expect(Number.isFinite(point.separation)).toBe(true);
    expect(point.featureId.length).toBeGreaterThan(0);
  }
};

describe("SAT contact manifold generation", () => {
  test("generates a finite circle manifold when centers coincide", () => {
    const detector = new SATNarrowPhase();
    const bodyA = createBody({ shape: circle(2), velocity: [-1, 0] });
    const bodyB = createBody({ shape: circle(3), velocity: [1, 0] });

    const collision = detector.detectCollision(bodyA, bodyB);

    expect(collision).not.toBeNull();
    expectFiniteManifold(collision.manifold);
    expect(collision.manifold.normal).toEqual([1, 0]);
    expect(collision.manifold.penetrationDepth).toBeCloseTo(5);
    expect(collision.manifold.points[0].separation).toBeCloseTo(-5);
  });

  test("uses translated circle-to-polygon geometry instead of the world origin", () => {
    const detector = new SATNarrowPhase();
    const wall = createBody({ position: [1000, 1000], shape: box(50, 50) });
    const marble = createBody({ position: [1060, 1000], shape: circle(15) });

    const collision = detector.detectCollision(wall, marble);

    expect(collision).not.toBeNull();
    expectFiniteManifold(collision.manifold);
    expect(collision.manifold.normal[0]).toBeCloseTo(1);
    expect(collision.manifold.normal[1]).toBeCloseTo(0);
    expect(collision.manifold.penetrationDepth).toBeCloseTo(5);
    expect(collision.manifold.points[0].position[0]).toBeCloseTo(1047.5);

    const reversed = detector.detectCollision(marble, wall);
    expect(reversed).not.toBeNull();
    expect(reversed.manifold.normal[0]).toBeCloseTo(-1);
    expect(reversed.manifold.normal[1]).toBeCloseTo(0);
    expect(reversed.manifold.penetrationDepth).toBeCloseTo(5);
  });

  test("pushes a circle contained by a polygon toward its nearest face", () => {
    const detector = new SATNarrowPhase();
    const wall = createBody({ position: [20, 30], shape: box(5, 5) });
    const marble = createBody({ position: [20, 30], shape: circle(1) });

    const collision = detector.detectCollision(wall, marble);

    expect(collision).not.toBeNull();
    expectFiniteManifold(collision.manifold);
    expect(collision.manifold.normal).toEqual([0, -1]);
    expect(collision.manifold.penetrationDepth).toBeCloseTo(6);
  });

  test("clips overlapping polygon faces into a two-point manifold", () => {
    const detector = new SATNarrowPhase();
    const bodyA = createBody({ position: [0, 0], shape: box(5, 5) });
    const bodyB = createBody({ position: [9, 0], shape: box(5, 5) });

    const collision = detector.detectCollision(bodyA, bodyB);

    expect(collision).not.toBeNull();
    expectFiniteManifold(collision.manifold);
    expect(collision.manifold.normal[0]).toBeCloseTo(1);
    expect(collision.manifold.normal[1]).toBeCloseTo(0);
    expect(collision.manifold.penetrationDepth).toBeCloseTo(1);
    expect(collision.manifold.points).toHaveLength(2);
    expect(
      collision.manifold.points.map((point) => point.position[1]).sort()
    ).toEqual([-5, 5]);
  });

  test("returns mirrored normals when the pair order is reversed", () => {
    const detector = new SATNarrowPhase();
    const bodyA = createBody({ position: [0, 0], shape: box(5, 5) });
    const bodyB = createBody({ position: [9, 0], shape: box(5, 5) });

    const forward = detector.detectCollision(bodyA, bodyB);
    const reverse = detector.detectCollision(bodyB, bodyA);

    expect(forward).not.toBeNull();
    expect(reverse).not.toBeNull();
    expect(reverse.manifold.normal[0]).toBeCloseTo(-forward.manifold.normal[0]);
    expect(reverse.manifold.normal[1]).toBeCloseTo(-forward.manifold.normal[1]);
    expect(reverse.manifold.penetrationDepth).toBeCloseTo(
      forward.manifold.penetrationDepth
    );
  });

  test("does not report separated rotated polygons", () => {
    const detector = new SATNarrowPhase();
    const bodyA = createBody({
      position: [0, 0],
      rotation: Math.PI / 4,
      shape: box(5, 1),
    });
    const bodyB = createBody({
      position: [0, 20],
      rotation: -Math.PI / 6,
      shape: box(5, 1),
    });

    expect(detector.detectCollision(bodyA, bodyB)).toBeNull();
  });

  test("supports clockwise convex polygon input", () => {
    const detector = new SATNarrowPhase();
    const clockwiseWall = createBody({
      shape: {
        type: "BoundingConvexPolygon",
        vertices: [...box(5, 5).vertices].reverse(),
      },
    });
    const marble = createBody({ position: [5.5, 0], shape: circle(1) });

    const collision = detector.detectCollision(clockwiseWall, marble);

    expect(collision).not.toBeNull();
    expectFiniteManifold(collision.manifold);
    expect(collision.manifold.normal[0]).toBeCloseTo(1);
    expect(collision.manifold.penetrationDepth).toBeCloseTo(0.5);
  });

  test("rejects concave and degenerate polygon input", () => {
    const detector = new SATNarrowPhase();
    const concave = createBody({
      shape: {
        type: "BoundingConvexPolygon",
        vertices: [
          [0, 0],
          [2, 0],
          [1, 1],
          [2, 2],
          [0, 2],
        ],
      },
    });
    const valid = createBody({ position: [1, 1], shape: box(1, 1) });

    expect(() => detector.detectCollision(concave, valid)).toThrow(
      "vertices must form a convex polygon"
    );
  });

  test("preserves finite, mirrored manifolds across seeded pair permutations", () => {
    const detector = new SATNarrowPhase();
    let seed = 0x5eed1234;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let i = 0; i < 250; i++) {
      const createRandomBody = () =>
        createBody({
          position: [random() * 20 - 10, random() * 20 - 10],
          rotation: random() * Math.PI * 2,
          shape:
            random() < 0.5
              ? circle(random() * 2 + 0.25)
              : box(random() * 2 + 0.25, random() * 2 + 0.25),
        });
      const bodyA = createRandomBody();
      const bodyB = createRandomBody();
      const forward = detector.detectCollision(bodyA, bodyB);
      const reverse = detector.detectCollision(bodyB, bodyA);

      expect(Boolean(forward)).toBe(Boolean(reverse));
      if (!forward || !reverse) {
        continue;
      }
      expectFiniteManifold(forward.manifold);
      expectFiniteManifold(reverse.manifold);
      expect(
        dot2(forward.manifold.normal, reverse.manifold.normal)
      ).toBeCloseTo(-1);
      expect(reverse.manifold.penetrationDepth).toBeCloseTo(
        forward.manifold.penetrationDepth
      );
    }
  });
});

const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
