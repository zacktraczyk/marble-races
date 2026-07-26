import type { Vec2 } from "@engine/core/transform";
import type { LevelObjectData, SpawnPointVariant } from "@game/level/document";
import {
  applyTopSliderSpawnLayout,
  createCourseBoundaries,
} from "@game/level/objects";
import type { RoundConfiguration } from "@game/race/types";
import type { AuthoredLevel } from "@game/level/authoredLevel";
import type Stage from "@engine/stage";
import { computeCourseGridWorldBounds } from "./courseGridBounds";
import { constrainSpawnPoint } from "./spawnConstraint";
import { readCourseSize, readWallThickness } from "./ui/settings";
import type { BuilderUi } from "./ui";

type CourseSyncHost = {
  readonly stage: Stage;
  readonly level: AuthoredLevel;
  readonly ui: BuilderUi;
  getConfiguration(): RoundConfiguration;
  getLastValidSpawnPosition(): Vec2 | null;
  setLastValidSpawnPosition(value: Vec2 | null): void;
  commitLevelChange(): void;
  fitCamera(): void;
};

/** Course size, wall thickness, and spawn-point sync for the leg builder. */
export class LegCourseSync {
  constructor(private readonly host: CourseSyncHost) {}

  constrainSpawnPoint(
    spawnPoint: Extract<LevelObjectData, { prefab: "spawn-point" }>
  ) {
    this.host.setLastValidSpawnPosition(
      constrainSpawnPoint({
        spawnPoint,
        objects: this.host.level.objects,
        wallThickness: this.host.level.wallThickness,
        stageSize: [this.host.stage.width, this.host.stage.height],
        lastValidSpawnPosition: this.host.getLastValidSpawnPosition(),
      })
    );
  }

  syncSpawnPointToCourse() {
    const spawnPoint = this.host.level.find("spawn-point");
    if (!spawnPoint) {
      return;
    }
    this.constrainSpawnPoint(spawnPoint);
    this.host.level.refresh(spawnPoint);
  }

  setSpawnVariant(variant: SpawnPointVariant, playbackActive: boolean) {
    if (playbackActive) {
      return false;
    }
    const spawnPoint = this.host.level.find("spawn-point");
    if (!spawnPoint || (spawnPoint.properties.variant ?? "point") === variant) {
      return false;
    }
    spawnPoint.properties.variant = variant;
    if (variant === "top-slider") {
      applyTopSliderSpawnLayout(
        spawnPoint,
        [this.host.stage.width, this.host.stage.height],
        this.host.level.wallThickness
      );
    } else {
      delete spawnPoint.motion;
      spawnPoint.transform.rotation = Math.PI / 2;
      this.constrainSpawnPoint(spawnPoint);
    }
    this.host.level.refresh(spawnPoint);
    this.host.commitLevelChange();
    return true;
  }

  handleCourseSizeChange() {
    const [width, height] = readCourseSize(this.host.ui);
    this.host.ui.courseWidthInput.value = `${width}`;
    this.host.ui.courseHeightInput.value = `${height}`;
    if (width === this.host.stage.width && height === this.host.stage.height) {
      return;
    }
    this.host.stage.setSize(width, height);
    this.host.level.resize(
      [width, height],
      createCourseBoundaries(
        width,
        height,
        this.host.level.wallThickness,
        this.host.getConfiguration()
      )
    );
    this.syncSpawnPointToCourse();
    this.host.fitCamera();
    this.host.commitLevelChange();
  }

  handleWallThicknessChange() {
    const wallThickness = readWallThickness(this.host.ui);
    this.host.ui.wallThicknessInput.value = `${wallThickness}`;
    if (wallThickness === this.host.level.wallThickness) {
      return;
    }
    this.host.level.setWallThickness(wallThickness);
    this.host.level.resize(
      [this.host.stage.width, this.host.stage.height],
      createCourseBoundaries(
        this.host.stage.width,
        this.host.stage.height,
        wallThickness,
        this.host.getConfiguration()
      )
    );
    this.syncSpawnPointToCourse();
    this.host.commitLevelChange();
  }

  getGridWorldBounds() {
    return computeCourseGridWorldBounds({
      objects: this.host.level.objects,
      wallThickness: this.host.level.wallThickness,
      stageWidth: this.host.stage.width,
      stageHeight: this.host.stage.height,
    });
  }
}
