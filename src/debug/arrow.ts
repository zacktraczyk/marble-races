import { debugArrowDefinition } from "./definitions";
import type { Entity } from "@engine/core/entity";
import type { Scene } from "@engine/runtime/scene";
import Stage from "@engine/stage";
import { rectangleDefinition } from "@game/prefabs/primitives/rectangle";

const ARROW_COLOR: [number, number, number, number] = [0.8, 0.4, 0.6, 1];
const arrowDefinition = (start: [number, number], end: [number, number]) =>
  debugArrowDefinition({
    start,
    end,
    tipLength: 40,
    stroke: 4,
    color: ARROW_COLOR,
  });

function createScene(): Scene {
  const stage = new Stage();
  const center: [number, number] = [0, 0];
  const arrowLength = 150;
  const offset = 50;
  const marker = (
    position: [number, number],
    color: [number, number, number, number]
  ) =>
    stage.spawn(
      rectangleDefinition({
        position,
        width: 40,
        height: 40,
        color,
        physical: false,
      })
    );

  const arrows: [number, number, number, number][] = [];
  for (let first = 0; first < 2; first++) {
    for (let second = 0; second < 2; second++) {
      const baseX =
        center[0] +
        offset * (first % 2 ? 1 : -1) +
        offset * (second % 2 ? 1 : -1);
      const baseY =
        center[1] +
        offset * (second % 2 ? 1 : -1) +
        offset * (first % 2 ? -1 : 1);
      const tipX =
        baseX +
        (arrowLength * (first % 2 ? 1 : -1) +
          arrowLength * (second % 2 ? 1 : -1)) /
          2;
      const tipY =
        baseY +
        (arrowLength * (second % 2 ? 1 : -1) +
          arrowLength * (first % 2 ? -1 : 1)) /
          2;
      arrows.push([baseX, baseY, tipX, tipY]);
    }
  }
  arrows.push([-50, -100, 100, 230]);
  for (const [baseX, baseY, tipX, tipY] of arrows) {
    marker([baseX, baseY], [0.3, 0, 0, 1]);
    marker([tipX, tipY], [0, 0.3, 0, 1]);
    stage.spawn(arrowDefinition([baseX, baseY], [tipX, tipY]));
  }

  const rotatingCenter: [number, number] = [-300, -300];
  marker(rotatingCenter, [0.3, 0, 0, 1]);
  const tipMarker = marker(
    [rotatingCenter[0], rotatingCenter[1] + arrowLength],
    [0, 0.3, 0, 1]
  );
  let rotatingArrow: Entity | null = null;
  let simulationTime = 0;

  return {
    fixedUpdate: (deltaMs) => {
      simulationTime += deltaMs;
      const tip: [number, number] = [
        rotatingCenter[0] + Math.cos(simulationTime / 1000) * arrowLength,
        rotatingCenter[1] + Math.sin(simulationTime / 1000) * arrowLength,
      ];
      tipMarker.position = tip;
      rotatingArrow?.delete();
      rotatingArrow = stage.spawn(arrowDefinition(rotatingCenter, tip));
      stage.update(deltaMs);
    },
    render: () => stage.render(),
    dispose: () => stage.dispose(),
  };
}

export default createScene;
