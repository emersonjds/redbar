import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // lcov is not a vitest default reporter — without this, `--coverage` writes clover/html
    // and redbar cannot inspect itself
    coverage: { reporter: ['text', 'lcov'], include: ['src/**'] },
  },
})
