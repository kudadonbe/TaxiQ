import { defineConfig } from 'vitest/config'

// Server tests run against a real PostgreSQL (TEST_DATABASE_URL), one test file at a time.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 20000 },
})
