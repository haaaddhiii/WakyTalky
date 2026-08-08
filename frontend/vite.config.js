import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the historical output dir so vercel.json / Dockerfile / nginx.conf
    // don't need to change.
    outDir: 'build'
  },
  server: {
    port: 3000
  }
});
