<template>
    <!-- Sử dụng state từ store -->
    <div v-if="processStore.isLoading" class="loading-indicator">
        Đang tải dữ liệu quy trình...
    </div>
    <div v-else-if="processStore.loadError" class="error-message">
        Lỗi tải dữ liệu quy trình. Vui lòng thử lại.
    </div>

    <div v-else class="draw-process-app-container">
        <div class="draw-process-app">
            <!-- Palette (không đổi nhiều) -->
            <div class="palette">
                <h3>Kéo mẫu quy trình:</h3>
                <div v-for="item in paletteItems" :key="item.schemaId" class="source-rect"
                    :style="{ backgroundColor: item.color }" draggable="true"
                    @dragstart="handleSourceDragStart($event, item)"></div>
            </div>

            <!-- Canvas -->
            <div class="canvas" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop" ref="canvasRef">
                <h3>Thả vào đây để vẽ quy trình:</h3>

                <!-- SVG Layer: Sử dụng getter sortedRectangles -->
                <svg class="connection-lines">
                    <!-- defs không đổi -->
                    <defs>
                        <marker id="proc-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3"
                            orient="auto-start-reverse" markerUnits="strokeWidth">
                            <path d="M0,0 L8,3 L0,6 Z" fill="#555" />
                        </marker>
                    </defs>
                    <g>
                        <!-- Sử dụng getter từ store -->
                        <template v-for="(rect, index) in processStore.sortedRectangles" :key="rect.id + '-proc-elbow'">
                            <template v-if="index < processStore.sortedRectangles.length - 1">
                                <polyline :points="calculateElbowPoints(rect, processStore.sortedRectangles[index + 1])" fill="none"
                                    stroke="#555" stroke-width="1.5" stroke-dasharray="4, 4"
                                    marker-end="url(#proc-arrowhead)" />
                            </template>
                        </template>
                    </g>
                </svg>

                <!-- Component Rectangle: Sử dụng state drawnRectangles và resizeCounter -->
                <DrawProcessRectangle
                    v-for="rect in processStore.drawnRectangles"
                    :key="`${rect.id}-${processStore.resizeCounter}`" 
                    :rect="rect"
                    :prevent-drag="processStore.isAnyModalVisible || processStore.isSchemaLoading" 
                    @dragstart.stop="handleRectDragStart($event, rect)"
                    @dragend="handleRectDragEnd"
                    @contextmenu="handleContextMenu($event, rect)" 
                    @open-edit="handleOpenEdit" 
                />

                <!-- Loading Overlay: Sử dụng state từ store -->
                <div v-if="processStore.isSchemaLoading" class="schema-loading-overlay">
                    Đang tải cấu hình...
                </div>

                <!-- Debug Controls (gọi actions mới) -->
                <div class="debug-controls">
                    <button @click="showProcessStructure">Hiển thị Cấu Trúc Quy Trình</button>
                    <button @click="showAllFormData">Hiển thị Toàn Bộ Dữ Liệu</button>
                </div>
            </div>
        </div>

        <!-- Component Save/Load Controls: Truyền state và lắng nghe sự kiện gọi action -->
        <DrawProcessSaveLoadControls
            :current-rectangles="processStore.drawnRectangles"
            @state-loaded="processStore.loadState"
            class="controls-container" />

        <!-- Modal Builder Schema (Original): Sử dụng state/getter và gọi action save -->
        <DynamicProcessEditFormModal
            :visible="processStore.isSchemaBuilderVisible"
            :initial-schema="processStore.initialSchemaForEdit" 
            @saveSchema="processStore.saveSchema" 
            @cancel="processStore.closeAllModals" 
        />

        <!-- Modal Builder Schema (New): Sử dụng state/getter và gọi action save -->
        <DynamicRefProcessEditFormModal
            :visible="processStore.isRefSchemaBuilderVisible"
            :initial-schema="processStore.initialSchemaForEdit" 
            @saveSchema="processStore.saveSchema" 
            @cancel="processStore.closeAllModals" 
        />

        <!-- Modal Context Menu: Sử dụng state và gọi actions -->
        <DrawProcessContextMenu
            :visible="processStore.contextMenu.visible"
            :top="processStore.contextMenu.top"
            :left="processStore.contextMenu.left"
            @edit="handleEditFromContextMenu"
            @editRefSchema="handleEditRefSchemaFromContextMenu"
            @delete="handleDeleteFromContextMenu"
            @enterData="handleEnterDataFromContextMenu"
            ref="contextMenuRef" 
        />

        <!-- Modal Nhập Dữ liệu: Sử dụng state/getter và gọi action save -->
        <DataEntryModal
            :visible="processStore.isDataEntryVisible"
            :schema="processStore.editingRect?.formSchemaDefinition"
            :initialData="processStore.initialDataForEntry" 
            @saveData="processStore.saveData" 
            @cancel="processStore.closeAllModals" 
        />

        <!-- Debug Output: Sử dụng state và gọi action -->
        <div v-if="processStore.isDebugVisible" class="debug-output">
            <h3>{{ processStore.debugTitle }}</h3>
            <pre>{{ processStore.debugData }}</pre>
            <button @click="processStore.clearDebugInfo">Đóng</button> 
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia'; // Import storeToRefs nếu cần reactivity trực tiếp trong template (ít dùng hơn với setup script)
import { debounce } from 'lodash-es';

