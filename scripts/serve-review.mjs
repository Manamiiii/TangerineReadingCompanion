import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadReview } from './review-entry.mjs'

export async function startReview({ review, port = 5174, host = 'localhost' }) {
const { directory, manifest, manifestHash } = review
const identity = { format: 'reading-review-v1', revision: manifest.revision, version: manifest.version, sourceHash: manifest.sourceHash, manifestHash, pid: process.pid }
const server = await createServer({
  root: directory,
  configFile: directory + '/vite.config.js',
  // Never load private workspace .env files into the delivered browser bundle.
  envDir: false,
  define: { 'import.meta.env.VITE_APP_BUILD': JSON.stringify(manifest.revision) },
  server: { host, port, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'reading-review-identity',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'reading-review', content: manifestHash }, injectTo: 'head' }],
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/__reading_review') return next()
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return }
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(identity))
      })
    },
  }],
})
await server.listen()
return server
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startReview({ review: await loadReview() })
