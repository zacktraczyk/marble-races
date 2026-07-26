import { Camera2D } from "./camera/camera2d";
import { Entity, type EntityId } from "./core/entity";
import { World, type EntityCoreDefinition } from "./core/world";
import type { PhysicsComponentDefinition } from "./physics/component";
import Physics, { type CollisionEvents } from "./physics/physics";
import type { RenderComponentDefinition } from "./vdu/component";
import { VDU } from "./vdu/vdu";

/**
 * Everything needed to spawn one entity: neutral core data plus the optional
 * per-subsystem components. Composed here rather than in `core/` so that `core`
 * stays unaware of physics and rendering — the stage is the only place that
 * knows all three exist.
 */
export interface EntityDefinition extends EntityCoreDefinition {
  physics?: PhysicsComponentDefinition;
  render?: RenderComponentDefinition;
}

export class Stage {
  private readonly _vdu: VDU;

  physicsEnabled: boolean = true;
  private readonly _physics: Physics;

  height: number;
  width: number;

  readonly world: World;
  readonly camera: Camera2D;

  constructor({
    width = 600,
    height = 600,
    physics,
    vdu: vduParam,
  }: {
    width?: number;
    height?: number;
    physics?: Physics;
    vdu?: VDU | { canvas: HTMLCanvasElement | string };
  } = {}) {
    this.height = height;
    this.width = width;

    let vdu: VDU;
    let camera: Camera2D;
    if (vduParam) {
      if (vduParam instanceof VDU) {
        vdu = vduParam;
        camera = vdu.camera;
      } else {
        camera = new Camera2D();
        vdu = new VDU(vduParam.canvas, camera);
      }
    } else {
      camera = new Camera2D();
      vdu = new VDU("#gl-canvas", camera);
    }
    this._vdu = vdu;
    this.camera = camera;

    this._physics = physics ?? new Physics();
    this.world = new World();
    this.world.onDestroy((entity) => {
      this._physics.removeEntity(entity.id);
      this._vdu.removeEntity(entity.id);
    });
    this.camera.center(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  /**
   * Preferred creation path. The stage is the composition root that registers
   * neutral entity data with otherwise independent physics/rendering systems.
   */
  spawn(definition: EntityDefinition): Entity {
    const entity = this.world.create(definition);
    if (definition.physics) {
      this._physics.addEntity(entity.id, entity.transform, definition.physics);
    }
    if (definition.render) {
      this._vdu.addEntity(entity.id, entity.transform, definition.render);
    }
    return entity;
  }

  destroy(entity: EntityId | Entity) {
    this.world.destroy(typeof entity === "number" ? entity : entity.id);
  }

  getPhysicsEntity(entity: EntityId | Entity) {
    return this._physics.getEntity(
      typeof entity === "number" ? entity : entity.id
    );
  }

  update(elapsed: number) {
    if (this.physicsEnabled) {
      this._physics.update(elapsed);
    }
    this.world.flushDestruction();
  }

  render() {
    this._vdu.render();
  }

  setSize(width: number, height: number) {
    if (
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      throw new Error("Stage dimensions must be positive finite numbers");
    }
    this.width = width;
    this.height = height;
  }

  clearOutOfBoundsEntities(outOfBoundsPadding = 1000) {
    const removed: Entity[] = [];
    for (const entity of this.world.entities) {
      if (entity.markedForDeletion) {
        continue;
      }
      if (
        entity.position[0] < -this.width / 2 - outOfBoundsPadding ||
        entity.position[0] > this.width / 2 + outOfBoundsPadding ||
        entity.position[1] < -this.height / 2 - outOfBoundsPadding ||
        entity.position[1] > this.height / 2 + outOfBoundsPadding
      ) {
        entity.delete();
        removed.push(entity);
      }
    }
    return removed;
  }

  get canvas() {
    return this._vdu.canvas;
  }

  set drawMode(mode: "TRIANGLES" | "LINES") {
    this._vdu.drawMode = mode;
  }

  get drawMode() {
    return this._vdu.drawMode;
  }

  registerPhysicsObserver(observer: (data: CollisionEvents) => void) {
    this._physics.register(observer);
  }

  unregisterPhysicsObserver(observer: (data: CollisionEvents) => void) {
    this._physics.unregister(observer);
  }

  dispose() {
    for (const entity of this.world.entities) {
      entity.delete();
    }
    this.world.flushDestruction();
    this._physics.dispose();
    this._vdu.dispose();
  }
}

export default Stage;
