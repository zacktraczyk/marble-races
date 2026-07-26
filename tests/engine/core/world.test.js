import { describe, expect, test } from "bun:test";
import { createTransform } from "@engine/core/transform";
import { marbleDefinition } from "@game/prefabs/marble";

describe("core world", () => {
  test("owns one transform per entity without aliasing caller arrays", () => {
    const sourcePosition = [10, 20];
    const transform = createTransform({ position: sourcePosition });

    sourcePosition[0] = 99;

    expect(transform.position).toEqual([10, 20]);
  });
});

describe("prefabs", () => {
  test("builds a decorated marble as one entity with local render parts", () => {
    const definition = marbleDefinition({
      position: [30, 40],
      radius: 12,
      color: [0, 0, 1, 1],
      decorated: true,
    });

    expect(definition.tags).toContain("marble");
    expect(definition.physics?.collider.type).toBe("circle");
    expect(definition.render?.parts).toHaveLength(2);
    const highlightPosition =
      definition.render?.parts[1].localTransform?.position;
    expect(highlightPosition?.[0]).toBeCloseTo(-3.36);
    expect(highlightPosition?.[1]).toBeCloseTo(-3.6);
  });
});
