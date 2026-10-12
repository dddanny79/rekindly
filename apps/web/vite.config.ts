import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
// Relative import: Vite loads workspace packages unbundled in the config, and the
// shared package uses extensionless TypeScript imports internally.
import { APP_NAME } from '../../packages/shared/src/constants.ts';

/** Replaces %APP_NAME% in index.html with the single product-name constant. */
function appName(): Plugin {
  return {
    name: 'app-name',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
  };
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Shared .env in the repo root; only PORT and WEB_PORT are read here.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = env.PORT || '3000';

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), appName()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Listen on all interfaces so the dev server is reachable over Tailscale.
      host: '0.0.0.0',
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: {
        // Keep the browser's Host header (the string shorthand would rewrite it to
        // localhost): the server's CSRF check compares Origin with the request host,
        // and form uploads (photos) are rejected otherwise.
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false },
      },
    },
  };
});
