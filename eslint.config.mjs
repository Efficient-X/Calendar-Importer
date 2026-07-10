import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["node_modules/**", "main.js", ".agents/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", {
        brands: ["Obsidian", "Tasks", "Calendar Importer", "Efficient X Group", "Luxon", "iCal", "webcal"],
        acronyms: ["ICS", "URL", "URLs", "HTTPS"],
        ignoreRegex: ["^#", "^https?://", "^Australia/", "^yyyy-", "^HH:"],
      }],
    },
  },
  {
    files: ["esbuild.config.mjs", "eslint.config.mjs"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
]);
