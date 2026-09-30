import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// نکته: هاست 0.0.0.0 و allowedHosts برای اجرا در محیط پیش‌نمایش (پروکسی) ضروری است.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: { outDir: 'dist', sourcemap: false },
})
