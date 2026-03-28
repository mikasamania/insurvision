import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: true,
  },
  server: {
    port: 5174,
  },
})
