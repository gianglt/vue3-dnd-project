<template>
    <div
        class="drawn-rect"
        :style="rectStyle"
        :draggable="!preventDrag"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
        @contextmenu.prevent="handleContextMenu"
        @click="handleClick"
    >
    <!-- Thêm dòng này để hiển thị số thứ tự -->
    <span class="rect-order">{{ rect.order }}</span>
        <!-- Hiển thị tên hoặc ID nếu muốn -->
         <!-- <span class="rect-label">{{ rect.formData?.['Tên'] || rect.schemaId }}</span> -->
    </div>
</template>

<script setup>
/* eslint-disable */
import { computed, defineProps, defineEmits } from 'vue';
// Đảm bảo import types đúng đường dẫn
// import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE } from '../../types/drawingTypes.js'; // Không cần trực tiếp ở đây

const props = defineProps({
    rect: {
        type: Object,
        required: true
    },
    preventDrag: { // Prop để ngăn kéo khi modal mở
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['dragstart', 'dragend', 'contextmenu', 'open-edit']);

const rectStyle = computed(() => ({
    position: 'absolute',
    left: `${props.rect.x}px`,
    top: `${props.rect.y}px`,
    width: `${props.rect.width}px`,
    height: `${props.rect.height}px`,
    backgroundColor: props.rect.color,
    border: '1px solid #333',
    cursor: props.preventDrag ? 'default' : 'grab',
    zIndex: 2, // Đảm bảo hình chữ nhật nổi trên đường kẻ SVG
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: '#fff', // Màu chữ, có thể cần điều chỉnh
    overflow: 'hidden',
    userSelect: 'none' // Ngăn chọn text bên trong khi kéo
}));

const handleDragStart = (event) => {
    if (props.preventDrag) {
        event.preventDefault();
        return;
    }
    event.target.style.cursor = 'grabbing';
    emit('dragstart', event, props.rect); // Truyền cả event và rect lên cha
};

const handleDragEnd = (event) => {
     if (props.preventDrag) return;
    event.target.style.cursor = 'grab';
    emit('dragend', event);
};

const handleContextMenu = (event) => {
    emit('contextmenu', event, props.rect);
};

const handleClick = (event) => {
    // Ngăn chặn việc mở modal nếu đang kéo (mặc dù drag/drop thường ngăn click)
    if (props.preventDrag) return;
    // Có thể thêm logic double click ở đây nếu muốn
    // emit('open-edit', props.rect); // Quyết định xem click có mở edit không, hay chỉ context menu
};
</script>

<style scoped>
.drawn-rect {
    box-sizing: border-box;
    position: absolute; /* Đảm bảo style này có */
    /* ... các style khác từ file gốc ... */
    display: flex;
    align-items: center;
    justify-content: center;
    color: white; /* Hoặc màu khác tương phản với background */
    font-size: 12px; /* Kích thước chữ cho số thứ tự */
    font-weight: bold;
    user-select: none;
    overflow: hidden;
}
.rect-order {
    pointer-events: none; /* Để không cản trở drag */
}

.drawn-rect:active {
    /* cursor: grabbing; */ /* Đã xử lý bằng JS */
    /* Có thể thêm hiệu ứng khác khi active */
}
.rect-label {
    pointer-events: none; /* Để không cản trở drag */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
}
</style>
