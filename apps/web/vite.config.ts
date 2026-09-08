/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // `PORT` (not VITE_-prefixed, so it stays out of the browser bundle) keeps
  // working the way Create React App used it. The API's CORS allows a single
  // origin, so this must match FRONTEND_URL in packages/api/.env.
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT) || 3000;

  return {
    plugins: [react()],

    resolve: {
      alias: {
        // Mirrors the `baseUrl: "src"` + `@/*` paths of tsconfig.json.
        '@': path.resolve(__dirname, 'src')
      }
    },

    server: {
      port,
      strictPort: true
    },

    preview: {
      port
    },

    build: {
      // Keep the output directory Create React App used, so deployment
      // scripts and .gitignore entries stay valid.
      outDir: 'build',
      sourcemap: false,
      // The app is code-split per domain in App.tsx; the remaining large chunks
      // are vendor bundles, so raise the warning bar rather than silence it.
      chunkSizeWarningLimit: 900
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}']
    }
  };
});
