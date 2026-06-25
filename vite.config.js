import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const sfSource = resolve('node_modules/fairy-stockfish-nnue.wasm');
const publicLib = resolve('public/lib');

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    {
      name: 'copy-stockfish',
      buildStart() {
        if (!existsSync(publicLib)) mkdirSync(publicLib, { recursive: true });
        for (const f of ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js']) {
          copyFileSync(resolve(sfSource, f), resolve(publicLib, f));
        }
      },
    },
  ],
});
