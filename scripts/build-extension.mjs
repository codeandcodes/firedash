#!/usr/bin/env node
import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const outdir = resolve(projectRoot, 'extension', 'dist')

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

await build({
  entryPoints: {
    background: resolve(projectRoot, 'extension', 'src', 'background.ts'),
    'content-script': resolve(projectRoot, 'extension', 'src', 'content-script.ts')
  },
  bundle: true,
  format: 'esm',
  target: ['chrome115'],
  platform: 'browser',
  outdir,
  sourcemap: true,
  tsconfig: resolve(projectRoot, 'tsconfig.json'),
  logLevel: 'info'
})

console.log('Extension build complete.')
