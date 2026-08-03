import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Le module de facturation est autonome : ses tests vivent à côté de son code.
    include: ['modules/**/*.test.ts', 'modules/**/*.test.tsx'],
    environment: 'node',
  },
})
