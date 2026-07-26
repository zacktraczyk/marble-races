import {
  MAX_RACE_PARTICIPANTS,
  createDefaultLeg,
  createDefaultParticipants,
} from "@races/defaults";
import { MARBLES_PER_TEAM_OPTIONS, requiredLegCount } from "@races/types";
import { createExitAnimator } from "@ui/exitAnimation";
import { legCountLabel } from "../../format";
import { wireLegListReorder } from "./dragReorder";
import type { RaceBuilderContext } from "./context";
import { fitTextArea } from "./render";

/**
 * Binds every top-level race-builder control (name, marble counts, sliders,
 * add/complete leg, sticky legs header) once. Returns a dispose callback.
 */
export const bindRaceBuilderControls = (
  context: RaceBuilderContext
): (() => void) => {
  const { ui, repository, signal } = context;

  let stickyHeaderObserver: IntersectionObserver | null = null;
  if (ui.legsHeader && ui.legsDivider) {
    const legsHeader = ui.legsHeader;
    // The header is pinned exactly when the divider above it has scrolled
    // out of view (of the column scroller on lg, the viewport on mobile).
    stickyHeaderObserver = new IntersectionObserver(([entry]) => {
      const stuck = !entry.isIntersecting;
      legsHeader.classList.toggle("border-line", stuck);
      legsHeader.classList.toggle("border-transparent", !stuck);
    });
    stickyHeaderObserver.observe(ui.legsDivider);
  }

  const popoverExit = ui.setupPopover
    ? createExitAnimator(ui.setupPopover)
    : null;
  const setSetupPopoverOpen = (open: boolean) => {
    if (!ui.setupToggle || !ui.setupPopover) return;
    ui.setupToggle.setAttribute("aria-expanded", `${open}`);
    if (open) {
      popoverExit?.cancel();
      ui.setupPopover.hidden = false;
    } else if (!ui.setupPopover.hidden) {
      const popover = ui.setupPopover;
      popoverExit?.close(() => {
        popover.hidden = true;
      });
    }
  };
  ui.setupToggle?.addEventListener(
    "click",
    () =>
      setSetupPopoverOpen(
        ui.setupToggle?.getAttribute("aria-expanded") !== "true"
      ),
    { signal }
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !ui.setupPopover ||
        ui.setupPopover.hidden ||
        !(event.target instanceof Node)
      )
        return;
      if (
        ui.setupPopover.contains(event.target) ||
        ui.setupToggle?.contains(event.target)
      )
        return;
      setSetupPopoverOpen(false);
    },
    { signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !ui.setupPopover || ui.setupPopover.hidden)
        return;
      setSetupPopoverOpen(false);
      ui.setupToggle?.focus();
    },
    { signal }
  );

  const setParticipantCount = (nextCount: number) => {
    if (!context.race || nextCount < 2 || nextCount > MAX_RACE_PARTICIPANTS)
      return;
    const defaults = createDefaultParticipants(nextCount);
    const saved = context.saveRace({
      ...context.race,
      participants: defaults.map(
        (participant, index) => context.race!.participants[index] ?? participant
      ),
    });
    context.onEvents([{ type: "race_updated", race: saved }]);
  };

  ui.nameInput?.addEventListener("input", () => fitTextArea(ui.nameInput), {
    signal,
  });
  ui.nameInput?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        ui.nameInput?.blur();
      }
    },
    { signal }
  );
  ui.nameInput?.addEventListener(
    "change",
    () => {
      if (!context.race || !ui.nameInput) return;
      const name = ui.nameInput.value.replace(/\s+/g, " ").trim();
      context.saveRace({ ...context.race, name: name || "Untitled race" });
    },
    { signal }
  );
  ui.descriptionInput?.addEventListener(
    "input",
    () => fitTextArea(ui.descriptionInput),
    { signal }
  );
  ui.descriptionInput?.addEventListener(
    "change",
    () => {
      if (!context.race || !ui.descriptionInput) return;
      context.saveRace({
        ...context.race,
        description: ui.descriptionInput.value.trim(),
      });
    },
    { signal }
  );
  ui.marblesMinus?.addEventListener(
    "click",
    () =>
      context.race && setParticipantCount(context.race.participants.length - 1),
    { signal }
  );
  ui.marblesPlus?.addEventListener(
    "click",
    () =>
      context.race && setParticipantCount(context.race.participants.length + 1),
    { signal }
  );
  ui.marblesPerTeamSlider?.addEventListener(
    "input",
    () => {
      if (!ui.marblesPerTeamSlider || !ui.marblesPerTeamOutput) return;
      const option =
        MARBLES_PER_TEAM_OPTIONS[Number(ui.marblesPerTeamSlider.value)];
      if (option !== undefined) ui.marblesPerTeamOutput.value = `${option}`;
    },
    { signal }
  );
  ui.marblesPerTeamSlider?.addEventListener(
    "change",
    () => {
      if (!context.race || !ui.marblesPerTeamSlider) return;
      const option =
        MARBLES_PER_TEAM_OPTIONS[Number(ui.marblesPerTeamSlider.value)];
      if (option === undefined || option === context.race.rules.marblesPerTeam)
        return;
      context.saveRace({
        ...context.race,
        rules: { ...context.race.rules, marblesPerTeam: option },
      });
    },
    { signal }
  );
  ui.addLegButton?.addEventListener(
    "click",
    () => {
      if (
        !context.race ||
        context.race.legs.length >= requiredLegCount(context.race)
      )
        return;
      const leg = createDefaultLeg({ index: context.race.legs.length });
      context.race = repository.addLeg(context.race.id, leg);
      context.onEvents([
        {
          type: "leg_created",
          race: context.race,
          legNumber: context.race.legs.length,
          creationSource: "add_leg",
        },
      ]);
      window.location.assign(context.editLegUrl(leg.id));
    },
    { signal }
  );
  wireLegListReorder(context);
  ui.completeRaceButton?.addEventListener(
    "click",
    () => {
      if (!context.race) return;
      const needed = requiredLegCount(context.race);
      if (
        context.race.legs.length > needed &&
        !window.confirm(
          `Remove the final ${legCountLabel(context.race.legs.length - needed)} to match the team count?`
        )
      ) {
        return;
      }
      const previousLegCount = context.race.legs.length;
      const next = structuredClone(context.race);
      next.legs.splice(needed);
      const existingLegCount = next.legs.length;
      while (next.legs.length < needed) {
        next.legs.push(createDefaultLeg({ index: next.legs.length }));
      }
      const generatedLegCount = next.legs.length - existingLegCount;
      const removedLegCount = Math.max(previousLegCount - needed, 0);
      const saved = context.saveRace(next);
      context.onEvents([
        {
          type: "race_setup_autofilled",
          race: saved,
          generatedLegCount,
          removedLegCount,
        },
        ...Array.from({ length: generatedLegCount }, (_, offset) => ({
          type: "leg_created" as const,
          race: saved,
          legNumber: existingLegCount + offset + 1,
          creationSource: "complete_setup" as const,
        })),
      ]);
    },
    { signal }
  );

  return () => stickyHeaderObserver?.disconnect();
};
