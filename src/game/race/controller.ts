import type { Entity, EntityId } from "@engine/core/entity";
import type { EntityDefinition } from "@engine/stage";
import type { CollisionEvents } from "@engine/physics/physics";
import { marbleDefinition } from "../prefabs/marble";
import {
  createPackedFinishLayout,
  createPackedFinishPlacements,
  type FinishMarblePlacement,
} from "./finishGrid";
import { RoundRobinReleaseQueue } from "./releaseQueue";
import { TEAM_COLORS } from "./teams";
import {
  DEFAULT_SPAWN_DIRECTION_VARIANCE,
  randomSpawnAngle,
  randomSpawnOffsetsInCircle,
  spawnAreaRadius,
} from "./spawn";
import { getLevelObjectMotionPose } from "../level/motion";
import type { AuthoredLevel } from "../level/authoredLevel";
import {
  MAX_MARBLE_RADIUS,
  MIN_MARBLE_RADIUS,
  STAGING_MARBLE_GAP,
} from "../level/constants";
import { RoundFinishTracker } from "./roundFinishTracker";
import {
  resolveStableTeamIndices,
  teamIndexForMarble,
  type ExternalRaceMode,
  type FinishedMarble,
  type PendingMarble,
  type RaceControllerOptions,
  type RacePhase,
  type RaceSnapshot,
  type RoundConfiguration,
} from "./types";

export type {
  ExternalRaceMode,
  RaceControllerOptions,
  RaceSnapshot,
} from "./types";

/**
 * The slice of the engine stage a race actually drives. Declared structurally
 * rather than as the concrete `Stage` so this layer depends on the capabilities
 * it uses instead of on the engine's composition root — the same shape as the
 * leg editor's `EditorEnv` and `*Deps` ports. A real `Stage` satisfies it as-is.
 */
export type RaceStage = {
  physicsEnabled: boolean;
  readonly world: {
    get(id: EntityId): Entity | undefined;
    flushDestruction(): void;
  };
  spawn(definition: EntityDefinition): Entity;
  update(elapsed: number): void;
  clearOutOfBoundsEntities(outOfBoundsPadding?: number): Entity[];
  registerPhysicsObserver(observer: (data: CollisionEvents) => void): void;
  unregisterPhysicsObserver(observer: (data: CollisionEvents) => void): void;
};

export class RaceController {
  private configuration: RoundConfiguration;
  private stableTeamIndices: number[];
  private readonly usesCustomStableTeamIndices: boolean;
  private phase: RacePhase = "ready";
  private raceMarbles: Entity[] = [];
  private readonly raceMarbleIds = new Set<EntityId>();
  private finishMarbles: FinishedMarble[] = [];
  private releaseQueue: RoundRobinReleaseQueue<PendingMarble> | null = null;
  private physicsActive = false;
  private marbleRadius = MAX_MARBLE_RADIUS;
  private releaseElapsedMs = 0;
  private releasedMarbles = 0;
  private outOfBoundsMarbles = 0;
  private finishTracker: RoundFinishTracker;
  private motionElapsedMs = 0;
  private finishPlacements: FinishMarblePlacement[] = [];
  private readonly external: ExternalRaceMode | undefined;

  constructor(
    private readonly stage: RaceStage,
    private readonly level: AuthoredLevel,
    configuration: RoundConfiguration,
    { stableTeamIndices, external }: RaceControllerOptions = {}
  ) {
    this.configuration = { ...configuration };
    this.external = external;
    this.usesCustomStableTeamIndices = stableTeamIndices !== undefined;
    this.stableTeamIndices = resolveStableTeamIndices(
      configuration.teamCount,
      TEAM_COLORS.length,
      stableTeamIndices
    );
    this.finishTracker = new RoundFinishTracker(
      configuration.teamCount,
      configuration.marblesPerTeam
    );
    this.stage.registerPhysicsObserver(this.handleCollisions);
  }

  setConfiguration(configuration: RoundConfiguration) {
    this.stableTeamIndices = resolveStableTeamIndices(
      configuration.teamCount,
      TEAM_COLORS.length,
      this.usesCustomStableTeamIndices ? this.stableTeamIndices : undefined
    );
    this.configuration = { ...configuration };
    this.level.setRoundConfiguration(configuration);
    this.reset();
  }

