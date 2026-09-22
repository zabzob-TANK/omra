import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Le module de facturation est autonome : ses tests vivent à côté de son code.
    // `lib/` suit la même convention pour les briques transverses, comme le
    // garde-barrière de session (`lib/session-garde.ts`).
    include: [
      'modules/**/*.test.ts',
      'modules/**/*.test.tsx',
      'lib/**/*.test.ts',
    ],
    environment: 'node',
  },
})
