import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  build: {
    lib: {
      entry: 'src/bundle.manifests.ts',
      formats: ['es'],
      fileName: 'umbraco-community-kanban',
    },
    outDir: '../wwwroot/App_Plugins/UmbracoCommunityKanban',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { external: [/^@umbraco/] },
  },
  base: '/App_Plugins/UmbracoCommunityKanban/',
});
