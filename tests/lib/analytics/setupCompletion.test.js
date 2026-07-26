import { describe, expect, test } from "bun:test";
import {
  markRaceSetupCompleted,
  wasRaceSetupCompleted,
} from "@lib/analytics/setupCompletion";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

describe("race setup analytics marker", () => {
  test("persists setup completion separately for each race", () => {
    const storage = createStorage();

    expect(wasRaceSetupCompleted("race-a", storage)).toBe(false);
    markRaceSetupCompleted("race-a", storage);

    expect(wasRaceSetupCompleted("race-a", storage)).toBe(true);
    expect(wasRaceSetupCompleted("race-b", storage)).toBe(false);
  });

  test("remains best-effort when storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(wasRaceSetupCompleted("race-a", unavailableStorage)).toBe(false);
    expect(() =>
      markRaceSetupCompleted("race-a", unavailableStorage)
    ).not.toThrow();
  });
});
