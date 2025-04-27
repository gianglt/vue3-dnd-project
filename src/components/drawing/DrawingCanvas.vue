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

            <!-- SVG Layer cho đường nối gấp khúc -->
            <svg class="connection-lines">
                <g>
                    <!-- Lặp qua các cặp hình chữ nhật liền kề theo thứ tự -->
                    <template v-for="(rect, index) in sortedRectangles" :key="rect.id + '-elbow'">
                        <template v-if="index < sortedRectangles.length - 1">
                            <polyline
                                :points="calculateElbowPoints(rect, sortedRectangles[index + 1])"
                                fill="none"
                                stroke="#555"
                                stroke-width="1.5"
                                stroke-dasharray="4, 4"
                            />
                        </template>
                    </template>
                </g>
            </svg>

            <!-- Component DrawnRectangle -->
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

        <!-- Component ContextMenu -->
        <ContextMenu
            :visible="contextMenu.visible"
            :top="contextMenu.top"
            :left="contextMenu.left"
            @edit="handleEdit"
            @delete="handleDelete"
            ref="contextMenuRef"
        />

        <!-- Component EditFormModal -->
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
import { ref, onMounted, onUnmounted, computed } from 'vue';
import DrawnRectangle from './DrawnRectangle.vue';
import ContextMenu from './ContextMenu.vue';
import EditFormModal from './EditFormModal.vue';
// Đảm bảo đường dẫn import đúng với cấu trúc thư mục của bạn
import { sourceData, getSchemaById } from '../../data/drawingSchemas.js';
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js';

// --- State ---
const drawnRectangles = ref([]);
const canvasRef = ref(null);
const defaultRectWidth = 50;
const defaultRectHeight = 50;
const draggingRectId = ref(null);
const currentOrder = ref(1);
const contextMenuRef = ref(null);
const contextMenu = ref({ visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null });
const isModalVisible = ref(false);
const editingRect = ref(null);

// --- Computed ---
const sortedRectangles = computed(() => {
    console.log('Drawn Rectangles:', drawnRectangles.value); // Xem dữ liệu gốc
    const sorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
    console.log('Sorted Rectangles for Lines:', sorted); // Xem mảng đã sắp xếp
    return sorted;
});


// --- Helpers ---
const getSchemaForRect = (rect) => {
    return rect ? getSchemaById(rect.schemaId) : {};
};

const calculateElbowPoints = (rectA, rectB) => {
    console.log('Calculating points for:', rectA?.order, '->', rectB?.order); // Thêm log
    if (!rectA || !rectB) {
         console.warn('calculateElbowPoints: Missing rectA or rectB'); // Thêm log cảnh báo
         return "";
    }
    const startX = rectA.x + rectA.width;
    const startY = rectA.y + rectA.height / 2;
    const endX = rectB.x;
    const endY = rectB.y + rectB.height / 2;
    const cornerX = startX;
    const cornerY = endY;
    const pointsStr = `${startX},${startY} ${cornerX},${cornerY} ${endX},${endY}`;
    console.log('Calculated points string:', pointsStr); // Thêm log kết quả
    return pointsStr;
};


// --- Lifecycle Hooks ---
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
const handleClickOutside = (event) => {
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    if (contextMenu.value.visible && contextMenuElement && !contextMenuElement.contains(event.target)) {
        closeContextMenu();
    }
};

const handleWindowChange = () => {
    if (contextMenu.value.visible) {
        closeContextMenu();
    }
};

// --- Context Menu Handlers ---
const showContextMenu = (event, rect) => {
    if (isModalVisible.value) return;
    if (contextMenu.value.visible) closeContextMenu();
    contextMenu.value.visible = true;
    contextMenu.value.top = event.clientY;
    contextMenu.value.left = event.clientX;
    contextMenu.value.targetRectId = rect.id;
    contextMenu.value.targetRectOrder = rect.order; // Vẫn lưu để biết order gốc nếu cần
};

const closeContextMenu = () => {
    if (contextMenu.value.visible) {
        contextMenu.value.visible = false;
        contextMenu.value.targetRectId = null;
        contextMenu.value.targetRectOrder = null;
    }
};

const handleEdit = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openEditModal(rectToEdit);
        }
    }
    closeContextMenu();
};

const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    closeContextMenu(); // Đóng menu trước

    if (idToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            // 1. Xóa
            drawnRectangles.value.splice(indexToDelete, 1);

            // 2. Sắp xếp lại mảng còn lại theo thứ tự cũ (nếu có)
            const remainingSorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);

            // 3. Gán lại thứ tự liên tục 1, 2, 3,...
            remainingSorted.forEach((rect, index) => {
                rect.order = index + 1;
            });

            // 4. Cập nhật currentOrder
            currentOrder.value = drawnRectangles.value.length + 1;

            console.log(`Đã xóa hình ID: ${idToDelete}. Thứ tự cập nhật. Current order: ${currentOrder.value}`);
        }
    }
};

