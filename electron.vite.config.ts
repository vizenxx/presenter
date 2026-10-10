import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          deck: resolve(__dirname, 'src/preload/deck.ts'),
          console: resolve(__dirname, 'src/preload/console.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          roller: resolve(__dirname, 'src/preload/roller.ts')
        }
      },
      externalizeDeps: false
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__dirname, 'src/renderer/console.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          roller: resolve(__dirname, 'src/renderer/roller.html'),
          pdfdeck: resolve(__dirname, 'src/renderer/pdfdeck.html'),
          svgdeck: resolve(__dirname, 'src/renderer/svgdeck.html'),
          capture: resolve(__dirname, 'src/renderer/capture.html'),
          toolbar: resolve(__dirname, 'src/renderer/toolbar.html'),
          inkpad: resolve(__dirname, 'src/renderer/inkpad.html')
        }
      }
    }
  }
})
