// Bundles a harness that imports main-process code using Vite's "?raw" imports (electron-vite handles
// those in the app; esbuild needs this small plugin). Usage: node e2e/build-with-raw.mjs <entry.ts> <out.cjs>
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const [entry, outfile] = process.argv.slice(2)
if (!entry || !outfile) throw new Error('usage: node e2e/build-with-raw.mjs <entry.ts> <out.cjs>')

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'warning',
  plugins: [
    {
      name: 'raw',
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw' }))
        b.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: `export default ${JSON.stringify(fs.readFileSync(args.path, 'utf8'))}`, loader: 'js' }))
      }
    }
  ]
})
