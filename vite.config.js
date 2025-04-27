import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path'; // Cần module 'path' của Node.js

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Cấu hình alias '@' trỏ đến thư mục 'src' giống Vue CLI
      '@': path.resolve(__dirname, './src'),
    },
  },
  // server: { // Tùy chọn: Cấu hình server dev nếu cần
  //   port: 3000, // Ví dụ: đổi cổng
  //   // proxy: { ... } // Ví dụ: cấu hình proxy API
  // }
  // build: { // Tùy chọn: Cấu hình build nếu cần
  //   // outDir: 'dist', // Thư mục output (mặc định là dist)
  // }
});
