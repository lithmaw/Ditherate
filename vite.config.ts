import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // The site is served from https://lithmaw.github.io/Ditherate/, so built
  // asset URLs need that prefix. Dev still serves from the root.
  base: command === 'build' ? '/Ditherate/' : '/',
  server: {
    watch: {
      // `icons/` is a staging folder for exported artwork, not part of the app
      // (the served copies live in public/assets). Watching it crashes the dev
      // server with EBUSY whenever a design tool writes a file in place.
      ignored: ['**/icons/**'],
    },
  },
}));
