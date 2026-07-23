import Stage from "../../engine/stage";
import {
  computeEraSchedule,
  type LegFinishPlan,
} from "../../game/race/eraSchedule";
import { TEAM_COLORS } from "../../game/race/teams";
import {
  isRaceDocument,
  isRacePlayable,
  type RaceDocument,
} from "../../races/types";
import { legScheduleInputs } from "../../races/eraSchedule";
import {
  MAX_MARBLE_RADIUS,
  MIN_MARBLE_RADIUS,
  STAGING_MARBLE_GAP,
} from "../../game/level/constants";
import { computeLegStackLayout, type LegFrame } from "./legStack";
import { fallbackEliminationIndex, RaceProgression } from "./progression";
import { RaceCameraController } from "./raceCamera";
import { RaceCountdown } from "./countdown";
import { RaceRunLifecycle, type RacePlayerLifecycleEvent } from "./lifecycle";
import { RacePlayerPresenter } from "./presenter";
import { setupChromeAutoHide } from "./chromeAutoHide";
import { bindRacePlayerControls, runningLegStatus } from "./controls";
import { LegInstance } from "./legInstance";
import { roundConfigurationFromFinishPlan } from "../../game/race/legRound";
import type { RoundConfiguration } from "../../game/race/types";

/**
 * Fraction of the incoming leg that must be on screen before its marbles start
 * releasing — the "marble transfer" hand-off point mid-scroll.
 */
const NEXT_LEG_RELEASE_FRACTION = 2 / 3;

type EliminationReason = "finished" | "skipped" | "timed-out";

type LegWindow = {
  previous: LegInstance | null;
  current: LegInstance;
  next: LegInstance | null;
};

type Transition = {
  released: boolean;
  oldLeg: LegInstance;
};

/**
 * Vertical padding, in screen pixels, the scrolling camera keeps around the
 * active leg. Horizontal insets stay zero so the leg walls sit flush with the
 * viewport edges.
 */
const CAMERA_INSET = 24;

export type RacePlayerOptions = {
  /** Optional authoring safeguard. Normal races wait until only one team remains. */
  maximumLegDurationMs?: number | null;
  onLifecycleEvent?: (event: RacePlayerLifecycleEvent) => void;
};

export type { RacePlayerLifecycleEvent } from "./lifecycle";

const optionalButtons = (root: HTMLElement, roles: readonly string[]) =>
  roles.flatMap((role) => [
    ...root.querySelectorAll<HTMLButtonElement>(`[data-role="${role}"]`),
  ]);

export class RacePlayerRuntime {
  private readonly raceDocument: RaceDocument;
  private readonly root: HTMLElement;
  private readonly stage: Stage;
  private readonly progression: RaceProgression;
  private readonly maximumLegDurationMs: number | null;
  private readonly lifecycle: RaceRunLifecycle;
  private readonly backLink: HTMLAnchorElement | null;
  private readonly pauseButtons: HTMLButtonElement[];
  private readonly restartButtons: HTMLButtonElement[];
  private readonly skipContinueButtons: HTMLButtonElement[];
  private readonly layout: LegFrame[];
  private readonly finishSchedule: LegFinishPlan[];
  private readonly cameraController: RaceCameraController;
  private readonly presenter: RacePlayerPresenter;
  private readonly countdown = new RaceCountdown();
  private legWindow: LegWindow | null = null;
  private transition: Transition | null = null;
  private legElapsedMs = 0;
  private playbackPaused = false;
  private disposed = false;
  private statusMessage = "";

