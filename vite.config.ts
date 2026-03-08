import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { defineConfig } from 'vitest/config';

const root = resolve(__dirname);
const dist = resolve(root, 'dist');

function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      mkdirSync(dist, { recursive: true });
      copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));
      writeStandaloneScript('src/content/content-script.ts', 'content-script.js');
      writeStandaloneScript('src/content/page-bridge.ts', 'page-bridge.js');
    }
  };
}

function writeStandaloneScript(sourceFile: string, outputFile: string) {
  const source = readFileSync(resolve(root, sourceFile), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    }
  });
  writeFileSync(resolve(dist, outputFile), transpiled.outputText, 'utf8');
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        devtools: resolve(root, 'src/devtools/devtools.html'),
        panel: resolve(root, 'src/panel/panel.html'),
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
  plugins: [copyManifestPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/unit/**/*.spec.ts']
  }
});