  get snapshot(): RaceSnapshot {
    const queuedMarbles = this.releaseQueue?.remaining ?? 0;
    const eliminatedLocalTeamIndex = this.finishTracker.eliminatedTeamIndex;

    return {
      phase: this.phase,
      teamCount: this.configuration.teamCount,
      totalMarbles: this.finishTracker.totalMarbles,
      queuedMarbles,
      releasedMarbles: this.releasedMarbles,
      finishedMarbles: this.finishTracker.finishedMarbles,
      remainingMarbles: this.finishTracker.remainingMarbles,
      eliminatedTeamIndex:
        eliminatedLocalTeamIndex === null
          ? null
          : this.stableTeamIndices[eliminatedLocalTeamIndex],
      outOfBoundsMarbles: this.outOfBoundsMarbles,
      courseIssue: this.courseIssue,
    };
  }

  get courseIssue() {
    if (!this.level.has("spawn-point")) {
      return "Place a spawn point to run the race";
    }
    if (!this.level.has("finish-zone")) {
      return "The course needs a finish line";
    }
    return null;
  }

  toggleRunning() {
    if (this.courseIssue) {
      return;
    }
    if (this.phase === "running") {
      this.phase = "paused";
      return;
    }
    if (this.phase === "complete") {
      this.reset();
    }
    this.activatePhysics();
    this.phase = "running";
    this.releaseElapsedMs = this.configuration.releaseIntervalMs;
  }

  reset() {
    this.phase = "ready";
    if (!this.external) {
      this.stage.physicsEnabled = false;
    }
    this.releaseElapsedMs = 0;
    this.releasedMarbles = 0;
    this.outOfBoundsMarbles = 0;
    this.finishTracker = new RoundFinishTracker(
      this.configuration.teamCount,
      this.configuration.marblesPerTeam
    );
    this.motionElapsedMs = 0;
    this.clearRaceMarbles();
    this.level.resetMotion();

    const finish = this.level.find("finish-zone");
    this.finishPlacements = [];
    if (!finish) {
      this.marbleRadius = MAX_MARBLE_RADIUS;
    } else {
      const packedOptions = {
        position: finish.transform.position,
        rotation: finish.transform.rotation,
        width: finish.properties.width,
        wallThickness: this.level.wallThickness,
        bayCount: this.configuration.teamCount,
        marblesPerTeam: this.configuration.marblesPerTeam,
        marbleRadius:
          this.configuration.finishPlan?.marbleRadius ?? MAX_MARBLE_RADIUS,
        minimumRadius: MIN_MARBLE_RADIUS,
        gap: STAGING_MARBLE_GAP,
      };
      this.marbleRadius = createPackedFinishLayout(packedOptions).marbleRadius;
      this.finishPlacements = createPackedFinishPlacements(packedOptions);
    }
    this.level.setRaceMarbleRadius(this.marbleRadius);

    const teamQueues = Array.from(
      { length: this.configuration.teamCount },
      (_, teamIndex): PendingMarble[] =>
        Array.from({ length: this.configuration.marblesPerTeam }, () => ({
          teamIndex,
        }))
    );
    this.releaseQueue = new RoundRobinReleaseQueue(teamQueues);
  }

  fixedUpdate(deltaMs: number) {
    const ticksMotion =
      this.phase === "running" ||
      (this.external !== undefined && this.phase === "complete");

    if (this.phase === "running") {
      this.level.prepareMotionStep(this.motionElapsedMs, deltaMs);
      this.releaseElapsedMs += deltaMs;
      while (
        this.releaseQueue?.remaining &&
        this.releaseElapsedMs >= this.configuration.releaseIntervalMs
      ) {
        this.releaseWave();
        this.releaseElapsedMs -= this.configuration.releaseIntervalMs;
      }
    } else if (ticksMotion) {
      this.level.prepareMotionStep(this.motionElapsedMs, deltaMs);
    }

    if (this.phase !== "paused" && this.phase !== "complete") {
      if (this.external) {
        this.recordOutOfBoundsMarbles(this.collectOutOfBoundsMarbles());
      } else {
        this.stage.update(deltaMs);
        this.recordOutOfBoundsMarbles(this.stage.clearOutOfBoundsEntities());
      }
    }

    if (ticksMotion) {
      this.motionElapsedMs += deltaMs;
    }

    this.freezeIfSingleTeamRemains();
  }

  dispose() {
    this.stage.unregisterPhysicsObserver(this.handleCollisions);
  }

