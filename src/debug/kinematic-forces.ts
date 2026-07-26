import type { Entity } from "@engine/core/entity";
import { FreeCameraController } from "@engine/input/freeCameraController";
import type { Scene } from "@engine/runtime/scene";
import Stage from "@engine/stage";
import type { Color } from "@engine/core/color";
import { circleDefinition } from "@game/prefabs/primitives/circle";
import { rectangleDefinition } from "@game/prefabs/primitives/rectangle";

const NUM_BALLS = 40;
const BALL_RADIUS = 30;
const SPAWN_BUFFER = 10;
const BALL_COLOR: Color = [239 / 255, 68 / 255, 68 / 255, 1];
const WALL_COLOR: Color = [34 / 255, 197 / 255, 94 / 255, 1];
const PUSHER_COLOR: Color = [56 / 255, 189 / 255, 248 / 255, 1];

const safeSpawnPosition = (
  balls: readonly Entity[],
  xRange: [number, number],
  yRange: [number, number]
): [number, number] => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const position: [number, number] = [
      xRange[0] + Math.random() * (xRange[1] - xRange[0]),
      yRange[0] + Math.random() * (yRange[1] - yRange[0]),
    ];
    if (
      balls.every(
        (ball) =>
          Math.hypot(
            ball.position[0] - position[0],
            ball.position[1] - position[1]
          ) >=
          BALL_RADIUS * 2 + SPAWN_BUFFER
      )
    ) {
      return position;
    }
  }
  throw new Error("Unable to find a safe ball spawn position");
};

function createScene(): Scene {
  const stage = new Stage();
  const spawnPosition = (balls: readonly Entity[]) => {
    const width = stage.canvas.clientWidth / 2 - 100;
    return safeSpawnPosition(
      balls,
      [-width, width],
      [
        -stage.canvas.clientHeight / 2 - 200,
        -stage.canvas.clientHeight / 2 - 100,
      ]
    );
  };

  const balls: Entity[] = [];
  for (let index = 0; index < NUM_BALLS; index++) {
    balls.push(
      stage.spawn(
        circleDefinition({
          position: spawnPosition(balls),
          radius: BALL_RADIUS,
          color: BALL_COLOR,
        })
      )
    );
  }

  const thirdHeight = stage.canvas.clientHeight / 3;
  const spawnPusher = (position: [number, number], rotation = 0) => {
    const entity = stage.spawn(
      rectangleDefinition({
        position,
        width: 50,
        height: 200,
        rotation,
        bodyType: "kinematic",
        color: PUSHER_COLOR,
      })
    );
    const body = stage.getPhysicsEntity(entity);
    if (!body) {
      throw new Error("Kinematic demo requires physical pushers");
    }
    return body;
  };
  const firstPusher = spawnPusher([0, -thirdHeight]);
  const secondPusher = spawnPusher([0, thirdHeight], Math.PI / 8);

  for (const rotation of [0, Math.PI / 2]) {
    stage.spawn(
      rectangleDefinition({
        position: [0, 0],
        width: 300,
        height: 10,
        rotation,
        angularVelocity: 0.075,
        bodyType: "kinematic",
        color: PUSHER_COLOR,
      })
    );
  }
  for (const x of [
    -stage.canvas.clientWidth / 2,
    stage.canvas.clientWidth / 2,
  ]) {
    stage.spawn(
      rectangleDefinition({
        position: [x, 0],
        width: 50,
        height: stage.canvas.clientHeight,
        color: WALL_COLOR,
      })
    );
  }

  let simulationTime = 0;
  return {
    load: ({ signal }) => {
      new FreeCameraController(stage.canvas, stage.camera, { signal });
    },
    fixedUpdate: (deltaMs) => {
      simulationTime += deltaMs;
      const magnitude = stage.canvas.clientWidth / 16;
      firstPusher.velocity[0] =
        (Math.sin(simulationTime / 1000 + Math.PI / 2) * magnitude) / 2;
      secondPusher.velocity[0] =
        (Math.sin(simulationTime / 1000) * magnitude) / 2;
      stage.update(deltaMs);

      for (const ball of balls) {
        if (ball.position[1] <= stage.canvas.clientHeight + 100) {
          continue;
        }
        const body = stage.getPhysicsEntity(ball);
        if (body) {
          body.velocity = [0, 0];
        }
        ball.position = spawnPosition(
          balls.filter((candidate) => candidate !== ball)
        );
      }
    },
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
