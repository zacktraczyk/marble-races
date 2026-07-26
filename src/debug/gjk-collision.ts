import type { Entity } from "@engine/core/entity";
import type { Vec2 } from "@engine/core/transform";
import {
  debugArrowDefinition,
  debugPointDefinition,
  debugPolylineDefinitions,
} from "./definitions";
import { GJKNarrowPhase } from "./gjk";
import {
  SequentialImpulseSolver,
  type Collision,
} from "@engine/physics/collision";
import { EntityDragController } from "./entityDragController";
import { FreeCameraController } from "@engine/input/freeCameraController";
import Physics from "@engine/physics/physics";
import type { Scene } from "@engine/runtime/scene";
import Stage from "@engine/stage";
import {
  collisionDebugData,
  deleteEntities,
  spawnCollisionDemoShapes,
  spawnCollisionDiagnostics,
} from "./collisionDemoSupport";
import { updateDebugInfo } from "./debugInfo";

type GjkDebugEvent = {
  furthestPoint1?: Vec2;
  furthestPoint2?: Vec2;
  supportPoint?: Vec2;
  simplex?: Vec2[];
  direction?: Vec2;
  isColliding?: boolean;
  inconclusiveSimplex?: boolean;
};

const spawnGjkDiagnostics = (
  stage: Stage,
  events: readonly GjkDebugEvent[]
) => {
  const visuals: Entity[] = [];
  const points = new Map<
    string,
    { position: Vec2; color: [number, number, number, number] }
  >();
  let latestSimplex: Vec2[] | null = null;
  let latestDirection: Vec2 | null = null;

  for (const event of events) {
    for (const position of [event.furthestPoint1, event.furthestPoint2]) {
      if (position) {
        points.set(position.join(":"), { position, color: [1, 1, 1, 1] });
      }
    }
    if (event.supportPoint) {
      points.set(event.supportPoint.join(":"), {
        position: event.supportPoint,
        color: [0.8, 0, 0.6, 1],
      });
    }
    if (event.simplex?.length) {
      latestSimplex = event.simplex;
      latestDirection = event.direction ?? null;
    }
  }

  for (const { position, color } of points.values()) {
    visuals.push(stage.spawn(debugPointDefinition({ position, color })));
  }
  if (latestSimplex) {
    for (const definition of debugPolylineDefinitions({
      vertices: latestSimplex,
      closed: latestSimplex.length > 2,
      color: [0, 0.8, 0.6, 1],
    })) {
      visuals.push(stage.spawn(definition));
    }
    if (latestDirection && latestSimplex.length > 0) {
      const start: Vec2 = latestSimplex.reduce(
        (sum, point) => [
          sum[0] + point[0] / latestSimplex.length,
          sum[1] + point[1] / latestSimplex.length,
        ],
        [0, 0]
      );
      visuals.push(
        stage.spawn(
          debugArrowDefinition({
            start,
            end: [
              start[0] + latestDirection[0] * 50,
              start[1] + latestDirection[1] * 50,
            ],
            color: [0.8, 0, 0.6, 1],
          })
        )
      );
    }
  }
  return visuals;
};

function createScene(): Scene {
  const narrowPhase = new GJKNarrowPhase();
  const stage = new Stage({
    physics: new Physics({
      narrowPhase,
      contactSolver: new SequentialImpulseSolver(),
    }),
  });
  stage.drawMode = "TRIANGLES";
  const draggableEntities = spawnCollisionDemoShapes(stage);

  let collisions: Collision[] = [];
  let debugEvents: GjkDebugEvent[] = [];
  let diagnostics: Entity[] = [];
  stage.registerPhysicsObserver((event) => {
    collisions = event.collisions;
  });
  narrowPhase.addDebugObserver((event: GjkDebugEvent) => {
    debugEvents.push(event);
  });

  return {
    load: ({ signal }) => {
      new EntityDragController(stage.canvas, stage.camera, {
        getEntities: () => draggableEntities,
        signal,
      });
      new FreeCameraController(stage.canvas, stage.camera, { signal });
    },
    fixedUpdate: (deltaMs) => {
      deleteEntities(diagnostics);
      collisions = [];
      debugEvents = [];
      stage.update(deltaMs);
      diagnostics = [
        ...spawnCollisionDiagnostics(stage, collisions),
        ...spawnGjkDiagnostics(stage, debugEvents),
      ];
    },
    update: () =>
      updateDebugInfo({
        collisions: collisionDebugData(collisions),
        gjkDiagnosticEvents: debugEvents.length,
      }),
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
