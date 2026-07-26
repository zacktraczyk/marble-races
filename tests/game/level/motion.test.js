import { describe, expect, test } from "bun:test";
import { LevelDocument } from "@game/level/document";
import {
  doesSliderLoopResetBetween,
  getLevelObjectMotionPose,
  getOscillationPeakSpeed,
  getOscillationEndpoints,
  getRotationPivot,
  getSliderSpeed,
  oscillationPeriodForRange,
} from "@game/level/motion";
import { levelObjectDefinitions } from "@game/prefabs/levelObject";
import { getLevelObjectShape } from "@game/level/geometry";
import {
  createPusher,
  loopPeriodForRange,
  pusherSpeedForMotion,
  PUSHER_DEFAULT_RANGE,
  PUSHER_LINEAR_SPEEDS,
  PUSHER_PERIODS,
  sliderPeriodForRange,
} from "@game/level/objects";

const authored = (data, id = "pusher") => ({ ...data, id });

describe("level object motion", () => {
  test("places a slider at the center of its path and reaches both endpoints", () => {
    const slider = authored(createPusher("slider", [100, 200]));
    const endpoints = getOscillationEndpoints(slider, 15);

    expect(slider.properties).toMatchObject({
      start: [100, 140],
      end: [100, 260],
    });
    expect(endpoints).toEqual([
      [100 - PUSHER_DEFAULT_RANGE, 200],
      [100 + PUSHER_DEFAULT_RANGE, 200],
    ]);
    expect(getLevelObjectMotionPose(slider, 15, 0).position).toEqual([
      100, 200,
    ]);
    const sliderPeriod = sliderPeriodForRange(PUSHER_DEFAULT_RANGE, "medium");
    expect(
      getLevelObjectMotionPose(slider, 15, sliderPeriod / 4).position
    ).toEqual([100 + PUSHER_DEFAULT_RANGE, 200]);
    expect(
      getLevelObjectMotionPose(slider, 15, sliderPeriod / 2).position[0]
    ).toBeCloseTo(100);
  });

  test("keeps slider speed constant when its travel distance changes", () => {
    const peakSpeeds = [30, 90, 240].map((range) => {
      const slider = authored(createPusher("slider", [0, 0]));
      slider.motion.vector = [range, 0];
      slider.motion.periodMs = sliderPeriodForRange(range, "medium");
      const next = getLevelObjectMotionPose(slider, 15, 1).position[0];
      return next * 1000;
    });

    for (const peakSpeed of peakSpeeds) {
      expect(peakSpeed).toBeCloseTo(PUSHER_LINEAR_SPEEDS.medium, 1);
    }
    expect(sliderPeriodForRange(240, "medium")).toBe(
      sliderPeriodForRange(30, "medium") * 8
    );

    const draggedSlider = authored(createPusher("slider", [0, 0]));
    const originalSpeed = getOscillationPeakSpeed(draggedSlider.motion);
    draggedSlider.motion.periodMs = oscillationPeriodForRange(
      draggedSlider.motion,
      180
    );
    draggedSlider.motion.vector = [180, 0];
    expect(getOscillationPeakSpeed(draggedSlider.motion)).toBeCloseTo(
      originalSpeed
    );
  });

  test("loops from the authored wall to one endpoint before resetting", () => {
    const slider = authored(createPusher("slider", [100, 200]));
    slider.motion.repeat = "loop";
    slider.motion.periodMs = loopPeriodForRange(PUSHER_DEFAULT_RANGE, "medium");

    expect(getLevelObjectMotionPose(slider, 15, 0).position).toEqual([
      100, 200,
    ]);
    expect(
      getLevelObjectMotionPose(slider, 15, slider.motion.periodMs / 2).position
    ).toEqual([100 + PUSHER_DEFAULT_RANGE / 2, 200]);
    expect(
      getLevelObjectMotionPose(slider, 15, slider.motion.periodMs - 1)
        .position[0]
    ).toBeCloseTo(100 + PUSHER_DEFAULT_RANGE, 0);
    expect(
      getLevelObjectMotionPose(slider, 15, slider.motion.periodMs).position
    ).toEqual([100, 200]);
    expect(getSliderSpeed(slider.motion)).toBeCloseTo(
      PUSHER_LINEAR_SPEEDS.medium
    );
    expect(
      doesSliderLoopResetBetween(
        slider.motion,
        slider.motion.periodMs - 1,
        slider.motion.periodMs + 1
      )
    ).toBe(true);
  });

  test("reverses which side of the authored wall a loop grows toward", () => {
    const slider = authored(createPusher("slider", [100, 200]));
    slider.motion.repeat = "loop";
    slider.motion.direction = -1;
    slider.motion.periodMs = loopPeriodForRange(PUSHER_DEFAULT_RANGE, "medium");

    expect(getLevelObjectMotionPose(slider, 15, 0).position).toEqual([
      100, 200,
    ]);
    expect(
      getLevelObjectMotionPose(slider, 15, slider.motion.periodMs / 2).position
    ).toEqual([100 - PUSHER_DEFAULT_RANGE / 2, 200]);
    expect(getOscillationEndpoints(slider, 15)).toEqual([
      [100, 200],
      [100 - PUSHER_DEFAULT_RANGE, 200],
    ]);
  });

  test("applies slider placement defaults without carrying over dimensions", () => {
    const slider = authored(
      createPusher("slider", [100, 200], {
        repeat: "loop",
        speed: "fast",
        rotation: 0,
      })
    );
    const shape = getLevelObjectShape(slider, 15);

    expect(shape).toMatchObject({
      position: [100, 200],
      rotation: 0,
      width: 120,
      height: 15,
    });
    expect(slider.properties).not.toHaveProperty("thickness");
    expect(slider.motion).toMatchObject({
      repeat: "loop",
      vector: [PUSHER_DEFAULT_RANGE, 0],
      direction: 1,
    });
    expect(pusherSpeedForMotion(slider.motion)).toBe("fast");
  });

  test("uses evenly spaced linear speed presets", () => {
    expect(PUSHER_LINEAR_SPEEDS).toEqual({
      slow: 120,
      medium: 360,
      fast: 600,
    });
    expect(PUSHER_PERIODS).toEqual({
      slow: 9000,
      medium: 6500,
      fast: 4500,
    });
    expect(PUSHER_LINEAR_SPEEDS.medium - PUSHER_LINEAR_SPEEDS.slow).toBe(
      PUSHER_LINEAR_SPEEDS.fast - PUSHER_LINEAR_SPEEDS.medium
    );
  });

  test("keeps a sweeper pivot fixed at its authored first endpoint", () => {
    const sweeper = authored(createPusher("sweeper", [10, 20]));
    const quarterTurn = getLevelObjectMotionPose(
      sweeper,
      15,
      PUSHER_PERIODS.medium / 4
    );

    expect(getRotationPivot(sweeper, 15)).toEqual([10, 20]);
    expect(quarterTurn.position[0]).toBeCloseTo(10);
    expect(quarterTurn.position[1]).toBeCloseTo(80);
    expect(quarterTurn.rotation).toBeCloseTo(Math.PI / 2);
  });

  test("reverses rotating presets without changing their rest pose", () => {
    const spinner = authored(createPusher("spinner", [0, 0]));
    spinner.motion.direction = -1;

    const rest = getLevelObjectMotionPose(spinner, 15, 0);
    const quarterTurn = getLevelObjectMotionPose(
      spinner,
      15,
      PUSHER_PERIODS.medium / 4
    );

    expect(rest).toMatchObject({ position: [0, 0], rotation: 0 });
    expect(quarterTurn.rotation).toBeCloseTo(-Math.PI / 2);
  });

  test("spawns moving walls as kinematic physics bodies", () => {
    const slider = authored(createPusher("slider", [0, 0]));
    const [definition] = levelObjectDefinitions(slider, { wallThickness: 15 });

    expect(definition.physics?.type).toBe("kinematic");
  });

  test("serializes the motion-ready level format", () => {
    const document = new LevelDocument("Motion course", [800, 800], {
      wallThickness: 15,
    });
    document.add(createPusher("slider", [0, 0]));

    expect(document.serialize()).toMatchObject({
      version: 3,
      objects: [
        {
          motion: {
            type: "oscillate",
            repeat: "ping-pong",
            phase: 0,
          },
        },
      ],
    });
  });
});
