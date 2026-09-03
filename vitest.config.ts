import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // lcov is not a vitest default reporter — without this, `--coverage` writes clover/html
    // and redbar cannot inspect itself
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      // the suite fails below these, so a regression is a red build and not a number nobody reads
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