  constructor(
    raceDocument: RaceDocument,
    rootElement: HTMLElement | null,
    signal: AbortSignal,
    { maximumLegDurationMs = null, onLifecycleEvent }: RacePlayerOptions = {}
  ) {
    if (!isRaceDocument(raceDocument) || !isRacePlayable(raceDocument)) {
      throw new Error(
        "A playable race needs one leg for every team elimination"
      );
    }
    if (raceDocument.participants.length > TEAM_COLORS.length) {
      throw new Error(
        `Race playback supports at most ${TEAM_COLORS.length} teams`
      );
    }
    if (
      maximumLegDurationMs !== null &&
      (!Number.isFinite(maximumLegDurationMs) || maximumLegDurationMs <= 0)
    ) {
      throw new Error("Maximum leg duration must be positive");
    }
    if (!rootElement) {
      throw new Error("Race player root element is required");
    }
    const canvas = rootElement.querySelector<HTMLCanvasElement>("#gl-canvas");
    if (!canvas) {
      throw new Error("Race player requires a #gl-canvas element");
    }

    this.raceDocument = structuredClone(raceDocument);
    this.root = rootElement;
    this.backLink =
      this.root.querySelector<HTMLAnchorElement>("#race-back-link");
    this.presenter = new RacePlayerPresenter(this.root);
    this.maximumLegDurationMs = maximumLegDurationMs;
    this.lifecycle = new RaceRunLifecycle(onLifecycleEvent);
    this.progression = new RaceProgression(
      this.raceDocument.participants.length,
      this.raceDocument.legs.length
    );
    const firstLeg = this.raceDocument.legs[0];
    this.stage = new Stage({
      width: firstLeg.level.size[0],
      height: firstLeg.level.size[1],
      vdu: { canvas },
    });
    // Every leg's finish rack layout — bay counts, X'd bays, and heights —
    // is deterministic (one elimination per leg), so plan the whole race now.
    this.finishSchedule = computeEraSchedule({
      participantCount: this.raceDocument.participants.length,
      marblesPerTeam: this.raceDocument.rules.marblesPerTeam,
      legs: legScheduleInputs(this.raceDocument.legs),
      marbleRadius: MAX_MARBLE_RADIUS,
      minimumRadius: MIN_MARBLE_RADIUS,
      gap: STAGING_MARBLE_GAP,
    });
    this.layout = computeLegStackLayout(
      this.raceDocument.legs,
      this.finishSchedule
    );

    // Size the stage once to the whole stack's bounding box. Nothing in this
    // scene culls against stage bounds anymore (each leg controller owns its
    // own bounds), so this is defensive only.
    const stackWidth = Math.max(...this.layout.map((frame) => frame.size[0]));
    const stackHeight =
      this.layout[this.layout.length - 1].bottom - this.layout[0].top;
    this.stage.setSize(stackWidth, stackHeight);
    // The runtime owns global physics now; enable it once and leave it on.
    // Pausing freezes the sim by skipping `fixedUpdate`, not by toggling this.
    this.stage.physicsEnabled = true;

    this.cameraController = new RaceCameraController(
      canvas,
      this.stage.camera,
      {
        insets: { top: CAMERA_INSET, bottom: CAMERA_INSET, left: 0, right: 0 },
      }
    );

    this.pauseButtons = optionalButtons(this.root, [
      "race-pause-resume",
      "race-toggle",
    ]);
    this.restartButtons = optionalButtons(this.root, ["race-restart"]);
    this.skipContinueButtons = optionalButtons(this.root, [
      "race-skip-continue",
      "race-skip",
      "race-continue",
    ]);
    this.bindControls(signal);
    this.presenter.setText("race-name", this.raceDocument.name);
    setupChromeAutoHide(this.root, signal);

    try {
      this.startRace();
    } catch (error) {
      this.stage.dispose();
      throw error;
    }
  }

