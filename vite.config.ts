import { build as esbuildBuild } from 'esbuild';
import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(__dirname);
const dist = resolve(root, 'dist');

function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    async closeBundle() {
      mkdirSync(dist, { recursive: true });
      copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));
      copyFileSync(resolve(root, 'src/content/overlay.css'), resolve(dist, 'overlay.css'));
      cpSync(resolve(root, 'assets/icons'), resolve(dist, 'assets/icons'), { recursive: true });
      copyFileSync(resolve(dist, 'src/devtools/devtools.html'), resolve(dist, 'devtools.html'));
      copyFileSync(resolve(dist, 'src/devtools/panel.html'), resolve(dist, 'panel.html'));
      rmSync(resolve(dist, 'src'), { recursive: true, force: true });
      await writeBundledBrowserScript('src/content/content-script.ts', 'content-script.js');
      await writeBundledBrowserScript('src/content/page-bridge.ts', 'page-bridge.js');
    }
  };
}

async function writeBundledBrowserScript(sourceFile: string, outputFile: string) {
  await esbuildBuild({
    entryPoints: [resolve(root, sourceFile)],
    bundle: true,
    format: 'iife',
    legalComments: 'none',
    minify: false,
    outfile: resolve(dist, outputFile),
    platform: 'browser',
    target: 'es2022'
  });
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        devtools: resolve(root, 'src/devtools/devtools.html'),
        panel: resolve(root, 'src/devtools/panel.html'),
        'service-worker': resolve(root, 'src/background/service-worker.ts')
      },
      output: {
        entryFileNames(chunkInfo) {
          return `${chunkInfo.name}.js`;
        },
        chunkFileNames: 'chunks/[name].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.name ?? 'asset';
          if (name.endsWith('.css')) {
            return '[name][extname]';
          }

          return 'assets/[name][extname]';
        }
      }
    }
  },
  plugins: [copyManifestPlugin()]
});
