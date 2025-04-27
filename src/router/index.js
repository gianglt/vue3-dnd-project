import { createRouter, createWebHistory } from 'vue-router'
import HelloWorld from '../components/HelloWorld.vue'
import DrawingCanvas from '../components/drawing/DrawingCanvas.vue'
// Import component canvas mới
import DrawProcessCanvas from '../components/DrawProcess/DrawProcessCanvas.vue' // Đảm bảo đường dẫn đúng
import DynamicProcessCanvas from '../components/DynamicProcess/DynamicProcessCanvas.vue' // Đảm bảo đường dẫn đúng
import TabProcessCanvas from '../components/TabProcess/TabProcessCanvas.vue' // Đảm bảo đường dẫn đúng

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
    // Thêm route mới cho DrawProcess
    {
      path: '/dynamicprocess', // Đường dẫn mới
      name: 'DynamicProcessCanvas', // Tên route mới
      component: DynamicProcessCanvas // Component mới
    },

    {
      path: '/tabprocess', // Đường dẫn mới
      name: 'TabProcessCanvas', // Tên route mới
      component: TabProcessCanvas // Component mới
    },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
