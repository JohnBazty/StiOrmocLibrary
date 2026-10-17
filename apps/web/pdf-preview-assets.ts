import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import type { Plugin } from 'vite'

/** Keep PDF fonts, character maps and image decoders local in development and production. */
export function pdfPreviewAssets(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  const folders = ['cmaps', 'standard_fonts', 'wasm']
  return {
    name: 'local-pdf-preview-assets',
    configureServer(server) {
      server.middlewares.use('/pdf-preview-assets', (request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!/^\/(cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+$/.test(path)) { next(); return }
        void readFile(join(root, path.slice(1))).then(bytes => {
          response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
          response.end(bytes)
        }).catch(() => { response.statusCode = 404; response.end() })
      })
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'pdf-preview-assets/LICENSE', source: await readFile(join(root, 'LICENSE')) })
      for (const folder of folders) {
        for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
          if (entry.isFile()) {
            this.emitFile({ type: 'asset', fileName: `pdf-preview-assets/${folder}/${entry.name}`, source: await readFile(join(root, folder, entry.name)) })
          }
        }
      }
    },
  }
}
