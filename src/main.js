// src/main.js (hoặc main.ts)

import { createPinia } from 'pinia' // Import Pinia
import { createApp } from 'vue';
import 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
import App from './App.vue';
import router from './router'; // <-- Import router từ file cấu hình

const app = createApp(App);

app.use(router); // <-- Sử dụng router cho ứng dụng Vue
app.use(createPinia()) // Sử dụng Pinia plugin

app.mount('#app');