  fixedUpdate(deltaMs: number) {
    if (
      this.disposed ||
      this.countdown.active ||
      this.playbackPaused ||
      this.legWindow === null ||
      this.progression.snapshot.winnerIndex !== null
    ) {
      return;
    }

    const legWindow = this.legWindow;
    this.lifecycle.advance(deltaMs);
    legWindow.previous?.fixedUpdate(deltaMs);
    legWindow.current.fixedUpdate(deltaMs);
    if (this.transition?.released) {
      legWindow.next?.fixedUpdate(deltaMs);
    }
    // Single stage-stepping point for the whole stack.
    this.stage.update(deltaMs);

    // While scrolling, the "current" leg is the finished one; its completion
    // has already been consumed, so do not re-trigger a transition from it.
    if (this.transition) {
      return;
    }

    this.legElapsedMs += Math.max(0, deltaMs);
    const snapshot = legWindow.current.controller?.snapshot;
    if (
      snapshot?.phase === "complete" &&
      snapshot.eliminatedTeamIndex !== null
    ) {
      this.beginTransition(snapshot.eliminatedTeamIndex, "finished");
      return;
    }
    if (
      this.maximumLegDurationMs !== null &&
      this.legElapsedMs >= this.maximumLegDurationMs
    ) {
      this.beginTransition(
        fallbackEliminationIndex(
          this.progression.snapshot.activeParticipantIndices
        ),
        "timed-out"
      );
    }
  }

  update(deltaMs: number) {
    if (this.disposed || this.legWindow === null) {
      return;
    }

    const legWindow = this.legWindow;
    // Refit every frame (handles resize); glide progress freezes while paused.
    this.cameraController.update(deltaMs, { advance: !this.playbackPaused });

    if (this.transition && !this.playbackPaused) {
      const nextLeg = legWindow.next;
      if (
        nextLeg &&
        !this.transition.released &&
        this.cameraController.visibleFractionOf(nextLeg.worldRect) >=
          NEXT_LEG_RELEASE_FRACTION
      ) {
        this.releaseNextLeg();
      }
      if (!this.cameraController.gliding) {
        this.finalizeTransition();
      }
    }

    this.updateInterface();
  }

  render() {
    if (!this.disposed) {
      this.stage.render();
    }
  }

  togglePause = () => {
    if (
      this.disposed ||
      this.countdown.active ||
      this.progression.snapshot.winnerIndex !== null
    ) {
      return;
    }

    // Pausing is allowed during a scroll transition: it stops `fixedUpdate`
    // stepping, freezes the camera glide (via `advance`), and gates the
    // release/finalize logic in `update`, so the whole transition simply holds.
    this.playbackPaused = !this.playbackPaused;
    this.statusMessage = this.playbackPaused
      ? "Race paused"
      : this.runningStatus;
    this.updateInterface();
  };

  restart = () => {
    if (this.disposed) {
      return;
    }
    this.teardownLegs();
    this.progression.restart();
    this.presenter.setText("race-eliminated", "");
    this.presenter.setText("race-winner", "");
    this.startRace();
  };

