import {
  createCollision,
  type Collision,
  type ContactManifold,
  type NarrowPhase,
} from "@engine/physics/collision/types";
import { Observer } from "@engine/utils/observer";
import type { PhysicsEntity } from "@engine/physics/entity";

/** Builds an approximate one-point manifold for diagnostic-only detectors. */
const createApproximateManifold = ({
  entity1,
  entity2,
  normal,
  penetrationDepth,
  featureId,
}: {
  entity1: PhysicsEntity;
  entity2: PhysicsEntity;
  normal: [number, number];
  penetrationDepth: number;
  featureId: string;
}): ContactManifold => ({
  normal,
  penetrationDepth,
  points: [
    {
      position: [
        (entity1.position[0] + entity2.position[0]) / 2,
        (entity1.position[1] + entity2.position[1]) / 2,
      ],
      separation: -penetrationDepth,
      featureId,
    },
  ],
});

/** Diagnostic GJK/EPA implementation. Production contacts use SAT manifolds. */
export class GJKNarrowPhase implements NarrowPhase {
  private _findFartherstPoint(
    entity: PhysicsEntity,
    directionNormal: [number, number]
  ): [number, number] {
    if (!entity.boundingShape) {
      throw new Error("Entity has no bounding shape");
    }

    if (entity.boundingShape.type === "BoundingConvexPolygon") {
      const polygon = entity.boundingShape;
      const vertices = polygon.vertices;
      let maxDot = -Infinity;
      let maxVertex: [number, number] = vertices[0];
      for (const vertex of vertices) {
        const [bodyX, bodyY] = vertex;

        const rotation = entity.rotation;
        const rotatedBodyVertex = [
          bodyX * Math.cos(rotation) - bodyY * Math.sin(rotation),
          bodyX * Math.sin(rotation) + bodyY * Math.cos(rotation),
        ];

        const position = entity.position;
        const worldVertex: [number, number] = [
          rotatedBodyVertex[0] + position[0],
          rotatedBodyVertex[1] + position[1],
        ];

        const dot =
          worldVertex[0] * directionNormal[0] +
          worldVertex[1] * directionNormal[1];
        if (dot > maxDot) {
          maxDot = dot;
          maxVertex = worldVertex;
        }
      }
      return maxVertex;
    }

    if (entity.boundingShape.type === "BoundingCircle") {
      const circle = entity.boundingShape;
      const position = entity.position;
      const worldPosition: [number, number] = [
        position[0] + circle.radius * directionNormal[0],
        position[1] + circle.radius * directionNormal[1],
      ];

      return worldPosition;
    }

    throw new Error("Entity has unsupported bounding shape");
  }

  private _supportPoint(
    entity1: PhysicsEntity,
    entity2: PhysicsEntity,
    directionNormal: [number, number]
  ): [number, number] {
    const oppositeDirectionNormal: [number, number] = [
      -directionNormal[0],
      -directionNormal[1],
    ];

    const furthestPoint1 = this._findFartherstPoint(entity1, directionNormal);
    const furthestPoint2 = this._findFartherstPoint(
      entity2,
      oppositeDirectionNormal
    );

    this._debug({
      furthestPoint1,
      furthestPoint2,
    });

    const supportPoint: [number, number] = [
      furthestPoint1[0] - furthestPoint2[0],
      furthestPoint1[1] - furthestPoint2[1],
    ];

    this._debug({
      supportPointDirection: directionNormal,
      supportPoint,
    });

    return supportPoint;
  }

  private _sameDirection(
    direction1: [number, number],
    direction2: [number, number]
  ): boolean {
    return direction1[0] * direction2[0] + direction1[1] * direction2[1] > 0;
  }

  private _tripleProduct(
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ): [number, number] {
    const aCrossB = a[0] * b[1] - a[1] * b[0];
    return [-aCrossB * c[1], aCrossB * c[0]];
  }

  private _getDirectionUnitVector(
    point1: [number, number],
    point2: [number, number]
  ): [number, number] {
    const direction = [point2[0] - point1[0], point2[1] - point1[1]];
    const magnitude = Math.sqrt(direction[0] ** 2 + direction[1] ** 2);
    return [direction[0] / magnitude, direction[1] / magnitude];
  }

