import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative URLs keep the built site usable at a domain root or a subdirectory.
  base: './',
  // Allow the development preview host as well as Vite's default localhost.
  server: { allowedHosts: ['terminal.local'] },
});
