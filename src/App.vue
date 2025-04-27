<template>
  <nav>
    <router-link to="/">Home</router-link> |
    <router-link to="/drawing">Bản vẽ </router-link> |
    <router-link to="/process">Quy trình</router-link> <!-- Liên kết mới --> | 
    <router-link to="/dynamicprocess">Quy trình Động</router-link> <!-- Liên kết mới --> |
    <router-link to="/tabprocess">Quy trình Tab</router-link> <!-- Liên kết mới -->
    <router-link to="/refprocess">Quy trình Ref</router-link> <!-- Liên kết mới -->
  </nav>
  <router-view/>
</template>

<style>
nav { padding: 30px; }
nav a { font-weight: bold; color: #2c3e50; }
nav a.router-link-exact-active { color: #42b983; }
</style>
