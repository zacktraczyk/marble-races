import { translateSerializedLevel } from "@game/level/transform";
import type { WorldRect } from "@engine/camera/fit";
import type Stage from "@engine/stage";
import type { SerializedLevel } from "@game/level/document";
import type { RaceLegDocument } from "@races/types";
import { AuthoredLevel } from "@game/level/authoredLevel";
import { RaceController, type ExternalRaceMode } from "@game/race/controller";
import type { RoundConfiguration } from "@game/race/types";
import type { LegFrame } from "./legStack";

/**
 * Left, right, and top culling padding, in world units. Matches the stage's
 * own out-of-bounds convention (`Stage.clearOutOfBoundsEntities`, default
 * 1000) so escapees off the sides/top are only culled once well clear.
 */
export const LEG_CULL_PADDING = 1000;
/**
 * Bottom culling margin, in world units. Kept tight — a few marble radii —
 * so a marble that escapes the bottom of this leg is culled before it can
 * physically fall into the leg stacked below it.
 */
export const LEG_BOTTOM_CULL_MARGIN = 24;

/**
 * Culling bounds for a leg's own marbles: generous left/right/top padding, but
 * a tight bottom so escaped marbles never enter the leg below. Pure helper so
 * it can be unit-tested without a Stage.
 */
export const computeLegCullBounds = (
  frame: LegFrame
): ExternalRaceMode["bounds"] => {
  const halfWidth = frame.size[0] / 2;
  return {
    minX: frame.center[0] - halfWidth - LEG_CULL_PADDING,
    maxX: frame.center[0] + halfWidth + LEG_CULL_PADDING,
    minY: frame.top - LEG_CULL_PADDING,
    maxY: frame.bottom + LEG_BOTTOM_CULL_MARGIN,
  };
};

/**
 * One alive leg in a stacked, scrolling race: owns its own `AuthoredLevel`
 * (restored translated into the leg's slot in the stack, spawn point hidden)
 * plus an optional `RaceController` running in external mode. The runtime owns
 * the global stage (size, stepping); a `LegInstance` only touches its own level
 * and controller.
 */
export class LegInstance {
  readonly frame: LegFrame;
  readonly leg: RaceLegDocument;
  controller: RaceController | null = null;
  private readonly stage: Stage;
  private readonly level: AuthoredLevel;
  private readonly configuration: RoundConfiguration;
  private disposed = false;

  constructor(args: {
    stage: Stage;
    leg: RaceLegDocument;
    frame: LegFrame;
    configuration: RoundConfiguration;
  }) {
    this.stage = args.stage;
    this.leg = args.leg;
    this.frame = args.frame;
    this.configuration = args.configuration;

    this.level = new AuthoredLevel(
      this.stage,
      this.configuration,
      this.leg.level.settings.wallThickness
    );
    // The frame can be taller than the authored level (a packed finish rack
    // may extend below it), so align the level's top edge with the frame's
    // top edge instead of centering on the frame.
    const levelCenter: [number, number] = [
      this.frame.center[0],
      this.frame.top + this.leg.level.size[1] / 2,
    ];
    this.level.restore(
      translateSerializedLevel(this.resizedFinishRackLevel(), levelCenter),
      levelCenter
    );

    // Hide the spawn-point visual exactly as the runtime does today — marbles
    // release from it but the ring itself should not be drawn during the race.
    // A top slider stays visible: marbles drop from the moving triangle.
    const spawnPoint = this.level.find("spawn-point");
    if (
      spawnPoint &&
      (spawnPoint.properties.variant ?? "point") !== "top-slider"
    ) {
      this.level.setVisible(spawnPoint.id, false);
    }
  }

  /**
   * The saved level with its finish rack resized to this leg's era plan: the
   * rack keeps its top edge (the finish line stays where the track delivers
   * marbles) and grows or shrinks downward. Locked boundary walls that ended
   * at the saved level bottom follow the rack's new bottom edge, so the rack
   * always meets the next leg's top wall with no gap and no protruding wall
   * stubs. Without a plan the document is used as saved.
   */
  private resizedFinishRackLevel(): SerializedLevel {
    const plan = this.configuration.finishPlan;
    if (!plan) {
      return this.leg.level;
    }
    const level = structuredClone(this.leg.level);
    const savedBottom = level.size[1] / 2;
    let rackBottom: number | null = null;
    for (const object of level.objects) {
      if (object.prefab !== "finish-zone") {
        continue;
      }
      const top = object.transform.position[1] - object.properties.height / 2;
      object.properties.height = plan.rackHeight;
      object.transform.position = [
        object.transform.position[0],
        top + plan.rackHeight / 2,
      ];
      rackBottom = top + plan.rackHeight;
    }
    if (rackBottom !== null) {
      for (const object of level.objects) {
        if (object.prefab !== "wall" || !object.locked) {
          continue;
        }
        for (const key of ["start", "end"] as const) {
          const point = object.properties[key];
          if (Math.abs(point[1] - savedBottom) < 1e-6) {
            object.properties[key] = [point[0], rackBottom];
          }
        }
      }
    }
    return level;
  }

  attachController(
    stableTeamIndices: readonly number[],
    hooks?: { onMarbleReleased?: (stableTeamIndex: number) => void }
  ): RaceController {
    this.controller = new RaceController(
      this.stage,
      this.level,
      this.configuration,
      {
        stableTeamIndices,
        external: {
          bounds: computeLegCullBounds(this.frame),
          onMarbleReleased: hooks?.onMarbleReleased,
        },
      }
    );
    this.controller.reset();
    return this.controller;
  }

  fixedUpdate(deltaMs: number) {
    this.controller?.fixedUpdate(deltaMs);
  }

  removeFinishedMarble(stableTeamIndex: number): boolean {
    return this.controller?.removeFinishedMarble(stableTeamIndex) ?? false;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // `RaceController.dispose` only unregisters its collision observer, so
    // reset first to delete this leg's race + finished marbles from the stage;
    // otherwise they would leak when the leg scrolls out of the window.
    this.controller?.reset();
    this.controller?.dispose();
    this.controller = null;
    this.level.dispose();
  }

  /** Convenience for the camera: the leg's slot as a world-space rect. */
  get worldRect(): WorldRect {
    return {
      center: this.frame.center,
      width: this.frame.size[0],
      height: this.frame.size[1],
    };
  }
}
