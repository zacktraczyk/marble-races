import type { EntityDefinition } from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";
import type { Color } from "@engine/core/color";
import {
  DEFAULT_SPAWN_DIRECTION_VARIANCE,
  spawnAreaRadius,
} from "../race/spawn";

export interface SpawnPointDefinitionOptions {
  position: Vec2;
  rotation?: number;
  radius: number;
  directionVariance?: number;
  marbleCount?: number;
  marbleRadius?: number;
  maximumMarbleRadius?: number;
  color?: Color;
  variant?: "point" | "top-slider";
}

/**
 * Gap between a top-slider spawn center and the top wall's inner edge: the
 * spawn circle plus two marble radii, so dropped marbles never overlap the
 * wall and get ejected out of the course.
 */
export const topSliderSpawnClearance = (
  radius: number,
  maximumMarbleRadius: number
) => radius + maximumMarbleRadius * 2;

/** Editor-visible marker. The race controller owns its launch behavior. */
export const spawnPointDefinition = ({
  position,
  rotation = Math.PI / 2,
  radius,
  directionVariance = DEFAULT_SPAWN_DIRECTION_VARIANCE,
  marbleCount = 1,
  marbleRadius = radius * 0.4,
  maximumMarbleRadius = marbleRadius,
  color = [34 / 255, 211 / 255, 238 / 255, 1],
  variant = "point",
}: SpawnPointDefinitionOptions): EntityDefinition => {
  const areaRadius = spawnAreaRadius(radius, marbleCount, marbleRadius);

  if (variant === "top-slider") {
    // A downward-pointing triangle whose top edge sits flush against the top
    // wall, filled like the point spawn's area circle; the authored rotation
    // aims the marbles, so the render stays axis-aligned.
    const topEdge = -topSliderSpawnClearance(radius, maximumMarbleRadius);
    return {
      transform: { position, rotation: 0 },
      tags: ["spawn-point"],
      render: {
        parts: [
          {
            primitive: {
              type: "polygon",
              vertices: [
                [-areaRadius, topEdge] as Vec2,
                [areaRadius, topEdge] as Vec2,
                [0, areaRadius * 0.55] as Vec2,
              ],
            },
            color: [color[0], color[1], color[2], 0.24] as Color,
          },
        ],
      },
    };
  }
  const directionBound = (angle: number) => ({
    primitive: { type: "rectangle" as const, width: 1, height: 1 },
    color: [color[0], color[1], color[2], 0.7] as Color,
    localTransform: {
      position: [
        Math.cos(angle) * areaRadius * 0.52,
        Math.sin(angle) * areaRadius * 0.52,
      ] as Vec2,
      rotation: angle,
      scale: [areaRadius * 0.9, Math.max(2, areaRadius * 0.07)] as Vec2,
    },
  });

  return {
    transform: { position, rotation },
    tags: ["spawn-point"],
    render: {
      parts: [
        {
          primitive: { type: "circle", radius: 1 },
          color: [color[0], color[1], color[2], 0.24],
          localTransform: {
            position: [0, 0],
            scale: [areaRadius, areaRadius],
          },
        },
        {
          primitive: { type: "circle", radius: 1 },
          color,
          localTransform: {
            position: [0, 0],
            scale: [radius * 0.22, radius * 0.22],
          },
        },
        directionBound(-Math.abs(directionVariance)),
        directionBound(Math.abs(directionVariance)),
      ],
    },
  };
};
