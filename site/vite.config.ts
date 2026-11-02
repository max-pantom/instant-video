import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { 'instant-video': fileURLToPath(new URL('./vendor/instant-video/index.js', import.meta.url)) } },
  build: { target: 'es2022' },
})
