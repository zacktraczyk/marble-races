import { describe, expect, test } from "bun:test";
import { handleRaceExitKey } from "@scenes/race-player/controls";

describe("race player controls", () => {
  test("Escape prevents the browser default and exits the race", () => {
    let prevented = false;
    let exitCount = 0;

    handleRaceExitKey(
      {
        key: "Escape",
        defaultPrevented: false,
        preventDefault: () => {
          prevented = true;
        },
      },
      () => {
        exitCount += 1;
      }
    );

    expect(prevented).toBe(true);
    expect(exitCount).toBe(1);
  });

  test("ignores other keys and already-handled Escape presses", () => {
    let exitCount = 0;
    const onExit = () => {
      exitCount += 1;
    };

    handleRaceExitKey(
      {
        key: "Enter",
        defaultPrevented: false,
        preventDefault: () => {},
      },
      onExit
    );
    handleRaceExitKey(
      {
        key: "Escape",
        defaultPrevented: true,
        preventDefault: () => {},
      },
      onExit
    );

    expect(exitCount).toBe(0);
  });
});
