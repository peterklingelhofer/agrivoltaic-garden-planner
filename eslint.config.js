import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Biome is the linter and formatter for this repo: see biome.jsonc.
 * ESLint survives for one reason only. eslint-plugin-react-hooks v7 ships sixteen
 * React Compiler rules and Biome has an equivalent for exactly two of them
 * (rules-of-hooks, exhaustive-deps). The other fourteen are purity, immutability,
 * set-state-in-render, set-state-in-effect, refs, preserve-manual-memoization,
 * error-boundaries and friends. They have no Biome counterpart, so dropping ESLint would
 * lose real guarantees. typescript-eslint is present only as the parser. Biome covers
 * its rules
 */
export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    extends: [reactHooks.configs.flat.recommended],
  },
])
