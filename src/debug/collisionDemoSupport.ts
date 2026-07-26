import type { Entity } from "@engine/core/entity";
import type { DraggableEntity } from "./entityDragController";
import {
  debugArrowDefinition,
  debugLineDefinition,
  draggableCircleDefinition,
  draggableShapeDefinition,
} from "./definitions";
import type { Collision } from "@engine/physics/collision";
import type Stage from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";

const HANDLE_RADIUS = 15;
const HANDLE_COLOR: [number, number, number, number] = [0.4, 0.4, 0.4, 1];

const regularPolygonVertices = (radius: number, sides: number): Vec2[] =>
  Array.from({ length: sides }, (_, index) => {
    const angle = (Math.PI * 2 * index) / sides;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });

export const spawnCollisionDemoShapes = (stage: Stage): DraggableEntity[] => {
  const definitions = [
    draggableCircleDefinition({
      position: [200, 0],
      radius: 50,
      color: [34 / 255, 197 / 255, 94 / 255, 1],
      handleRadius: HANDLE_RADIUS,
      handleColor: HANDLE_COLOR,
    }),
    draggableCircleDefinition({
      position: [0, 200],
      radius: 70,
      color: [167 / 255, 139 / 255, 250 / 255, 1],
      handleRadius: HANDLE_RADIUS,
      handleColor: HANDLE_COLOR,
    }),
    draggableShapeDefinition({
      position: [0, -200],
      vertices: regularPolygonVertices(80, 6),
      color: [56 / 255, 189 / 255, 248 / 255, 1],
      handleRadius: HANDLE_RADIUS,
      handleColor: HANDLE_COLOR,
    }),
    draggableShapeDefinition({
      position: [-200, 0],
      rotation: Math.PI / 8,
      vertices: [
        [-50, -50],
        [50, -50],
        [50, 50],
        [-50, 50],
      ],
      color: [239 / 255, 68 / 255, 68 / 255, 1],
      handleRadius: HANDLE_RADIUS,
      handleColor: HANDLE_COLOR,
    }),
  ];
  return definitions.map((definition) => ({
    entity: stage.spawn(definition),
    grabHandleRadius: HANDLE_RADIUS,
  }));
};

export const spawnCollisionDiagnostics = (
  stage: Stage,
  collisions: readonly Collision[]
) => {
  const visuals: Entity[] = [];
  for (const { entity1, entity2, diagnostics, manifold } of collisions) {
    const edge = diagnostics?.referenceEdge;
    if (edge) {
      visuals.push(
        stage.spawn(
          debugLineDefinition({
            start: edge[0],
            end: edge[1],
            color: [252 / 255, 0, 147 / 255, 1],
          })
        )
      );
    }
    if (manifold.penetrationDepth <= 0) {
      continue;
    }
    const magnitude = manifold.penetrationDepth;
    const normal = manifold.normal;
    visuals.push(
      stage.spawn(
        debugArrowDefinition({
          start: [...entity2.position],
          end: [
            entity2.position[0] + normal[0] * magnitude,
            entity2.position[1] + normal[1] * magnitude,
          ],
        })
      ),
      stage.spawn(
        debugArrowDefinition({
          start: [...entity1.position],
          end: [
            entity1.position[0] - normal[0] * magnitude,
            entity1.position[1] - normal[1] * magnitude,
          ],
        })
      )
    );
  }
  return visuals;
};

export const collisionDebugData = (collisions: readonly Collision[]) =>
  collisions.map(({ entity1, entity2, diagnostics, manifold }) => ({
    entity1: entity1.ownerId,
    entity2: entity2.ownerId,
    referenceEdge: diagnostics?.referenceEdge,
    manifold,
  }));

export const deleteEntities = (entities: readonly Entity[]) => {
  for (const entity of entities) {
    entity.delete();
  }
};
