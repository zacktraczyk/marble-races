import type { Scene } from "@engine/runtime/scene";
import { FreeCameraController } from "@engine/input/freeCameraController";
import Stage from "@engine/stage";
import { finishZoneDefinition } from "@game/prefabs/finishZone";
import { marbleDefinition } from "@game/prefabs/marble";
import { rectangleDefinition } from "@game/prefabs/primitives/rectangle";
import { updateDebugInfo } from "./debugInfo";

function createScene(): Scene {
  const { stage, finishLine } = init();

  const finishedBalls: number[] = [];
  stage.registerPhysicsObserver(({ entityCollisions }) => {
    for (const collision of entityCollisions) {
      const { entity1, entity2 } = collision;
      const collisionPemutations = [
        [entity1, entity2],
        [entity2, entity1],
      ];

      for (const [marbleId, finishId] of collisionPemutations) {
        const marble = stage.world.get(marbleId);
        const finish = stage.world.get(finishId);
        if (marble?.hasTag("marble") && finish?.id === finishLine.id) {
          marble.delete();
          finishedBalls.push(marble.id);
        }
      }
    }
  });

  return {
    load: ({ signal }) => {
      new FreeCameraController(stage.canvas, stage.camera, { signal });
    },
    fixedUpdate: (deltaMs) => stage.update(deltaMs),
    update: () => {
      updateDebugInfo({ finishedBalls });
    },
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

function init() {
  const stage = new Stage({
    height: 1000,
    width: 1000,
  });
  // Spawn area
  const spawnOriginx = 0;
  const spawnOriginy = 110 - stage.height / 2;
  const spawnPadding = 50;
  const spawnw = stage.width - spawnPadding * 2;
  const spawnh = 180 - spawnPadding * 2;

  const numSpawnEntities = 200;

  function randomCirclesSpawn() {
    const circleSharedProps = {
      radius: 12,
      type: "dynamic" as const,
    };

    // Spawn circles
    const spawnPositions: [number, number][] = [];
    const spawnBuffer = 5;
    function spawnCircle(): boolean {
      const x = spawnOriginx + Math.random() * spawnw - spawnw / 2;
      const y = spawnOriginy + Math.random() * spawnh - spawnh / 2;
      const { radius } = circleSharedProps;

      for (const pos of spawnPositions) {
        if (
          Math.abs(pos[0] - x) < radius + spawnBuffer &&
          Math.abs(pos[1] - y) < radius + spawnBuffer
        ) {
          return false;
        }
      }

      spawnPositions.push([x, y]);
      i++;

      const vx = Math.random() * 200 - 100;
      const vy = 0;

      stage.spawn(
        marbleDefinition({
          position: [x, y],
          velocity: [vx, vy],
          color: [0, 0, Math.random() * 0.5 + 0.5, 1],
          radius: circleSharedProps.radius,
          decorated: false,
        })
      );

      return true;
    }

    let i = 0;
    let successiveFailures = 0;
    while (i < numSpawnEntities) {
      if (spawnCircle()) {
        i++;
        successiveFailures = 0;
      } else {
        successiveFailures++;
      }

      if (successiveFailures > 100) {
        throw new Error(
          "Failed to spawn circles, unable to find suitable spawn positions"
        );
      }
    }
  }

  function spawnWalls() {
    stage.spawn(
      rectangleDefinition({
        position: [25 - stage.width / 2, 25],
        width: 50,
        height: stage.height - 50,
        color: [0, 1, 0, 1],
      })
    );

    stage.spawn(
      rectangleDefinition({
        position: [stage.width / 2 - 25, 25],
        width: 50,
        height: stage.height - 50,
        color: [0, 1, 0, 1],
      })
    );

    stage.spawn(
      rectangleDefinition({
        position: [0, 25 - stage.height / 2],
        width: stage.width,
        height: 50,
        color: [0, 1, 0, 1],
      })
    );
  }

  function spawnObstacles() {
    const numObstacles = 10;

    for (let j = 0; j < numObstacles / 2; j++) {
      for (let i = 0; i < numObstacles / 2; i++) {
        const x =
          -stage.width / 2 +
          ((stage.width - 100) / (numObstacles / 2)) *
            (i + (j % 2) * 0.5 + 0.5);
        const y =
          100 -
          stage.height / 2 +
          ((stage.height - 200) / (numObstacles / 2)) * (j + 0.5);

        stage.spawn(
          rectangleDefinition({
            position: [x, y],
            width: 50,
            height: 50,
            color: [1, 1, 1, 1],
            bodyType: "kinematic",
          })
        );
      }
    }
  }

  const finishLine = stage.spawn(
    finishZoneDefinition({
      position: [0, stage.height - 25 - stage.height / 2],
      width: stage.width - 100,
      height: 50,
      color: [1, 0, 0, 1],
    })
  );

  // Init
  spawnWalls();
  randomCirclesSpawn();
  spawnObstacles();

  return {
    stage,
    finishLine,
  };
}

export default createScene;
