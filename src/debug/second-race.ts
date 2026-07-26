import { CameraResizeController } from "@engine/camera/resizeController";
import { uniformCameraFitInsets } from "@engine/camera/fit";
import Stage from "@engine/stage";
import type { Entity } from "@engine/core/entity";
import { FreeCameraController } from "@engine/input/freeCameraController";
import type { Scene } from "@engine/runtime/scene";
import { finishZoneDefinition } from "@game/prefabs/finishZone";
import { marbleDefinition } from "@game/prefabs/marble";
import {
  rectangleDefinition,
  type RectangleDefinitionOptions,
} from "@game/prefabs/primitives/rectangle";
import {
  rightTriangleDefinition,
  type RightTriangleDefinitionOptions,
} from "@game/prefabs/primitives/rightTriangle";

type Color = [number, number, number, number];

const WINDOW_PADDING = 50;

const BLUE_COLOR: Color = [56 / 255, 189 / 255, 248 / 255, 1];
const GREEN_COLOR: Color = [16 / 255, 255 / 255, 129 / 255, 1];
const RED_COLOR: Color = [239 / 255, 68 / 255, 68 / 255, 1];
const YELLOW_COLOR: Color = [255 / 255, 215 / 255, 0 / 255, 1];
const PURPLE_COLOR: Color = [168 / 255, 85 / 255, 247 / 255, 1];
const ORANGE_COLOR: Color = [255 / 255, 159 / 255, 67 / 255, 1];
const PINK_COLOR: Color = [255 / 255, 186 / 255, 186 / 255, 1];
const BROWN_COLOR: Color = [156 / 255, 102 / 255, 31 / 255, 1];
const MARBLE_COLOR: Color[] = [
  BLUE_COLOR,
  GREEN_COLOR,
  RED_COLOR,
  YELLOW_COLOR,
  PURPLE_COLOR,
  ORANGE_COLOR,
  PINK_COLOR,
  BROWN_COLOR,
];
const MARBLE_RADIUS = 20;
const MARBLE_SPAWN_BUFFER = 10;

const WALL_THICKNESS = 50;
const TRIANGLE_THICKNESS = WALL_THICKNESS * 2;
const WALL_COLOR: Color = [113 / 255, 113 / 255, 122 / 255, 1];

const NUM_PUSHERS = 6;
const PUSHER_SIZE = TRIANGLE_THICKNESS;
const PUSHER_OVERFLOW_DISTANCE = WALL_THICKNESS + PUSHER_SIZE / 2;
const PUSHER_COLOR: Color = [1, 1, 1, 1];

const OUT_OF_BOUNDS_THICKNESS = WINDOW_PADDING + PUSHER_OVERFLOW_DISTANCE;
const OUT_OF_BOUNDS_COLOR: Color = [24 / 255, 24 / 255, 27 / 255, 1];

const FINISH_LINE_THICKNESS = 25;
const FINISH_LINE_COLOR: Color = [239 / 255, 68 / 255, 68 / 255, 1];

