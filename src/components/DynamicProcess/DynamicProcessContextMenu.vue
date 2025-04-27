<template>
    <ul v-if="visible" class="context-menu" :style="{ top: top + 'px', left: left + 'px' }">
        <!-- Thêm option mới -->
        <li @click="emitEnterData">
            <i class="fas fa-keyboard"></i> Nhập dữ liệu
        </li>
        <li @click="emitEdit">
            <i class="fas fa-pencil-alt"></i> Chỉnh sửa Schema
        </li>
        <li @click="emitDelete" class="delete-option">
            <i class="fas fa-trash-alt"></i> Xóa bước
        </li>
    </ul>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

defineProps({
    visible: Boolean,
    top: Number,
    left: Number
});

// Thêm 'enterData' vào emits
const emit = defineEmits(['edit', 'delete', 'enterData']);

const emitEdit = () => emit('edit');
const emitDelete = () => emit('delete');
// Method mới để emit sự kiện 'enterData'
const emitEnterData = () => emit('enterData');

</script>

<style scoped>
/* Thêm icon nếu muốn (cần Font Awesome hoặc tương tự) */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

.context-menu {
    position: fixed;
    background-color: white;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15);
    list-style: none;
    padding: 8px 0;
    margin: 0;
    z-index: 100; /* Đảm bảo menu nổi lên trên */
    min-width: 180px; /* Tăng chiều rộng để chứa icon và text */
    border-radius: 4px;
}

.context-menu li {
    padding: 8px 15px;
    cursor: pointer;
    display: flex; /* Sử dụng flexbox để căn chỉnh icon và text */
    align-items: center; /* Căn giữa theo chiều dọc */
    gap: 8px; /* Khoảng cách giữa icon và text */
    font-size: 0.9em;
    color: #333;
}

.context-menu li:hover {
    background-color: #f0f0f0;
}

.context-menu li i {
    width: 16px; /* Đảm bảo icon có không gian cố định */
    text-align: center;
    color: #555; /* Màu icon */
}


.context-menu .delete-option {
    color: #dc3545; /* Màu đỏ cho tùy chọn xóa */
    border-top: 1px solid #eee; /* Thêm đường kẻ phân cách */
    margin-top: 5px;
    padding-top: 8px;
}
.context-menu .delete-option:hover {
    background-color: #f8d7da; /* Màu nền đỏ nhạt khi hover */
}
.context-menu .delete-option i {
    color: #dc3545; /* Màu icon đỏ */
}
</style>
