import type { Scene } from "@engine/runtime/scene";
import { FreeCameraController } from "@engine/input/freeCameraController";
import Stage from "@engine/stage";
import { circleDefinition } from "@game/prefabs/primitives/circle";
import { rectangleDefinition } from "@game/prefabs/primitives/rectangle";
import { updateDebugInfo } from "./debugInfo";

function createScene(): Scene {
  const stage = new Stage();

  const spawnX = -250;
  const spawnY = -stage.canvas.clientHeight / 2 + 100;
  const circle = stage.spawn(
    circleDefinition({
      position: [spawnX, spawnY],
      radius: 40,
      color: [1, 0, 0, 1],
    })
  );
  const circleBody = stage.getPhysicsEntity(circle);
  if (!circleBody) {
    throw new Error("Angular collision demo requires a physical circle");
  }

  stage.spawn(
    rectangleDefinition({
      position: [spawnX - 40, 0],
      width: 100,
      height: 100,
      rotation: Math.PI / 8,
      bodyType: "kinematic",
      color: [0, 1, 0, 1],
    })
  );

  const collisions: [number, number][] = [];
  stage.registerPhysicsObserver(({ entityCollisions }) => {
    for (const { entity1, entity2 } of entityCollisions) {
      if (
        !collisions.some(
          ([first, second]) => first === entity1 && second === entity2
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
      if (circle.position[1] > stage.canvas.clientHeight + 100) {
        circle.position = [spawnX, spawnY];
        circleBody.velocity = [0, 0];
      }
      stage.update(deltaMs);
    },
    update: () => updateDebugInfo({ collisions }),
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
