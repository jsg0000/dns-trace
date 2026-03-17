import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend calls /api/audit (our own Worker) — it never needs an AI API key.
// Injecting secrets via define() bakes them into the client bundle. Removed.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
