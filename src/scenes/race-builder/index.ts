import type { Scene } from "@engine/runtime/scene";
import { EVENTS } from "@lib/analytics/events";
import { captureEvent } from "@lib/analytics/capture";
import {
  markRaceSetupCompleted,
  wasRaceSetupCompleted,
} from "@lib/analytics/setupCompletion";
import { attachTooltip } from "@ui/tooltip";
import { isRacePlayable, RaceRepository, type RaceDocument } from "@races";
import { createRaceBuilderAnalytics } from "./analytics";
import { bindRaceBuilderControls } from "./ui/controls";
import type { RaceBuilderContext } from "./ui/context";
import { resolveRaceBuilderUi } from "./ui/elements";
import { render } from "./ui/render";
import { legBuilderUrl } from "../urls";

/** Thin orchestrator: wires the repository, resolved UI, render, and controls. */
function createRaceBuilder(signal: AbortSignal) {
  attachTooltip(document.body, signal);
  const repository = new RaceRepository();
  const params = new URLSearchParams(window.location.search);
  const raceId = params.get("race") ?? "";
  const ui = resolveRaceBuilderUi();
  const initialRace = repository.get(raceId);
  const initialSetupComplete = initialRace
    ? isRacePlayable(initialRace)
    : false;
  const setupCompletedCaptured =
    initialSetupComplete || wasRaceSetupCompleted(raceId);
  if (initialSetupComplete) markRaceSetupCompleted(raceId);

  const editLegUrl = (legId: string) => legBuilderUrl(raceId, legId);
  const onEvents = createRaceBuilderAnalytics({
    setupCompleted: setupCompletedCaptured,
    onSetupCompleted: (race) => markRaceSetupCompleted(race.id),
  });

  const context: RaceBuilderContext = {
    ui,
    repository,
    raceId,
    signal,
    race: initialRace,
    draggedItem: null,
    pendingFocusLegId: null,
    onEvents,
    render: () => render(context),
    saveRace: (next: RaceDocument) => {
      context.race = repository.save(next);
      context.render();
      return context.race;
    },
    editLegUrl,
  };

  let disposeControls = () => {};

  if (!context.race) {
    captureEvent(EVENTS.SURFACE_BLOCKED, {
      surface: "race_builder",
      reason: "not_found",
    });
    if (ui.missing) ui.missing.hidden = false;
    if (ui.playLink) ui.playLink.hidden = true;
  } else {
    if (ui.builder) ui.builder.hidden = false;
    disposeControls = bindRaceBuilderControls(context);
    render(context);
  }

  return disposeControls;
}

export default function createScene(): Scene {
  let dispose = () => {};

  return {
    load: ({ signal }) => {
      dispose = createRaceBuilder(signal);
    },
    dispose: () => dispose(),
  };
}