  skipOrContinue = () => {
    if (
      this.disposed ||
      this.countdown.active ||
      this.progression.snapshot.winnerIndex !== null
    ) {
      return;
    }
    if (this.transition) {
      // Jump-cut the scroll; `finalizeTransition` runs on the next update tick.
      this.cameraController.completeGlide();
      return;
    }
    this.beginTransition(
      fallbackEliminationIndex(
        this.progression.snapshot.activeParticipantIndices
      ),
      "skipped"
    );
  };

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.countdown.clear();
    this.teardownLegs();
    this.stage.dispose();
  }

  private updateInterface() {
    if (this.disposed) {
      return;
    }
    const snapshot = this.legWindow?.current.controller?.snapshot;
    this.presenter.updateInterface({
      racePhase: snapshot?.phase ?? "ready",
      raceState: this.currentState,
      releasedCount: snapshot ? snapshot.releasedMarbles : null,
      finishedCount: snapshot ? snapshot.finishedMarbles : null,
      statusMessage: this.statusMessage,
      controls: {
        pauseButtons: this.pauseButtons,
        restartButtons: this.restartButtons,
        skipContinueButtons: this.skipContinueButtons,
        winnerDeclared: this.progression.snapshot.winnerIndex !== null,
        countdownActive: this.countdown.active,
        playbackPaused: this.playbackPaused,
      },
    });
  }

  private bindControls(signal: AbortSignal) {
    bindRacePlayerControls({
      signal,
      backLink: this.backLink,
      pauseButtons: this.pauseButtons,
      restartButtons: this.restartButtons,
      skipContinueButtons: this.skipContinueButtons,
      onPause: this.togglePause,
      onRestart: this.restart,
      onSkipContinue: this.skipOrContinue,
    });
  }

  private updateActiveParticipants() {
    this.presenter.updateActiveParticipants(
      this.raceDocument,
      this.progression.snapshot.activeParticipantIndices
    );
  }

  private get runningStatus() {
    const progression = this.progression.snapshot;
    return runningLegStatus({
      raceDocument: this.raceDocument,
      legIndex: progression.legIndex,
      activeTeamCount: progression.activeParticipantIndices.length,
      marblesPerTeam:
        this.finishSchedule[progression.legIndex]?.marblesPerTeam ??
        this.raceDocument.rules.marblesPerTeam,
      courseIssue: this.legWindow?.current.controller?.snapshot.courseIssue,
    });
  }

  private get currentState() {
    if (this.progression.snapshot.winnerIndex !== null) {
      return "complete";
    }
    if (this.transition !== null) {
      return "transition";
    }
    if (this.countdown.active) {
      return "countdown";
    }
    if (this.playbackPaused) {
      return "paused";
    }
    if (this.legWindow?.current.controller?.snapshot.courseIssue) {
      return "blocked";
    }
    return "running";
  }

  private createRoundConfiguration(legIndex: number): RoundConfiguration {
    return roundConfigurationFromFinishPlan(
      this.finishSchedule[legIndex],
      this.raceDocument.releaseIntervalMs
    );
  }

  private buildLeg(index: number): LegInstance {
    const leg = this.raceDocument.legs[index];
    return new LegInstance({
      stage: this.stage,
      leg,
      frame: this.layout[index],
      configuration: this.createRoundConfiguration(index),
    });
  }

  private teardownLegs() {
    this.countdown.clear();
    this.transition = null;
    const legWindow = this.legWindow;
    if (legWindow) {
      legWindow.previous?.dispose();
      legWindow.current.dispose();
      legWindow.next?.dispose();
      this.legWindow = null;
    }
  }

  private launchCurrentLeg() {
    this.legWindow?.current.controller?.toggleRunning();
    if (this.legWindow?.current.controller?.snapshot.phase === "running") {
      this.lifecycle.startRun();
    }
    this.statusMessage = this.runningStatus;
    this.updateInterface();
  }

  private beginCountdown() {
    this.countdown.begin({
      root: this.root,
      onStatus: (message) => {
        this.statusMessage = message;
        this.updateInterface();
      },
      onComplete: () => this.launchCurrentLeg(),
    });
  }

  /** Publishes the active leg's name, progress, and index for the chrome. */
  private announceLeg(legIndex: number) {
    const leg = this.raceDocument.legs[legIndex];
    this.root.dataset.legIndex = `${legIndex}`;
    this.presenter.setText("race-leg-name", leg.name);
    this.presenter.setText(
      "race-leg-progress",
      `Leg ${legIndex + 1} of ${this.raceDocument.legs.length}`
    );
    this.presenter.setText("race-eliminated", "");
  }

  private startRace() {
    this.lifecycle.prepareRun();
    this.transition = null;
    this.legElapsedMs = 0;
    this.playbackPaused = false;

    const progression = this.progression.snapshot;
    const current = this.buildLeg(progression.legIndex);
    const nextIndex = progression.legIndex + 1;
    const next = this.layout[nextIndex] ? this.buildLeg(nextIndex) : null;
    current.attachController([...progression.activeParticipantIndices]);
    this.legWindow = { previous: null, current, next };

    this.cameraController.snapTo(current.worldRect);

    this.announceLeg(progression.legIndex);
    this.presenter.setText("race-winner", "");
    this.updateActiveParticipants();

    // Leg 0 always opens with the countdown; the stack is otherwise idle.
    this.beginCountdown();
  }

  private beginTransition(
    eliminatedStableIndex: number,
    reason: EliminationReason
  ) {
    const legWindow = this.legWindow;
    if (
      legWindow === null ||
      this.transition !== null ||
      this.progression.snapshot.winnerIndex !== null ||
      !this.progression.snapshot.activeParticipantIndices.includes(
        eliminatedStableIndex
      )
    ) {
      return;
    }

    // On a skip/timeout the leg has no natural survivor yet — freeze whatever is
    // still live into the finish pool so its colors are still drainable above.
    if (reason !== "finished") {
      legWindow.current.controller?.abandon();
    }

    const oldLeg = legWindow.current;
    const result = this.progression.eliminate(eliminatedStableIndex);
    this.updateActiveParticipants();

    if (result.winnerIndex !== null) {
      const winner = this.raceDocument.participants[result.winnerIndex];
      this.statusMessage = `${winner.name} wins ${this.raceDocument.name}!`;
      this.presenter.setText("race-winner", winner.name);
      this.presenter.setText("race-eliminated", "");
      this.lifecycle.completeRun(result.winnerIndex);
      // Camera stays on the final leg; the frozen field is the end tableau.
      this.updateInterface();
      return;
    }

    const nextLeg = legWindow.next;
    if (!nextLeg) {
      // A non-winning elimination always has a leg to scroll to; guard anyway.
      return;
    }

    const participant = this.raceDocument.participants[eliminatedStableIndex];
    this.statusMessage =
      reason === "timed-out"
        ? `Leg timed out — ${participant.name} team is eliminated.`
        : reason === "skipped"
          ? `Leg skipped — ${participant.name} team is eliminated.`
          : `${participant.name} is the only team left on the track and is eliminated.`;
    this.presenter.setText("race-eliminated", participant.name);

    // Each marble the incoming leg releases drains one finished marble of the
    // same color from the bays above, selling the transfer.
    nextLeg.attachController([...result.activeParticipantIndices], {
      onMarbleReleased: (stableTeamIndex) =>
        oldLeg.removeFinishedMarble(stableTeamIndex),
    });

    // At most two finished legs can be alive; retire the older one now.
    if (legWindow.previous) {
      legWindow.previous.dispose();
      legWindow.previous = null;
    }

    this.cameraController.glideTo(nextLeg.worldRect);
    this.transition = { released: false, oldLeg };
    this.updateInterface();
  }

  private releaseNextLeg() {
    this.legWindow?.next?.controller?.toggleRunning();
    const transition = this.transition;
    if (transition) {
      transition.released = true;
    }
  }

  private finalizeTransition() {
    const legWindow = this.legWindow;
    const transition = this.transition;
    if (legWindow === null || transition === null) {
      return;
    }
    const nextLeg = legWindow.next;
    if (!nextLeg) {
      return;
    }

    // If the scroll finished before the 2/3 hand-off fired, release now.
    if (!transition.released) {
      this.releaseNextLeg();
    }
    const oldLeg = transition.oldLeg;
    this.transition = null;

    // Slide the window down one leg and pre-build the following leg's geometry.
    legWindow.previous = oldLeg;
    legWindow.current = nextLeg;
    const legIndex = this.progression.snapshot.legIndex;
    const followingIndex = legIndex + 1;
    legWindow.next = this.layout[followingIndex]
      ? this.buildLeg(followingIndex)
      : null;

    this.legElapsedMs = 0;

    this.announceLeg(legIndex);
    this.statusMessage = this.runningStatus;

    // Drop the just-finished leg immediately if it has already scrolled fully
    // out of view; otherwise it lingers (still ticking motion) until the next
    // transition retires it.
    if (this.cameraController.visibleFractionOf(oldLeg.worldRect) === 0) {
      oldLeg.dispose();
      legWindow.previous = null;
    }

    this.updateInterface();
  }
}
