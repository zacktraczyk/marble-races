import {
  EVENTS,
  legAnalyticsProperties,
  raceAnalyticsProperties,
} from "@lib/analytics/events";
import { captureEvent } from "@lib/analytics/capture";
import { isRacePlayable, type RaceDocument } from "@races/types";
import type { RaceBuilderEvent } from "./events";

type RaceBuilderAnalyticsOptions = {
  setupCompleted?: boolean;
  onSetupCompleted?: (race: RaceDocument) => void;
};

/** Maps persisted race-builder product events onto the analytics contract. */
export const createRaceBuilderAnalytics = ({
  setupCompleted = false,
  onSetupCompleted,
}: RaceBuilderAnalyticsOptions = {}) => {
  let setupCompletedCaptured = setupCompleted;

  return (events: readonly RaceBuilderEvent[]) => {
    for (const event of events) {
      if (event.type === "race_setup_autofilled") {
        captureEvent(EVENTS.RACE_SETUP_AUTOFILLED, {
          ...raceAnalyticsProperties(event.race),
          generated_leg_count: event.generatedLegCount,
          removed_leg_count: event.removedLegCount,
        });
      } else if (event.type === "leg_created") {
        captureEvent(EVENTS.LEG_CREATED, {
          ...legAnalyticsProperties(event.race, event.legNumber),
          creation_source: event.creationSource,
        });
      }
    }

    const race = events.at(-1)?.race;
    if (!race || setupCompletedCaptured || !isRacePlayable(race)) return;
    setupCompletedCaptured = true;
    onSetupCompleted?.(race);
    captureEvent(EVENTS.RACE_SETUP_COMPLETED, raceAnalyticsProperties(race));
  };
};
