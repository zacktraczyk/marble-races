import type { Vec2 } from "../../engine/core/transform";
import { FINISH_RACK_HEIGHT } from "../../game/prefabs/finishZone";
import type { LegFinishPlan } from "../../game/race/eraSchedule";
import type { RaceLegDocument } from "../../races/types";

export type LegFrame = {
  index: number;
  size: Vec2;
  center: Vec2;
  top: number;
  bottom: number;
};

/** The finish rack height baked into a leg's saved level document. */
const savedFinishRackHeight = (leg: RaceLegDocument): number => {
  for (const object of leg.level.objects) {
    if (object.prefab === "finish-zone") {
      return object.properties.height;
    }
  }
  return FINISH_RACK_HEIGHT;
};

/**
 * Stacks legs edge-to-edge along +Y (downward in this engine). Leg 0 is
 * centered at the origin; each later leg's top edge meets the previous leg's
 * bottom edge, and every leg is horizontally centered on x = 0.
 *
 * When finish plans are provided, each frame tracks its packed rack exactly:
 * the frame grows or shrinks by the difference between the packed rack
 * height and the saved one, so the rack's bottom wall always sits flush
 * against the next leg's top wall — no dead strip between legs. The leg's
 * authored side walls are trimmed/extended to match in `LegInstance`.
 */
export const computeLegStackLayout = (
  legs: readonly RaceLegDocument[],
  plans?: readonly LegFinishPlan[]
): LegFrame[] => {
  const frames: LegFrame[] = [];
  let previousBottom = 0;

  legs.forEach((leg, index) => {
    const plan = plans?.[index];
    const rackGrowth = plan ? plan.rackHeight - savedFinishRackHeight(leg) : 0;
    const size: Vec2 = [leg.level.size[0], leg.level.size[1] + rackGrowth];
    const height = size[1];
    const centerY = index === 0 ? 0 : previousBottom + height / 2;
    const center: Vec2 = [0, centerY];
    const top = centerY - height / 2;
    const bottom = centerY + height / 2;

    frames.push({ index, size, center, top, bottom });
    previousBottom = bottom;
  });

  return frames;
};