function createScene(): Scene {
  const { stage, finishLine, constrainPushers } = init();

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
        if (marble?.hasTag("marble") && finishId === finishLine.id) {
          marble.delete();
          finishedBalls.push(marble.id);
        }
      }
    }
  });

  const numMarbles = 500;
  const marbles: Entity[] = [];
  let colorIndex = 0;
  const spawnBall = () => {
    const x =
      -stage.width / 2 + MARBLE_RADIUS + WALL_THICKNESS + MARBLE_SPAWN_BUFFER;
    const y =
      -stage.height / 2 + MARBLE_RADIUS + WALL_THICKNESS + MARBLE_SPAWN_BUFFER;

    for (const marble of marbles) {
      if (
        Math.abs(marble.position[0] - x) < MARBLE_RADIUS &&
        Math.abs(marble.position[1] - y) < MARBLE_RADIUS
      ) {
        return false;
      }
    }

    const speed = Math.random() * 30 + 70;

    const vx = Math.random() * speed;
    const vy = vx - speed - 10;

    const newMarble = stage.spawn(
      marbleDefinition({
        position: [x, y],
        velocity: [vx, vy],
        radius: MARBLE_RADIUS,
        color: MARBLE_COLOR[colorIndex],
        decorated: false,
      })
    );
    marbles.push(newMarble);

    colorIndex = (colorIndex + 1) % MARBLE_COLOR.length;
  };

  const destroyOutOfBoundsObjects = () => {
    for (const marble of marbles) {
      if (
        marble.position[0] < -stage.width / 2 - OUT_OF_BOUNDS_THICKNESS ||
        marble.position[0] > stage.width / 2 + OUT_OF_BOUNDS_THICKNESS ||
        marble.position[1] < -stage.height / 2 - OUT_OF_BOUNDS_THICKNESS ||
        marble.position[1] > stage.height / 2 + OUT_OF_BOUNDS_THICKNESS
      ) {
        marble.delete();
      }
    }
  };

  return {
    load: ({ signal }) => {
      new FreeCameraController(stage.canvas, stage.camera, { signal });
      new CameraResizeController(stage.canvas, stage.camera, {
        getContentSize: () => [stage.width, stage.height],
        insets: uniformCameraFitInsets(WINDOW_PADDING),
        signal,
      });
    },
    fixedUpdate: (deltaMs) => {
      if (marbles.length < numMarbles) {
        spawnBall();
      }
      constrainPushers();
      destroyOutOfBoundsObjects();
      stage.update(deltaMs);
    },
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

function init() {
  const stage = new Stage({
    height: 1200,
    width: 2000,
  });
  const gapWidth = stage.width / 6;
  const thirdHeight = stage.height / 6;

  function spawnWalls() {
    const rectangles: RectangleDefinitionOptions[] = [
      {
        position: [WALL_THICKNESS / 2 - stage.width / 2, WALL_THICKNESS / 2],
        width: WALL_THICKNESS,
        height: stage.height - WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [stage.width / 2 - WALL_THICKNESS / 2, WALL_THICKNESS / 2],
        width: WALL_THICKNESS,
        height: stage.height - WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [0, WALL_THICKNESS / 2 - stage.height / 2],
        width: stage.width,
        height: WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [-gapWidth / 2, -thirdHeight],
        width: stage.width - gapWidth,
        height: WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [gapWidth / 2, thirdHeight],
        width: stage.width - gapWidth,
        height: WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [-gapWidth / 2, stage.height - 25 - stage.height / 2],
        width: stage.width - gapWidth,
        height: WALL_THICKNESS,
        color: WALL_COLOR,
      },
      {
        position: [-stage.width / 2 - OUT_OF_BOUNDS_THICKNESS / 2, 0],
        width: OUT_OF_BOUNDS_THICKNESS,
        height: stage.height + OUT_OF_BOUNDS_THICKNESS * 2,
        color: OUT_OF_BOUNDS_COLOR,
      },
      {
        position: [stage.width / 2 + OUT_OF_BOUNDS_THICKNESS / 2, 0],
        width: OUT_OF_BOUNDS_THICKNESS,
        height: stage.height + OUT_OF_BOUNDS_THICKNESS * 2,
        color: OUT_OF_BOUNDS_COLOR,
      },
      {
        position: [0, -stage.height / 2 - OUT_OF_BOUNDS_THICKNESS / 2],
        width: stage.width,
        height: OUT_OF_BOUNDS_THICKNESS,
        color: OUT_OF_BOUNDS_COLOR,
      },
      {
        position: [0, stage.height / 2 + OUT_OF_BOUNDS_THICKNESS / 2],
        width: stage.width,
        height: OUT_OF_BOUNDS_THICKNESS,
        color: OUT_OF_BOUNDS_COLOR,
      },
    ];
    for (const rectangle of rectangles) {
      stage.spawn(rectangleDefinition(rectangle));
    }

    const triangles: Pick<
      RightTriangleDefinitionOptions,
      "position" | "rotation"
    >[] = [
      {
        position: [
          -stage.width / 2 + WALL_THICKNESS + TRIANGLE_THICKNESS / 2,
          -thirdHeight - WALL_THICKNESS / 2 - TRIANGLE_THICKNESS / 2,
        ],
      },
      {
        position: [
          stage.width / 2 - WALL_THICKNESS - TRIANGLE_THICKNESS / 2,
          thirdHeight - WALL_THICKNESS / 2 - TRIANGLE_THICKNESS / 2,
        ],
        rotation: -Math.PI / 2,
      },
      {
        position: [
          -stage.width / 2 + WALL_THICKNESS + TRIANGLE_THICKNESS / 2,
          stage.height / 2 - WALL_THICKNESS - TRIANGLE_THICKNESS / 2,
        ],
      },
    ];
    for (const triangle of triangles) {
      stage.spawn(
        rightTriangleDefinition({
          ...triangle,
          width: TRIANGLE_THICKNESS,
          height: TRIANGLE_THICKNESS,
          color: WALL_COLOR,
        })
      );
    }
  }

  const finishLine = stage.spawn(
    finishZoneDefinition({
      position: [
        stage.width / 2 - (gapWidth - WALL_THICKNESS) / 2 - WALL_THICKNESS,
        stage.height - stage.height / 2 - FINISH_LINE_THICKNESS / 2,
      ],
      width: gapWidth - WALL_THICKNESS,
      height: FINISH_LINE_THICKNESS,
      color: FINISH_LINE_COLOR,
    })
  );

  const offset = (stage.width + PUSHER_OVERFLOW_DISTANCE / 2) / NUM_PUSHERS;
  const minTopPusherX =
    -stage.width / 2 + PUSHER_SIZE - PUSHER_OVERFLOW_DISTANCE;
  const maxTopPusherX =
    stage.width / 2 - PUSHER_SIZE + PUSHER_OVERFLOW_DISTANCE;
  const topPushers: Entity[] = [];
  for (let i = 0; i < NUM_PUSHERS; i++) {
    const x = minTopPusherX + offset * i;
    const y = -thirdHeight - WALL_THICKNESS / 2 - PUSHER_SIZE / 2;

    const pusher = stage.spawn(
      rightTriangleDefinition({
        position: [x, y],
        width: PUSHER_SIZE,
        height: PUSHER_SIZE,
        color: PUSHER_COLOR,
        bodyType: "kinematic",
        velocity: [60, 0],
      })
    );
    topPushers.push(pusher);
  }

  const middlePushers: Entity[] = [];
  const minMiddlePusherX =
    stage.width / 2 - PUSHER_SIZE + PUSHER_OVERFLOW_DISTANCE;
  const maxMiddlePusherX =
    -stage.width / 2 + PUSHER_SIZE / 2 - PUSHER_OVERFLOW_DISTANCE;
  for (let i = 0; i < NUM_PUSHERS; i++) {
    const x = minMiddlePusherX - offset * i;
    const y = thirdHeight - WALL_THICKNESS / 2 - PUSHER_SIZE / 2;

    const pusher = stage.spawn(
      rightTriangleDefinition({
        position: [x, y],
        rotation: -Math.PI / 2,
        width: PUSHER_SIZE,
        height: PUSHER_SIZE,
        color: PUSHER_COLOR,
        bodyType: "kinematic",
        velocity: [-60, 0],
      })
    );
    middlePushers.push(pusher);
  }

  const bottomPushers: Entity[] = [];
  const minBottomPusherX =
    -stage.width / 2 + PUSHER_SIZE - PUSHER_OVERFLOW_DISTANCE;
  const maxBottomPusherX =
    stage.width / 2 - PUSHER_SIZE + PUSHER_OVERFLOW_DISTANCE;
  for (let i = 0; i < NUM_PUSHERS; i++) {
    const x = minTopPusherX + offset * i;
    const y = stage.height / 2 - WALL_THICKNESS - PUSHER_SIZE / 2;

    const pusher = stage.spawn(
      rightTriangleDefinition({
        position: [x, y],
        width: PUSHER_SIZE,
        height: PUSHER_SIZE,
        color: PUSHER_COLOR,
        bodyType: "kinematic",
        velocity: [60, 0],
      })
    );
    bottomPushers.push(pusher);
  }

  const constrainPushers = () => {
    for (const pusher of topPushers) {
      if (pusher.position[0] > maxTopPusherX) {
        pusher.position[0] = minTopPusherX;
      }
    }
    for (const pusher of middlePushers) {
      if (pusher.position[0] < maxMiddlePusherX) {
        pusher.position[0] = minMiddlePusherX;
      }
    }
    for (const pusher of bottomPushers) {
      if (pusher.position[0] > maxBottomPusherX) {
        pusher.position[0] = minBottomPusherX;
      }
    }
  };

  // Init
  spawnWalls();
  return {
    stage,
    constrainPushers,
    finishLine,
  };
}

export default createScene;
