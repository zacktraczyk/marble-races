import { describe, expect, test } from "bun:test";
import { RoundRobinReleaseQueue } from "@game/race/releaseQueue";

describe("round-robin release queue", () => {
  test("rotates teams and skips queues that have emptied", () => {
    const releases = new RoundRobinReleaseQueue(
      [["a1", "a2"], ["b1"], ["c1", "c2"]],
      1
    );

    expect([
      releases.takeNext(),
      releases.takeNext(),
      releases.takeNext(),
      releases.takeNext(),
      releases.takeNext(),
    ]).toEqual(["b1", "c1", "a1", "c2", "a2"]);
    expect(releases.remaining).toBe(0);
    expect(releases.takeNext()).toBeNull();
  });
});
