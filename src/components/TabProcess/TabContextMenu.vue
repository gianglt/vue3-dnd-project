<template>
    <ul v-if="visible" role="menu" class="context-menu" :style="{ top: top + 'px', left: left + 'px' }">
        <li role="menuitem" tabindex="-1" @click="emitEnterData">
            <i class="fas fa-keyboard"></i> Nhập dữ liệu
        </li>
        <li role="menuitem" tabindex="-1" @click="emitEdit">
            <i class="fas fa-pencil-alt"></i> Chỉnh sửa Schema
        </li>
        <!-- NEW: Option for Reference Schema Editor -->
        <li role="menuitem" tabindex="-1" @click="emitEditRefSchema">
            <i class="fas fa-cogs"></i> Chỉnh sửa Schema (Ref)
        </li>
        <li role="menuitem" tabindex="-1" @click="emitDelete" class="delete-option">
            <i class="fas fa-trash-alt"></i> Xóa bước
        </li>
    </ul>
</template>

<script setup>


defineProps({
    visible: Boolean,
    top: Number,
    left: Number
});

// Add 'editRefSchema' to emits
const emit = defineEmits(['edit', 'delete', 'enterData', 'editRefSchema']);

const emitEdit = () => emit('edit');
const emitDelete = () => emit('delete');
const emitEnterData = () => emit('enterData');
// NEW: Method to emit 'editRefSchema' event
const emitEditRefSchema = () => emit('editRefSchema');

</script>

<style scoped>
.context-menu {
    position: fixed;
    background-color: white;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15);
    list-style: none;
    padding: 8px 0;
    margin: 0;
    z-index: 100;
    min-width: 200px;
    /* Adjust width if needed */
    border-radius: 4px;
}

.context-menu li {
    padding: 8px 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
    color: #333;
}

.context-menu li:hover {
    background-color: #f0f0f0;
}

.context-menu li i {
    width: 16px;
    text-align: center;
    color: #555;
}


.context-menu .delete-option {
    color: #dc3545;
    border-top: 1px solid #eee;
    margin-top: 5px;
    padding-top: 8px;
}

.context-menu .delete-option:hover {
    background-color: #f8d7da;
}

.context-menu .delete-option i {
    color: #dc3545;
}
</style>
