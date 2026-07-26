import type { Entity } from "@engine/core/entity";
import type { PhysicsEntity } from "@engine/physics/entity";
import { FreeCameraController } from "@engine/input/freeCameraController";
import type { Scene } from "@engine/runtime/scene";
import Stage from "@engine/stage";
import { circleDefinition } from "@game/prefabs/primitives/circle";
import { updateDebugInfo } from "./debugInfo";

function createScene(): Scene {
  const stage = new Stage();

  const center: [number, number] = [0, -stage.canvas.clientHeight / 4];
  const offset = 100;
  const initialVelocity1 = 70;
  const initialVelocity2 = -20;
  const spawnCircle = (x: number, velocity: number) => {
    const entity = stage.spawn(
      circleDefinition({
        position: [x, center[1]],
        velocity: [velocity, 0],
        radius: 40,
        color: [1, 0, 0, 1],
      })
    );
    const body = stage.getPhysicsEntity(entity);
    if (!body) {
      throw new Error("Collision resolution demo requires physical circles");
    }
    return { entity, body };
  };
  const first = spawnCircle(center[0] - offset, initialVelocity1);
  const second = spawnCircle(center[0] + offset, initialVelocity2);

  const outsideViewport = (entity: Entity) =>
    entity.position[0] > stage.canvas.clientWidth / 2 ||
    entity.position[0] < -stage.canvas.clientWidth / 2 ||
    entity.position[1] > stage.canvas.clientHeight / 2 ||
    entity.position[1] < -stage.canvas.clientHeight / 2;
  const reset = (
    entity: Entity,
    body: PhysicsEntity,
    x: number,
    velocity: number
  ) => {
    entity.position = [x, center[1]];
    body.velocity = [velocity, 0];
  };

  const collisions: [number, number][] = [];
  stage.registerPhysicsObserver(({ entityCollisions }) => {
    for (const { entity1, entity2 } of entityCollisions) {
      if (
        !collisions.some(
          ([firstId, secondId]) => firstId === entity1 && secondId === entity2
        )
      ) {
        collisions.push([entity1, entity2]);
      }
    }
  });

  return {
    load: ({ signal }) => {
      new FreeCameraController(stage.canvas, stage.camera, { signal });
    },
    fixedUpdate: (deltaMs) => {
      if (outsideViewport(first.entity) || outsideViewport(second.entity)) {
        reset(first.entity, first.body, center[0] - offset, initialVelocity1);
        reset(second.entity, second.body, center[0] + offset, initialVelocity2);
      }
      stage.update(deltaMs);
    },
    update: () => updateDebugInfo({ collisions }),
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
