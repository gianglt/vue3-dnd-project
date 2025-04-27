// src/components/drawing/DrawingCanvas.vue
<template>
    <div class="drawing-app">
        <!-- Palette -->
        <div class="palette">
            <h3>Kéo từ đây:</h3>
            <div v-for="item in sourceData" :key="item.schemaId" class="source-rect" :style="{ backgroundColor: item.color }"
                draggable="true" @dragstart="handleSourceDragStart($event, item)"></div>
        </div>

        <!-- Canvas -->
        <div class="canvas" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop" ref="canvasRef">
            <h3>Thả vào đây:</h3>
            <!-- Sử dụng Component DrawnRectangle -->
            <DrawnRectangle
                v-for="rect in drawnRectangles"
                :key="rect.id"
                :rect="rect"
                :prevent-drag="isModalVisible"
                @dragstart.stop="handleRectDragStart($event, rect)"
                @dragend="handleRectDragEnd"
                @contextmenu="showContextMenu($event, rect)"
                @open-edit="openEditModal"
            />
        </div>

        <!-- Sử dụng Component ContextMenu -->
        <ContextMenu
            :visible="contextMenu.visible"
            :top="contextMenu.top"
            :left="contextMenu.left"
            @edit="handleEdit"
            @delete="handleDelete"
            ref="contextMenuRef"
        />

        <!-- Sử dụng Component EditFormModal -->
        <EditFormModal
            :visible="isModalVisible"
            :rect-data="editingRect"
            :schema="getSchemaForRect(editingRect)"
            @save="saveForm"
            @cancel="cancelForm"
        />
    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, onMounted, onUnmounted } from 'vue';
// Import các component con
import DrawnRectangle from './DrawnRectangle.vue';
import ContextMenu from './ContextMenu.vue';
import EditFormModal from './EditFormModal.vue';
// Import dữ liệu và types
import { sourceData, getSchemaById } from '../data/drawingSchemas.js';
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../types/drawingTypes.js';

// --- State --- (Giữ lại state cần thiết)
const drawnRectangles = ref([]);
const canvasRef = ref(null);
const defaultRectWidth = 50;
const defaultRectHeight = 50;
const draggingRectId = ref(null);
const currentOrder = ref(1);

// State cho Context Menu
const contextMenuRef = ref(null); // Vẫn cần ref để check click outside
const contextMenu = ref({ visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null });

// State cho Modal Chỉnh sửa
const isModalVisible = ref(false);
const editingRect = ref(null); // Chỉ cần lưu rect gốc đang sửa

// --- Helpers ---
// Helper để lấy schema cho hình chữ nhật cụ thể (dùng cho modal prop)
const getSchemaForRect = (rect) => {
    return rect ? getSchemaById(rect.schemaId) : {};
};

// --- Lifecycle Hooks --- (Giữ nguyên)
onMounted(() => {
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
});
onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
});

// --- Event Handlers ---

// Đóng menu/modal nếu click ra ngoài
const handleClickOutside = (event) => {
    // Đóng context menu (logic giữ nguyên, dùng contextMenuRef)
    if (contextMenu.value.visible && !contextMenuRef.value?.$el?.contains(event.target)) {
         // Lưu ý: Cần truy cập $el nếu contextMenuRef trỏ đến component instance
         // Hoặc đảm bảo ref trỏ trực tiếp đến DOM element của context menu
         // Nếu ContextMenu.vue expose root element thì không cần $el
        closeContextMenu();
    }
    // Modal tự xử lý đóng qua overlay click
};

// Đóng context menu khi resize/scroll (Giữ nguyên)
const handleWindowChange = () => {
    if (contextMenu.value.visible) {
        closeContextMenu();
    }
};

// --- Context Menu Handlers --- (Logic xử lý sự kiện emit từ ContextMenu.vue)
const showContextMenu = (event, rect) => {
    if (isModalVisible.value) return;
    if (contextMenu.value.visible) closeContextMenu();
    contextMenu.value.visible = true;
    contextMenu.value.top = event.clientY;
    contextMenu.value.left = event.clientX;
    contextMenu.value.targetRectId = rect.id;
    contextMenu.value.targetRectOrder = rect.order;
};

const closeContextMenu = () => {
    if (contextMenu.value.visible) {
        contextMenu.value.visible = false;
        contextMenu.value.targetRectId = null;
        contextMenu.value.targetRectOrder = null;
    }
};

// Được gọi khi ContextMenu emit 'edit'
const handleEdit = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openEditModal(rectToEdit); // Gọi hàm mở modal
        }
    }
    closeContextMenu();
};

// Được gọi khi ContextMenu emit 'delete'
const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    const orderToDelete = contextMenu.value.targetRectOrder;
    closeContextMenu();

    if (idToDelete !== null && orderToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            drawnRectangles.value.splice(indexToDelete, 1);
            drawnRectangles.value.forEach(rect => {
                if (rect.order > orderToDelete) rect.order--;
            });
            currentOrder.value--;
        }
    }
};

