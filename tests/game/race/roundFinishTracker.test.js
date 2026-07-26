import { describe, expect, test } from "bun:test";
import { RoundFinishTracker } from "@game/race/roundFinishTracker";

describe("round finish tracker", () => {
  test("first team to finish claims the leftmost bay", () => {
    const tracker = new RoundFinishTracker(4, 3);

    expect(tracker.record(2)).toMatchObject({
      bayIndex: 0,
      slotIndex: 0,
    });
    expect(tracker.record(2)).toMatchObject({
      bayIndex: 0,
      slotIndex: 1,
    });

    // The next team to finish claims the next bay to the right.
    expect(tracker.record(0)).toMatchObject({ bayIndex: 1, slotIndex: 0 });

    expect(tracker.finishedMarbles).toBe(3);
    expect(tracker.eliminatedTeamIndex).toBeNull();
  });

  test("identifies the team of the single marble that does not finish", () => {
    const tracker = new RoundFinishTracker(4, 3);
    const finishOrder = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3];

    for (const teamIndex of finishOrder) {
      tracker.record(teamIndex);
    }

    expect(tracker.eliminatedTeamIndex).toBe(1);
    expect(tracker.finishedMarbles).toBe(11);
    expect(tracker.totalMarbles).toBe(12);
  });

  test("eliminates the team with the final marble in a 100-marble field", () => {
    const tracker = new RoundFinishTracker(2, 100);

    for (let index = 0; index < 100; index++) {
      tracker.record(0);
    }
    for (let index = 0; index < 99; index++) {
      tracker.record(1);
    }

    expect(tracker.totalMarbles).toBe(200);
    expect(tracker.finishedMarbles).toBe(199);
    expect(tracker.remainingMarbles).toBe(1);
    expect(tracker.eliminatedTeamIndex).toBe(1);
  });

  test("eliminates the only team still moving even when it has several marbles", () => {
    const tracker = new RoundFinishTracker(2, 5);

    for (let index = 0; index < 5; index++) {
      tracker.record(1);
    }

    expect(tracker.remainingMarbles).toBe(5);
    expect(tracker.eliminatedTeamIndex).toBe(0);
  });

  test("waits while marbles from more than one team are still moving", () => {
    const tracker = new RoundFinishTracker(3, 5);

    for (let index = 0; index < 5; index++) {
      tracker.record(0);
    }
    for (let index = 0; index < 4; index++) {
      tracker.record(1);
    }

    expect(tracker.remainingMarbles).toBe(6);
    expect(tracker.eliminatedTeamIndex).toBeNull();

    tracker.record(1);
    expect(tracker.remainingMarbles).toBe(5);
    expect(tracker.eliminatedTeamIndex).toBe(2);
  });

  test("keeps a team's claimed bay stable across later finishes", () => {
    const tracker = new RoundFinishTracker(2, 2);

    tracker.record(0);
    expect(tracker.record(1)).toMatchObject({
      bayIndex: 1,
      slotIndex: 0,
    });

    tracker.record(0);
    expect(tracker.record(1)).toMatchObject({
      bayIndex: 1,
      slotIndex: 1,
    });
    expect(tracker.finishedMarbles).toBe(4);
  });
});
