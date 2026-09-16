import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    server: {
        port: 5500,
        open: '/dashboard.html'
    },
    build: {
        outDir: 'dist'
    }
})