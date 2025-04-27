<template>
    <div class="drawing-app">
        <!-- Palette -->
        <div class="palette">
            <h3>Kéo từ đây:</h3>
            <div v-for="item in sourceData" :key="item.schemaId" class="source-rect"
                :style="{ backgroundColor: item.color }" draggable="true"
                @dragstart="handleSourceDragStart($event, item)"></div>
        </div>

        <!-- Canvas -->
        <div class="canvas" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop" ref="canvasRef">
            <h3>Thả vào đây:</h3>

            <!-- SVG Layer cho đường nối gấp khúc -->
            <svg class="connection-lines">
                <defs>
                    <!-- Định nghĩa marker mũi tên -->
                    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3"
                        orient="auto-start-reverse" markerUnits="strokeWidth">
                        <!-- Hình dạng mũi tên (tam giác) - giữ nguyên -->
                        <path d="M0,0 L8,3 L0,6 Z" fill="#555" />
                    </marker>
                    <!-- Alternative marker if needed for start -->
                    <!-- <marker id="arrowtail" ... /> -->
                </defs>
                <g>
                    <!-- Lặp qua các cặp hình chữ nhật liền kề theo thứ tự -->
                    <template v-for="(rect, index) in sortedRectangles" :key="rect.id + '-elbow'">
                        <template v-if="index < sortedRectangles.length - 1">
                            <polyline :points="calculateElbowPoints(rect, sortedRectangles[index + 1])" fill="none"
                                stroke="#555" stroke-width="1.5" stroke-dasharray="4, 4" marker-end="url(#arrowhead)" />
                        </template>
                    </template>
                </g>
            </svg>

            <!-- Component DrawnRectangle -->
            <DrawnRectangle v-for="rect in drawnRectangles" :key="rect.id" :rect="rect" :prevent-drag="isModalVisible"
                @dragstart.stop="handleRectDragStart($event, rect)" @dragend="handleRectDragEnd"
                @contextmenu="showContextMenu($event, rect)" @open-edit="openEditModal" />
        </div>

        <!-- Component ContextMenu -->
        <ContextMenu :visible="contextMenu.visible" :top="contextMenu.top" :left="contextMenu.left" @edit="handleEdit"
            @delete="handleDelete" ref="contextMenuRef" />

        <!-- Component EditFormModal -->
        <EditFormModal :visible="isModalVisible" :rect-data="editingRect" :schema="getSchemaForRect(editingRect)"
            @save="saveForm" @cancel="cancelForm" />
    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { debounce } from 'lodash-es';
import DrawnRectangle from './DrawnRectangle.vue';
import ContextMenu from './ContextMenu.vue';
import EditFormModal from './EditFormModal.vue';
import { sourceData, getSchemaById, loadTemplatesFromManifest } from '../../data/drawingSchemas.js';

import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js';


// Thêm state cho trạng thái loading và lỗi
const isLoading = ref(true);
const loadError = ref(false);

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
    return drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
});

// --- Helpers ---
const getSchemaForRect = (rect) => {
    return rect ? getSchemaById(rect.schemaId) : {};
};

