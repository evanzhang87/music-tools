import { defineConfig } from 'vite';

// 用相对路径 base，构建产物在任意子路径（GitHub Pages 项目站）都能正常加载。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
