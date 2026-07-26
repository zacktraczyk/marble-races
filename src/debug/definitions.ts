import type { EntityDefinition } from "@engine/stage";
import type { Vec2 } from "@engine/core/transform";
import type { Color } from "@engine/core/color";
import type { RenderPartDefinition } from "@engine/vdu/component";

const linePart = (
  start: Vec2,
  end: Vec2,
  stroke: number,
  color: Color
): RenderPartDefinition => {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  return {
    primitive: { type: "rectangle", width: 1, height: 1 },
    color,
    localTransform: {
      position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
      rotation: Math.atan2(deltaY, deltaX),
      scale: [Math.hypot(deltaX, deltaY), stroke],
    },
  };
};

export const debugLineDefinition = ({
  start,
  end,
  stroke = 4,
  color = [1, 1, 1, 1],
}: {
  start: Vec2;
  end: Vec2;
  stroke?: number;
  color?: Color;
}): EntityDefinition => ({
  transform: { position: [0, 0] },
  tags: ["debug-visual"],
  render: { parts: [linePart(start, end, stroke, color)] },
});

export const debugArrowDefinition = ({
  start,
  end,
  tipLength = 10,
  stroke = 4,
  color = [1, 1, 1, 1],
}: {
  start: Vec2;
  end: Vec2;
  tipLength?: number;
  stroke?: number;
  color?: Color;
}): EntityDefinition => {
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const headAngle = Math.PI / 5;
  const headEnd = (direction: -1 | 1): Vec2 => [
    end[0] - Math.cos(angle + direction * headAngle) * tipLength,
    end[1] - Math.sin(angle + direction * headAngle) * tipLength,
  ];
  return {
    transform: { position: [0, 0] },
    tags: ["debug-visual"],
    render: {
      parts: [
        linePart(start, end, stroke, color),
        linePart(end, headEnd(-1), stroke, color),
        linePart(end, headEnd(1), stroke, color),
      ],
    },
  };
};

export const debugPointDefinition = ({
  position,
  radius = 5,
  color = [1, 1, 1, 1],
}: {
  position: Vec2;
  radius?: number;
  color?: Color;
}): EntityDefinition => ({
  transform: { position },
  tags: ["debug-visual"],
  render: {
    parts: [
      {
        primitive: { type: "circle", radius: 1 },
        color,
        localTransform: { position: [0, 0], scale: [radius, radius] },
      },
    ],
  },
});

export const debugPolylineDefinitions = ({
  vertices,
  closed = false,
  stroke = 4,
  color = [1, 1, 1, 1],
}: {
  vertices: readonly Vec2[];
  closed?: boolean;
  stroke?: number;
  color?: Color;
}) => {
  const definitions: EntityDefinition[] = [];
  const segmentCount = closed
    ? vertices.length
    : Math.max(0, vertices.length - 1);
  for (let index = 0; index < segmentCount; index++) {
    definitions.push(
      debugLineDefinition({
        start: vertices[index],
        end: vertices[(index + 1) % vertices.length],
        stroke,
        color,
      })
    );
  }
  return definitions;
};

export const draggableShapeDefinition = ({
  position,
  rotation = 0,
  vertices,
  color,
  handleRadius,
  handleColor,
}: {
  position: Vec2;
  rotation?: number;
  vertices: Vec2[];
  color: Color;
  handleRadius: number;
  handleColor: Color;
}): EntityDefinition => ({
  transform: { position, rotation },
  tags: ["debug-shape", "draggable"],
  render: {
    parts: [
      { primitive: { type: "polygon", vertices }, color },
      {
        primitive: { type: "circle", radius: 1 },
        color: handleColor,
        localTransform: {
          position: [0, 0],
          scale: [handleRadius, handleRadius],
        },
      },
    ],
  },
  physics: {
    type: "kinematic",
    collider: { type: "polygon", vertices },
  },
});

export const draggableCircleDefinition = ({
  position,
  radius,
  color,
  handleRadius,
  handleColor,
}: {
  position: Vec2;
  radius: number;
  color: Color;
  handleRadius: number;
  handleColor: Color;
}): EntityDefinition => ({
  transform: { position },
  tags: ["debug-shape", "draggable"],
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
      {
        primitive: { type: "circle", radius: 1 },
        color: handleColor,
        localTransform: {
          position: [0, 0],
          scale: [handleRadius, handleRadius],
        },
      },
    ],
  },
  physics: {
    type: "kinematic",
    collider: { type: "circle", radius },
  },
});
