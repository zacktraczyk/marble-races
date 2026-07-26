import type { EntityDefinition } from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";
import type { Color } from "@engine/core/color";
import { circleDefinition } from "./primitives/circle";

export interface MarbleDefinitionOptions {
  position: Vec2;
  radius: number;
  color: Color;
  team?: string;
  velocity?: Vec2;
  angularVelocity?: number;
  acceleration?: Vec2;
  mass?: number;
  inertia?: number;
  friction?: number;
  restitution?: number;
  fixedRotation?: boolean;
  decorated?: boolean;
  tags?: string[];
  physical?: boolean;
}

/** A game-level variation composed from the circle primitive definition. */
export const marbleDefinition = ({
  position,
  radius,
  color,
  team,
  velocity,
  angularVelocity,
  acceleration,
  mass,
  inertia,
  friction,
  restitution,
  fixedRotation,
  decorated = false,
  tags = [],
  physical = true,
}: MarbleDefinitionOptions): EntityDefinition => {
  const definition = circleDefinition({
    position,
    radius,
    color,
    velocity,
    angularVelocity,
    acceleration,
    mass,
    inertia,
    friction,
    restitution,
    fixedRotation,
    physical,
    bodyType: "dynamic",
    tags: ["marble", ...tags, ...(team ? [`team:${team}`] : [])],
  });

  if (decorated) {
    definition.render?.parts.push({
      primitive: { type: "circle", radius: 1 },
      color: [1, 1, 1, 0.28],
      localTransform: {
        position: [-radius * 0.28, -radius * 0.3],
        scale: [radius * 0.24, radius * 0.16],
      },
    });
  }

  return definition;
};