// --- Modal Handlers ---
const openEditModal = (rect) => {
    if (!rect || draggingRectId.value !== null) return;
    closeContextMenu();
    editingRect.value = rect;
    isModalVisible.value = true;
};

const saveForm = (updatedFormData) => {
    if (!editingRect.value) return;
    const originalRectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
    if (originalRectIndex > -1) {
        console.log("Lưu dữ liệu từ modal:", updatedFormData);
        try {
            drawnRectangles.value[originalRectIndex].formData = structuredClone(updatedFormData);
        } catch (e) {
            console.warn("structuredClone not supported, using JSON fallback.");
            drawnRectangles.value[originalRectIndex].formData = JSON.parse(JSON.stringify(updatedFormData));
        }
    }
    cancelForm(); // Đóng modal
};

const cancelForm = () => {
    isModalVisible.value = false;
    editingRect.value = null;
};

// --- Drag and Drop Handlers ---
const handleSourceDragStart = (event, item) => {
    const dataToTransfer = { color: item.color, schemaId: item.schemaId };
    const dataStr = JSON.stringify(dataToTransfer);
    console.log('Source Drag Start - Data:', dataStr);
    event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, dataStr);
    event.dataTransfer.effectAllowed = 'copy';
    draggingRectId.value = null;
    closeContextMenu();
};

const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu();
    if (isModalVisible.value) {
         event.preventDefault(); // Ngăn kéo khi modal mở
         return;
    }

    event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
    const offsetX = event.offsetX;
    const offsetY = event.offsetY;
    event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, JSON.stringify({ x: offsetX, y: offsetY }));
    event.dataTransfer.effectAllowed = 'move';
    draggingRectId.value = rect.id;
    console.log(`Bắt đầu kéo hình ID: ${rect.id}`);
};

const handleRectDragEnd = (event) => {
    draggingRectId.value = null;
    console.log(`Kết thúc kéo hình`);
};

const handleDragOver = (event) => {
    
    console.log('Drag Over - Types:', event.dataTransfer.types);
    event.preventDefault(); // Quan trọng để cho phép drop
    // Đặt dropEffect dựa trên loại dữ liệu đang kéo
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move";
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy";
    } else {
         event.dataTransfer.dropEffect = "none"; // Không cho phép thả nếu không phải loại dữ liệu hợp lệ
    }
};

const handleDrop = (event) => {
    event.preventDefault();
    closeContextMenu();
    console.log('--- Handle Drop ---');

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) {
        console.error('Drop Error: Cannot get canvas bounds.');
        return;
    }

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;
    console.log('Drop Coords (relative):', dropX, dropY);
    console.log('DataTransfer Types:', event.dataTransfer.types);

    // Trường hợp DI CHUYỂN
    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    console.log('Attempting to get RECT_ID:', draggedRectIdStr);
    if (draggedRectIdStr) {
        console.log('Handling MOVE');
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
            console.log(`Đã di chuyển hình ID ${draggedRectId}`);
        } else {
             console.error(`Move Error: Cannot find rect with ID ${draggedRectId}`);
        }
    }
    // Trường hợp TẠO MỚI
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        console.log('Attempting to get SOURCE_ITEM:', sourceItemDataStr);
        if (sourceItemDataStr) {
            console.log('Handling CREATE NEW');
            try {
                const sourceItemData = JSON.parse(sourceItemDataStr);
                const schema = getSchemaById(sourceItemData.schemaId);
                // Khởi tạo formData từ giá trị mặc định của schema
                const initialFormData = {};
                for(const key in schema) {
                    initialFormData[key] = schema[key];
                }

                const newRect = {
                    id: Date.now(),
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId,
                    x: dropX - defaultRectWidth / 2,
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value, // Gán thứ tự hiện tại
                    formData: initialFormData
                };
                console.log('Pushing new rectangle:', newRect);
                drawnRectangles.value.push(newRect);
                currentOrder.value++; // Tăng thứ tự cho lần sau
                console.log('drawnRectangles length now:', drawnRectangles.value.length);
            } catch (e) {
                console.error("Drop Error: Failed to parse source item data:", e, sourceItemDataStr);
            }
        } else {
            console.warn('Drop Warning: No valid data found in dataTransfer.');
        }
    }
    draggingRectId.value = null; // Reset trạng thái kéo
};

</script>

<style scoped>
/* CSS cho layout chính */
.drawing-app { display: flex; gap: 2rem; font-family: sans-serif; }
.palette { border: 1px solid #ccc; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background-color: #f8f8f8; height: fit-content; }
.palette h3 { margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555; }
.source-rect { width: 50px; height: 50px; border: 1px solid #eee; cursor: grab; transition: transform 0.2s ease; }
.source-rect:active { cursor: grabbing; transform: scale(1.1); }
.canvas { border: 2px dashed #007bff; width: 500px; height: 400px; position: relative; background-color: #e9ecef; overflow: hidden; }
.canvas h3 { position: absolute; top: 5px; left: 10px; margin: 0; font-size: 0.9em; color: #6c757d; pointer-events: none; }

/* CSS cho SVG layer */
.connection-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
}
</style>
