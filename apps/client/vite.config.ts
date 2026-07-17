import { defineConfig } from 'vite';

export default defineConfig({
  // The native Electron build loads index.html from disk. Relative production
  // assets work in both file:// packages and the normal Vite browser server.
  base: './',
  envDir: '../..',
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
