import type { Scene } from "../../engine/runtime/scene";
import type { RaceDocument } from "../../races/types";
import { RacePlayerRuntime, type RacePlayerOptions } from "./runtime";

export type { RacePlayerOptions } from "./runtime";

function createScene(
  raceDocument: RaceDocument,
  rootElement: HTMLElement | null,
  options: RacePlayerOptions = {}
): Scene {
  let runtime: RacePlayerRuntime | null = null;

  return {
    load: ({ signal }) => {
      runtime = new RacePlayerRuntime(
        raceDocument,
        rootElement,
        signal,
        options
      );
    },
    fixedUpdate: (deltaMs) => runtime?.fixedUpdate(deltaMs),
    update: (deltaMs) => runtime?.update(deltaMs),
    render: () => runtime?.render(),
    dispose: () => {
      runtime?.dispose();
      runtime = null;
    },
  };
}

export default createScene;
