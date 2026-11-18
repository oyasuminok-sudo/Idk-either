import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// The upstream browser-inswapper repository ships TypeScript sources, not built
// dist files. Resolve the package name to its published-in-repo source entry;
// Vite compiles the worker and TypeScript modules as part of this app build.
const browserInswapperSource = fileURLToPath(
  new URL('./node_modules/browser-inswapper/src/index.ts', import.meta.url)
);

// GitHub Pages hosts this repository under /Idk-either/.
// Local development and other hosts use the root path.
const base = process.env.GITHUB_ACTIONS === 'true' ? '/Idk-either/' : '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      'browser-inswapper': browserInswapperSource
    }
  },
  build: {
    target: 'es2022',
    sourcemap: false
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  }
});
