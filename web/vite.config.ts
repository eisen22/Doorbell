import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the site lives at https://<user>.github.io/Doorbell/, so assets need that prefix.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Doorbell/' : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
});
