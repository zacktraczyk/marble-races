import {
  SATNarrowPhase,
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

function createScene(): Scene {
  const stage = new Stage({
    physics: new Physics({
      narrowPhase: new SATNarrowPhase(),
      contactSolver: new SequentialImpulseSolver(),
    }),
  });
  stage.drawMode = "TRIANGLES";
  const draggableEntities = spawnCollisionDemoShapes(stage);

  let collisions: Collision[] = [];
  let diagnostics = spawnCollisionDiagnostics(stage, collisions);
  stage.registerPhysicsObserver((event) => {
    collisions = event.collisions;
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
      stage.update(deltaMs);
      diagnostics = spawnCollisionDiagnostics(stage, collisions);
    },
    update: () =>
      updateDebugInfo({ collisions: collisionDebugData(collisions) }),
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