  private _lineSimplex(
    simplex: [[number, number], [number, number]],
    direction: [number, number]
  ): boolean {
    const A = simplex[0];
    const B = simplex[1];

    const AO = this._getDirectionUnitVector(A, [0, 0]);
    const AB = this._getDirectionUnitVector(A, B);

    // TOOD: Handle case where origin is on line

    if (this._sameDirection(AB, AO)) {
      const ABPerp = this._tripleProduct(AB, AO, AB);

      const magnitude = Math.sqrt(ABPerp[0] ** 2 + ABPerp[1] ** 2);
      direction[0] = ABPerp[0] / magnitude;
      direction[1] = ABPerp[1] / magnitude;

      return false;
    } else {
      direction[0] = AO[0];
      direction[1] = AO[1];

      simplex.pop();

      return false;
    }
  }

  private _triangleSimplex(
    simplex: [[number, number], [number, number], [number, number]],
    direction: [number, number]
  ): boolean {
    const C = simplex[0];
    const B = simplex[1];
    const A = simplex[2];

    const AB = this._getDirectionUnitVector(A, B);
    const AC = this._getDirectionUnitVector(A, C);
    const AO = this._getDirectionUnitVector(A, [0, 0]);

    const ABperp = this._tripleProduct(AC, AB, AB);
    const ACperp = this._tripleProduct(AB, AC, AC);

    if (this._sameDirection(ABperp, AO)) {
      simplex.shift();

      const magnitude = Math.sqrt(ABperp[0] ** 2 + ABperp[1] ** 2);
      direction[0] = ABperp[0] / magnitude;
      direction[1] = ABperp[1] / magnitude;

      return false;
    } else if (this._sameDirection(ACperp, AO)) {
      simplex.pop();

      const magnitude = Math.sqrt(ACperp[0] ** 2 + ACperp[1] ** 2);
      direction[0] = ACperp[0] / magnitude;
      direction[1] = ACperp[1] / magnitude;

      return false;
    }

    return true;
  }

  /**
   * Given a simplex and a direction, find the next point in the simplex
   * and update the direction to the next direction.
   *
   * @param simplex The simplex to check (updated in place)
   * @param direction The direction to check (updated in place)
   * @returns True if the simplex is colliding, false otherwise
   */
  private _handleSimplex(
    simplex: [number, number][],
    direction: [number, number]
  ): boolean {
    switch (simplex.length) {
      case 2:
        return this._lineSimplex(
          simplex as [[number, number], [number, number]],
          direction
        );
      case 3: {
        const triangleSimplex = simplex as [
          [number, number],
          [number, number],
          [number, number],
        ];
        return this._triangleSimplex(triangleSimplex, direction);
      }
      default:
        throw new Error("Simplex has too many points");
    }
  }

  private _findClosestEdgeToOrigin(polygon: [number, number][]): {
    edgeIndex: number;
    normal: [number, number];
    magnitude: number;
  } {
    if (polygon.length < 2) {
      // TODO: graceful error handling
      throw new Error(
        "Cannot find closest edge to origin: polygon has too few points"
      );
    }

    let minDistance = Infinity;
    let closestNormal: [number, number] | null = null;
    let closestEdgeIndex: number | null = null;

    // NOTE: Start at 1 to avoid the first edge (0, 1)
    for (let i = 1; i < polygon.length; i++) {
      const j = i + 1 === polygon.length ? 0 : i + 1;

      const A = polygon[i];
      const B = polygon[j];

      const edgeVector: [number, number] = [B[0] - A[0], B[1] - A[1]];

      const OA = this._getDirectionUnitVector([0, 0], A);

      const unnormalizedNormal = this._tripleProduct(
        edgeVector,
        OA,
        edgeVector
      );
      const magnitude = Math.sqrt(
        unnormalizedNormal[0] ** 2 + unnormalizedNormal[1] ** 2
      );
      const normal: [number, number] = [
        unnormalizedNormal[0] / magnitude,
        unnormalizedNormal[1] / magnitude,
      ];

      const distance = normal[0] * A[0] + normal[1] * A[1];

      if (distance < minDistance) {
        minDistance = distance;
        closestNormal = normal;
        closestEdgeIndex = j;
      }
    }

    return {
      edgeIndex: closestEdgeIndex!,
      normal: closestNormal!,
      magnitude: minDistance!,
    };
  }

  private readonly _proximityThreshold = 0.0001;

