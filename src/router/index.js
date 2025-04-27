import { createRouter, createWebHistory } from 'vue-router'
import HelloWorld from '../components/HelloWorld.vue'
import DrawingCanvas from '../components/drawing/DrawingCanvas.vue'
// Import component canvas mới
import DrawProcessCanvas from '../components/DrawProcess/DrawProcessCanvas.vue' // Đảm bảo đường dẫn đúng

const routes = [
  {
    path: '/',
    name: 'HelloWorld',
    component: HelloWorld
  },
  {
    path: '/drawing', // Route cho bản gốc
    name: 'DrawingCanvas',
    component: DrawingCanvas
  },
  // Thêm route mới cho DrawProcess
  {
    path: '/process', // Đường dẫn mới
    name: 'DrawProcessCanvas', // Tên route mới
    component: DrawProcessCanvas // Component mới
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
