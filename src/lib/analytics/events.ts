export type RaceAnalyticsProperties = {
  team_count: number;
  leg_count: number;
  marbles_per_team: number;
};

export type LegAnalyticsProperties = RaceAnalyticsProperties & {
  /** One-based position of the leg in its race. */
  leg_number: number;
};

export type AnalyticsSurface =
  | "race_library"
  | "race_builder"
  | "leg_builder"
  | "race_player";

export type AnalyticsOperation =
  | "create_race"
  | "load_race_library"
  | "load_race_builder"
  | "load_leg_builder"
  | "load_race_player";

export type OperationFailureReason =
  | "missing_root"
  | "persistence_error"
  | "initialization_error"
  | "runtime_error";

export type SurfaceBlockedReason = "not_found" | "setup_incomplete";

export type ExceptionContext = {
  surface: AnalyticsSurface;
  operation: AnalyticsOperation;
  reason?: OperationFailureReason;
};

type RaceAnalyticsSource = {
  participants: readonly unknown[];
  legs: readonly unknown[];
  rules: { marblesPerTeam: number };
};

export const raceAnalyticsProperties = (
  race: RaceAnalyticsSource
): RaceAnalyticsProperties => ({
  team_count: race.participants.length,
  leg_count: race.legs.length,
  marbles_per_team: race.rules.marblesPerTeam,
});

export const legAnalyticsProperties = (
  race: RaceAnalyticsSource,
  legNumber: number
): LegAnalyticsProperties => ({
  ...raceAnalyticsProperties(race),
  leg_number: legNumber,
});

/** Source of truth for custom analytics event names. */
export const EVENTS = {
  // A new race was successfully created and persisted from the library form.
  RACE_CREATED: "race_created",

  // A race first reached a playable setup with the required number of legs.
  RACE_SETUP_COMPLETED: "race_setup_completed",

  // Auto-fill successfully persisted the required race-leg changes.
  RACE_SETUP_AUTOFILLED: "race_setup_autofilled",

  // A new leg document was successfully persisted, including generated legs.
  LEG_CREATED: "leg_created",

  // A valid leg finished loading in the editor; capture once per editor load.
  LEG_EDITOR_OPENED: "leg_editor_opened",

  // The first meaningful leg change in an editor session was successfully saved.
  LEG_EDITED: "leg_edited",

  // The user explicitly started previewing an authored leg in the leg builder.
  LEG_PREVIEW_STARTED: "leg_preview_started",

  // A valid full race run began; a page view or countdown alone is not a start.
  RACE_STARTED: "race_started",

  // A race run declared its winner; capture once per completed run.
  RACE_COMPLETED: "race_completed",

  // An expected product state prevented a surface from opening.
  SURFACE_BLOCKED: "surface_blocked",

  // A known product operation failed; use exception reporting for diagnostics.
  OPERATION_FAILED: "operation_failed",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Central contract for custom analytics events.
 *
 * Keep properties anonymous and aggregate-friendly. In particular, do not add
 * race names, descriptions, document IDs, or serialized course data here.
 */
export type AnalyticsEventProperties = {
  [EVENTS.RACE_CREATED]: RaceAnalyticsProperties;
  [EVENTS.RACE_SETUP_COMPLETED]: RaceAnalyticsProperties;
  [EVENTS.RACE_SETUP_AUTOFILLED]: RaceAnalyticsProperties & {
    generated_leg_count: number;
    removed_leg_count: number;
  };
  [EVENTS.LEG_CREATED]: LegAnalyticsProperties & {
    creation_source: "add_leg" | "complete_setup" | "duplicate_leg";
  };
  [EVENTS.LEG_EDITOR_OPENED]: LegAnalyticsProperties;
  [EVENTS.LEG_EDITED]: LegAnalyticsProperties;
  [EVENTS.LEG_PREVIEW_STARTED]: LegAnalyticsProperties;
  [EVENTS.RACE_STARTED]: RaceAnalyticsProperties & {
    run_number: number;
  };
  [EVENTS.RACE_COMPLETED]: RaceAnalyticsProperties & {
    duration_ms: number;
    run_number: number;
    winner_team_index: number;
  };
  [EVENTS.SURFACE_BLOCKED]: {
    surface: AnalyticsSurface;
    reason: SurfaceBlockedReason;
  };
  [EVENTS.OPERATION_FAILED]: {
    surface: AnalyticsSurface;
    operation: AnalyticsOperation;
    /** A stable product reason, not a raw error message. */
    reason: OperationFailureReason;
  };
};

type AnalyticsEventSchemaMatches =
  Exclude<AnalyticsEvent, keyof AnalyticsEventProperties> extends never
    ? Exclude<keyof AnalyticsEventProperties, AnalyticsEvent> extends never
      ? true
      : never
    : never;

const eventSchemaMatches: AnalyticsEventSchemaMatches = true;
void eventSchemaMatches;
