// src/router/index.js

import { createRouter, createWebHistory } from 'vue-router';

// Import các component bạn muốn điều hướng đến
// Đảm bảo đường dẫn import là chính xác so với vị trí file router/index.js
import HelloWorld from '../components/HelloWorld.vue';
import DrawingCanvas from '../components/drawing/DrawingCanvas.vue'; // <-- Đường dẫn mới

// Định nghĩa các route
const routes = [
  {
    path: '/', // Đường dẫn gốc, thường là trang chủ
    name: 'HelloWorld', // Tên route (tùy chọn nhưng nên có)
    component: HelloWorld // Component sẽ hiển thị cho đường dẫn này
  },
  {
    path: '/draw', // Đường dẫn cho trang vẽ
    name: 'DrawingCanvas',
    component: DrawingCanvas
  },
  // Bạn có thể thêm các route khác ở đây
];

// Tạo instance router
const router = createRouter({
  // Sử dụng createWebHistory cho chế độ history (URL sạch, cần cấu hình server khi deploy)
  // Hoặc createWebHashHistory cho chế độ hash (#) (hoạt động mà không cần cấu hình server)
  history: createWebHistory(), // Hoặc sử dụng createWebHashHistory() nếu cần
  //history: createWebHistory(import.meta.env.BASE_URL), // Dùng cho Vite
  // history: createWebHistory(process.env.BASE_URL), // Dùng cho Vue CLI
  routes, // Viết tắt của routes: routes
});

// Export router instance để sử dụng trong main.js
export default router;
