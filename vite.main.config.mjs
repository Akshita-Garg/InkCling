import { defineConfig } from 'vite';

// node-llama-cpp is a native ESM module — must not be bundled.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['node-llama-cpp'],
    },
  },
});
