<template>
    <div v-if="visible" class="context-menu" :style="menuStyle">
        <ul>
            <li @click="handleEdit">Chỉnh sửa</li>
            <li @click="handleDelete">Xóa</li>
        </ul>
    </div>
</template>

<script setup>
import { computed, defineProps, defineEmits } from 'vue';

const props = defineProps({
    visible: Boolean,
    top: Number,
    left: Number
});

const emit = defineEmits(['edit', 'delete']);

const menuStyle = computed(() => ({
    top: `${props.top}px`,
    left: `${props.left}px`,
}));

const handleEdit = () => {
    emit('edit');
};

const handleDelete = () => {
    emit('delete');
};
</script>

<style scoped>
.context-menu {
    position: fixed; /* Hoặc absolute tùy vào container cha */
    background-color: #fff;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    z-index: 1001; /* Cao hơn modal overlay */
    min-width: 100px;
}

.context-menu ul {
    list-style: none;
    padding: 5px 0;
    margin: 0;
}

.context-menu li {
    padding: 8px 15px;
    cursor: pointer;
    font-size: 0.9rem;
}

.context-menu li:hover {
    background-color: #f0f0f0;
}
</style>
