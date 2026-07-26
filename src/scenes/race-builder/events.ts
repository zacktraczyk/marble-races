import type { RaceDocument } from "@races/types";

/** Product events emitted by race-builder mutations after persistence succeeds. */
export type RaceBuilderEvent =
  | {
      type: "race_setup_autofilled";
      race: RaceDocument;
      generatedLegCount: number;
      removedLegCount: number;
    }
  | {
      type: "leg_created";
      race: RaceDocument;
      legNumber: number;
      creationSource: "add_leg" | "complete_setup" | "duplicate_leg";
    }
  | {
      type: "race_updated";
      race: RaceDocument;
    };
