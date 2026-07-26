import { describe, expect, test } from "bun:test";
import {
  parseCliArgs,
  resolveCommonConfig,
} from "../../../benchmarks/shared/config.ts";

describe("benchmark CLI configuration", () => {
  test("parses positional, assigned, repeated, and negated options", () => {
    const args = parseCliArgs([
      "run",
      "--preset=smoke",
      "--scenario",
      "contiguous",
      "--scenario",
      "fragmented",
      "--no-headless",
    ]);

    expect(args._).toEqual(["run"]);
    expect(args.preset).toBe("smoke");
    expect(args.scenario).toEqual(["contiguous", "fragmented"]);
    expect(args.headless).toBe(false);
  });

  test("resolves preset defaults and explicit overrides", () => {
    const config = resolveCommonConfig(
      parseCliArgs(["--preset", "smoke", "--repetitions", "3", "--no-build"]),
      "/tmp/marble-test"
    );

    expect(config).toMatchObject({
      preset: "smoke",
      repetitions: 3,
      warmupFrames: 60,
      durationMs: 2_000,
      minFrames: 60,
      headless: true,
      build: false,
    });
    expect(config.outputDir).toBe("/tmp/marble-test/benchmarks/results");
  });

  test("rejects invalid numeric and preset options", () => {
    expect(() =>
      resolveCommonConfig(parseCliArgs(["--repetitions", "0"]))
    ).toThrow("at least 1");
    expect(() =>
      resolveCommonConfig(parseCliArgs(["--preset", "overnight"]))
    ).toThrow("Unknown preset");
  });
});
