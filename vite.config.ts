import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 打包成单个 index.html，双击就能在浏览器里打开
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
