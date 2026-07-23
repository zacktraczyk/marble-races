import type { RaceDocument } from "../../races/types";

export type UpdateControlsArgs = {
  pauseButtons: readonly HTMLButtonElement[];
  restartButtons: readonly HTMLButtonElement[];
  skipContinueButtons: readonly HTMLButtonElement[];
  winnerDeclared: boolean;
  countdownActive: boolean;
  playbackPaused: boolean;
};

export type UpdateInterfaceArgs = {
  /** The active leg's controller phase, or `"ready"` before one is attached. */
  racePhase: string;
  raceState: string;
  /** `null` while no leg controller is attached yet (nothing to report). */
  releasedCount: number | null;
  finishedCount: number | null;
  statusMessage: string;
  controls: UpdateControlsArgs;
};

/**
 * Owns every DOM read/write for the race player chrome: `[data-role]` text
 * nodes, the `[data-team-index]` roster rows, and the transport controls.
 * Pure presentation — it never decides *what* to show, only how to paint the
 * state `RacePlayerRuntime` hands it.
 */
export class RacePlayerPresenter {
  constructor(private readonly root: HTMLElement) {}

  setText(role: string, text: string) {
    for (const element of this.root.querySelectorAll<HTMLElement>(
      `[data-role="${role}"]`
    )) {
      element.textContent = text;
    }
  }

  updateControls({
    pauseButtons,
    restartButtons,
    skipContinueButtons,
    winnerDeclared,
    countdownActive,
    playbackPaused,
  }: UpdateControlsArgs) {
    for (const button of pauseButtons) {
      // Pause stays available during a transition (only the countdown and a
      // declared winner disable it).
      button.disabled = winnerDeclared || countdownActive;
      button.setAttribute(
        "aria-label",
        playbackPaused ? "Resume race" : "Pause race"
      );
      button.setAttribute("aria-pressed", `${playbackPaused}`);
    }
    for (const button of restartButtons) {
      button.disabled = false;
    }
    for (const button of skipContinueButtons) {
      button.disabled = winnerDeclared || countdownActive;
      button.textContent = "Skip leg";
    }
  }

  updateActiveParticipants(
    raceDocument: RaceDocument,
    activeIndices: readonly number[]
  ) {
    const names = activeIndices.map(
      (index) => raceDocument.participants[index].name
    );
    this.setText("race-active-participants", names.join(", "));
    this.setText("race-active-count", `${activeIndices.length}`);
    for (const row of this.root.querySelectorAll<HTMLElement>(
      "[data-team-index]"
    )) {
      row.dataset.active = `${activeIndices.includes(
        Number(row.dataset.teamIndex)
      )}`;
    }
  }

  updateInterface({
    racePhase,
    raceState,
    releasedCount,
    finishedCount,
    statusMessage,
    controls,
  }: UpdateInterfaceArgs) {
    this.root.dataset.racePhase = racePhase;
    this.root.dataset.raceState = raceState;
    if (releasedCount !== null) {
      this.setText("race-released-count", `${releasedCount}`);
    }
    if (finishedCount !== null) {
      this.setText("race-finished-count", `${finishedCount}`);
    }
    this.setText("race-status", statusMessage);
    this.updateControls(controls);
  }
}
