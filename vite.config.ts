import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // `icons/` is a staging folder for exported artwork, not part of the app
      // (the served copies live in public/assets). Watching it crashes the dev
      // server with EBUSY whenever a design tool writes a file in place.
      ignored: ['**/icons/**'],
    },
  },
});
