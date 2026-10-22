import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { quasar } from '@quasar/vite-plugin'

export default defineConfig({
  plugins: [vue(), quasar({ autoImportComponentCase: 'combined' })],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  test: { environment: 'node' },
})
