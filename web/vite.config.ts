import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// Racine explicite (répertoire de ce fichier) : le script `build`/`dev` lance vite depuis
// la racine du repo, index.html vit dans web/.
export default defineConfig({
  root: __dirname,
  plugins: [vue()],
  css: {
    postcss: path.resolve(__dirname, '..', 'postcss.config.js'),
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4318',
    },
  },
})
