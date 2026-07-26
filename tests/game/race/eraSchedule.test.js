import { describe, expect, test } from "bun:test";

import { computeEraSchedule } from "@game/race/eraSchedule";

const uniformLegs = (count, width = 1440, wallThickness = 15) =>
  Array.from({ length: count }, () => ({ width, wallThickness }));

describe("computeEraSchedule", () => {
  test("requires one leg per elimination", () => {
    expect(() =>
      computeEraSchedule({
        participantCount: 4,
        marblesPerTeam: 60,
        legs: uniformLegs(2),
      })
    ).toThrow();
  });

  test("redistributes eliminated teams' marbles to the survivors", () => {
    const plans = computeEraSchedule({
      participantCount: 6,
      marblesPerTeam: 60,
      legs: uniformLegs(5),
    });

    expect(plans.map(({ activeTeams }) => activeTeams)).toEqual([
      6, 5, 4, 3, 2,
    ]);
    // Per-team counts grow as the field shrinks, rounded to whole rows.
    expect(plans.map(({ marblesPerTeam }) => marblesPerTeam)).toEqual([
      60, 72, 90, 120, 180,
    ]);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].marblesPerTeam).toBeGreaterThan(
        plans[i - 1].marblesPerTeam
      );
    }
  });

  test("scales the race's marble radius so small fields keep deep racks", () => {
    const small = computeEraSchedule({
      participantCount: 6,
      marblesPerTeam: 60,
      legs: uniformLegs(5),
    });
    // One constant, larger-than-base radius for the whole race.
    const radius = small[0].marbleRadius;
    expect(radius).toBeGreaterThan(4.8);
    expect(radius).toBeLessThanOrEqual(4.8 * 3);
    for (const plan of small) {
      expect(plan.marbleRadius).toBe(radius);
    }

    // Large fields already stack deep, so they stay at the base radius.
    const large = computeEraSchedule({
      participantCount: 6,
      marblesPerTeam: 360,
      legs: uniformLegs(5),
    });
    expect(large.every(({ marbleRadius }) => marbleRadius === 4.8)).toBe(true);
  });

  test("keeps a constant marble radius and roughly constant rack height", () => {
    const plans = computeEraSchedule({
      participantCount: 12,
      marblesPerTeam: 100,
      legs: uniformLegs(11),
    });
    for (const plan of plans) {
      expect(plan.marbleRadius).toBe(4.8);
      expect(plan.rackHeight).toBeCloseTo(plans[0].rackHeight);
    }
  });
});
