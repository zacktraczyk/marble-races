import type { RaceRepository } from "@races/repository";
import type { RaceDocument } from "@races/types";
import type { RaceBuilderEvent } from "../events";
import type { RaceBuilderUi } from "./elements";

/** Shared mutable state + wiring passed into every race-builder UI module. */
export type RaceBuilderContext = {
  readonly ui: RaceBuilderUi;
  readonly repository: RaceRepository;
  readonly raceId: string;
  readonly signal: AbortSignal;
  race: RaceDocument | null;
  draggedItem: HTMLElement | null;
  pendingFocusLegId: string | null;
  onEvents: (events: readonly RaceBuilderEvent[]) => void;
  render: () => void;
  saveRace: (next: RaceDocument) => RaceDocument;
  editLegUrl: (legId: string) => string;
};