  private clearRaceMarbles() {
    for (const marble of this.raceMarbles) {
      marble.delete();
    }
    for (const { entity } of this.finishMarbles) {
      entity.delete();
    }
    this.raceMarbles = [];
    this.raceMarbleIds.clear();
    this.finishMarbles = [];
    this.releaseQueue = null;
    this.physicsActive = false;
    this.stage.world.flushDestruction();
  }

  private activatePhysics() {
    if (this.physicsActive) {
      return;
    }
    this.physicsActive = true;
    if (!this.external) {
      this.stage.physicsEnabled = true;
    }
  }

  private getFinishPlacement(bayIndex: number, slotIndex: number) {
    const placement =
      this.finishPlacements[
        bayIndex * this.configuration.marblesPerTeam + slotIndex
      ];
    return placement?.bayIndex === bayIndex && placement.slotIndex === slotIndex
      ? placement.position
      : null;
  }

  private freezeIfSingleTeamRemains() {
    if (
      this.phase !== "running" ||
      this.releaseQueue?.remaining !== 0 ||
      this.finishTracker.eliminatedTeamIndex === null
    ) {
      return false;
    }
    this.phase = "complete";
    this.physicsActive = false;
    if (this.external) {
      for (const marble of [...this.raceMarbles]) {
        if (!marble.markedForDeletion) {
          this.freezeMarbleInPlace(marble);
        }
      }
    } else {
      this.stage.physicsEnabled = false;
    }
    return true;
  }

  removeFinishedMarble(stableTeamIndex: number): boolean {
    for (let index = this.finishMarbles.length - 1; index >= 0; index--) {
      if (this.finishMarbles[index].stableTeamIndex === stableTeamIndex) {
        const [removed] = this.finishMarbles.splice(index, 1);
        removed.entity.delete();
        return true;
      }
    }
    return false;
  }

  abandon() {
    for (const marble of [...this.raceMarbles]) {
      if (marble.markedForDeletion) {
        continue;
      }
      this.freezeMarbleInPlace(marble);
    }
    this.releaseQueue = null;
  }

  private freezeMarbleInPlace(marble: Entity) {
    const teamIndex = teamIndexForMarble(marble, this.configuration.teamCount);
    if (teamIndex === null) {
      return;
    }
    const position: [number, number] = [marble.position[0], marble.position[1]];
    marble.delete();
    this.spawnFinishedMarble(position, teamIndex);
  }

  private spawnFinishedMarble(position: [number, number], teamIndex: number) {
    const stableTeamIndex = this.stableTeamIndices[teamIndex];
    this.finishMarbles.push({
      stableTeamIndex,
      entity: this.stage.spawn(
        marbleDefinition({
          position,
          radius: this.marbleRadius,
          color: TEAM_COLORS[stableTeamIndex],
          team: `${teamIndex + 1}`,
          tags: ["finished-marble"],
          physical: false,
        })
      ),
    });
  }

  private collectOutOfBoundsMarbles(): Entity[] {
    const bounds = this.external?.bounds;
    if (!bounds) {
      return [];
    }
    const outOfBounds: Entity[] = [];
    for (const marble of this.raceMarbles) {
      if (marble.markedForDeletion || !marble.hasTag("released-marble")) {
        continue;
      }
      const [x, y] = marble.position;
      if (
        x < bounds.minX ||
        x > bounds.maxX ||
        y < bounds.minY ||
        y > bounds.maxY
      ) {
        outOfBounds.push(marble);
      }
    }
    return outOfBounds;
  }

  private recordOutOfBoundsMarbles(entities: readonly Entity[]) {
    for (const marble of entities) {
      if (!marble.hasTag("released-marble")) {
        continue;
      }
      const teamIndex = teamIndexForMarble(
        marble,
        this.configuration.teamCount
      );
      if (
        teamIndex !== null &&
        this.completeMarble(marble, teamIndex, "out-of-bounds")
      ) {
        return;
      }
    }
  }

  private completeMarble(
    marble: Entity,
    teamIndex: number,
    source: "finish" | "out-of-bounds" = "finish"
  ) {
    const finishRecord = this.finishTracker.record(teamIndex);
    if (source === "out-of-bounds") {
      this.outOfBoundsMarbles++;
    }
    marble.delete();
    this.collectFinishedMarble(
      teamIndex,
      finishRecord.bayIndex,
      finishRecord.slotIndex
    );
    return this.freezeIfSingleTeamRemains();
  }

