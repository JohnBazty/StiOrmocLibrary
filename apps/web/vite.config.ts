import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          // Historical covers are bundled with the website, as on the hosted site.
          bypass(request) {
            const pathname = (request.url ?? '').split('?')[0]
            if (/^\/api\/assets\/covers\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(pathname)
              && existsSync(path.resolve(process.cwd(), 'public', pathname.slice(1)))) {
              return pathname
            }
          },
        },
      },
    },
  }
})
