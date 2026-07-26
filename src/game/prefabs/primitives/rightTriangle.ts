import type { EntityDefinition } from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";
import type { PhysicsEntityType } from "@engine/physics/entity";
import type { Color } from "@engine/core/color";

export interface RightTriangleDefinitionOptions {
  position: Vec2;
  width: number;
  height: number;
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

export const rightTriangleDefinition = ({
  position,
  width,
  height,
  color,
  rotation = 0,
  bodyType = "static",
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
}: RightTriangleDefinitionOptions): EntityDefinition => ({
  transform: { position, rotation },
  tags,
  render: {
    parts: [
      {
        primitive: { type: "right-triangle", width: 1, height: 1 },
        color,
        localTransform: {
          position: [0, 0],
          scale: [width, height],
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
        collider: {
          type: "polygon",
          vertices: [
            [-width / 2, -height / 2],
            [width / 2, height / 2],
            [-width / 2, height / 2],
          ],
        },
      }
    : undefined,
});
