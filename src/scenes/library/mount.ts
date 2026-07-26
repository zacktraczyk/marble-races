import {
  DEFAULT_MARBLES_PER_TEAM,
  DEFAULT_PARTICIPANT_COUNT,
  MARBLES_PER_TEAM_OPTIONS,
  MAX_RACE_PARTICIPANTS,
  RaceRepository,
  createDefaultRace,
  eraScheduleForRace,
  isRacePlayable,
  requiredLegCount,
} from "@races";
import { renderRaceThumbnail } from "@game/level/thumbnail";
import { openConfirmDelete } from "@ui/confirmDelete";
import { createExitAnimator } from "@ui/exitAnimation";
import { attachTooltip } from "@ui/tooltip";
import {
  captureEvent,
  EVENTS,
  raceAnalyticsProperties,
  reportOperationFailure,
} from "@lib/analytics";
import { legCountLabel } from "../format";
import { raceBuilderUrl } from "../urls";
import { attachThumbnailTour, type ThumbnailTour } from "./thumbnailTour";

/** Mounts the race library grid on `/`. */
export const mountRaceLibrary = () => {
  attachTooltip(document.body);
  const repository = new RaceRepository();
  const grid = document.querySelector<HTMLElement>("#grid");
  const template = document.querySelector<HTMLTemplateElement>("#tile");
  const createTile = document.querySelector<HTMLElement>("#create-tile");

  // The create dialog collects name + setup up front; the race document is
  // only persisted on submit, so cancelling leaves no orphan "Untitled race".
  const dialog = document.querySelector<HTMLDialogElement>("#create-dialog");
  const form = document.querySelector<HTMLFormElement>("#create-form");
  const nameInput = document.querySelector<HTMLInputElement>("#create-name");
  const descriptionInput = document.querySelector<HTMLTextAreaElement>(
    "#create-description"
  );
  const descriptionCount = document.querySelector<HTMLElement>(
    "#create-description-count"
  );
  const teamsMinus = document.querySelector<HTMLButtonElement>(
    "#create-teams-minus"
  );
  const teamsPlus =
    document.querySelector<HTMLButtonElement>("#create-teams-plus");
  const teamCount =
    document.querySelector<HTMLOutputElement>("#create-team-count");
  const marblesSlider =
    document.querySelector<HTMLInputElement>("#create-marbles");
  const marblesOutput = document.querySelector<HTMLOutputElement>(
    "#create-marbles-output"
  );
  const derived = document.querySelector<HTMLElement>("#create-derived");
  const cancel = document.querySelector<HTMLButtonElement>("#create-cancel");

  let participantCount = DEFAULT_PARTICIPANT_COUNT;
  let thumbnailTours: ThumbnailTour[] = [];

  const renderCreateForm = () => {
    if (
      !teamCount ||
      !teamsMinus ||
      !teamsPlus ||
      !marblesSlider ||
      !marblesOutput ||
      !derived
    )
      return;
    teamCount.value = `${participantCount}`;
    teamsMinus.disabled = participantCount <= 2;
    teamsPlus.disabled = participantCount >= MAX_RACE_PARTICIPANTS;
    const marblesPerTeam =
      MARBLES_PER_TEAM_OPTIONS[Number(marblesSlider.value)];
    marblesOutput.value = `${marblesPerTeam}`;
    const legs = participantCount - 1;
    derived.textContent = `${participantCount} teams → ${legs} legs, one team knocked out per leg. Losers' marbles carry over.`;
  };

  const dialogExit = dialog ? createExitAnimator(dialog) : null;
  const closeCreateDialog = () => {
    if (!dialog || !dialog.open) return;
    dialogExit?.close(() => dialog.close());
  };

  const openCreateDialog = () => {
    if (!dialog || !nameInput || !marblesSlider) return;
    dialogExit?.cancel();
    nameInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    if (descriptionCount) descriptionCount.textContent = "0";
    participantCount = DEFAULT_PARTICIPANT_COUNT;
    marblesSlider.value = `${MARBLES_PER_TEAM_OPTIONS.indexOf(DEFAULT_MARBLES_PER_TEAM)}`;
    renderCreateForm();
    if (!dialog.open) dialog.showModal();
  };

  teamsMinus?.addEventListener("click", () => {
    participantCount = Math.max(2, participantCount - 1);
    renderCreateForm();
  });
  teamsPlus?.addEventListener("click", () => {
    participantCount = Math.min(MAX_RACE_PARTICIPANTS, participantCount + 1);
    renderCreateForm();
  });
  marblesSlider?.addEventListener("input", renderCreateForm);
  descriptionInput?.addEventListener("input", () => {
    if (descriptionCount) {
      descriptionCount.textContent = `${descriptionInput.value.length}`;
    }
  });
  cancel?.addEventListener("click", closeCreateDialog);
  // Clicks on the backdrop land on the dialog element itself.
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeCreateDialog();
  });
  // Escape fires `cancel`; intercept it so the exit animation plays first.
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCreateDialog();
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!marblesSlider) return;
    try {
      const race = repository.create(
        createDefaultRace({
          name: nameInput?.value,
          description: descriptionInput?.value,
          participantCount,
          marblesPerTeam: MARBLES_PER_TEAM_OPTIONS[Number(marblesSlider.value)],
        })
      );
      captureEvent(EVENTS.RACE_CREATED, raceAnalyticsProperties(race));
      window.location.assign(raceBuilderUrl(race.id));
    } catch (error) {
      reportOperationFailure({
        surface: "race_library",
        operation: "create_race",
        reason: "persistence_error",
      });
      throw error;
    }
  });

  const renderLibrary = () => {
    if (!grid || !template || !createTile) return;
    for (const tour of thumbnailTours) tour.destroy();
    thumbnailTours = [];
    const races = repository.list();
    grid.replaceChildren();

    const pending: (() => void)[] = [];
    for (const race of races) {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const playable = isRacePlayable(race);
      fragment.querySelector<HTMLAnchorElement>("a")!.href = raceBuilderUrl(
        race.id
      );
      fragment.querySelector("[data-name]")!.textContent = race.name;
      fragment.querySelector("[data-legs]")!.textContent = legCountLabel(
        race.legs.length
      );

      const preview = fragment.querySelector<HTMLElement>("[data-preview]")!;
      const previewFade = fragment.querySelector<HTMLElement>(
        "[data-preview-fade]"
      )!;
      const previewScrollbar = fragment.querySelector<HTMLElement>(
        "[data-preview-scrollbar]"
      )!;
      const previewScrollThumb = fragment.querySelector<HTMLElement>(
        "[data-preview-scroll-thumb]"
      )!;
      previewFade.hidden = race.legs.length === 1;
      const emptyPreview = fragment.querySelector<HTMLElement>(
        "[data-empty-preview]"
      )!;
      if (race.legs.length === 0) {
        emptyPreview.classList.remove("hidden");
        emptyPreview.classList.add("flex");
      } else {
        const canvas = document.createElement("canvas");
        canvas.className = "block w-full";
        preview.append(canvas);
        // With a complete race the era schedule is deterministic, so the
        // preview can show each leg's true finish rack bay count.
        const schedule = eraScheduleForRace(race);
        // Draw after the cards are in the document so sizes are measurable.
        pending.push(() => {
          renderRaceThumbnail(
            canvas,
            race.legs.map((leg, index) => ({
              level: leg.level,
              teamCount:
                schedule?.[index]?.activeTeams ??
                race.participants.length - index,
            })),
            {
              background: "oklch(19% 0.004 285)",
              courseBackground: "oklch(26% 0.005 285)",
              border: "oklch(38% 0.006 285)",
              // Short stacks still fill the preview frame, track centered.
              minHeight: preview.clientHeight,
            }
          );
          if (race.legs.length > 1) {
            thumbnailTours.push(
              attachThumbnailTour(
                preview,
                canvas,
                previewFade,
                previewScrollbar,
                previewScrollThumb
              )
            );
          }
        });
      }

      fragment
        .querySelector<HTMLButtonElement>("[data-duplicate-race]")!
        .addEventListener("click", () => {
          repository.duplicateRace(race.id);
          renderLibrary();
        });
      fragment
        .querySelector<HTMLButtonElement>("[data-delete-race]")!
        .addEventListener("click", () => {
          openConfirmDelete({
            title: "Delete race?",
            message: `This permanently deletes “${race.name}” and all of its legs. This can't be undone.`,
            confirmName: race.name,
            onConfirm: () => {
              repository.delete(race.id);
              renderLibrary();
            },
          });
        });

      const action = fragment.querySelector<HTMLElement>("[data-action]")!;
      action.textContent = playable ? "Preview" : "Finish setup";
      action.classList.add(playable ? "pill-play" : "pill-primary");
      if (!playable) {
        const difference = requiredLegCount(race) - race.legs.length;
        action.dataset.tooltip =
          difference > 0
            ? `Add ${legCountLabel(difference)} to play`
            : `Remove ${legCountLabel(Math.abs(difference))} to play`;
      }
      grid.append(fragment);
    }
    grid.append(createTile);
    for (const draw of pending) draw();
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-create-race]"
  )) {
    button.addEventListener("click", openCreateDialog);
  }
  renderLibrary();
};
