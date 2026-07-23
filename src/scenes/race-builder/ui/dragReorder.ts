import type { RaceLegDocument } from "../../../races";
import type { RaceBuilderContext } from "./context";

/**
 * Live-reorders the dragged leg item as the pointer moves over the list.
 * Attached once; the actual persisted move happens on `dragend`.
 */
export const wireLegListReorder = (context: RaceBuilderContext) => {
  const { ui, signal } = context;
  ui.legList?.addEventListener(
    "dragover",
    (event) => {
      if (!context.draggedItem || !ui.legList) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const nextSibling = Array.from(ui.legList.children)
        .filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child !== context.draggedItem
        )
        .find((child) => {
          const rect = child.getBoundingClientRect();
          return event.clientY < rect.top + rect.height / 2;
        });
      if ((nextSibling ?? null) === context.draggedItem.nextElementSibling)
        return;
      ui.legList.insertBefore(context.draggedItem, nextSibling ?? null);
      ui.legList
        .querySelectorAll("[data-leg-number]")
        .forEach((numberBadge, position) => {
          numberBadge.textContent = `${position + 1}`.padStart(2, "0");
        });
    },
    { signal }
  );
  ui.legList?.addEventListener("drop", (event) => event.preventDefault(), {
    signal,
  });
};

/**
 * Wires a single leg's drag handle: pointer drag-to-reorder (with a
 * browser-captured drag image before the fade) and arrow-key reordering.
 */
export const wireLegDragHandle = ({
  handle,
  item,
  leg,
  context,
}: {
  handle: HTMLButtonElement;
  item: HTMLElement;
  leg: RaceLegDocument;
  context: RaceBuilderContext;
}) => {
  const { repository, signal, ui } = context;

  handle.addEventListener(
    "keydown",
    (event) => {
      const offset =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!offset || !context.race) return;
      event.preventDefault();
      const from = context.race.legs.findIndex(
        (candidate) => candidate.id === leg.id
      );
      const to = from + offset;
      if (from < 0 || to < 0 || to >= context.race.legs.length) return;
      context.race = repository.moveLeg(context.race.id, leg.id, to);
      context.pendingFocusLegId = leg.id;
      if (ui.legMoveStatus) {
        ui.legMoveStatus.textContent = `“${leg.name}” moved to position ${to + 1} of ${context.race.legs.length}.`;
      }
      context.render();
    },
    { signal }
  );
  handle.addEventListener(
    "dragstart",
    (event) => {
      if (!event.dataTransfer) return;
      context.draggedItem = item;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", leg.id);
      const rect = item.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        item,
        event.clientX - rect.left,
        event.clientY - rect.top
      );
      // Fade after the browser captures the drag image, not before.
      requestAnimationFrame(() => item.classList.add("opacity-40"));
    },
    { signal }
  );
  handle.addEventListener(
    "dragend",
    (event) => {
      context.draggedItem = null;
      item.classList.remove("opacity-40");
      if (!context.race || !ui.legList) return;
      const to = Array.from(ui.legList.children).indexOf(item);
      const from = context.race.legs.findIndex(
        (candidate) => candidate.id === leg.id
      );
      if (event.dataTransfer?.dropEffect !== "none" && to >= 0 && to !== from) {
        context.race = repository.moveLeg(context.race.id, leg.id, to);
      }
      // Re-render even when nothing moved to undo live preview reordering.
      context.render();
    },
    { signal }
  );
};
