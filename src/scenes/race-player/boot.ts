import { RaceRepository } from "@races/repository";
import { isRacePlayable, type RaceDocument } from "@races/types";
import { EVENTS, raceAnalyticsProperties } from "@lib/analytics/events";
import { captureEvent, reportOperationFailure } from "@lib/analytics/capture";
import { mountScene } from "../mount";
import { raceBuilderUrl } from "../urls";
import createRacePlayerScene from "./index";

type PageErrorAction = {
  href: string;
  label: string;
};

type ShowPageErrorOptions = {
  title: string;
  copy: string;
  action?: PageErrorAction;
  stateSelector?: string;
  titleSelector?: string;
  copySelector?: string;
  actionSelector?: string;
};

/** Reveals a full-page error panel (race player style). */
const showPageErrorState = ({
  title,
  copy,
  action = { href: "/", label: "Return to library" },
  stateSelector = "#race-error-state",
  titleSelector = "#race-error-title",
  copySelector = "#race-error-copy",
  actionSelector = "#race-error-action",
}: ShowPageErrorOptions) => {
  const errorState = document.querySelector<HTMLElement>(stateSelector);
  const errorTitle = document.querySelector<HTMLElement>(titleSelector);
  const errorCopy = document.querySelector<HTMLElement>(copySelector);
  const errorAction = document.querySelector<HTMLAnchorElement>(actionSelector);
  if (errorState) errorState.hidden = false;
  if (errorTitle) errorTitle.textContent = title;
  if (errorCopy) errorCopy.textContent = copy;
  if (errorAction) {
    errorAction.href = action.href;
    errorAction.textContent = action.label;
  }
};

const resolveRace = (): RaceDocument | null => {
  const raceId = new URLSearchParams(window.location.search).get("race") ?? "";
  return new RaceRepository().get(raceId);
};

/** Validates the race query and mounts the player, or shows an error state. */
export const bootRacePlayer = () => {
  const race = resolveRace();
  const player = document.querySelector<HTMLElement>("#race-player");

  if (!race) {
    captureEvent(EVENTS.SURFACE_BLOCKED, {
      surface: "race_player",
      reason: "not_found",
    });
    showPageErrorState({
      title: "Race not found",
      copy: "It may have been deleted from this browser.",
    });
    return;
  }
  if (!isRacePlayable(race)) {
    captureEvent(EVENTS.SURFACE_BLOCKED, {
      surface: "race_player",
      reason: "setup_incomplete",
    });
    showPageErrorState({
      title: "Race setup is incomplete",
      copy: "A race needs exactly one leg for each team that will be eliminated.",
      action: {
        href: raceBuilderUrl(race.id),
        label: "Open race builder",
      },
    });
    return;
  }
  if (!player) {
    reportOperationFailure({
      surface: "race_player",
      operation: "load_race_player",
      reason: "missing_root",
      error: new Error("Race player root element is missing"),
    });
    return;
  }

  const backLinks = document.querySelectorAll<HTMLAnchorElement>(
    "[data-race-back-link]"
  );
  for (const backLink of backLinks) {
    backLink.href = raceBuilderUrl(race.id);
  }
  player.hidden = false;
  try {
    mountScene(
      createRacePlayerScene(race, player, {
        onLifecycleEvent: (event) => {
          const raceProperties = raceAnalyticsProperties(race);
          if (event.type === "started") {
            captureEvent(EVENTS.RACE_STARTED, {
              ...raceProperties,
              run_number: event.runNumber,
            });
            return;
          }
          captureEvent(EVENTS.RACE_COMPLETED, {
            ...raceProperties,
            duration_ms: event.durationMs,
            run_number: event.runNumber,
            winner_team_index: event.winnerTeamIndex,
          });
        },
      }),
      {
        errorElement: document.querySelector<HTMLElement>("#race-error"),
        onError: (error, phase) => {
          const reason =
            phase === "load" ? "initialization_error" : "runtime_error";
          reportOperationFailure({
            surface: "race_player",
            operation: "load_race_player",
            reason,
            error,
          });
        },
      }
    );
  } catch (error) {
    reportOperationFailure({
      surface: "race_player",
      operation: "load_race_player",
      reason: "initialization_error",
      error,
    });
    showPageErrorState({
      title: "Race could not start",
      copy: `${error}`,
    });
    player.hidden = true;
  }
};
