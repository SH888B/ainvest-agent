import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Electron Vite 配置
 * 同时构建主进程、preload 脚本和渲染进程
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@main': path.resolve(__dirname, './src/main'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@preload': path.resolve(__dirname, './src/preload'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      sourcemap: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
  },
})
