import type { Scene, SceneContext } from "@engine/runtime/scene";
import { EVENTS, legAnalyticsProperties } from "@lib/analytics/events";
import { captureEvent } from "@lib/analytics/capture";
import { createLegRoundConfiguration } from "@game/race/legRound";
import { RaceRepository } from "@races/repository";
import { legScheduleInputs } from "@races/schedule";
import { raceBuilderUrl } from "../urls";
import { LegBuilderRuntime, type LegBuilderOptions } from "./runtime";

export type { LegBuilderOptions } from "./runtime";

/** Core leg editor scene — mounts against a root element with optional race wiring. */
function createLegBuilder(
  rootElement: HTMLElement | null,
  options: LegBuilderOptions = {}
): Scene {
  let runtime: LegBuilderRuntime | null = null;

  return {
    load: ({ signal }) => {
      runtime = new LegBuilderRuntime(rootElement, signal, options);
    },
    fixedUpdate: (deltaMs) => runtime?.fixedUpdate(deltaMs),
    update: () => runtime?.updateInterface(),
    render: () => runtime?.render(),
    dispose: () => {
      runtime?.dispose();
      runtime = null;
    },
  };
}

const byId = (id: string) => document.getElementById(id);
const SIDEBAR_OPEN_STORAGE_KEY = "marble:leg-builder:options-open:v1";

const readStoredSidebarOpen = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const storeSidebarOpen = (open: boolean) => {
  try {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, `${open}`);
  } catch {
    // The sidebar still works when browser storage is unavailable.
  }
};

const setupSidebar = () => {
  const builder = byId("leg-builder");
  const sidebar = byId("leg-options-sidebar");
  const sidebarToggle = byId("toggle-sidebar");

  const setSidebarOpen = (open: boolean) => {
    if (!builder || !sidebar || !sidebarToggle) {
      return;
    }

    builder.dataset.sidebarOpen = `${open}`;
    sidebarToggle.setAttribute("aria-expanded", `${open}`);
    sidebarToggle.setAttribute(
      "aria-label",
      open ? "Close options sidebar" : "Open options sidebar"
    );
    sidebarToggle.dataset.tooltip = open ? "Close Sidebar" : "Open Sidebar";
    sidebar.setAttribute("aria-hidden", `${!open}`);
    sidebar.toggleAttribute("inert", !open);
  };

  const onSidebarToggle = () => {
    const open = builder?.dataset.sidebarOpen !== "true";
    setSidebarOpen(open);
    storeSidebarOpen(open);
  };

  setSidebarOpen(readStoredSidebarOpen());
  const readyFrame = window.requestAnimationFrame(() => {
    if (builder) {
      builder.dataset.sidebarReady = "true";
    }
  });
  sidebarToggle?.addEventListener("click", onSidebarToggle);

  return () => {
    window.cancelAnimationFrame(readyFrame);
    sidebarToggle?.removeEventListener("click", onSidebarToggle);
  };
};

const wireRaceHomeLink = () => {
  const builder = byId("leg-builder");
  const homeLink = byId("builder-home-link") as HTMLAnchorElement | null;
  const params = new URLSearchParams(window.location.search);
  const raceId = params.get("race");
  const legId = params.get("leg");
  const repository = new RaceRepository();
  const race = raceId ? repository.get(raceId) : null;
  const raceLeg = race?.legs.find((leg) => leg.id === legId) ?? null;
  const legIndex = race?.legs.findIndex((leg) => leg.id === legId) ?? -1;

  if (race && raceLeg && homeLink) {
    homeLink.href = raceBuilderUrl(race.id);
    const label = homeLink.querySelector("span");
    if (label) {
      label.textContent = `${race.name} · Leg ${legIndex + 1}`;
    }
    for (const role of ["team-count", "marbles-per-team", "release-interval"]) {
      const input = builder?.querySelector<HTMLInputElement>(
        `[data-role="${role}"]`
      );
      if (input) {
        input.disabled = true;
        input.title = "This setting is controlled by the race builder";
      }
    }
  }

  const roundConfiguration =
    race && raceLeg
      ? createLegRoundConfiguration(
          {
            participantCount: race.participants.length,
            marblesPerTeam: race.rules.marblesPerTeam,
            releaseIntervalMs: race.releaseIntervalMs,
            legs: legScheduleInputs(race.legs),
          },
          Math.max(legIndex, 0)
        )
      : null;

  return {
    builder,
    race,
    raceLeg,
    legIndex,
    repository,
    roundConfiguration,
  };
};

/** Page scene for `/leg-builder` — wires race persistence around the leg editor. */
export default function createScene(): Scene {
  let disposeChrome = () => {};
  let inner: Scene | null = null;

  return {
    load: (context: SceneContext) => {
      disposeChrome = setupSidebar();
      const {
        builder,
        race,
        raceLeg,
        legIndex,
        repository,
        roundConfiguration,
      } = wireRaceHomeLink();

      let currentRace = race;
      let currentLeg = raceLeg;
      let capturedFirstEdit = false;
      const currentLegProperties = () =>
        currentRace && legIndex >= 0
          ? legAnalyticsProperties(currentRace, legIndex + 1)
          : null;

      inner = createLegBuilder(builder, {
        ...(currentRace && currentLeg && roundConfiguration
          ? {
              initialLevel: currentLeg.level,
              roundConfiguration,
              onCommit: (level) => {
                if (!currentRace || !currentLeg) {
                  return;
                }
                currentLeg = {
                  ...currentLeg,
                  level: { ...level, name: currentLeg.name },
                };
                currentRace = repository.saveLeg(currentRace.id, currentLeg);
                if (!capturedFirstEdit) {
                  const properties = currentLegProperties();
                  if (properties) {
                    capturedFirstEdit = true;
                    captureEvent(EVENTS.LEG_EDITED, properties);
                  }
                }
              },
              onPreviewStarted: () => {
                const properties = currentLegProperties();
                if (properties) {
                  captureEvent(EVENTS.LEG_PREVIEW_STARTED, properties);
                }
              },
            }
          : {}),
      });
      inner.load?.(context);
      const properties = currentLegProperties();
      if (properties) {
        captureEvent(EVENTS.LEG_EDITOR_OPENED, properties);
      }
    },
    fixedUpdate: (deltaMs) => inner?.fixedUpdate?.(deltaMs),
    update: (deltaMs, interpolation) => inner?.update?.(deltaMs, interpolation),
    render: (interpolation) => inner?.render?.(interpolation),
    dispose: () => {
      inner?.dispose?.();
      inner = null;
      disposeChrome();
    },
  };
}
