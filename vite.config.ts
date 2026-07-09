import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  base: '/doculium/',
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
  plugins: [
    {
      name: 'cross-origin-headers',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (url.startsWith('/@vite/') || url.startsWith('/doculium/@vite/') || url === '/') {
            return next();
          }
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
    },
    {
      name: 'serve-pdfjs-assets',
      apply: 'serve',
      configureServer(server) {
        const cmapsPath = join(process.cwd(), 'node_modules/pdfjs-dist/cmaps');
        const fontsPath = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts');
        const serveDir = (basePath: string, fsPath: string) => {
          server.middlewares.use(basePath, (_req: any, res: any) => {
            const url = new URL(_req.url, `http://${_req.headers.host}`);
            const file = join(fsPath, url.pathname.replace(basePath, ''));
            if (existsSync(file)) {
              res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
              res.statusCode = 200;
              res.end(readFileSync(file));
            } else {
              res.statusCode = 404;
              res.end();
            }
          });
        };
        serveDir('/pdfjs-cmaps', cmapsPath);
        serveDir('/pdfjs-stdfonts', fontsPath);
      },
    },
    {
      name: 'copy-pdfjs-assets',
      apply: 'build',
      closeBundle() {
        const root = process.cwd();
        const cmapsSrc = join(root, 'node_modules/pdfjs-dist/cmaps');
        const cmapsDest = join(root, 'dist/pdfjs-cmaps');
        if (!existsSync(cmapsDest)) mkdirSync(cmapsDest, { recursive: true });
        cpSync(cmapsSrc, cmapsDest, { recursive: true, force: true });

        const fontsSrc = join(root, 'node_modules/pdfjs-dist/standard_fonts');
        const fontsDest = join(root, 'dist/pdfjs-stdfonts');
        if (!existsSync(fontsDest)) mkdirSync(fontsDest, { recursive: true });
        cpSync(fontsSrc, fontsDest, { recursive: true, force: true });
      },
    },
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      scope: '/doculium/',
      includeAssets: ['icons/*.svg', 'logo.png'],
      manifest: {
        name: 'Doculium',
        short_name: 'Doculium',
        description: 'AI-powered document management',
        theme_color: '#1d232c',
        background_color: '#1d232c',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/doculium/',
        start_url: '/doculium/',
        icons: [
          {
            src: 'logo.png',
            sizes: 'any',
            type: 'image/png',
          },
        ],
        share_target: {
          action: '/doculium/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              { name: 'file', accept: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'] },
            ],
          },
        } as any,
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  build: {
    target: 'es2023',
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          webllm: ['@mlc-ai/web-llm'],
        },
      },
    },
  },
});