  private collectFinishedMarble(
    teamIndex: number,
    bayIndex: number,
    slotIndex: number
  ) {
    const position = this.getFinishPlacement(bayIndex, slotIndex);
    if (!position) {
      return;
    }
    this.spawnFinishedMarble([...position], teamIndex);
  }

  private getSpawnPoint() {
    return this.level.find("spawn-point");
  }

  /** Where marbles emerge right now — tracks an oscillating spawn slider. */
  private getSpawnPosition(
    spawnPoint: NonNullable<ReturnType<RaceController["getSpawnPoint"]>>
  ): [number, number] {
    if (!spawnPoint.motion) {
      return [...spawnPoint.transform.position];
    }
    const pose = getLevelObjectMotionPose(
      spawnPoint,
      this.level.wallThickness,
      this.motionElapsedMs
    );
    return [...pose.position];
  }

  private releaseWave() {
    if (!this.releaseQueue) {
      return false;
    }
    const waveSize = Math.min(
      this.configuration.teamCount,
      this.releaseQueue.remaining
    );
    const spawnPoint = this.getSpawnPoint();
    if (!spawnPoint) {
      return false;
    }
    const areaRadius = spawnAreaRadius(
      spawnPoint.properties.radius,
      waveSize,
      this.marbleRadius
    );
    const spawnOffsets = randomSpawnOffsetsInCircle(
      waveSize,
      areaRadius,
      this.marbleRadius
    );
    for (const spawnOffset of spawnOffsets) {
      this.releaseNextMarble(spawnOffset);
    }
    return true;
  }

  private releaseNextMarble(spawnOffset: [number, number]) {
    if (!this.releaseQueue) {
      return false;
    }
    const stagedMarble = this.releaseQueue.takeNext();
    const spawnPoint = this.getSpawnPoint();
    if (!stagedMarble || !spawnPoint) {
      return false;
    }

    const spawnRotation = spawnPoint.transform.rotation ?? 0;
    const spawnPosition = this.getSpawnPosition(spawnPoint);
    const angle = randomSpawnAngle(
      spawnRotation,
      spawnPoint.properties.directionVariance ??
        DEFAULT_SPAWN_DIRECTION_VARIANCE
    );
    const cosine = Math.cos(spawnRotation);
    const sine = Math.sin(spawnRotation);
    const marble = this.stage.spawn(
      marbleDefinition({
        position: [
          spawnPosition[0] + spawnOffset[0] * cosine - spawnOffset[1] * sine,
          spawnPosition[1] + spawnOffset[0] * sine + spawnOffset[1] * cosine,
        ],
        radius: this.marbleRadius,
        color: TEAM_COLORS[this.stableTeamIndices[stagedMarble.teamIndex]],
        team: `${stagedMarble.teamIndex + 1}`,
        tags: ["race-marble", "released-marble"],
        velocity: [
          Math.cos(angle) * spawnPoint.properties.launchSpeed,
          Math.sin(angle) * spawnPoint.properties.launchSpeed,
        ],
        restitution: 0.15,
        friction: 0.55,
      })
    );
    this.raceMarbles.push(marble);
    this.raceMarbleIds.add(marble.id);
    this.releasedMarbles++;
    this.external?.onMarbleReleased?.(
      this.stableTeamIndices[stagedMarble.teamIndex]
    );
    return true;
  }

  private readonly handleCollisions = ({
    entityCollisions,
  }: CollisionEvents) => {
    for (const { entity1: firstId, entity2: secondId } of entityCollisions) {
      for (const [marbleId, finishId] of [
        [firstId, secondId],
        [secondId, firstId],
      ]) {
        if (!this.raceMarbleIds.has(marbleId)) {
          continue;
        }
        const marble = this.stage.world.get(marbleId);
        const finish = this.stage.world.get(finishId);
        if (
          marble?.hasTag("released-marble") &&
          !marble.markedForDeletion &&
          finish?.hasTag("finish-zone")
        ) {
          const teamIndex = teamIndexForMarble(
            marble,
            this.configuration.teamCount
          );
          if (teamIndex === null) {
            continue;
          }
          if (this.completeMarble(marble, teamIndex)) {
            return;
          }
          break;
        }
      }
    }
  };
}
