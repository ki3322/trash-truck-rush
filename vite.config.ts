import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/systems/**', 'src/utils/**', 'src/config/**'],
      exclude: ['src/systems/AudioSystem.ts', 'src/systems/ShareImage.ts'],
    },
  },
});
