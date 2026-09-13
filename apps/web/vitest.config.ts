import { defineConfig } from 'vitest/config';

/**
 * The web app's tests cover its *logic*, not its rendering: the pure functions in
 * `state/` that decide what the UI should do — which cavity a layup implies, how a
 * bridged layer's geometry resolves, what the engine gets handed. Those are the parts
 * where being wrong is silent, and they need no DOM to check.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
