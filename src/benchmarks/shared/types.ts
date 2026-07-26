import type { VDURenderMetadata, VDURenderStrategy } from "@engine/vdu/vdu";

export interface WarmupOptions {
  frames?: number;
}

export interface WarmupResult {
  frames: number;
  durationMs: number;
  nominalFrameIntervalMs: number;
}

export interface BenchmarkRunOptions {
  durationMs?: number;
  minFrames?: number;
  gpu?: boolean;
}

export interface GpuRunSummary {
  requested: boolean;
  supported: boolean;
  validQueries: number;
  discardedQueries: number;
  pendingQueries: number;
}

export interface BrowserRunResult {
  startedAt: number;
  wallDurationMs: number;
  measuredFrames: number;
  /** Consecutive requestAnimationFrame callback timestamp deltas. */
  frameIntervalsMs: number[];
  /** CPU time spent in VDU.render(). */
  renderDurationsMs: number[];
  /** CPU time spent in the complete measured rAF callback. */
  callbackDurationsMs: number[];
  /** Valid asynchronous GPU timer results; absent when not requested. */
  gpuDurationsMs?: number[];
  gpu: GpuRunSummary;
}

export type VduScenarioName =
  | "random-balls"
  | "contiguous"
  | "grouped-runs"
  | "fragmented"
  | "unique-meshes"
  | "full-race";

export interface VduScenarioConfig {
  name: VduScenarioName;
  count: number;
  seed: number;
  physics: boolean;
  renderer: VDURenderStrategy;
}

export interface BenchmarkMetadata {
  scenario: VduScenarioConfig;
  vdu: VDURenderMetadata;
  webgl: {
    vendor: string;
    renderer: string;
    unmaskedVendor?: string;
    unmaskedRenderer?: string;
    version: string;
    shadingLanguageVersion: string;
    instancingSupported: boolean;
    gpuTimerSupported: boolean;
  };
  canvas: {
    cssWidth: number;
    cssHeight: number;
    backingWidth: number;
    backingHeight: number;
    devicePixelRatio: number;
  };
  userAgent: string;
}

export interface GlAuditResult {
  totalDrawCalls: number;
  drawArrays: number;
  drawArraysInstanced: number;
  totalInstancesSubmitted: number;
  instanceCounts: number[];
  averageBatchSize: number;
  maxBatchSize: number;
  uniformMatrix3fv: number;
  uniform4fv: number;
  uniform2f: number;
  bindBuffer: number;
  vertexAttribPointer: number;
  bufferData: number;
  bufferDataBytes: number;
  bufferSubData: number;
  bufferSubDataBytes: number;
  useProgram: number;
  clear: number;
}

export interface VisualSnapshot {
  width: number;
  height: number;
  pngDataUrl: string;
}

export interface VduBenchmarkApi {
  readonly ready: true;
  metadata(): BenchmarkMetadata;
  warmup(options?: WarmupOptions): Promise<WarmupResult>;
  run(options?: BenchmarkRunOptions): Promise<BrowserRunResult>;
  audit(): Promise<GlAuditResult>;
  capture(): VisualSnapshot;
  dispose(): void;
}

declare global {
  interface Window {
    __BENCHMARK__?: VduBenchmarkApi;
    __BENCHMARK_ERROR__?: string;
  }
}
