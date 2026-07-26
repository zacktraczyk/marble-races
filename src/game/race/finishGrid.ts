import type { Vec2 } from "@engine/core/transform";
import { applyTransform } from "@engine/core/transform";

const assertPositiveFinite = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
};

export interface FinishBayOptions {
  width: number;
  height: number;
  wallThickness: number;
  teamCount: number;
}

interface FinishBayInnerSize {
  gridWidth: number;
  gridHeight: number;
}

/** Inner width of one team bay: the rack width minus its walls, split evenly. */
export const finishBayInnerWidth = ({
  width,
  wallThickness,
  bayCount,
}: {
  width: number;
  wallThickness: number;
  bayCount: number;
}): number => (width - wallThickness * (bayCount + 1)) / bayCount;

/** Inner size of each team bay once the rack walls are carved out. */
export const finishBayInnerSize = ({
  width,
  height,
  wallThickness,
  teamCount,
}: FinishBayOptions): FinishBayInnerSize => {
  assertPositiveFinite(width, "Finish rack width");
  assertPositiveFinite(height, "Finish rack height");
  assertPositiveFinite(wallThickness, "Finish wall thickness");
  if (!Number.isInteger(teamCount) || teamCount < 1) {
    throw new Error("Team count must be a positive integer");
  }
  const gridWidth = finishBayInnerWidth({
    width,
    wallThickness,
    bayCount: teamCount,
  });
  const gridHeight = height - wallThickness * 2;
  if (gridWidth <= 0 || gridHeight <= 0) {
    throw new Error(
      `A ${width}×${height} finish rack cannot fit ${teamCount} team bays`
    );
  }
  return { gridWidth, gridHeight };
};

/**
 * Row cap for packed finish grids. When a bay is so narrow that a grid would
 * stack deeper than this, the layout falls back to shrinking the marble
 * radius instead of growing the rack without bound.
 */
export const MAX_FINISH_ROWS = 24;

export interface PackedFinishOptions {
  width: number;
  wallThickness: number;
  bayCount: number;
  marblesPerTeam: number;
  marbleRadius?: number;
  minimumRadius?: number;
  gap?: number;
  maxRows?: number;
}

export interface PackedFinishLayout {
  columns: number;
  rows: number;
  marbleRadius: number;
  /** Vertical center-to-center spacing between rows (tight packing). */
  pitch: number;
  /**
   * Horizontal center-to-center spacing between columns, edge-to-edge (the
   * first and last columns touch the bay walls). At most `pitch`: sub-pitch
   * slack is absorbed by crunching the columns together slightly, never by
   * loose spacing.
   */
  columnPitch: number;
  /** Total slots in the grid; equals marblesPerTeam when rows divide evenly. */
  capacity: number;
  bayInnerWidth: number;
  gridHeight: number;
  rackHeight: number;
  /** True when the radius had to shrink below the requested size to fit. */
  shrunk: boolean;
}

/**
 * Sizes a packed finish grid at a constant marble radius: the column count
 * is the most that span the bay (ceil — leftover sub-pitch slack crunches
 * the columns together slightly rather than spreading them), and the rack
 * height grows with the row count. Race legs pass marble counts already
 * rounded to whole rows (see `roundToFinishGrid`), so their top row is
 * always complete; arbitrary counts get a partial top row.
 */
