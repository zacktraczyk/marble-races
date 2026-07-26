import {
  LevelDocument,
  type LevelObjectData,
  type NewLevelObjectData,
  type SerializedLevel,
} from "./document";
import type { Entity } from "@engine/core/entity";
import type { Vec2 } from "@engine/core/transform";
import { millisecondsToSimulationSeconds } from "@engine/physics/physics";
import type Stage from "@engine/stage";
import { doesSliderLoopResetBetween, getLevelObjectMotionPose } from "./motion";
import { levelObjectDefinitions } from "../prefabs/levelObject";
import { applyTopSliderSpawnLayout } from "./objects";
import { finishRackHeightFor } from "../race/finishGrid";
import {
  MAX_MARBLE_RADIUS,
  MIN_MARBLE_RADIUS,
  STAGING_MARBLE_GAP,
} from "./constants";
import type { RoundConfiguration } from "../race/types";

type LevelPrefab = LevelObjectData["prefab"];

export class AuthoredLevel {
  readonly document: LevelDocument;
  private readonly entities = new Map<string, Entity[]>();
  private readonly hiddenObjects = new Set<string>();
  private teamCount: number;
  private marblesPerTeam: number;
  private finishPlan: RoundConfiguration["finishPlan"];
  private raceMarbleRadius = MAX_MARBLE_RADIUS;

  constructor(
    private readonly stage: Stage,
    configuration: Pick<
      RoundConfiguration,
      "teamCount" | "marblesPerTeam" | "finishPlan"
    >,
    wallThickness: number
  ) {
    this.teamCount = configuration.teamCount;
    this.marblesPerTeam = configuration.marblesPerTeam;
    this.finishPlan = configuration.finishPlan;
    this.document = new LevelDocument(
      "Untitled level",
      [stage.width, stage.height],
      { wallThickness }
    );
  }

  setRoundConfiguration(
    configuration: Pick<
      RoundConfiguration,
      "teamCount" | "marblesPerTeam" | "finishPlan"
    >
  ) {
    if (
      this.teamCount === configuration.teamCount &&
      this.marblesPerTeam === configuration.marblesPerTeam &&
      this.finishPlan === configuration.finishPlan
    ) {
      return;
    }
    this.teamCount = configuration.teamCount;
    this.marblesPerTeam = configuration.marblesPerTeam;
    this.finishPlan = configuration.finishPlan;
    this.syncFinishZoneGeometry();
    for (const object of [...this.objects]) {
      if (object.prefab === "finish-zone" || object.prefab === "spawn-point") {
        this.refresh(object);
      }
    }
  }

  /**
   * Re-derives the locked finish rack's height from the packed grid and keeps
   * its bottom edge anchored. The saved document's height always wins when a
   * rack spawns, so the document itself is rewritten before refreshing.
   */
  private syncFinishZoneGeometry() {
    const finish = this.find("finish-zone");
    if (!finish || !finish.locked) {
      return;
    }
    let height: number;
    try {
      height =
        this.finishPlan?.rackHeight ??
        finishRackHeightFor({
          width: finish.properties.width,
          wallThickness: this.wallThickness,
          bayCount: this.teamCount,
          marblesPerTeam: this.marblesPerTeam,
          marbleRadius: MAX_MARBLE_RADIUS,
          minimumRadius: MIN_MARBLE_RADIUS,
          gap: STAGING_MARBLE_GAP,
        });
    } catch {
      // Impossible combination mid-edit; keep the saved geometry.
      return;
    }
    const bottom = finish.transform.position[1] + finish.properties.height / 2;
    finish.properties.height = height;
    finish.transform.position = [
      finish.transform.position[0],
      bottom - height / 2,
    ];
  }

  /**
   * Re-derives a top-slider spawn's pinned track from the current course.
   * Saved documents may predate the current layout (different clearance or
   * color), so the document is rewritten before the spawn's entities exist.
   */
  private syncSpawnPointGeometry(origin: Vec2 = [0, 0]) {
    const spawnPoint = this.find("spawn-point");
    if (
      !spawnPoint ||
      (spawnPoint.properties.variant ?? "point") !== "top-slider"
    ) {
      return;
    }
    applyTopSliderSpawnLayout(
      spawnPoint,
      this.document.size,
      this.wallThickness,
      origin
    );
  }

  setRaceMarbleRadius(marbleRadius: number) {
    if (Math.abs(this.raceMarbleRadius - marbleRadius) < Number.EPSILON) {
      return;
    }
    this.raceMarbleRadius = marbleRadius;
    const spawnPoint = this.find("spawn-point");
    if (spawnPoint) {
      this.refresh(spawnPoint);
    }
  }

  get objects() {
    return this.document.objects;
  }

  get wallThickness() {
    return this.document.settings.wallThickness;
  }

  add(data: NewLevelObjectData) {
    return this.spawn(this.document.add(data));
  }

  remove(id: string) {
    this.clearRuntimeEntities(id);
    this.hiddenObjects.delete(id);
    this.document.remove(id);
  }

