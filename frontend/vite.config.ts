import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Same-origin API calls in dev: the HTTP-only session cookie just works, no CORS preflights.
      proxy: {
        '/api': { target: backend, changeOrigin: false },
        '/admin': { target: backend, changeOrigin: false },
      },
    },
  };
});
