import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 15000, // above the 5 s findBy* wait in test-setup.ts
  },
})
