# Marble Races — Custom-Engine Marble Race Game

Marble Races (working title) is a local-first race builder and player built with
TypeScript, Astro, WebGL, and a custom 2D physics engine. Design multi-leg
courses in the browser, then race teams through an elimination tournament until
one winner remains.

## Project status

Marble Races is an actively developed local MVP. Race documents and course geometry
are stored in the browser's `localStorage`; there are no accounts, remote
storage, or publishing features yet. Clearing site data also removes saved
races, so treat the current build as a creative sandbox rather than permanent
storage.

## Glossary

| Term           | Meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| **level**      | Serialized course geometry (`SerializedLevel` / `AuthoredLevel`) under `game/level/` |
| **leg**        | One race stage that wraps a level document                                           |
| **leg editor** | Interactive course editor (`scenes/leg-builder/editor`) used by the leg builder      |
| **VDU**        | Visual Display Unit — the WebGL renderer under `src/engine/vdu`                      |

## Features

- **Race builder:** Configure teams and arrange the legs of an elimination race
- **Leg editor:** Build courses from walls and moving obstacles with snapping,
  selection, transforms, undo, and redo
- **Race player:** Run each authored leg, eliminate teams, and advance to a
  winner
- **Custom physics:** Simulate circles, convex polygons, sensors, friction, and
  kinematic obstacles with SAT collision detection
- **WebGL renderer:** Draw race geometry through basic and instanced render paths
- **Developer experiments:** Explore GJK and other collision/rendering prototypes
  separately from the product physics path

## Using Marble Races

1. Create a race and choose its starting team count.
2. Add one leg for each elimination the race needs.
3. Open each leg in the editor, arrange its course, and preview the simulation.
4. Return to the race builder and start the complete race.
5. Pause, restart, or skip a leg that cannot finish; press `Escape` to leave the
   race player.

### Leg editor shortcuts

| Shortcut                      | Action                         |
| ----------------------------- | ------------------------------ |
| `H` or `1`                    | Pan tool                       |
| `V` or `2`                    | Selection tool                 |
| `W`, `L`, or `3`              | Wall tool                      |
| Hold `Space`                  | Temporarily pan                |
| `Ctrl/⌘` + mouse wheel        | Zoom                           |
| `F`                           | Focus the current selection    |
| Arrow keys                    | Nudge the selection            |
| `Shift` + arrow keys          | Nudge by a larger step         |
| `Ctrl/⌘ Z` / `Ctrl/⌘ Shift Z` | Undo / redo                    |
| `Ctrl/⌘ C`, `X`, `V`, or `D`  | Copy, cut, paste, or duplicate |
| `Delete` or `Backspace`       | Delete the selection           |
| `Escape`                      | Cancel the current operation   |

## Quick Start

### Prerequisites

- Bun 1.3.11
- Modern web browser with WebGL support

### Installation

```bash
# Install dependencies
bun install
```

### Development

```bash
# Start development server
bun run dev
```

Open [http://localhost:4321](http://localhost:4321) to view the project.

### Building for Production

```bash
# Build the project
bun run build

# Preview the build
bun run preview
```

## Available scripts

| Command                | Description                             |
| ---------------------- | --------------------------------------- |
| `bun run dev`          | Start development server                |
| `bun run build`        | Build for production                    |
| `bun run preview`      | Preview production build                |
| `bun run check`        | Run the full validation suite           |
| `bun run lint`         | Run ESLint                              |
| `bun run lint:fix`     | Fix ESLint issues                       |
| `bun run type-check`   | Check TypeScript and Astro components   |
| `bun run format`       | Format code with Prettier               |
| `bun run format:check` | Check formatting without changing files |
| `bun run test`         | Run unit tests                          |
| `bun run bench:vdu`    | Benchmark VDU render paths              |
| `bun run clean`        | Clean build artifacts                   |

## VDU performance benchmark

The browser benchmark compares the basic and instanced WebGL paths with paired,
interleaved runs against a production build. It separately checks visual output
and WebGL call counts so instrumentation does not affect timed samples.

```bash
# Short harness check
bun run bench:vdu:smoke

# Standard paired benchmark
bun run bench:vdu -- --scenario contiguous --count 2500

# All representative scenarios
bun run bench:vdu:full
```

See [`benchmarks/vdu/README.md`](benchmarks/vdu/README.md) for presets, GPU
timing, cross-build comparison, and result interpretation.

## Documentation

- [Local MVP sitemap and rules](docs/MVP_SITEMAP.md)
- [VDU benchmark guide](benchmarks/vdu/README.md)
- [Recorded VDU instancing result](docs/performance/vdu-instancing.md)

## Architecture

Product code lives under `src/` with intended dependency direction:

`pages` → `scenes` → `races` → `game` → `engine`

Shared level documents, geometry, motion, constants, grid helpers, and race
simulation (`RaceController`) live in `game/`. Saved-race documents and browser
persistence live in `races/`. Interactive editing (`legEditor`, undo history,
tools) lives under `scenes/leg-builder/editor/`.

Engine prototypes and legacy race demos live in `debug/` with Astro routes
under `/dev/*`, separate from product `scenes/`.