// Import Store
import { useProcessStore } from '@/stores/processStore'; // Đường dẫn tới store

// Import các component con (giữ nguyên)
import DrawProcessRectangle from './TabRectangle.vue';
import DrawProcessContextMenu from './TabContextMenu.vue';
import DynamicProcessEditFormModal from './TabEditForm.vue';
import DynamicRefProcessEditFormModal from './TabRefEditForm.vue';
import DrawProcessSaveLoadControls from './TabSaveLoadControls.vue';
import DataEntryModal from './TabDataEntryModal.vue';

// Import types và paletteItems (có thể không cần nếu không dùng trực tiếp ở đây nữa)
import { paletteItems } from '../../data/tabProcessSchemas.js'; // Vẫn cần cho palette
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js';

// --- Khởi tạo Store ---
const processStore = useProcessStore();

// --- Lấy state và getters (nếu cần reactivity trong template hoặc script phức tạp) ---
// Sử dụng storeToRefs nếu bạn muốn các biến state/getter có thể được destructured và vẫn giữ reactivity
// Ví dụ: const { isLoading, drawnRectangles, sortedRectangles } = storeToRefs(processStore);
// Tuy nhiên, với <script setup>, thường truy cập trực tiếp processStore.propertyName là đủ.

// --- Refs cục bộ (chỉ giữ lại những gì thực sự cần thiết cho component này) ---
const canvasRef = ref(null); // Vẫn cần để lấy kích thước canvas
const contextMenuRef = ref(null); // Vẫn cần để kiểm tra click outside
const draggingRectId = ref(null); // State tạm thời khi kéo thả
const defaultRectWidth = 50; // Có thể chuyển thành hằng số hoặc vào store nếu muốn cấu hình
const defaultRectHeight = 50;

