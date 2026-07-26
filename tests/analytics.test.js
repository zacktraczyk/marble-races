import { afterEach, describe, expect, test } from "bun:test";
import {
  EVENTS,
  legAnalyticsProperties,
  raceAnalyticsProperties,
} from "../src/lib/analytics/events.ts";
import {
  captureEvent,
  reportException,
  reportOperationFailure,
  setAnalyticsProvider,
} from "../src/lib/analytics/capture.ts";

afterEach(() => setAnalyticsProvider(null));

describe("analytics facade", () => {
  test("derives anonymous race and leg dimensions consistently", () => {
    const race = {
      participants: [{}, {}, {}, {}],
      legs: [{}, {}, {}],
      rules: { marblesPerTeam: 60 },
    };

    expect(raceAnalyticsProperties(race)).toEqual({
      team_count: 4,
      leg_count: 3,
      marbles_per_team: 60,
    });
    expect(legAnalyticsProperties(race, 2)).toEqual({
      team_count: 4,
      leg_count: 3,
      marbles_per_team: 60,
      leg_number: 2,
    });
  });

  test("forwards typed events to the configured provider", () => {
    const captures = [];
    setAnalyticsProvider({
      capture: (event, properties) => captures.push({ event, properties }),
    });

    captureEvent(EVENTS.RACE_CREATED, {
      team_count: 4,
      leg_count: 1,
      marbles_per_team: 60,
    });
    captureEvent(EVENTS.LEG_CREATED, {
      team_count: 4,
      leg_count: 2,
      marbles_per_team: 60,
      leg_number: 2,
      creation_source: "add_leg",
    });

    expect(captures).toEqual([
      {
        event: "race_created",
        properties: {
          team_count: 4,
          leg_count: 1,
          marbles_per_team: 60,
        },
      },
      {
        event: "leg_created",
        properties: {
          team_count: 4,
          leg_count: 2,
          marbles_per_team: 60,
          leg_number: 2,
          creation_source: "add_leg",
        },
      },
    ]);
  });

  test("the default disabled provider is safe during server rendering", () => {
    expect(() => {
      captureEvent(EVENTS.OPERATION_FAILED, {
        surface: "race_player",
        operation: "load_race_player",
        reason: "initialization_error",
      });
      reportException(new Error("not available during SSR"), {
        surface: "race_player",
        operation: "load_race_player",
      });
    }).not.toThrow();
  });

  test("forwards exceptions and stable context to the provider", () => {
    const exceptions = [];
    const error = new Error("player failed");
    setAnalyticsProvider({
      capture: () => {},
      reportException: (exception, context) =>
        exceptions.push({ exception, context }),
    });

    reportException(error, {
      surface: "race_player",
      operation: "load_race_player",
      reason: "runtime_error",
    });

    expect(exceptions).toEqual([
      {
        exception: error,
        context: {
          surface: "race_player",
          operation: "load_race_player",
          reason: "runtime_error",
        },
      },
    ]);
  });

  test("reports technical operation failures through both analytics channels", () => {
    const captures = [];
    const exceptions = [];
    const error = new Error("load failed");
    setAnalyticsProvider({
      capture: (event, properties) => captures.push({ event, properties }),
      reportException: (exception, context) =>
        exceptions.push({ exception, context }),
    });

    reportOperationFailure({
      surface: "race_builder",
      operation: "load_race_builder",
      reason: "initialization_error",
      error,
    });

    expect(captures).toEqual([
      {
        event: "operation_failed",
        properties: {
          surface: "race_builder",
          operation: "load_race_builder",
          reason: "initialization_error",
        },
      },
    ]);
    expect(exceptions).toEqual([
      {
        exception: error,
        context: {
          surface: "race_builder",
          operation: "load_race_builder",
          reason: "initialization_error",
        },
      },
    ]);
  });

  test("captures expected blocked states separately from operation failures", () => {
    const captures = [];
    setAnalyticsProvider({
      capture: (event, properties) => captures.push({ event, properties }),
    });

    captureEvent(EVENTS.SURFACE_BLOCKED, {
      surface: "race_player",
      reason: "setup_incomplete",
    });

    expect(captures).toEqual([
      {
        event: "surface_blocked",
        properties: {
          surface: "race_player",
          reason: "setup_incomplete",
        },
      },
    ]);
  });

  test("provider failures never interrupt the product flow", () => {
    setAnalyticsProvider({
      capture: () => {
        throw new Error("analytics unavailable");
      },
      reportException: () => {
        throw new Error("error reporting unavailable");
      },
    });

    expect(() =>
      captureEvent(EVENTS.LEG_EDITOR_OPENED, {
        team_count: 4,
        leg_count: 3,
        marbles_per_team: 60,
        leg_number: 1,
      })
    ).not.toThrow();
    expect(() => reportException(new Error("product failure"))).not.toThrow();
  });
});
