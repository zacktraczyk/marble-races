// ---------------------------------------------------------------------------
// Layer graph
//
// The architecture is declared once, in the tables below, and everything that
// enforces or documents it is derived from them. Each zone lists what its files
// MAY import; everything else under src/ is denied. Cross-layer imports are
// spelled with the `@layer/*` aliases from tsconfig.json.
//
// Consumed by eslint.config.js (import boundaries) and by the boundary test.
// This lives at the repo root rather than under src/ on purpose: it is build
// tooling that runs *on* the source tree, not application code inside it.
// ---------------------------------------------------------------------------

export const LAYERS = [
  "engine",
  "game",
  "races",
  "scenes",
  "debug",
  "pages",
  "ui",
  "lib",
  "layouts",
  "benchmarks",
];

/** Top-level layers. Order matters: later zones override earlier ones. */
export const LAYER_ZONES = [
  { dir: "src/engine", self: "engine", mayImport: [] },
  { dir: "src/game", self: "game", mayImport: ["engine"] },
  { dir: "src/races", self: "races", mayImport: ["engine", "game"] },
  { dir: "src/benchmarks", self: "benchmarks", mayImport: ["engine", "game"] },
  { dir: "src/debug", self: "debug", mayImport: ["engine", "game"] },
  { dir: "src/ui", self: "ui", mayImport: [] },
  { dir: "src/lib", self: "lib", mayImport: [] },
  { dir: "src/layouts", self: "layouts", mayImport: ["lib", "ui"] },
  {
    dir: "src/scenes",
    self: "scenes",
    mayImport: ["engine", "game", "races", "ui", "lib"],
  },
  {
    dir: "src/pages",
    self: "pages",
    mayImport: ["scenes", "debug", "ui", "lib", "layouts", "benchmarks"],
    // Underscore-prefixed files are page-local chrome, not routes; they may
    // read game constants for form defaults. Route shells stay thin.
    ignores: ["src/pages/**/_*.astro"],
  },
];

/**
 * Narrower zones, applied after the layer zones above so they win. Their deny
 * lists still include the parent layer's, because ESLint flat config REPLACES
 * a rule's options for a later matching config rather than merging them — a
 * sub-zone that omits its parent's denials silently disables them.
 */
export const NARROW_ZONES = [
  {
    // The leg editor sits beneath the rest of the leg builder: it may reach
    // game/engine, but not races, ui, or any sibling scene.
    dir: "src/scenes/leg-builder/editor",
    self: "scenes",
    mayImport: ["engine", "game"],
    alsoDeny: [
      "@scenes/library/**",
      "@scenes/race-builder/**",
      "@scenes/race-player/**",
      "**/library/**",
      "**/race-builder/**",
      "**/race-player/**",
    ],
  },
  {
    dir: "src/pages/dev",
    self: "pages",
    mayImport: ["debug", "ui", "layouts", "benchmarks"],
    ignores: ["src/pages/**/_*.astro"],
  },
];

/**
 * The engine's own internal order. `utils` and `core` sit beneath every
 * subsystem; `stage` is the composition root that knows about all of them, so a
 * type composing physics/render components belongs there rather than in core.
 */
export const ENGINE_SUBSYSTEMS = [
  "utils",
  "core",
  "camera",
  "physics",
  "vdu",
  "input",
  "runtime",
  "stage",
];

export const ENGINE_ZONES = [
  { sub: "utils", mayImport: [] },
  { sub: "core", mayImport: ["utils"] },
  { sub: "camera", mayImport: ["core"] },
  { sub: "physics", mayImport: ["core", "utils"] },
  { sub: "vdu", mayImport: ["camera", "core", "utils"] },
  { sub: "input", mayImport: ["camera"] },
  { sub: "runtime", mayImport: [] },
  { sub: "stage", mayImport: ["camera", "core", "physics", "vdu"] },
];

// ---------------------------------------------------------------------------
// Rule generation
// ---------------------------------------------------------------------------

/** Every import spelling that reaches top-level `layer` from outside it. */
const layerPatterns = (layer) => [
  `@${layer}`,
  `@${layer}/**`,
  // Relative spellings are a backstop for anything hand-written. Omitted for
  // `ui`: a glob ending in a `ui` segment would also match the scene-local
  // scenes/leg-builder/ui and scenes/race-builder/ui folders.
  ...(layer === "ui" ? [] : [`**/${layer}`, `**/${layer}/**`]),
];

/** Every import spelling that reaches engine subsystem `sub` from outside it. */
const subsystemPatterns = (sub) => [
  `@engine/${sub}`,
  `@engine/${sub}/**`,
  `**/${sub}`,
  `**/${sub}/**`,
];

const forbidden = (universe, self, mayImport, patternsFor) =>
  universe
    .filter((name) => name !== self && !mayImport.includes(name))
    .flatMap(patternsFor);

const list = (names) => (names.length ? names.join(", ") : "nothing");

const zoneConfig = ({ dir, self, mayImport, alsoDeny = [], ignores }) => ({
  files: [`${dir}/**/*.{ts,js,astro}`],
  ...(ignores ? { ignores } : {}),
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              ...forbidden(LAYERS, self, mayImport, layerPatterns),
              ...alsoDeny,
            ],
            message: `${dir} may import ${list(mayImport)}`,
          },
        ],
      },
    ],
  },
});

const engineZoneConfig = ({ sub, mayImport }) => ({
  // A subsystem is either a folder or a single flat file (e.g. stage.ts), so
  // match both spellings — otherwise flattening a folder silently kills its zone.
  files: [`src/engine/${sub}/**/*.{ts,js}`, `src/engine/${sub}.{ts,js}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // Self-contained: repeats the src/engine layer denials.
            group: [
              ...forbidden(LAYERS, "engine", [], layerPatterns),
              ...forbidden(
                ENGINE_SUBSYSTEMS,
                sub,
                mayImport,
                subsystemPatterns
              ),
            ],
            message: `engine/${sub} may import ${list(mayImport)} within the engine, and nothing outside it`,
          },
        ],
      },
    ],
  },
});

/** ESLint config objects enforcing the graph above, in precedence order. */
export const boundaryConfigs = [
  ...LAYER_ZONES.map(zoneConfig),
  ...ENGINE_ZONES.map(engineZoneConfig),
  ...NARROW_ZONES.map(zoneConfig),
];