// --- Logic Tính toán (chỉ giữ lại những gì không thuộc về store) ---
// Tính toán điểm nối (vẫn cần ở đây vì nó là logic hiển thị phụ thuộc vào rects)
const calculateElbowPoints = (rectA, rectB) => {
    // Giữ nguyên logic này
    if (!rectA || !rectB) return "";
    let startX, endX;
    const startY = rectA.y + rectA.height / 2;
    const endY = rectB.y + rectB.height / 2;
    if (rectB.x >= rectA.x + rectA.width) { startX = rectA.x + rectA.width; endX = rectB.x; }
    else if (rectB.x + rectB.width <= rectA.x) { startX = rectA.x; endX = rectB.x + rectB.width; }
    else { startX = rectA.x + rectA.width; endX = rectB.x; }
    const midX = (startX + endX) / 2;
    return `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
};

// --- Event Handlers (Gọi actions của store) ---

// Xử lý Context Menu (gọi action của store)
const handleContextMenu = (event, rect) => {
    processStore.showContextMenu(event, rect);
};

// Xử lý mở modal Edit (gọi action của store)
const handleOpenEdit = (rect) => {
    // Quyết định mở modal nào (ví dụ: luôn mở modal Ref mới)
    processStore.openSchemaEditor(rect.id, true); // true để mở Ref Editor
};

// Xử lý các sự kiện từ Context Menu (gọi actions tương ứng)
const handleEditFromContextMenu = () => {
    if (processStore.contextMenu.targetRectId) {
        processStore.openSchemaEditor(processStore.contextMenu.targetRectId, false); // Mở modal cũ
    }
    processStore.closeContextMenu(); // Đóng menu sau khi gọi action
};
const handleEditRefSchemaFromContextMenu = () => {
    if (processStore.contextMenu.targetRectId) {
        processStore.openSchemaEditor(processStore.contextMenu.targetRectId, true); // Mở modal mới
    }
    processStore.closeContextMenu();
};
const handleDeleteFromContextMenu = () => {
    if (processStore.contextMenu.targetRectId) {
        processStore.deleteRectangle(processStore.contextMenu.targetRectId);
    }
     // Action deleteRectangle đã tự đóng menu nếu cần, hoặc gọi closeContextMenu ở đây
     processStore.closeContextMenu(); // Đảm bảo đóng
};
const handleEnterDataFromContextMenu = () => {
    if (processStore.contextMenu.targetRectId) {
        processStore.openDataEditor(processStore.contextMenu.targetRectId);
    }
    processStore.closeContextMenu();
};

// --- Drag & Drop Handlers (Logic phần lớn giữ nguyên, nhưng gọi actions khi cần) ---
const handleSourceDragStart = (event, item) => {
    console.log(`[Canvas] handleSourceDragStart: Attempting drag for item schemaId=${item.schemaId}`);
    processStore.closeContextMenu(); // Đóng context menu nếu đang mở
    const dataToTransfer = { schemaId: item.schemaId, color: item.color, filename: item.filename };
    try {
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
        event.dataTransfer.effectAllowed = 'copy';
        draggingRectId.value = null;
        console.log(`[Canvas] handleSourceDragStart: Data set for ${item.schemaId}`);
    } catch (e) {
        console.error("[Canvas] Source Drag Start Error:", e);
        event.preventDefault();
    }
};

const handleRectDragStart = (event, rect) => {
    console.log(`[Canvas] handleRectDragStart: Attempting drag for rect ID=${rect.id}`);
    processStore.closeContextMenu();
    if (processStore.isAnyModalVisible) { // Kiểm tra qua store
        console.log(`[Canvas] handleRectDragStart: Prevented drag for rect ID=${rect.id} because a modal is visible.`);
        event.preventDefault();
        return;
    }
    try {
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        const offsetData = JSON.stringify({ x: event.offsetX, y: event.offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move';
        draggingRectId.value = rect.id; // Vẫn dùng ref cục bộ cho ID đang kéo
        console.log(`[Canvas] handleRectDragStart: Data set for rect ID=${rect.id}`);
    } catch (e) {
        console.error("[Canvas] Rect Drag Start Error:", e);
        event.preventDefault();
    }
};

const handleRectDragEnd = (event) => {
    console.log(`[Canvas] handleRectDragEnd: Drag ended for rect ID=${draggingRectId.value}`);
    draggingRectId.value = null; // Reset ID đang kéo
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

// Xử lý Drop (Gọi actions của store)
const handleDrop = async (event) => {
    event.preventDefault();
    console.log('[Canvas] handleDrop: Drop event triggered.');
    processStore.closeContextMenu();

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) {
        console.error('[Canvas] Drop Error: Cannot get canvas bounds.');
        draggingRectId.value = null;
        return;
    }

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);

    // --- Trường hợp: Di chuyển ---
    if (draggedRectIdStr) {
        console.log(`[Canvas] handleDrop: Processing MOVE for rect ID=${draggedRectIdStr}`);
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try {
                const offset = JSON.parse(offsetData || '{}');
                offsetX = offset.x || 0;
                offsetY = offset.y || 0;
            } catch (e) { console.warn('[Canvas] Could not parse drag offset data:', e); }

            // Gọi action moveRectangle của store
            processStore.moveRectangle(draggedRectId, dropX - offsetX, dropY - offsetY);

        } catch (e) { console.error("[Canvas] Error processing move drop:", e); }
    }
    // --- Trường hợp: Tạo mới ---
    else if (sourceItemDataStr) {
        console.log(`[Canvas] handleDrop: Processing CREATE NEW from source data.`);
        try {
            const sourceItemData = JSON.parse(sourceItemDataStr);
            // Gọi action addRectangle của store
            await processStore.addRectangle(sourceItemData, dropX, dropY, defaultRectWidth, defaultRectHeight);
        } catch (e) {
            console.error("[Canvas] Drop Error (Create New):", e);
            processStore.isSchemaLoading = false; // Đảm bảo tắt loading nếu lỗi parse JSON
        }
    } else {
        console.warn('[Canvas] Drop Warning: No valid data found.');
    }
    draggingRectId.value = null; // Reset ID đang kéo
    console.log('[Canvas] handleDrop: Finished processing drop.');
};


// --- Debug Functions (Gọi actions của store) ---
const showProcessStructure = () => {
    // Clone không cần thiết ở đây vì action sẽ xử lý
    processStore.setDebugInfo('Cấu Trúc Quy Trình', processStore.drawnRectangles);
};

const showAllFormData = () => {
    const allFormData = {};
    processStore.drawnRectangles.forEach(rect => {
        // Clone ở đây hoặc trong action setDebugInfo nếu cần
        allFormData[rect.id] = structuredClone(rect.formData);
    });
    processStore.setDebugInfo('Toàn Bộ Dữ Liệu', allFormData);
};

// --- Window Event Listeners (Gọi actions hoặc xử lý cục bộ) ---

// Debounce handler (giữ ở component để quản lý instance dễ hơn)
const debouncedWindowChange = debounce(() => {
    console.log('[Canvas] Debounced window change handler executed.');
    // Gọi action trong store để xử lý logic chung (đóng menu, tăng counter)
    processStore.handleWindowChange();

    // Có thể thêm logic chỉ thuộc về component ở đây nếu cần, sau khi store đã xử lý
    // Ví dụ: tính toán lại vị trí dựa trên canvasRef.value.getBoundingClientRect()
    // nếu việc đó không thể làm trong store.

}, 300);

const handleClickOutside = (event) => {
    // Kiểm tra click ngoài context menu (logic này vẫn cần ref)
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);

    if (processStore.contextMenu.visible && !isClickInsideMenu) {
        console.log('[Canvas] handleClickOutside: Closing context menu via store action.');
        processStore.closeContextMenu(); // Gọi action để đóng
    }
};

// --- Lifecycle Hooks ---
onMounted(() => {
    console.log('[Canvas] Component Mounted. Initializing store and adding listeners.');
    // Gọi action khởi tạo của store
    processStore.initializeCanvas();

    // Thêm listeners
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', debouncedWindowChange);
    window.addEventListener('scroll', debouncedWindowChange, true);
});

onUnmounted(() => {
    console.log('[Canvas] Component Unmounted. Removing listeners.');
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', debouncedWindowChange);
    window.removeEventListener('scroll', debouncedWindowChange, true);
    debouncedWindowChange.cancel?.(); // Hủy debounce khi unmount
    // Có thể gọi action dọn dẹp trong store nếu cần
    // processStore.cleanupDebouncedHandler?.(); // Nếu debounce được quản lý trong store
});

</script>

<style scoped>
/* Style giữ nguyên như các phiên bản trước */
.draw-process-app-container {
    display: flex;
    flex-direction: column;
}

.draw-process-app {
    display: flex;
    gap: 2rem;
    font-family: sans-serif;
}

.controls-container {
    margin: 1rem auto;
    width: fit-content;
}

.schema-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.2em;
    color: #333;
    z-index: 10; /* Đảm bảo nó ở trên các hình chữ nhật */
}

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

.palette {
    border: 1px solid #ccc;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background-color: #f8f8f8;
    height: fit-content; /* Chiều cao tự động theo nội dung */
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
    width: 100%; /* Chiếm hết không gian còn lại */
    height: 500px; /* Hoặc chiều cao mong muốn */
    position: relative; /* Cần thiết cho định vị tuyệt đối của children */
    background-color: #e9ecef;
    overflow: hidden; /* Ngăn nội dung tràn ra ngoài */
}

.canvas h3 {
    position: absolute;
    top: 5px;
    left: 10px;
    margin: 0;
    font-size: 0.9em;
    color: #6c757d;
    pointer-events: none; /* Không bắt sự kiện chuột */
}

.connection-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* SVG không bắt sự kiện chuột */
    z-index: 1; /* Nằm dưới các hình chữ nhật (có z-index: 2) */
}

.debug-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 10px;
    z-index: 10; /* Đảm bảo nút lệnh nổi lên trên các hình */
}
.debug-controls button {
  padding: 5px 10px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* Style cho vùng hiển thị debug */
.debug-output {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    max-height: 80vh;
    background-color: #fff;
    border: 1px solid #ccc;
    padding: 20px;
    overflow: auto;
    z-index: 20; /* Phải cao hơn debug-controls và các phần tử khác */
    box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5);
}

.debug-output h3 {
    margin-top: 0;
}

.debug-output pre {
    white-space: pre-wrap;
    font-family: monospace;
    border: 1px solid #ddd;
    padding: 10px;
    background-color: #f8f8f8;
    overflow-x: auto;
}
</style>
