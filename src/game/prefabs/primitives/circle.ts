import type { EntityDefinition } from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";
import type { PhysicsEntityType } from "@engine/physics/entity";
import type { Color } from "@engine/core/color";

export interface CircleDefinitionOptions {
  position: Vec2;
  radius: number;
  color: Color;
  rotation?: number;
  bodyType?: PhysicsEntityType;
  velocity?: Vec2;
  angularVelocity?: number;
  acceleration?: Vec2;
  tags?: string[];
  physical?: boolean;
  mass?: number;
  inertia?: number;
  friction?: number;
  restitution?: number;
  fixedRotation?: boolean;
}

export const circleDefinition = ({
  position,
  radius,
  color,
  rotation = 0,
  bodyType = "dynamic",
  velocity = [0, 0],
  angularVelocity,
  acceleration,
  tags = [],
  physical = true,
  mass,
  inertia,
  friction,
  restitution,
  fixedRotation,
}: CircleDefinitionOptions): EntityDefinition => ({
  transform: { position, rotation },
  tags,
  render: {
    parts: [
      {
        primitive: { type: "circle", radius: 1 },
        color,
        localTransform: {
          position: [0, 0],
          scale: [radius, radius],
        },
      },
    ],
  },
  physics: physical
    ? {
        type: bodyType,
        velocity,
        angularVelocity,
        acceleration,
        mass,
        inertia,
        friction,
        restitution,
        fixedRotation,
        collider: { type: "circle", radius },
      }
    : undefined,
});
