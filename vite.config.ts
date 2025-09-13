import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@types': path.resolve(__dirname, 'src/types'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages')
    }
  }
})

