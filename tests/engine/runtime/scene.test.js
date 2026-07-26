import { describe, expect, test } from "bun:test";
import { SceneHost } from "@engine/runtime/scene";

class FakeFrameScheduler {
  time = 0;
  nextHandle = 1;
  callbacks = new Map();

  now() {
    return this.time;
  }

  request(callback) {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle) {
    this.callbacks.delete(handle);
  }

  advance(deltaMs) {
    this.time += deltaMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) {
      callback(this.time);
    }
  }
}

describe("SceneHost", () => {
  test("runs fixed updates and disposes a scene exactly once", () => {
    const scheduler = new FakeFrameScheduler();
    const calls = { load: 0, fixed: 0, update: 0, render: 0, dispose: 0 };
    let signal;

    const host = new SceneHost(
      {
        load: (context) => {
          calls.load++;
          signal = context.signal;
        },
        fixedUpdate: () => calls.fixed++,
        update: () => calls.update++,
        render: () => calls.render++,
        dispose: () => calls.dispose++,
      },
      { scheduler, fixedDeltaMs: 10 }
    );

    host.start();
    scheduler.advance(25);
    host.stop();
    host.stop();

    expect(calls).toEqual({
      load: 1,
      fixed: 2,
      update: 1,
      render: 1,
      dispose: 1,
    });
    expect(signal.aborted).toBe(true);
    expect(host.running).toBe(false);
  });

  test("publishes optional host-level performance samples", () => {
    const scheduler = new FakeFrameScheduler();
    const samples = [];
    const host = new SceneHost(
      { fixedUpdate: () => {}, render: () => {} },
      {
        scheduler,
        fixedDeltaMs: 10,
        collectPerformance: true,
        performanceSampleIntervalMs: 20,
        onPerformanceSample: (sample) => samples.push(sample),
      }
    );

    host.start();
    scheduler.advance(25);
    host.stop();

    expect(samples).toHaveLength(1);
    expect(samples[0].fps).toBeCloseTo(40);
    expect(samples[0].averageFrameMs).toBeCloseTo(25);
    expect(samples[0].fixedSteps).toBe(2);
  });

  test("stops and disposes when a scene update throws", () => {
    const scheduler = new FakeFrameScheduler();
    const errors = [];
    let disposeCount = 0;
    const host = new SceneHost(
      {
        fixedUpdate: () => {
          throw new Error("scene failure");
        },
        dispose: () => disposeCount++,
      },
      {
        scheduler,
        fixedDeltaMs: 10,
        onError: (error, phase) => errors.push({ error, phase }),
      }
    );

    host.start();
    scheduler.advance(10);

    expect(host.running).toBe(false);
    expect(disposeCount).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].phase).toBe("runtime");
  });

  test("distinguishes scene load failures from runtime failures", () => {
    const scheduler = new FakeFrameScheduler();
    const errors = [];
    let disposeCount = 0;
    const host = new SceneHost(
      {
        load: () => {
          throw new Error("load failure");
        },
        dispose: () => disposeCount++,
      },
      {
        scheduler,
        onError: (error, phase) => errors.push({ error, phase }),
      }
    );

    host.start();

    expect(host.running).toBe(false);
    expect(disposeCount).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].phase).toBe("load");
  });
});
