// src/main.js (hoặc main.ts)

import { createPinia } from 'pinia' // Import Pinia
import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // <-- Import router từ file cấu hình

const app = createApp(App);

app.use(router); // <-- Sử dụng router cho ứng dụng Vue
app.use(createPinia()) // Sử dụng Pinia plugin

app.mount('#app');
