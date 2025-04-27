<template>
  <div id="app">
    <!-- Khu vực điều hướng -->
    <nav>
      <router-link to="/">Trang HelloWorld</router-link> |
      <router-link to="/draw">Trang Vẽ</router-link>
    </nav>

    <!-- Nơi component của route hiện tại sẽ được render -->
    <router-view />
  </div>
</template>

<script setup>
// Không cần import trực tiếp HelloWorld hay DrawingCanvas ở đây nữa
// vì router sẽ quản lý việc hiển thị chúng trong <router-view>
</script>

<style>
/* Thêm một số style cơ bản cho dễ nhìn */
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}

nav {
  padding: 20px;
  text-align: center;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  margin-bottom: 20px;
}

nav a {
  font-weight: bold;
  color: #495057;
  text-decoration: none;
  margin: 0 15px;
}

/* Style cho link đang active */
nav a.router-link-exact-active {
  color: #007bff;
}
</style>
