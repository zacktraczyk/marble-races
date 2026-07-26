import { describe, expect, test } from "bun:test";
import { RaceRunLifecycle } from "@scenes/race-player/lifecycle";

describe("race run lifecycle", () => {
  test("numbers completed runs across a restart", () => {
    const events = [];
    const lifecycle = new RaceRunLifecycle((event) => events.push(event));

    lifecycle.prepareRun();
    lifecycle.startRun();
    lifecycle.advance(12.4);
    lifecycle.completeRun(2);

    lifecycle.prepareRun();
    lifecycle.startRun();
    lifecycle.advance(8.8);
    lifecycle.completeRun(1);

    expect(events).toEqual([
      { type: "started", runNumber: 1 },
      {
        type: "completed",
        durationMs: 12,
        runNumber: 1,
        winnerTeamIndex: 2,
      },
      { type: "started", runNumber: 2 },
      {
        type: "completed",
        durationMs: 9,
        runNumber: 2,
        winnerTeamIndex: 1,
      },
    ]);
  });
});
