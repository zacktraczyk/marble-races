import type { LegFinishPlan } from "../../../game/race/eraSchedule";
import {
  MARBLES_PER_TEAM_OPTIONS,
  MAX_RACE_PARTICIPANTS,
  createLocalId,
  eraScheduleForRace,
  isRacePlayable,
  requiredLegCount,
  type RaceLegDocument,
} from "../../../races";
import { renderLevelThumbnail } from "../../../game/level/thumbnail";
import { openConfirmDelete } from "../../../ui/confirmDelete";
import { legCountLabel } from "../../format";
import { racePlayerUrl } from "../../urls";
import { wireLegDragHandle } from "./dragReorder";
import type { RaceBuilderContext } from "./context";

export const fitTextArea = (input: HTMLTextAreaElement | null) => {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
};

export const render = (context: RaceBuilderContext) => {
  const { ui, repository, signal } = context;
  const race = context.race;
  if (
    !race ||
    !ui.nameInput ||
    !ui.descriptionInput ||
    !ui.playLink ||
    !ui.marbleCount ||
    !ui.marblesMinus ||
    !ui.marblesPlus ||
    !ui.legCount ||
    !ui.setupSummaryPill ||
    !ui.setupWarning ||
    !ui.setupWarningText ||
    !ui.legList ||
    !ui.legTemplate ||
    !ui.addLegButton ||
    !ui.completeRaceButton
  ) {
    return;
  }
  if (document.activeElement !== ui.nameInput) ui.nameInput.value = race.name;
  fitTextArea(ui.nameInput);
  if (document.activeElement !== ui.descriptionInput) {
    ui.descriptionInput.value = race.description;
  }
  fitTextArea(ui.descriptionInput);
  ui.marbleCount.value = `${race.participants.length}`;
  ui.marblesMinus.disabled = race.participants.length <= 2;
  ui.marblesPlus.disabled = race.participants.length >= MAX_RACE_PARTICIPANTS;
  const marblesPerTeam = race.rules.marblesPerTeam;
  if (ui.marblesPerTeamSlider && ui.marblesPerTeamOutput) {
    // Legacy races store 100, which sits between the 96 and 120 stops —
    // park the thumb at the nearest stop but show the true value until the
    // user moves the slider.
    const sliderIndex = MARBLES_PER_TEAM_OPTIONS.reduce(
      (best, option, index) =>
        Math.abs(option - marblesPerTeam) <
        Math.abs(MARBLES_PER_TEAM_OPTIONS[best] - marblesPerTeam)
          ? index
          : best,
      0
    );
    ui.marblesPerTeamSlider.value = `${sliderIndex}`;
    ui.marblesPerTeamOutput.value = `${marblesPerTeam}`;
  }
  const needed = requiredLegCount(race);
  const difference = needed - race.legs.length;
  ui.legCount.textContent = `${race.legs.length} / ${needed}`;
  ui.setupSummaryPill.textContent = `${race.participants.length} teams · ${marblesPerTeam} each`;
  const configured = difference === 0;
  ui.setupWarning.hidden = configured;
  ui.setupWarningText.textContent = configured
    ? ""
    : difference > 0
      ? `Add ${legCountLabel(difference)}`
      : `Remove ${legCountLabel(Math.abs(difference))}`;
  ui.addLegButton.hidden = difference <= 0;
  ui.completeRaceButton.hidden = difference === 0;

  const playable = isRacePlayable(race);
  if (playable) {
    ui.playLink.href = racePlayerUrl(race.id);
    ui.playLink.removeAttribute("data-tooltip");
  } else {
    ui.playLink.removeAttribute("href");
    ui.playLink.dataset.tooltip =
      difference > 0
        ? `Add ${legCountLabel(difference)} to play`
        : `Remove ${legCountLabel(Math.abs(difference))} to play`;
  }
  ui.playLink.setAttribute("aria-disabled", `${!playable}`);
  ui.playLink.classList.toggle("opacity-40", !playable);
  ui.playLink.classList.toggle("cursor-not-allowed", !playable);
  ui.playLink.classList.toggle("hover:transform-none", !playable);

  ui.legList.replaceChildren();
  let handleToFocus: HTMLButtonElement | null = null;
  const startingTeams = race.participants.length;
  // With a complete race the era schedule is deterministic, so thumbnails
  // can show each leg's true finish rack: era bay count plus X'd bays.
  const schedule: LegFinishPlan[] | null = eraScheduleForRace(race);
  race.legs.forEach((leg, index) => {
    const fragment = ui.legTemplate!.content.cloneNode(
      true
    ) as DocumentFragment;
    const item = fragment.querySelector<HTMLElement>("li");
    const number = fragment.querySelector<HTMLElement>("[data-leg-number]");
    const thumbnail = fragment.querySelector<HTMLCanvasElement>(
      "[data-leg-thumbnail]"
    );
    const duplicate = fragment.querySelector<HTMLButtonElement>(
      "[data-duplicate-leg]"
    );
    const remove =
      fragment.querySelector<HTMLButtonElement>("[data-delete-leg]");
    const edit = fragment.querySelector<HTMLAnchorElement>("[data-edit-leg]");
    const handle = fragment.querySelector<HTMLButtonElement>("[data-drag-leg]");
    if (
      !item ||
      !number ||
      !thumbnail ||
      !duplicate ||
      !remove ||
      !edit ||
      !handle
    )
      return;

    number.textContent = `${index + 1}`.padStart(2, "0");
    edit.href = context.editLegUrl(leg.id);
    edit.setAttribute("aria-label", `Edit “${leg.name}”`);
    handle.setAttribute(
      "aria-label",
      `Reorder “${leg.name}”, position ${index + 1} of ${race.legs.length}. Press arrow keys to move.`
    );
    if (leg.id === context.pendingFocusLegId) handleToFocus = handle;
    wireLegDragHandle({ handle, item, leg, context });
    duplicate.addEventListener(
      "click",
      () => {
        if (
          !context.race ||
          context.race.legs.length >= MAX_RACE_PARTICIPANTS - 1
        )
          return;
        const duplicateName = `${leg.name} copy`;
        const copy: RaceLegDocument = {
          ...structuredClone(leg),
          id: createLocalId(),
          name: duplicateName,
          level: { ...structuredClone(leg.level), name: duplicateName },
        };
        context.race = repository.addLeg(context.race.id, copy, index + 1);
        context.onEvents([
          {
            type: "leg_created",
            race: context.race,
            legNumber: index + 2,
            creationSource: "duplicate_leg",
          },
        ]);
        context.render();
      },
      { signal }
    );
    remove.addEventListener(
      "click",
      () => {
        if (!context.race) return;
        openConfirmDelete({
          title: "Delete leg?",
          message: `This permanently deletes “${leg.name}”. This can't be undone.`,
          onConfirm: () => {
            if (!context.race) return;
            context.race = repository.deleteLeg(context.race.id, leg.id);
            context.onEvents([{ type: "race_updated", race: context.race }]);
            context.render();
          },
        });
      },
      { signal }
    );

    ui.legList!.append(fragment);
    // One team is eliminated per leg, so later legs race with fewer teams.
    const plan = schedule?.[index];
    renderLevelThumbnail(thumbnail, leg.level, {
      teamCount: plan ? plan.activeTeams : startingTeams - index,
    });
  });
  context.pendingFocusLegId = null;
  (handleToFocus as HTMLButtonElement | null)?.focus();
};
