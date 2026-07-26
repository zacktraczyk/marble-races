import { describe, expect, test } from "bun:test";
import {
  createLegRoundConfiguration,
  resolveLegFinishPlan,
  roundConfigurationFromFinishPlan,
} from "@game/race/legRound";

describe("leg round configuration", () => {
  test("uses an even-split approximation when the race is incomplete", () => {
    const config = createLegRoundConfiguration(
      {
        participantCount: 4,
        marblesPerTeam: 60,
        releaseIntervalMs: 50,
        legs: [{ width: 1000, wallThickness: 15 }],
      },
      0
    );

    expect(config.teamCount).toBe(4);
    expect(config.marblesPerTeam).toBe(60);
    expect(config.releaseIntervalMs).toBe(50);
    expect(config.finishPlan).toBeUndefined();
  });

  test("attaches an era finish plan for a complete race", () => {
    const race = {
      participantCount: 3,
      marblesPerTeam: 60,
      releaseIntervalMs: 40,
      legs: [
        { width: 1440, wallThickness: 15 },
        { width: 1440, wallThickness: 15 },
      ],
    };
    const plan = resolveLegFinishPlan(race, 0);
    expect(plan).not.toBeNull();
    const config = createLegRoundConfiguration(race, 0, plan);
    expect(config.teamCount).toBe(plan.activeTeams);
    expect(config.finishPlan?.rackHeight).toBe(plan.rackHeight);
  });

  test("roundConfigurationFromFinishPlan mirrors the plan fields", () => {
    const plan = {
      legIndex: 1,
      activeTeams: 3,
      marblesPerTeam: 80,
      rackHeight: 120,
      marbleRadius: 4.5,
    };
    expect(roundConfigurationFromFinishPlan(plan, 33)).toEqual({
      teamCount: 3,
      marblesPerTeam: 80,
      releaseIntervalMs: 33,
      finishPlan: {
        rackHeight: 120,
        marbleRadius: 4.5,
      },
    });
  });
});
