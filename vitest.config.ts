import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Measure only the pure-logic layers that are unit-tested. The runtime-
      // bound layers (Svelte components, Obsidian glue, the Runes store) are
      // verified by type-checking and manual testing instead.
      include: [
        'src/parser/**',
        'src/model/metadata.ts',
        'src/model/board-ops.ts',
        'src/ui/linkify.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 100,
        lines: 95,
      },
    },
  },
});
