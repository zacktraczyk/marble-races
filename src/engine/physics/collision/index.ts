// The public surface of the collision module. Everything here is named
// explicitly so that adding an export to a file below does not silently join
// the API; broadphase/, narrowphase/, and solver/ stay swappable behind it.

// Contract: the strategy interfaces and the manifold data they exchange.
export {
  createCollision,
  type Line,
  type CollisionPair,
  type ContactPoint,
  type ContactManifold,
  type Collision,
  type BroadPhase,
  type NarrowPhase,
  type ContactSolver,
} from "./types";

// Implementations.
export { NaiveAabbBroadPhase } from "./broadphase/naiveAabb";
export { computeWorldAabb, aabbsOverlap, type Aabb } from "./broadphase/aabb";
export { SATNarrowPhase } from "./narrowphase/sat";
export {
  SequentialImpulseSolver,
  type SequentialImpulseSolverOptions,
} from "./solver/sequentialImpulse";