  setVisible(id: string, visible: boolean) {
    if (visible) {
      this.hiddenObjects.delete(id);
    } else {
      this.hiddenObjects.add(id);
    }
    for (const entity of this.entities.get(id) ?? []) {
      entity.scale = visible ? [1, 1] : [0, 0];
    }
  }

  resize(size: Vec2, boundaries: NewLevelObjectData[]) {
    for (const object of [...this.objects]) {
      if (object.locked) {
        this.remove(object.id);
      }
    }
    this.document.size = [...size];
    for (const boundary of boundaries) {
      this.add(boundary);
    }
  }

  setWallThickness(wallThickness: number) {
    this.document.settings.wallThickness = wallThickness;
    for (const object of [...this.objects]) {
      if (object.prefab === "wall" || object.prefab === "finish-zone") {
        this.refresh(object);
      }
    }
  }

  dispose() {
    for (const object of [...this.objects]) {
      this.clearRuntimeEntities(object.id);
    }
    this.hiddenObjects.clear();
  }

  /** Restores a level, optionally re-pinning course-relative objects around a world-space origin. */
  restore(serialized: SerializedLevel, origin: Vec2 = [0, 0]) {
    for (const object of [...this.objects]) {
      this.clearRuntimeEntities(object.id);
    }
    this.hiddenObjects.clear();
    this.document.restore(serialized);
    // Saved racks may predate the current packed layout; re-derive before
    // spawning so the frame matches where finished marbles will actually go.
    this.syncFinishZoneGeometry();
    this.syncSpawnPointGeometry(origin);
    for (const object of this.objects) {
      this.spawn(object);
    }
  }

  find<Prefab extends LevelPrefab>(prefab: Prefab) {
    return (
      (this.objects.find((object) => object.prefab === prefab) as
        | Extract<LevelObjectData, { prefab: Prefab }>
        | undefined) ?? null
    );
  }

  has(prefab: LevelPrefab) {
    return this.objects.some((object) => object.prefab === prefab);
  }

  refresh(object: LevelObjectData) {
    this.clearRuntimeEntities(object.id);
    this.spawn(object);
  }

  prepareMotionStep(elapsedMs: number, deltaMs: number) {
    const deltaSeconds = millisecondsToSimulationSeconds(deltaMs);
    if (deltaSeconds <= 0) {
      return;
    }

    for (const object of this.objects) {
      if (!object.motion) {
        continue;
      }
      const current = getLevelObjectMotionPose(
        object,
        this.wallThickness,
        elapsedMs
      );
      const next = getLevelObjectMotionPose(
        object,
        this.wallThickness,
        elapsedMs + deltaMs
      );
      const resetsAtEndpoint =
        object.motion.type === "oscillate" &&
        doesSliderLoopResetBetween(
          object.motion,
          elapsedMs,
          elapsedMs + deltaMs
        );
      for (const entity of this.entities.get(object.id) ?? []) {
        entity.position = [
          ...(resetsAtEndpoint ? next.position : current.position),
        ];
        entity.rotation = resetsAtEndpoint ? next.rotation : current.rotation;
        const physicsEntity = this.stage.getPhysicsEntity(entity);
        if (!physicsEntity) {
          continue;
        }
        physicsEntity.velocity = resetsAtEndpoint
          ? [0, 0]
          : [
              (next.position[0] - current.position[0]) / deltaSeconds,
              (next.position[1] - current.position[1]) / deltaSeconds,
            ];
        physicsEntity.angularVelocity = resetsAtEndpoint
          ? 0
          : (next.rotation - current.rotation) / deltaSeconds;
      }
    }
  }

  resetMotion() {
    for (const object of this.objects) {
      if (!object.motion) {
        continue;
      }
      const rest = getLevelObjectMotionPose(object, this.wallThickness, 0);
      for (const entity of this.entities.get(object.id) ?? []) {
        entity.position = [...rest.position];
        entity.rotation = rest.rotation;
        const physicsEntity = this.stage.getPhysicsEntity(entity);
        if (physicsEntity) {
          physicsEntity.velocity = [0, 0];
          physicsEntity.angularVelocity = 0;
        }
      }
    }
  }

  private spawn(object: LevelObjectData) {
    const entities = levelObjectDefinitions(object, {
      teamCount: this.teamCount,
      marblesPerTeam: this.marblesPerTeam,
      wallThickness: this.wallThickness,
      maximumMarbleRadius: MAX_MARBLE_RADIUS,
      minimumMarbleRadius: MIN_MARBLE_RADIUS,
      marbleGap: STAGING_MARBLE_GAP,
      raceMarbleRadius: this.raceMarbleRadius,
    }).map((definition) => this.stage.spawn(definition));
    if (this.hiddenObjects.has(object.id)) {
      for (const entity of entities) {
        entity.scale = [0, 0];
      }
    }
    this.entities.set(object.id, entities);
    return object;
  }

  private clearRuntimeEntities(id: string) {
    for (const entity of this.entities.get(id) ?? []) {
      entity.delete();
    }
    this.entities.delete(id);
    this.stage.world.flushDestruction();
  }
}
