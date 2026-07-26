import type { Vec2 } from "@engine/core/transform";
import type { SerializedLevel } from "./document";

const translated = (point: Vec2, offset: Vec2): Vec2 => [
  point[0] + offset[0],
  point[1] + offset[1],
];

/**
 * Returns a deep clone of the level with every object shifted by `offset`.
 * Walls move via their `start`/`end` endpoints; all other prefabs move via
 * their transform position. Motion properties are relative and left untouched.
 */
export const translateSerializedLevel = (
  level: SerializedLevel,
  offset: Vec2
): SerializedLevel => {
  const clone = structuredClone(level);

  for (const object of clone.objects) {
    if (object.prefab === "wall") {
      object.properties.start = translated(object.properties.start, offset);
      object.properties.end = translated(object.properties.end, offset);
    } else {
      object.transform.position = translated(object.transform.position, offset);
    }
  }

  return clone;
};