export const createPackedFinishLayout = ({
  width,
  wallThickness,
  bayCount,
  marblesPerTeam,
  marbleRadius = 4.8,
  minimumRadius = 1.2,
  gap = 0.6,
  maxRows = MAX_FINISH_ROWS,
}: PackedFinishOptions): PackedFinishLayout => {
  assertPositiveFinite(width, "Finish rack width");
  assertPositiveFinite(wallThickness, "Finish wall thickness");
  assertPositiveFinite(marbleRadius, "Finish marble radius");
  assertPositiveFinite(minimumRadius, "Minimum marble radius");
  if (!Number.isInteger(bayCount) || bayCount < 1) {
    throw new Error("Bay count must be a positive integer");
  }
  if (!Number.isInteger(marblesPerTeam) || marblesPerTeam < 1) {
    throw new Error("Marbles per team must be a positive integer");
  }
  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error("Finish marble gap must be finite and non-negative");
  }
  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error("Finish max rows must be a positive integer");
  }

  const bayInnerWidth = finishBayInnerWidth({ width, wallThickness, bayCount });
  if (bayInnerWidth <= 0) {
    throw new Error(`A ${width}-wide finish rack cannot fit ${bayCount} bays`);
  }

  let radius = marbleRadius;
  let shrunk = false;
  const columnsFor = (r: number) =>
    Math.max(1, Math.ceil((bayInnerWidth + gap) / (r * 2 + gap)));

  // Narrow guard: when the marbles would stack deeper than the row cap (or a
  // single marble is wider than its bay), shrink the radius just enough.
  const minimumColumns = Math.ceil(marblesPerTeam / maxRows);
  const neededDiameter = Math.min(
    bayInnerWidth,
    (bayInnerWidth + gap) / minimumColumns - gap
  );
  if (neededDiameter < radius * 2) {
    if (
      !Number.isFinite(neededDiameter) ||
      neededDiameter < minimumRadius * 2
    ) {
      throw new Error(
        `The finish rack cannot fit ${marblesPerTeam} marbles for each of ${bayCount} bays`
      );
    }
    radius = neededDiameter / 2;
    shrunk = true;
  }

  const columns = columnsFor(radius);
  const rows = Math.max(1, Math.ceil(marblesPerTeam / columns));
  const pitch = radius * 2 + gap;
  const gridHeight = rows * pitch - gap;
  const columnPitch =
    columns > 1
      ? Math.min(
          pitch,
          radius * 2 + (bayInnerWidth - columns * radius * 2) / (columns - 1)
        )
      : 0;

  return {
    columns,
    rows,
    marbleRadius: radius,
    pitch,
    columnPitch,
    capacity: columns * rows,
    bayInnerWidth,
    gridHeight,
    rackHeight: gridHeight + wallThickness * 2,
    shrunk,
  };
};

/**
 * Rounds an ideal marble count to fill this bay geometry with whole rows —
 * the count teams actually race with. Redistribution targets rarely divide
 * by the fitted column count, so the count snaps to the nearest full grid
 * (at least one row, at most the row cap).
 */
export const roundToFinishGrid = (
  options: Omit<PackedFinishOptions, "marblesPerTeam"> & {
    idealMarbles: number;
  }
): number => {
  const { idealMarbles, maxRows = MAX_FINISH_ROWS, ...rest } = options;
  assertPositiveFinite(idealMarbles, "Ideal marble count");
  const probe = createPackedFinishLayout({
    ...rest,
    maxRows,
    marblesPerTeam: Math.max(1, Math.round(idealMarbles)),
  });
  const rows = Math.min(
    maxRows,
    Math.max(1, Math.round(idealMarbles / probe.columns))
  );
  return probe.columns * rows;
};

/**
 * The rack height a packed layout needs. Level placement, leg stacking, and
 * the builders all derive height from here so they always agree.
 */
export const finishRackHeightFor = (options: PackedFinishOptions): number =>
  createPackedFinishLayout(options).rackHeight;

export interface FinishMarblePlacement {
  bayIndex: number;
  slotIndex: number;
  position: Vec2;
}

export interface PackedFinishPlacementOptions extends PackedFinishOptions {
  position: Vec2;
  rotation?: number;
}

/**
 * World positions for every finish slot, in every bay (bays are claimed
 * dynamically, so disabled bays simply never receive marbles). Slots fill
 * row-major from the bottom row up, left to right — a liquid fill.
 */
export const createPackedFinishPlacements = (
  options: PackedFinishPlacementOptions
): FinishMarblePlacement[] => {
  const layout = createPackedFinishLayout(options);
  const rotation = options.rotation ?? 0;
  const { wallThickness, bayCount, marblesPerTeam } = options;
  const rackLeft = -options.width / 2;
  const gridBottom = layout.rackHeight / 2 - wallThickness;
  const placements: FinishMarblePlacement[] = [];

  for (let bayIndex = 0; bayIndex < bayCount; bayIndex++) {
    const bayLeft =
      rackLeft +
      wallThickness +
      bayIndex * (layout.bayInnerWidth + wallThickness);
    // Columns spread edge-to-edge; a single column centers in its bay.
    const firstColumnX =
      layout.columns > 1
        ? bayLeft + layout.marbleRadius
        : bayLeft + layout.bayInnerWidth / 2;
    for (let slotIndex = 0; slotIndex < marblesPerTeam; slotIndex++) {
      const column = slotIndex % layout.columns;
      const row = Math.floor(slotIndex / layout.columns);
      placements.push({
        bayIndex,
        slotIndex,
        position: applyTransform(options.position, rotation, [
          firstColumnX + column * layout.columnPitch,
          gridBottom - layout.marbleRadius - row * layout.pitch,
        ]),
      });
    }
  }

  return placements;
};