  /**
   * Generate collision information from a simplex using EPA.
   *
   * @param simplex The simplex to expand
   * @param entity1 The first entity
   * @param entity2 The second entity
   * @returns The collision information
   */
  private _expandSimplex(
    simplex: [number, number][],
    entity1: PhysicsEntity,
    entity2: PhysicsEntity
  ): { normal: [number, number]; magnitude: number } {
    const polygon = [...simplex];
    while (true) {
      const {
        edgeIndex,
        normal: edgeNormal,
        magnitude: edgeDistance,
      } = this._findClosestEdgeToOrigin(polygon);

      const supportPoint = this._supportPoint(entity1, entity2, edgeNormal);

      const supportPointDistance: number =
        supportPoint[0] * edgeNormal[0] + supportPoint[1] * edgeNormal[1];

      const isSupportPointOnEdge =
        Math.abs(supportPointDistance - edgeDistance) <
        this._proximityThreshold;

      if (isSupportPointOnEdge) {
        return { normal: edgeNormal, magnitude: supportPointDistance };
      }

      polygon.splice(edgeIndex, 0, supportPoint);
    }
  }

  private _detectCollision(
    entity1: PhysicsEntity,
    entity2: PhysicsEntity
  ): [number, number][] | null {
    const initialDirection = this._getDirectionUnitVector(
      entity2.position,
      entity1.position
    );
    const supportPoint1 = this._supportPoint(
      entity1,
      entity2,
      initialDirection
    );

    const simplex: [number, number][] = [];
    simplex.push(supportPoint1);

    const direction = this._getDirectionUnitVector(supportPoint1, [0, 0]);

    while (true) {
      const supportPoint = this._supportPoint(entity1, entity2, direction);

      if (!this._sameDirection(direction, supportPoint)) {
        this._debug({
          sameDirectionSupportPoint: true,
          direction,
          supportPoint,
        });
        return null;
      }

      simplex.push(supportPoint);

      this._debug({
        inconclusiveSimplex: true,
        simplex,
        direction,
      });

      const isColliding = this._handleSimplex(simplex, direction);
      if (isColliding) {
        this._debug({
          isColliding: true,
          simplex,
          direction,
        });
        return simplex;
      }
    }
  }

  private _circleCircleCollision(
    entity1: PhysicsEntity,
    entity2: PhysicsEntity
  ):
    | {
        isColliding: true;
        normal: [number, number];
        magnitude: number;
      }
    | {
        isColliding: false;
        normal: null;
        magnitude: null;
      } {
    if (
      entity1.boundingShape.type !== "BoundingCircle" ||
      entity2.boundingShape.type !== "BoundingCircle"
    ) {
      console.error(
        "Cannot check circle circle collision: Entity has unsupported bounding shape",
        { entity1, entity2 }
      );
      return { isColliding: false, normal: null, magnitude: null };
    }
    const distance = Math.sqrt(
      (entity1.position[0] - entity2.position[0]) ** 2 +
        (entity1.position[1] - entity2.position[1]) ** 2
    );

    const isColliding =
      distance <= entity1.boundingShape.radius + entity2.boundingShape.radius;

    if (!isColliding) {
      return { isColliding: false, normal: null, magnitude: null };
    }

    const normal = this._getDirectionUnitVector(
      entity1.position,
      entity2.position
    );

    const magnitude =
      entity1.boundingShape.radius + entity2.boundingShape.radius - distance;

    this._debug({
      type: "circleCircleCollision",
      isColliding,
      normal,
      magnitude,
    });

    return { isColliding, normal, magnitude };
  }

  detectCollision(
    entity1: PhysicsEntity,
    entity2: PhysicsEntity
  ): Collision | null {
    if (
      entity1.boundingShape.type === "BoundingCircle" &&
      entity2.boundingShape.type === "BoundingCircle"
    ) {
      const result = this._circleCircleCollision(entity1, entity2);
      return result.isColliding
        ? createCollision({
            entity1,
            entity2,
            manifold: createApproximateManifold({
              entity1,
              entity2,
              normal: result.normal,
              penetrationDepth: result.magnitude,
              featureId: "gjk:circle-circle",
            }),
          })
        : null;
    }

    const simplex = this._detectCollision(entity1, entity2);
    if (!simplex) {
      return null;
    }
    const { normal, magnitude } = this._expandSimplex(
      simplex,
      entity1,
      entity2
    );
    return createCollision({
      entity1,
      entity2,
      manifold: createApproximateManifold({
        entity1,
        entity2,
        normal,
        penetrationDepth: magnitude,
        featureId: "gjk:epa",
      }),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDebugObserver(observer: (data: any) => void) {
    this._debug_observer.register(observer);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeDebugObserver(observer: (data: any) => void) {
    this._debug_observer.unregister(observer);
  }

  clearDebugObservers() {
    this._debug_observer.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _debug_observer: Observer<any> = new Observer<any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _debug(data: any) {
    this._debug_observer.notify(data);
  }
}
