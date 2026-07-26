import { afterEach, describe, expect, test } from "bun:test";
import { setAnalyticsProvider } from "@lib/analytics/capture";
import { createDefaultRace } from "@races/defaults";
import { createRaceBuilderAnalytics } from "@scenes/race-builder/analytics";

afterEach(() => setAnalyticsProvider(null));

describe("race builder analytics", () => {
  test("captures auto-fill, generated legs, and setup completion in order", () => {
    const captures = [];
    const completedRaces = [];
    setAnalyticsProvider({
      capture: (event, properties) => captures.push({ event, properties }),
    });
    const race = createDefaultRace({
      id: "race",
      participantCount: 4,
      legCount: 3,
    });
    const captureEvents = createRaceBuilderAnalytics({
      onSetupCompleted: (completedRace) =>
        completedRaces.push(completedRace.id),
    });

    captureEvents([
      {
        type: "race_setup_autofilled",
        race,
        generatedLegCount: 2,
        removedLegCount: 0,
      },
      {
        type: "leg_created",
        race,
        legNumber: 2,
        creationSource: "complete_setup",
      },
      {
        type: "leg_created",
        race,
        legNumber: 3,
        creationSource: "complete_setup",
      },
    ]);

    expect(captures.map(({ event }) => event)).toEqual([
      "race_setup_autofilled",
      "leg_created",
      "leg_created",
      "race_setup_completed",
    ]);
    expect(captures[0].properties).toMatchObject({
      generated_leg_count: 2,
      removed_leg_count: 0,
      leg_count: 3,
    });
    expect(completedRaces).toEqual(["race"]);
  });

  test("captures an auto-fill that only removed excess legs", () => {
    const captures = [];
    setAnalyticsProvider({
      capture: (event, properties) => captures.push({ event, properties }),
    });
    const race = createDefaultRace({
      id: "race",
      participantCount: 4,
      legCount: 3,
    });
    const captureEvents = createRaceBuilderAnalytics();

    captureEvents([
      {
        type: "race_setup_autofilled",
        race,
        generatedLegCount: 0,
        removedLegCount: 1,
      },
    ]);

    expect(captures.map(({ event }) => event)).toEqual([
      "race_setup_autofilled",
      "race_setup_completed",
    ]);
    expect(captures[0].properties).toMatchObject({
      generated_leg_count: 0,
      removed_leg_count: 1,
    });
  });
});
