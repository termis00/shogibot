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
    {
      name: 'llm-proxy',
      configureServer(server) {
        server.middlewares.use('/api/llm', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end();
            return;
          }

          let body = '';
          for await (const chunk of req) body += chunk;

          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            res.writeHead(400);
            res.end('Invalid JSON');
            return;
          }

          const { url, headers, payload } = parsed;

          try {
            const upstream = await fetch(url, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            const text = await upstream.text();
            res.writeHead(upstream.status, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(text);
          } catch (e) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
  ],
});
