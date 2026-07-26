import type { Color } from "@engine/core/color";
import type { EntityDefinition } from "@engine/core/definition";
import type { RenderPrimitive } from "@engine/vdu/component";
import { Camera2D } from "@engine/camera/camera2d";
import Stage from "@engine/stage";
import { VDU } from "@engine/vdu/vdu";
import { marbleDefinition } from "@game/prefabs/marble";
import { rectangleDefinition } from "@game/prefabs/primitives/rectangle";
import type { VduScenarioConfig, VduScenarioName } from "../shared/types";

export interface BenchmarkScene {
  stage: Stage;
  vdu: VDU;
  update(deltaMs?: number): void;
  render(): void;
  dispose(): void;
}

const WORLD_WIDTH = 1_000;
const WORLD_HEIGHT = 1_000;

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const colorFor = (random: () => number): Color => [
  0.2 + random() * 0.7,
  0.2 + random() * 0.7,
  0.2 + random() * 0.7,
  1,
];

const positionFor = (
  index: number,
  count: number,
  random: () => number
): [number, number] => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const width = 900;
  const height = 900;
  return [
    -width / 2 + ((column + 0.5) * width) / columns + (random() - 0.5) * 2,
    -height / 2 + ((row + 0.5) * height) / rows + (random() - 0.5) * 2,
  ];
};

const renderOnlyDefinition = ({
  position,
  primitive,
  color,
  scale = [1, 1],
}: {
  position: [number, number];
  primitive: RenderPrimitive;
  color: Color;
  scale?: [number, number];
}): EntityDefinition => ({
  transform: { position },
  render: {
    parts: [
      {
        primitive,
        color,
        localTransform: { position: [0, 0], scale },
      },
    ],
  },
});

const populateContiguous = (
  stage: Stage,
  count: number,
  random: () => number
) => {
  for (let index = 0; index < count; index++) {
    stage.spawn(
      renderOnlyDefinition({
        position: positionFor(index, count, random),
        primitive: { type: "circle", radius: 1 },
        color: colorFor(random),
        scale: [6, 6],
      })
    );
  }
};

const populateGroupedRuns = (
  stage: Stage,
  count: number,
  random: () => number,
  blockSize = 32
) => {
  for (let index = 0; index < count; index++) {
    const circle = Math.floor(index / blockSize) % 2 === 0;
    stage.spawn(
      renderOnlyDefinition({
        position: positionFor(index, count, random),
        primitive: circle
          ? { type: "circle", radius: 1 }
          : { type: "rectangle", width: 1, height: 1 },
        color: colorFor(random),
        scale: [6, 6],
      })
    );
  }
};

const populateFragmented = (
  stage: Stage,
  count: number,
  random: () => number
) => populateGroupedRuns(stage, count, random, 1);

const populateUniqueMeshes = (
  stage: Stage,
  count: number,
  random: () => number
) => {
  for (let index = 0; index < count; index++) {
    stage.spawn(
      renderOnlyDefinition({
        position: positionFor(index, count, random),
        // Geometry identity changes while screen size stays nearly constant.
        primitive: { type: "circle", radius: 1 + index / 1_000_000 },
        color: colorFor(random),
        scale: [6, 6],
      })
    );
  }
};

/** Mirrors the debug scene's 80 marbles and four walls with a seeded layout. */
const populateRandomBalls = (
  stage: Stage,
  count: number,
  random: () => number
) => {
  const wallColor: Color = [0.1, 0.75, 0.25, 1];
  const walls: Array<{
    position: [number, number];
    primitive: RenderPrimitive;
  }> = [
    {
      position: [0, 475],
      primitive: { type: "rectangle", width: 1_000, height: 50 },
    },
    {
      position: [-475, 0],
      primitive: { type: "rectangle", width: 50, height: 900 },
    },
    {
      position: [475, 0],
      primitive: { type: "rectangle", width: 50, height: 900 },
    },
    {
      position: [0, -475],
      primitive: { type: "rectangle", width: 1_000, height: 50 },
    },
  ];
  for (const wall of walls) {
    stage.spawn(renderOnlyDefinition({ ...wall, color: wallColor }));
  }
  for (let index = 0; index < count; index++) {
    stage.spawn(
      renderOnlyDefinition({
        position: [random() * 880 - 440, random() * 880 - 440],
        primitive: { type: "circle", radius: 1 },
        color: [0.1, 0.2, 0.5 + random() * 0.5, 1],
        scale: [15, 15],
      })
    );
  }
};

const populateFullRace = (
  stage: Stage,
  count: number,
  random: () => number,
  physics: boolean
) => {
  const wallColor: Color = [0.18, 0.2, 0.25, 1];
  const walls = [
    { position: [0, -470] as [number, number], width: 950, height: 30 },
    { position: [-470, 0] as [number, number], width: 30, height: 950 },
    { position: [470, 0] as [number, number], width: 30, height: 950 },
    { position: [-180, -120] as [number, number], width: 500, height: 20 },
    { position: [180, 120] as [number, number], width: 500, height: 20 },
  ];
  for (const wall of walls) {
    stage.spawn(
      rectangleDefinition({
        ...wall,
        color: wallColor,
        physical: physics,
      })
    );
  }

  for (let index = 0; index < count; index++) {
    const position = positionFor(index, count, random);
    stage.spawn(
      marbleDefinition({
        position,
        radius: 7,
        color: colorFor(random),
        velocity: physics ? [random() * 80 - 40, random() * 80 - 40] : [0, 0],
        decorated: true,
        physical: physics,
      })
    );
  }
};

const populateScenario = (
  stage: Stage,
  config: VduScenarioConfig,
  random: () => number
) => {
  switch (config.name) {
    case "random-balls":
      populateRandomBalls(stage, config.count, random);
      return;
    case "contiguous":
      populateContiguous(stage, config.count, random);
      return;
    case "grouped-runs":
      populateGroupedRuns(stage, config.count, random);
      return;
    case "fragmented":
      populateFragmented(stage, config.count, random);
      return;
    case "unique-meshes":
      populateUniqueMeshes(stage, config.count, random);
      return;
    case "full-race":
      populateFullRace(stage, config.count, random, config.physics);
      return;
  }
};

export const DEFAULT_SCENARIO_COUNTS: Record<VduScenarioName, number> = {
  "random-balls": 80,
  contiguous: 2_500,
  "grouped-runs": 2_500,
  fragmented: 2_500,
  "unique-meshes": 1_000,
  "full-race": 80,
};

export const createBenchmarkScene = (
  canvas: HTMLCanvasElement,
  config: VduScenarioConfig
): BenchmarkScene => {
  const camera = new Camera2D();
  const vdu = new VDU(canvas, camera, { renderStrategy: config.renderer });
  const stage = new Stage({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    vdu,
  });
  stage.physicsEnabled = config.physics;
  camera.fit({
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight,
    contentWidth: WORLD_WIDTH,
    contentHeight: WORLD_HEIGHT,
  });
  populateScenario(stage, config, mulberry32(config.seed));

  return {
    stage,
    vdu,
    update(deltaMs = 1000 / 60) {
      if (config.physics) {
        stage.update(deltaMs);
      }
    },
    render() {
      stage.render();
    },
    dispose() {
      stage.dispose();
    },
  };
};
