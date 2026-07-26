import { describe, expect, test } from "bun:test";
import { GridOverlay } from "@scenes/leg-builder/ui/gridOverlay";

const createGridOverlay = (bounds = { min: [-177, -57], max: [169, 81] }) => {
  const properties = new Map();
  const worldPoints = [];
  const stage = {
    width: 400,
    height: 200,
    camera: {
      zoom: 2,
      worldToScreen: (x, y) => {
        worldPoints.push([x, y]);
        return [x * 2 + 400, y * 2 + 200];
      },
    },
  };
  const majorToggle = { dataset: {} };
  const minorToggle = { dataset: {} };
  const overlay = {
    dataset: {},
    hidden: false,
    style: {
      setProperty: (name, value) => properties.set(name, value),
    },
  };
  const grid = new GridOverlay(
    stage,
    majorToggle,
    minorToggle,
    overlay,
    () => bounds
  );
  return {
    grid,
    majorToggle,
    minorToggle,
    overlay,
    properties,
    worldPoints,
  };
};

describe("level builder grid overlay", () => {
  test("aligns its visual dots to the shared boundary-aware snap grid", () => {
    const { grid, majorToggle, minorToggle, overlay, properties, worldPoints } =
      createGridOverlay();

    grid.update();

    expect(majorToggle.ariaChecked).toBe("true");
    expect(majorToggle.dataset.active).toBe("true");
    expect(minorToggle.ariaChecked).toBe("false");
    expect(minorToggle.dataset.active).toBe("false");
    expect(overlay.dataset.majorVisible).toBe("true");
    expect(overlay.dataset.minorVisible).toBe("false");
    expect(overlay.hidden).toBe(false);
    expect(worldPoints).toEqual([[-177, -57]]);
    expect(overlay.style.left).toBe("46px");
    expect(overlay.style.top).toBe("86px");
    expect(overlay.style.width).toBe("692px");
    expect(overlay.style.height).toBe("276px");
    expect(Number.parseFloat(properties.get("--grid-step-x"))).toBeCloseTo(
      27.68
    );
    expect(Number.parseFloat(properties.get("--grid-step-y"))).toBeCloseTo(
      27.6
    );
    expect(properties.get("--grid-major-step-x")).toBe("138.4px");
    expect(properties.get("--grid-major-step-y")).toBe("138px");
    expect(properties.get("--grid-minor-background-x")).toBe("-13.84px");
    expect(properties.get("--grid-minor-background-y")).toBe("-13.8px");
    expect(properties.get("--grid-major-background-x")).toBe("-69.2px");
    expect(properties.get("--grid-major-background-y")).toBe("-69px");
    expect(properties.get("--grid-zoom-opacity")).toBe("1");
  });

  test("subdivides the playable course evenly between opposite walls", () => {
    const { grid, properties } = createGridOverlay({
      min: [-705, -390],
      max: [705, 270],
    });

    grid.update();

    const minorStepX = Number.parseFloat(properties.get("--grid-step-x"));
    const minorStepY = Number.parseFloat(properties.get("--grid-step-y"));
    const majorStepX = Number.parseFloat(properties.get("--grid-major-step-x"));
    const majorStepY = Number.parseFloat(properties.get("--grid-major-step-y"));
    expect(minorStepX * 95).toBeCloseTo(1410 * 2);
    expect(minorStepY * 45).toBeCloseTo(660 * 2);
    expect(majorStepX).toBeCloseTo(minorStepX * 5);
    expect(majorStepY).toBeCloseTo(minorStepY * 5);
    expect(majorStepX * 19).toBeCloseTo(1410 * 2);
    expect(majorStepY * 9).toBeCloseTo(660 * 2);
    expect(
      Number.parseFloat(properties.get("--grid-major-background-x")) * -2
    ).toBeCloseTo(majorStepX);
    expect(
      Number.parseFloat(properties.get("--grid-major-background-y")) * -2
    ).toBeCloseTo(majorStepY);
  });

  test("toggles each grid layer independently and suppresses both in playback", () => {
    const { grid, majorToggle, minorToggle, overlay } = createGridOverlay();

    grid.toggleMinor();
    grid.toggleMajor();
    expect(majorToggle.ariaChecked).toBe("false");
    expect(minorToggle.ariaChecked).toBe("true");
    expect(overlay.hidden).toBe(false);

    grid.setSuppressed(true);
    grid.update();
    expect(overlay.hidden).toBe(true);

    grid.setSuppressed(false);
    grid.update();
    expect(overlay.hidden).toBe(false);

    grid.toggleMinor();
    expect(overlay.hidden).toBe(true);
  });
});
