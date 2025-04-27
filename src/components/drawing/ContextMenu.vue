// src/components/drawing/ContextMenu.vue
<template>
    <div
        v-if="visible"
        class="context-menu"
        :style="{ top: top + 'px', left: left + 'px' }"
    >
        <ul>
            <li @click="emit('edit')">Sửa thông tin (Modal)</li>
            <li @click="emit('delete')">Xóa hình</li>
        </ul>
    </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

defineProps({
    visible: Boolean,
    top: Number,
    left: Number
});

const emit = defineEmits(['edit', 'delete']);
</script>

<style scoped>
/* Copy CSS của .context-menu từ file cũ vào đây */
.context-menu {
    position: fixed;
    background-color: white;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 120px;
}
.context-menu ul {
    list-style: none;
    padding: 5px 0;
    margin: 0;
}
.context-menu li {
    padding: 8px 15px;
    cursor: pointer;
    font-size: 0.9em;
}
.context-menu li:hover {
    background-color: #eee;
}
</style>
