import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

// Import boundaries are generated from the layer graph in layers.config.js.
import { boundaryConfigs } from "./layers.config.js";

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
  ...boundaryConfigs,
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", "bun.lockb"],
  },
];