// --- Modal Handlers --- (Logic xử lý sự kiện emit từ EditFormModal.vue)
const openEditModal = (rect) => {
    if (!rect || draggingRectId.value !== null) return;
    closeContextMenu();
    editingRect.value = rect; // Chỉ cần gán rect gốc
    isModalVisible.value = true; // Mở modal
};

// Được gọi khi EditFormModal emit 'save'
const saveForm = (updatedFormData) => {
    if (!editingRect.value) return;
    const originalRectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
    if (originalRectIndex > -1) {
        console.log("Lưu dữ liệu từ modal:", updatedFormData);
        // Cập nhật formData gốc bằng bản sao sâu dữ liệu nhận được
        try {
            drawnRectangles.value[originalRectIndex].formData = structuredClone(updatedFormData);
        } catch (e) {
            console.warn("structuredClone not supported, using JSON fallback.");
            drawnRectangles.value[originalRectIndex].formData = JSON.parse(JSON.stringify(updatedFormData));
        }
    }
    cancelForm(); // Đóng modal sau khi lưu
};

// Được gọi khi EditFormModal emit 'cancel'
const cancelForm = () => {
    isModalVisible.value = false;
    editingRect.value = null;
};


// --- Drag and Drop Handlers --- (Giữ nguyên logic cốt lõi, chỉ cần đảm bảo event được truyền đúng)
const handleSourceDragStart = (event, item) => {
    const dataToTransfer = { color: item.color, schemaId: item.schemaId };
    event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
    event.dataTransfer.effectAllowed = 'copy';
    draggingRectId.value = null;
    closeContextMenu();
};

// Được gọi khi DrawnRectangle emit 'dragstart'
const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu();
    if (isModalVisible.value) { // Ngăn kéo nếu modal mở
         event.preventDefault();
         return;
    }

    event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
    const offsetX = event.offsetX;
    const offsetY = event.offsetY;
    event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, JSON.stringify({ x: offsetX, y: offsetY }));
    event.dataTransfer.effectAllowed = 'move';
    draggingRectId.value = rect.id;
};

// Được gọi khi DrawnRectangle emit 'dragend'
const handleRectDragEnd = (event) => {
    draggingRectId.value = null;
};

const handleDragOver = (event) => { // Giữ nguyên
    event.preventDefault();
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move";
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy";
    } else {
         event.dataTransfer.dropEffect = "none";
    }
};

const handleDrop = (event) => { // Logic tạo mới và di chuyển giữ nguyên
    event.preventDefault();
    closeContextMenu();

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) return;

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    // DI CHUYỂN
    if (draggedRectIdStr) {
        const draggedRectId = parseInt(draggedRectIdStr, 10);
        const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
        let offsetX = 0, offsetY = 0;
        try {
            const offset = JSON.parse(offsetData);
            offsetX = offset.x; offsetY = offset.y;
        } catch (e) { console.warn('Parse offset error', e); }

        const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
        if (rectToMove) {
            rectToMove.x = dropX - offsetX;
            rectToMove.y = dropY - offsetY;
        }
    }
    // TẠO MỚI
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        if (sourceItemDataStr) {
            try {
                const sourceItemData = JSON.parse(sourceItemDataStr);
                const schema = getSchemaById(sourceItemData.schemaId);
                const initialFormData = {};
                for(const key in schema) { initialFormData[key] = schema[key]; }

                const newRect = {
                    id: Date.now(),
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId,
                    x: dropX - defaultRectWidth / 2,
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value,
                    formData: initialFormData
                };
                drawnRectangles.value.push(newRect);
                currentOrder.value++;
            } catch (e) { console.error("Lỗi parse dữ liệu item nguồn:", e); }
        } else { console.warn('Không có dữ liệu hợp lệ được truyền khi thả.'); }
    }
    draggingRectId.value = null;
};

</script>

<style scoped>
/* Chỉ giữ lại CSS cho layout chính (.drawing-app, .palette, .canvas) */
.drawing-app { display: flex; gap: 2rem; font-family: sans-serif; }
.palette { border: 1px solid #ccc; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background-color: #f8f8f8; height: fit-content; }
.palette h3 { margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555; }
.source-rect { width: 50px; height: 50px; border: 1px solid #eee; cursor: grab; transition: transform 0.2s ease; }
.source-rect:active { cursor: grabbing; transform: scale(1.1); }
.canvas { border: 2px dashed #007bff; width: 500px; height: 400px; position: relative; background-color: #e9ecef; overflow: hidden; }
.canvas h3 { position: absolute; top: 5px; left: 10px; margin: 0; font-size: 0.9em; color: #6c757d; pointer-events: none; }
</style>
