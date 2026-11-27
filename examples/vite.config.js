import { defineConfig } from 'vite';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const skipDirs = new Set(['shared', 'node_modules', 'public', 'dist', 'scripts']);

function collectHtmlInputs() {
  const inputs = {
    main: path.join(rootDir, 'index.html'),
  };
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;
    const htmlPath = path.join(rootDir, entry.name, 'index.html');
    if (existsSync(htmlPath)) {
      inputs[entry.name] = htmlPath;
    }
  }
  return inputs;
}

const assetProxy = {
  '/assets/heart': {
    target: 'https://assets.3dviz.dev',
    changeOrigin: true,
    rewrite: (reqPath) => reqPath.replace(/^\/assets/, ''),
  },
  '/assets/anatomy': {
    target: 'https://assets.3dviz.dev',
    changeOrigin: true,
    rewrite: (reqPath) => reqPath.replace(/^\/assets/, ''),
  },
};

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: assetProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: assetProxy,
  },
  build: {
    outDir: path.resolve(rootDir, '../dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: collectHtmlInputs(),
    },
  },
});
