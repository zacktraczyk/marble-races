import { describe, expect, test } from "bun:test";
import {
  fallbackEliminationIndex,
  RaceProgression,
} from "@scenes/race-player/progression";

describe("race player progression", () => {
  test("preserves stable participant indices through every elimination", () => {
    const progression = new RaceProgression(4, 3);

    expect(progression.eliminate(2)).toMatchObject({
      legIndex: 1,
      activeParticipantIndices: [0, 1, 3],
      eliminatedParticipantIndices: [2],
      winnerIndex: null,
    });
    expect(progression.eliminate(0)).toMatchObject({
      legIndex: 2,
      activeParticipantIndices: [1, 3],
      eliminatedParticipantIndices: [2, 0],
      winnerIndex: null,
    });
    expect(progression.eliminate(3)).toMatchObject({
      legIndex: 2,
      activeParticipantIndices: [1],
      eliminatedParticipantIndices: [2, 0, 3],
      winnerIndex: 1,
    });
  });

  test("restarts the original field and rejects invalid transitions", () => {
    const progression = new RaceProgression(3, 2);

    progression.eliminate(1);
    expect(() => progression.eliminate(1)).toThrow("is not active");
    expect(progression.restart()).toEqual({
      legIndex: 0,
      activeParticipantIndices: [0, 1, 2],
      eliminatedParticipantIndices: [],
      winnerIndex: null,
    });
  });

  test("chooses the last active stable index as the timeout fallback", () => {
    expect(fallbackEliminationIndex([0, 3, 8])).toBe(8);
    expect(() => fallbackEliminationIndex([])).toThrow("empty race field");
  });
});
