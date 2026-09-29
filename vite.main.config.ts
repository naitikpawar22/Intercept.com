import { defineConfig } from 'vite';
import path from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    target: 'node20',
    outDir: path.resolve(__dirname, 'dist/main'),
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/main/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.cjs'
    },
    rollupOptions: {
      external: [
        'electron',
        'sqlite3',
        'sql.js',
        'ws',
        'express',
        'cors',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`)
      ]
    }
  }
});
