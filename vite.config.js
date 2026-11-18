import { defineConfig } from 'vite';

// GitHub Pages hosts this repository under /Idk-either/.
// Local development and other hosts use the root path.
const base = process.env.GITHUB_ACTIONS === 'true' ? '/Idk-either/' : '/';

export default defineConfig({
  base,
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
