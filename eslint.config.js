import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layer boundaries (pages → scenes|debug|ui → races → game → engine).
 * Leg editing lives under scenes/leg-builder/editor and may only import game/engine.
 * Patterns match import paths as written (including relative ../../game/...).
 */
const deny = (groups, message) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: groups.map((group) => ({
        group: [group],
        message,
      })),
    },
  ],
});

/** @type {import('eslint').Linter.Config[]} */
export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  tseslint.configs.eslintRecommended,
  ...eslintPluginAstro.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/triple-slash-reference": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-case-declarations": "warn",
      "prefer-const": "warn",
    },
  },
  { languageOptions: { globals: globals.browser } },
  {
    files: ["src/engine/**/*.{ts,js}"],
    rules: deny(
      [
        "**/game/**",
        "**/races/**",
        "**/scenes/**",
        "**/debug/**",
        "**/pages/**",
        "**/ui/**",
      ],
      "engine is a leaf layer and must not import from game/races/scenes/debug/pages/ui"
    ),
  },
  {
    files: ["src/game/**/*.{ts,js}"],
    rules: deny(
      [
        "**/races/**",
        "**/scenes/**",
        "**/debug/**",
        "**/pages/**",
        "**/ui/**",
      ],
      "game may only import engine (not races/scenes/debug/pages/ui)"
    ),
  },
  {
    files: ["src/races/**/*.{ts,js}"],
    rules: deny(
      ["**/scenes/**", "**/debug/**", "**/pages/**", "**/ui/**"],
      "races may only import game and engine (not scenes/debug/pages/ui)"
    ),
  },
  {
    files: ["src/scenes/leg-builder/editor/**/*.{ts,js}"],
    rules: deny(
      [
        "**/races/**",
        "**/debug/**",
        "**/pages/**",
        "**/ui/**",
        "**/library/**",
        "**/race-builder/**",
        "**/race-player/**",
      ],
      "leg-builder editor may only import game and engine (not races/ui/other scenes)"
    ),
  },
  {
    files: ["src/debug/**/*.{ts,js}"],
    rules: deny(
      ["**/scenes/**", "**/races/**", "**/pages/**", "**/ui/**"],
      "debug demos may import game/engine only (not product scenes/races/pages/ui)"
    ),
  },
  {
    files: ["src/scenes/**/*.{ts,js}"],
    ignores: ["src/scenes/leg-builder/editor/**/*.{ts,js}"],
    rules: deny(
      ["**/pages/**", "**/debug/**"],
      "scenes may import game/races/engine/ui (not pages or debug)"
    ),
  },
  {
    files: ["src/pages/**/*.{ts,js,astro}"],
    // Underscore-prefixed files are page-local chrome (not routes); they may
    // read game constants for form defaults. Route shells stay thin.
    ignores: ["src/pages/**/_*.astro"],
    rules: deny(
      ["**/game/**", "**/engine/**", "**/races/**"],
      "pages should mount via scenes/debug/ui only (not game/engine/races)"
    ),
  },
  {
    files: ["src/pages/dev/**/*.{ts,js,astro}"],
    rules: deny(
      [
        "**/game/**",
        "**/engine/**",
        "**/races/**",
        "**/scenes/**",
      ],
      "dev pages should use debug/ + ui only"
    ),
  },
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", "bun.lockb"],
  },
];