// --- UPDATED calculateElbowPoints ---
const calculateElbowPoints = (rectA, rectB) => {
    if (!rectA || !rectB) {
        return "";
    }

    let startX, endX;
    const startY = rectA.y + rectA.height / 2; // Vertical center of A
    const endY = rectB.y + rectB.height / 2;   // Vertical center of B

    // Determine start and end edges based on relative horizontal position
    if (rectB.x >= rectA.x + rectA.width) {
        // Target is clearly to the RIGHT of source
        startX = rectA.x + rectA.width; // Start from right edge of A
        endX = rectB.x;                 // End at left edge of B
        console.log(`Points ${rectA.order}->${rectB.order}: RIGHT connection`);
    } else if (rectB.x + rectB.width <= rectA.x) {
        // Target is clearly to the LEFT of source
        startX = rectA.x;                 // Start from left edge of A
        endX = rectB.x + rectB.width;   // End at right edge of B
        console.log(`Points ${rectA.order}->${rectB.order}: LEFT connection`);
    } else {
        // Rectangles overlap horizontally or are very close.
        // Defaulting to right-of-A to left-of-B connection.
        // This might need refinement for better vertical routing in overlaps.
        startX = rectA.x + rectA.width;
        endX = rectB.x;
        console.log(`Points ${rectA.order}->${rectB.order}: OVERLAP/CLOSE connection (defaulting right->left)`);
    }

    // Calculate corner points for the elbow
    // Using a 4-point polyline for a clearer horizontal-vertical-horizontal path
    const midX = (startX + endX) / 2; // Horizontal midpoint
    const pointsStr = `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;

    // Alternative: Simpler 3-point elbow (horizontal first)
    // const cornerX = startX;
    // const cornerY = endY;
    // const pointsStr = `${startX},${startY} ${cornerX},${cornerY} ${endX},${endY}`;

    // console.log('Calculated points string:', pointsStr);
    return pointsStr;
};


// --- Event Handlers ---
const handleWindowChange = debounce(() => {
    if (contextMenu.value.visible) {
        // console.log('Window changed (resize/scroll), closing context menu.');
        closeContextMenu();
    }
}, 150);

// --- Lifecycle Hooks ---
onMounted(async () => {

    try {
        // Gọi hàm load mới với đường dẫn tới manifest
        await loadTemplatesFromManifest('/templates/manifest.json');
        loadError.value = false;
    } catch (error) {
        console.error("Failed to initialize DrawingCanvas due to template loading error:", error);
        loadError.value = true;
    } finally {
        isLoading.value = false;
    }

    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
});
onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
    handleWindowChange.cancel?.(); // Use optional chaining for cancel
});

// --- Event Handlers --- (Rest of the handlers remain unchanged)
const handleClickOutside = (event) => {
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);
    if (contextMenu.value.visible && !isClickInsideMenu) {
        closeContextMenu();
    }
};

const showContextMenu = (event, rect) => {
    if (isModalVisible.value) return;
    if (contextMenu.value.visible) closeContextMenu();
    event.preventDefault();
    contextMenu.value = {
        visible: true,
        top: event.clientY,
        left: event.clientX,
        targetRectId: rect.id,
        targetRectOrder: rect.order
    };
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
        if (rectToEdit) openEditModal(rectToEdit);
    }
    closeContextMenu();
};

const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    closeContextMenu();
    if (idToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            drawnRectangles.value.splice(indexToDelete, 1);
            const remainingSorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
            remainingSorted.forEach((rect, index) => { rect.order = index + 1; });
            currentOrder.value = drawnRectangles.value.length + 1;
            // console.log(`Đã xóa hình ID: ${idToDelete}. Thứ tự cập nhật. Current order: ${currentOrder.value}`);
        }
    }
};

const openEditModal = (rect) => {
    if (!rect || draggingRectId.value !== null) return;
    closeContextMenu();
    try {
        editingRect.value = { ...rect, formData: structuredClone(rect.formData || {}) };
    } catch (e) {
        console.warn("structuredClone failed, using JSON fallback.");
        editingRect.value = { ...rect, formData: JSON.parse(JSON.stringify(rect.formData || {})) };
    }
    isModalVisible.value = true;
};

const saveForm = (updatedFormData) => {
    if (!editingRect.value) return;
    const originalRectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
    if (originalRectIndex > -1) {
        // console.log("Lưu dữ liệu từ modal:", updatedFormData);
        try {
            drawnRectangles.value[originalRectIndex].formData = structuredClone(updatedFormData);
        } catch (e) {
            console.warn("structuredClone failed during save, using JSON fallback.");
            drawnRectangles.value[originalRectIndex].formData = JSON.parse(JSON.stringify(updatedFormData));
        }
    }
    cancelForm();
};

const cancelForm = () => {
    isModalVisible.value = false;
    editingRect.value = null;
};

const handleSourceDragStart = (event, item) => {
    closeContextMenu();
    const dataToTransfer = { color: item.color, schemaId: item.schemaId };
    try {
        const dataStr = JSON.stringify(dataToTransfer);
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, dataStr);
        event.dataTransfer.effectAllowed = 'copy';
        draggingRectId.value = null;
        // console.log('Source Drag Start - Data:', dataStr);
    } catch (e) {
        console.error("Source Drag Start Error:", e, dataToTransfer);
    }
};

const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu();
    if (isModalVisible.value) { event.preventDefault(); return; }
    try {
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        const offsetX = event.offsetX;
        const offsetY = event.offsetY;
        const offsetData = JSON.stringify({ x: offsetX, y: offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move';
        draggingRectId.value = rect.id;
        // console.log(`Bắt đầu kéo hình ID: ${rect.id} với offset:`, offsetData);
    } catch (e) {
        console.error("Rect Drag Start Error:", e);
        event.preventDefault();
    }
};

const handleRectDragEnd = (event) => {
    draggingRectId.value = null;
    // console.log(`Kết thúc kéo hình`);
};

const handleDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move";
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy";
    } else {
        event.dataTransfer.dropEffect = "none";
    }
};

const handleDrop = (event) => {
    event.preventDefault();
    closeContextMenu();
    // console.log('--- Handle Drop ---');
    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) { console.error('Drop Error: Cannot get canvas bounds.'); draggingRectId.value = null; return; }

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;
    // console.log(`Drop Coords (Relative): dropX=${dropX}, dropY=${dropY}`);

    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    if (draggedRectIdStr) { // --- MOVE ---
        // console.log('Handling MOVE for ID:', draggedRectIdStr);
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try { const offset = JSON.parse(offsetData || '{}'); offsetX = offset.x || 0; offsetY = offset.y || 0; }
            catch (e) { console.warn('Could not parse drag offset data:', offsetData, e); }
            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) { rectToMove.x = dropX - offsetX; rectToMove.y = dropY - offsetY; }
            else { console.error(`Move Error: Cannot find rect with ID ${draggedRectId}.`); }
        } catch (e) { console.error("Error processing move drop:", e); }
    } else { // --- CREATE NEW ---
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        // console.log('Attempting to get SOURCE_ITEM:', sourceItemDataStr);
        if (sourceItemDataStr) {
            // console.log('Handling CREATE NEW');
            try {
                const sourceItemData = JSON.parse(sourceItemDataStr);
                const schema = getSchemaById(sourceItemData.schemaId);
                if (!schema) { console.error(`Create Error: Cannot find schema ID ${sourceItemData.schemaId}`); draggingRectId.value = null; return; }
                const initialFormData = {};
                Object.keys(schema).forEach(key => { initialFormData[key] = schema[key]; });
                const newRect = {
                    id: Date.now(), color: sourceItemData.color, schemaId: sourceItemData.schemaId,
                    x: dropX - defaultRectWidth / 2, y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth, height: defaultRectHeight,
                    order: currentOrder.value, formData: initialFormData
                };
                drawnRectangles.value.push(newRect);
                currentOrder.value++;
            } catch (e) { console.error("Drop Error: Failed to process source item:", e, sourceItemDataStr); }
        } else { console.warn('Drop Warning: No valid data found.'); }
    }
    draggingRectId.value = null;
};

</script>

<style scoped>
/* Thêm style cho loading/error nếu muốn */
.loading-indicator,
.error-message {
    padding: 2rem;
    text-align: center;
    font-style: italic;
    color: #666;
}

.error-message {
    color: red;
    font-weight: bold;
}

/* CSS không đổi */
.drawing-app {
    display: flex;
    gap: 2rem;
    font-family: sans-serif;
}

.palette {
    border: 1px solid #ccc;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background-color: #f8f8f8;
    height: fit-content;
}

.palette h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9em;
    color: #555;
}

.source-rect {
    width: 50px;
    height: 50px;
    border: 1px solid #eee;
    cursor: grab;
    transition: transform 0.2s ease;
}

.source-rect:active {
    cursor: grabbing;
    transform: scale(1.1);
}

.canvas {
    border: 2px dashed #007bff;
    width: 100%;
    height: 500px;
    position: relative;
    background-color: #e9ecef;
    overflow: hidden;
}

.canvas h3 {
    position: absolute;
    top: 5px;
    left: 10px;
    margin: 0;
    font-size: 0.9em;
    color: #6c757d;
    pointer-events: none;
}

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
