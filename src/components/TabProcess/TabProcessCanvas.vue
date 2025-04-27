<template>
    <!-- Chỉ báo Loading ban đầu -->
    <div v-if="isLoading" class="loading-indicator">
        Đang tải dữ liệu quy trình...
    </div>
    <!-- Thông báo lỗi load ban đầu -->
    <div v-else-if="loadError" class="error-message">
        Lỗi tải dữ liệu quy trình. Vui lòng thử lại.
    </div>

    <!-- Giao diện chính sau khi load xong -->
    <div v-else class="draw-process-app-container">
        <div class="draw-process-app">
            <!-- Palette: Chứa các mẫu kéo thả -->
            <div class="palette">
                <h3>Kéo mẫu quy trình:</h3>
                <div v-for="item in paletteItems" :key="item.schemaId" class="source-rect"
                    :style="{ backgroundColor: item.color }" draggable="true"
                    @dragstart="handleSourceDragStart($event, item)"></div>
            </div>

            <!-- Canvas: Khu vực vẽ chính -->
            <div class="canvas" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop" ref="canvasRef">
                <h3>Thả vào đây để vẽ quy trình:</h3>

                <!-- SVG Layer: Vẽ đường nối -->
                <svg class="connection-lines">
                    <defs>
                        <marker id="proc-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3"
                            orient="auto-start-reverse" markerUnits="strokeWidth">
                            <path d="M0,0 L8,3 L0,6 Z" fill="#555" />
                        </marker>
                    </defs>
                    <g>
                        <template v-for="(rect, index) in sortedRectangles" :key="rect.id + '-proc-elbow'">
                            <template v-if="index < sortedRectangles.length - 1">
                                <polyline :points="calculateElbowPoints(rect, sortedRectangles[index + 1])" fill="none"
                                    stroke="#555" stroke-width="1.5" stroke-dasharray="4, 4"
                                    marker-end="url(#proc-arrowhead)" />
                            </template>
                        </template>
                    </g>
                </svg>

                <!-- Component Rectangle: Hiển thị các hình chữ nhật đã vẽ -->
                <!-- SỬ DỤNG resizeCounter TRONG KEY ĐỂ BUỘC UPDATE KHI RESIZE -->
                <DrawProcessRectangle
                    v-for="rect in drawnRectangles"
                    :key="`${rect.id}-${resizeCounter}`" 
                    :rect="rect"
                    :prevent-drag="isAnyModalVisible || isSchemaLoading"
                    @dragstart.stop="handleRectDragStart($event, rect)"
                    @dragend="handleRectDragEnd"
                    @contextmenu="showContextMenu($event, rect)"
                    @open-edit="openSchemaBuilderModal" 
                />

                <!-- Loading Overlay: Hiển thị khi đang load schema từ XML -->
                <div v-if="isSchemaLoading" class="schema-loading-overlay">
                    Đang tải cấu hình...
                </div>
            </div>
        </div>

        <!-- Component Save/Load Controls: Nút Lưu/Tải trạng thái -->
        <DrawProcessSaveLoadControls :current-rectangles="drawnRectangles" @state-loaded="onStateLoaded"
            class="controls-container" />

        <!-- Modal Builder Schema (Original - Có thể giữ lại hoặc loại bỏ) -->
        <DynamicProcessEditFormModal
            :visible="isSchemaBuilderVisible"
            :initial-schema="getInitialSchema(editingRect)"
            @saveSchema="handleSchemaSaved"
            @cancel="cancelSchemaBuilder"
        />

        <!-- Modal Builder Schema (Mới - Có Tabs và Reference) -->
        <DynamicRefProcessEditFormModal
            :visible="isRefSchemaBuilderVisible"
            :initial-schema="getInitialSchema(editingRect)"
            @saveSchema="handleSchemaSaved"
            @cancel="cancelRefSchemaBuilder"
        />

        <!-- Modal Context Menu: Menu chuột phải -->
        <DrawProcessContextMenu
            :visible="contextMenu.visible"
            :top="contextMenu.top"
            :left="contextMenu.left"
            @edit="openSchemaBuilderModalFromContextMenu"
            @editRefSchema="openRefSchemaBuilderModalFromContextMenu"
            @delete="handleDelete"
            @enterData="openDataEntryModalFromContextMenu"
            ref="contextMenuRef"
        />

        <!-- Modal Nhập Dữ liệu (Cần cập nhật để xử lý schema tabs) -->
        <DataEntryModal
            :visible="isDataEntryVisible"
            :schema="editingRect?.formSchemaDefinition"
            :initialData="editingRect?.formData"
            @saveData="handleDataSaved"
            @cancel="cancelDataEntry"
        />

    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'; // Thêm nextTick
import { debounce } from 'lodash-es';

// Import các component con
import DrawProcessRectangle from './TabRectangle.vue';
import DrawProcessContextMenu from './TabContextMenu.vue';
import DynamicProcessEditFormModal from './TabEditForm.vue'; // Modal cũ (có thể giữ lại hoặc bỏ)
import DynamicRefProcessEditFormModal from './TabRefEditForm.vue'; // Modal mới với Tabs/Ref
import DrawProcessSaveLoadControls from './TabSaveLoadControls.vue';
import DataEntryModal from './TabDataEntryModal.vue'; // Cần cập nhật sau

// Import logic quản lý schema và types
import { paletteItems, getCachedSchemaById, loadPaletteData, getOrLoadFormSchema } from '../../data/tabProcessSchemas.js';
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js';

// --- Component State ---
const isLoading = ref(true);
const loadError = ref(false);
const isSchemaLoading = ref(false);
const drawnRectangles = ref([]);
const canvasRef = ref(null);
const defaultRectWidth = 50;
const defaultRectHeight = 50;
const draggingRectId = ref(null);
const currentOrder = ref(1);
const contextMenuRef = ref(null);
const contextMenu = ref({ visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null });
const isSchemaBuilderVisible = ref(false); // State cho modal cũ
const isRefSchemaBuilderVisible = ref(false); // State cho modal mới (Tabs/Ref)
const isDataEntryVisible = ref(false);
const editingRect = ref(null); // Dùng chung cho cả 3 modal
const resizeCounter = ref(0); // <--- BIẾN ĐẾM RESIZE ĐỂ CẬP NHẬT KEY

// --- Computed Properties ---
const sortedRectangles = computed(() => {
    return drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
});

// Computed property để kiểm tra nếu bất kỳ modal nào đang hiển thị
const isAnyModalVisible = computed(() => {
    return isSchemaBuilderVisible.value || isRefSchemaBuilderVisible.value || isDataEntryVisible.value;
});


// --- Helper Functions ---

// Helper lấy giá trị mặc định cho các kiểu dữ liệu
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null tùy yêu cầu
        case 'reference': return null; // Giá trị mặc định cho reference là null
        default: return '';
    }
};

// Lấy schema ban đầu để truyền vào modal chỉnh sửa
const getInitialSchema = (rect) => {
    const schema = rect?.formSchemaDefinition;
    if (schema && typeof schema === 'object') {
        try {
            return structuredClone(schema);
        } catch (e) {
            console.warn("[DrawProcess] Using JSON fallback for cloning initial schema.");
            return JSON.parse(JSON.stringify(schema));
        }
    }
    return { tabs: [] }; // Mặc định trả về cấu trúc tabs rỗng
};

// Tính toán điểm nối khuỷu tay giữa 2 hình chữ nhật
const calculateElbowPoints = (rectA, rectB) => {
    if (!rectA || !rectB) return "";

    let startX, endX;
    const startY = rectA.y + rectA.height / 2;
    const endY = rectB.y + rectB.height / 2;

    // Xác định điểm bắt đầu và kết thúc dựa trên vị trí tương đối
    if (rectB.x >= rectA.x + rectA.width) { // B ở bên phải A
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    } else if (rectB.x + rectB.width <= rectA.x) { // B ở bên trái A
        startX = rectA.x;
        endX = rectB.x + rectB.width;
    } else { // B chồng lên A theo chiều ngang (trường hợp ít mong muốn, nối từ phải A sang trái B)
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    }

    const midX = (startX + endX) / 2; // Điểm giữa theo chiều ngang
    // Tạo chuỗi điểm cho polyline: Start -> Corner1 -> Corner2 -> End
    return `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
};

// --- Event Handlers ---

// Xử lý thay đổi kích thước cửa sổ (đã debounce và cập nhật resizeCounter)
const handleWindowChange = debounce(async () => {
    console.log('[DrawProcess] handleWindowChange executed (debounced). Context menu visible:', contextMenu.value.visible);
    if (contextMenu.value.visible) {
        console.log('[DrawProcess] Closing context menu due to window change.');
        closeContextMenu();
    }
    // Quan trọng: Tăng biến đếm để kích hoạt cập nhật key trong v-for
    resizeCounter.value++;
    console.log('[DrawProcess] Resize counter incremented:', resizeCounter.value);

    // Đợi DOM cập nhật xong sau khi key thay đổi (nếu cần làm gì đó sau)
    await nextTick();
    console.log('[DrawProcess] DOM updated after resize handling.');
    // Ví dụ: Nếu cần tính toán lại vị trí dựa trên canvas mới:
    // recalculatePositionsIfNeeded();

    // --- THỬ NGHIỆM: Đọc lại layout của canvas ---
    // Mục đích: Buộc trình duyệt tính toán lại layout sau khi DOM đã cập nhật.
    // Điều này có thể giúp ổn định việc xử lý sự kiện sau đó.
    if (canvasRef.value) {
        const currentCanvasRect = canvasRef.value.getBoundingClientRect();
        console.log('[DrawProcess] Read canvas bounds after nextTick:', currentCanvasRect);
        // Chúng ta không *làm gì* với currentCanvasRect ở đây,
        // chỉ việc đọc nó đã có thể kích hoạt tính toán layout.
    }
    // ---------------------------------------------

}, 300); // <-- Tăng thời gian debounce (300ms)

// --- Lifecycle Hooks ---
onMounted(async () => {
    console.log('[DrawProcess] Component Mounted. Adding window listeners.');
    try {
        await loadPaletteData('/tab_templates/manifest.json');
        loadError.value = false;
    } catch (error) {
        console.error("[DrawProcess] Failed to initialize due to palette data loading error:", error);
        loadError.value = true;
    } finally {
        isLoading.value = false;
    }
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true); // Lắng nghe cả scroll
});

onUnmounted(() => {
    console.log('[DrawProcess] Component Unmounted. Removing window listeners.');
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
    handleWindowChange.cancel?.(); // Hủy debounce khi unmount
});

// --- Component Methods / Event Handlers ---

// Xử lý khi trạng thái được tải từ Save/Load Controls
const onStateLoaded = (loadedRectangles) => {
    console.log("[DrawProcess] Received loaded state:", loadedRectangles);
    drawnRectangles.value = loadedRectangles.map(rect => ({
        ...rect,
        formSchemaDefinition: rect.formSchemaDefinition && typeof rect.formSchemaDefinition === 'object'
                                ? rect.formSchemaDefinition
                                : { tabs: [] },
        formData: rect.formData && typeof rect.formData === 'object'
                    ? rect.formData
                    : {}
    }));
    currentOrder.value = loadedRectangles.length > 0 ? Math.max(...loadedRectangles.map(r => r.order)) + 1 : 1;
    console.log("[DrawProcess] Canvas state restored. New currentOrder:", currentOrder.value);

    // Tải trước các schema cần thiết
    const uniqueSchemaIds = [...new Set(loadedRectangles.map(r => r.schemaId).filter(id => id))];
    console.log("[DrawProcess] Pre-loading schemas for IDs:", uniqueSchemaIds);
    uniqueSchemaIds.forEach(id => {
        getOrLoadFormSchema(id).catch(err => {
            console.error(`[DrawProcess] Failed to pre-load schema ${id} after state load:`, err);
        });
    });
    // Kích hoạt cập nhật key sau khi load state để đảm bảo render đúng
    resizeCounter.value++;
    console.log('[DrawProcess] Resize counter incremented after state load.');
};

// Xử lý click bên ngoài để đóng context menu
const handleClickOutside = (event) => {
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);
    // console.log(`[DrawProcess] handleClickOutside: Visible=${contextMenu.value.visible}, InsideMenu=${isClickInsideMenu}`);
    if (contextMenu.value.visible && !isClickInsideMenu) {
        console.log('[DrawProcess] handleClickOutside: Closing context menu.');
        closeContextMenu();
    }
};

// Hiển thị context menu
const showContextMenu = (event, rect) => {
    console.log(`[DrawProcess] showContextMenu: Attempting for rect ID=${rect.id} at (${event.clientX}, ${event.clientY})`);
    if (isAnyModalVisible.value) {
        console.log(`[DrawProcess] showContextMenu: Prevented because a modal is visible.`);
        event.preventDefault();
        return;
    }
    if (contextMenu.value.visible) {
        console.log(`[DrawProcess] showContextMenu: Closing existing menu before opening new one.`);
        closeContextMenu(); // Đóng menu cũ trước
    }
    event.preventDefault();
    contextMenu.value = {
        visible: true,
        top: event.clientY,
        left: event.clientX,
        targetRectId: rect.id,
        targetRectOrder: rect.order
    };
    console.log(`[DrawProcess] showContextMenu: Menu opened for rect ID=${rect.id}`);
};

// Đóng context menu
const closeContextMenu = () => {
    if (contextMenu.value.visible) {
        console.log(`[DrawProcess] closeContextMenu: Closing menu for target ID=${contextMenu.value.targetRectId}`);
        contextMenu.value = { visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null };
    }
};

// Xóa hình chữ nhật
const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    const orderToDelete = contextMenu.value.targetRectOrder;
    closeContextMenu();
    if (idToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            drawnRectangles.value.splice(indexToDelete, 1);
            // Cập nhật lại 'order' cho các hình chữ nhật còn lại có order lớn hơn cái đã xóa
            drawnRectangles.value.forEach(rect => {
                if (rect.order > orderToDelete) {
                    rect.order -= 1;
                }
            });
            // Cập nhật currentOrder dựa trên order lớn nhất còn lại
            currentOrder.value = drawnRectangles.value.length > 0
                ? Math.max(...drawnRectangles.value.map(r => r.order)) + 1
                : 1;
            console.log(`[DrawProcess] Deleted rect ID: ${idToDelete}. Order updated. New currentOrder: ${currentOrder.value}`);
        }
    }
};

// --- Schema Builder Modal Logic (Original - Optional) ---
const openSchemaBuilderModal = (rect) => {
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu();
    editingRect.value = rect;
    isSchemaBuilderVisible.value = true;
    console.log(`[DrawProcess] Opening ORIGINAL schema builder for rect ID: ${rect.id}`);
};

const openSchemaBuilderModalFromContextMenu = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) openSchemaBuilderModal(rectToEdit);
    }
    closeContextMenu();
};

const cancelSchemaBuilder = () => {
    isSchemaBuilderVisible.value = false;
    if (editingRect.value?.id === contextMenu.value.targetRectId) { // Chỉ reset nếu modal này đang mở cho rect đó
       // editingRect.value = null; // Không reset ở đây, để handleSchemaSaved xử lý
    }
    console.log("[DrawProcess] Original schema builder cancelled/closed.");
};

// --- Schema Builder Modal Logic (New - Tabs/Reference) ---
const openRefSchemaBuilderModal = (rect) => {
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu();
    editingRect.value = rect;
    isRefSchemaBuilderVisible.value = true;
    console.log(`[DrawProcess] Opening REFERENCE schema builder for rect ID: ${rect.id}`);
};

const openRefSchemaBuilderModalFromContextMenu = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) openRefSchemaBuilderModal(rectToEdit);
    }
    closeContextMenu();
};

const cancelRefSchemaBuilder = () => {
    isRefSchemaBuilderVisible.value = false;
     if (editingRect.value?.id === contextMenu.value.targetRectId) { // Chỉ reset nếu modal này đang mở cho rect đó
       // editingRect.value = null; // Không reset ở đây, để handleSchemaSaved xử lý
    }
    console.log("[DrawProcess] Reference schema builder cancelled/closed.");
};

// --- Common Schema Save Handler ---
const handleSchemaSaved = (newSchemaDefinition) => {
    console.log('[DrawProcess] Received new schema definition:', newSchemaDefinition);
    if (editingRect.value) {
        const rectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
        if (rectIndex !== -1) {
            try {
                drawnRectangles.value[rectIndex].formSchemaDefinition = structuredClone(newSchemaDefinition);
                console.log(`[DrawProcess] Updated schema definition for rect ID: ${editingRect.value.id}`, drawnRectangles.value[rectIndex].formSchemaDefinition);
            } catch (e) {
                drawnRectangles.value[rectIndex].formSchemaDefinition = JSON.parse(JSON.stringify(newSchemaDefinition));
                console.warn("[DrawProcess] Used JSON fallback to save schema definition.");
            }

            // Reset formData DẠNG PHẲNG dựa trên giá trị mặc định của schema MỚI
            const newFlatFormData = {};
            if (Array.isArray(newSchemaDefinition.tabs)) {
                newSchemaDefinition.tabs.forEach(tab => {
                    if (tab.fields && typeof tab.fields === 'object') {
                        for (const key in tab.fields) {
                            const fieldSchema = tab.fields[key];
                            newFlatFormData[key] = fieldSchema.hasOwnProperty('value')
                                ? fieldSchema.value
                                : getDefaultValue(fieldSchema.type);
                        }
                    }
                });
            } else if (typeof newSchemaDefinition === 'object') { // Fallback cho schema phẳng (nếu có)
                 for (const key in newSchemaDefinition) {
                     const fieldSchema = newSchemaDefinition[key];
                     newFlatFormData[key] = fieldSchema.hasOwnProperty('value')
                         ? fieldSchema.value
                         : getDefaultValue(fieldSchema.type);
                 }
            }

            try {
                drawnRectangles.value[rectIndex].formData = structuredClone(newFlatFormData);
                console.log("[DrawProcess] Reset flat formData based on new schema:", drawnRectangles.value[rectIndex].formData);
            } catch (e) {
                drawnRectangles.value[rectIndex].formData = JSON.parse(JSON.stringify(newFlatFormData));
                console.warn("[DrawProcess] Used JSON fallback to reset flat formData.");
            }

        } else {
            console.error(`[DrawProcess] Cannot find rect with ID ${editingRect.value.id} to save schema.`);
        }
    }
    // Đóng cả hai modal schema và reset editingRect
    isSchemaBuilderVisible.value = false;
    isRefSchemaBuilderVisible.value = false;
    editingRect.value = null;
    console.log("[DrawProcess] Schema saved, modals closed, editingRect reset.");
};


// --- Data Entry Modal Logic ---
const openDataEntryModal = (rect) => {
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu();
    editingRect.value = rect;
    isDataEntryVisible.value = true;
    console.log(`[DrawProcess] Opening data entry for rect ID: ${rect.id}`);
};

const openDataEntryModalFromContextMenu = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) openDataEntryModal(rectToEdit);
    }
    closeContextMenu();
};

// Xử lý lưu dữ liệu từ modal nhập liệu (nhận dữ liệu phẳng)
const handleDataSaved = (newFlatData) => {
    console.log('[DrawProcess] Received updated form data (flat):', newFlatData);
    if (editingRect.value) {
        const rectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
        if (rectIndex !== -1) {
            try {
                drawnRectangles.value[rectIndex].formData = structuredClone(newFlatData);
            } catch (e) {
                drawnRectangles.value[rectIndex].formData = JSON.parse(JSON.stringify(newFlatData));
                console.warn("[DrawProcess] Used JSON fallback to save form data.");
            }
            console.log(`[DrawProcess] Updated flat formData for rect ID: ${editingRect.value.id}`, drawnRectangles.value[rectIndex].formData);
        } else {
            console.error(`[DrawProcess] Cannot find rect with ID ${editingRect.value.id} to save data.`);
        }
    }
    cancelDataEntry(); // Đóng modal và reset editingRect
};

const cancelDataEntry = () => {
    isDataEntryVisible.value = false;
    editingRect.value = null; // Reset khi đóng hoặc lưu
    console.log("[DrawProcess] Data entry modal cancelled/closed, editingRect reset.");
};


// --- Drag & Drop Handlers ---
const handleSourceDragStart = (event, item) => {
    console.log(`[DrawProcess] handleSourceDragStart: Attempting drag for item schemaId=${item.schemaId}`);
    closeContextMenu();
    const dataToTransfer = { schemaId: item.schemaId, color: item.color, filename: item.filename };
    try {
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
        event.dataTransfer.effectAllowed = 'copy';
        draggingRectId.value = null; // Đảm bảo không có rect nào đang được kéo
        console.log(`[DrawProcess] handleSourceDragStart: Data set for ${item.schemaId}`);
    } catch (e) {
        console.error("[DrawProcess] Source Drag Start Error:", e, dataToTransfer);
        event.preventDefault(); // Ngăn kéo nếu lỗi
    }
};

const handleRectDragStart = (event, rect) => {
    console.log(`[DrawProcess] handleRectDragStart: Attempting drag for rect ID=${rect.id}`);
    if (contextMenu.value.visible) closeContextMenu();
    if (isAnyModalVisible.value) {
        console.log(`[DrawProcess] handleRectDragStart: Prevented drag for rect ID=${rect.id} because a modal is visible.`);
        event.preventDefault();
        return;
    }
    try {
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        const offsetData = JSON.stringify({ x: event.offsetX, y: event.offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move';
        draggingRectId.value = rect.id;
        console.log(`[DrawProcess] handleRectDragStart: Data set for rect ID=${rect.id}, Offset=(${event.offsetX}, ${event.offsetY})`);
    } catch (e) {
        console.error("[DrawProcess] Rect Drag Start Error:", e);
        event.preventDefault();
    }
};

const handleRectDragEnd = (event) => {
    console.log(`[DrawProcess] handleRectDragEnd: Drag ended for rect ID=${draggingRectId.value}`);
    draggingRectId.value = null;
};

const handleDragOver = (event) => {
    // Không cần log ở đây trừ khi debug dropEffect
    event.preventDefault();
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move";
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy";
    } else {
        event.dataTransfer.dropEffect = "none";
    }
};

// Xử lý khi thả vào Canvas
const handleDrop = async (event) => {
    event.preventDefault();
    console.log('[DrawProcess] handleDrop: Drop event triggered.');
    closeContextMenu();

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) {
        console.error('[DrawProcess] Drop Error: Cannot get canvas bounds.');
        draggingRectId.value = null; // Reset trạng thái kéo
        return;
    }
    console.log(`[DrawProcess] handleDrop: Client Coords=(${event.clientX}, ${event.clientY}), Canvas Rect=`, canvasRect);

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;
    console.log(`[DrawProcess] handleDrop: Calculated Drop Coords within Canvas=(${dropX}, ${dropY})`);

    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
    console.log(`[DrawProcess] handleDrop: Received RECT_ID='${draggedRectIdStr}', SOURCE_ITEM='${sourceItemDataStr}'`);

    // --- Trường hợp: Di chuyển hình chữ nhật đã có ---
    if (draggedRectIdStr) {
        console.log(`[DrawProcess] handleDrop: Processing MOVE for rect ID=${draggedRectIdStr}`);
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try {
                const offset = JSON.parse(offsetData || '{}');
                offsetX = offset.x || 0;
                offsetY = offset.y || 0;
                console.log(`[DrawProcess] handleDrop: Parsed offset=(${offsetX}, ${offsetY})`);
            }
            catch (e) { console.warn('[DrawProcess] Could not parse drag offset data:', offsetData, e); }

            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) {
                rectToMove.x = dropX - offsetX;
                rectToMove.y = dropY - offsetY;
                console.log(`[DrawProcess] Moved rect ID ${draggedRectId} to (${rectToMove.x}, ${rectToMove.y})`);
            } else { console.error(`[DrawProcess] Move Error: Cannot find rect with ID ${draggedRectId}.`); }
        } catch (e) { console.error("[DrawProcess] Error processing move drop:", e); }
    }
    // --- Trường hợp: Tạo hình chữ nhật mới từ Palette ---
    else if (sourceItemDataStr) {
        console.log(`[DrawProcess] handleDrop: Processing CREATE NEW from source data.`);
        let sourceItemData;
        try {
            sourceItemData = JSON.parse(sourceItemDataStr);
            console.log('[DrawProcess] Handling CREATE NEW for:', sourceItemData);

            isSchemaLoading.value = true;
            let formSchemaDefinitionFromXml = null; // Sẽ có cấu trúc { tabs: [...] }
            try {
                formSchemaDefinitionFromXml = await getOrLoadFormSchema(sourceItemData.schemaId);
                console.log(`[DrawProcess] Loaded schema for ${sourceItemData.schemaId}:`, formSchemaDefinitionFromXml);
            } catch(loadErr) {
                 console.error(`[DrawProcess] Error loading schema during drop for ${sourceItemData.schemaId}:`, loadErr);
                 formSchemaDefinitionFromXml = { tabs: [] }; // Mặc định tabs rỗng nếu lỗi load
            } finally {
                isSchemaLoading.value = false;
            }

            // Validate schema structure (ensure it has tabs array)
            if (!formSchemaDefinitionFromXml || !Array.isArray(formSchemaDefinitionFromXml.tabs)) {
                console.warn(`[DrawProcess] Loaded schema for ${sourceItemData.schemaId} is invalid or missing 'tabs'. Using empty structure.`, formSchemaDefinitionFromXml);
                formSchemaDefinitionFromXml = { tabs: [] }; // Đảm bảo cấu trúc hợp lệ
            }

            // Tạo initialFormData DẠNG PHẲNG dựa trên giá trị mặc định từ schema tabs
            const initialFlatFormData = {};
            formSchemaDefinitionFromXml.tabs.forEach(tab => {
                if (tab.fields && typeof tab.fields === 'object') {
                    for (const key in tab.fields) {
                        const fieldSchema = tab.fields[key];
                        initialFlatFormData[key] = fieldSchema.hasOwnProperty('value')
                            ? fieldSchema.value
                            : getDefaultValue(fieldSchema.type);
                    }
                }
            });
            console.log(`[DrawProcess] Generated initial flat data:`, initialFlatFormData);

            // Tạo bản sao sâu cho schema và data ban đầu
            let clonedFlatData;
            let clonedSchemaDefinition; // Sẽ là { tabs: [...] }
            try {
                clonedFlatData = structuredClone(initialFlatFormData);
                clonedSchemaDefinition = structuredClone(formSchemaDefinitionFromXml);
            } catch (e) {
                clonedFlatData = JSON.parse(JSON.stringify(initialFlatFormData));
                clonedSchemaDefinition = JSON.parse(JSON.stringify(formSchemaDefinitionFromXml));
                console.warn("[DrawProcess] Used JSON fallback for cloning initial data/schema.");
            }

            // Tạo đối tượng rect mới
            const newRect = {
                id: Date.now(),
                color: sourceItemData.color,
                schemaId: sourceItemData.schemaId,
                x: dropX - defaultRectWidth / 2,
                y: dropY - defaultRectHeight / 2,
                width: defaultRectWidth,
                height: defaultRectHeight,
                order: currentOrder.value,
                formSchemaDefinition: clonedSchemaDefinition, // Lưu schema { tabs: [...] }
                formData: clonedFlatData // Lưu data phẳng ban đầu
            };
            drawnRectangles.value.push(newRect);
            currentOrder.value++;
            console.log("[DrawProcess] Created new rect:", newRect);

        } catch (e) {
            console.error("[DrawProcess] Drop Error (Create New):", e, sourceItemDataStr);
            isSchemaLoading.value = false; // Đảm bảo tắt loading nếu lỗi
        }
    } else {
        console.warn('[DrawProcess] Drop Warning: No valid data (RECT_ID or SOURCE_ITEM) found.');
    }
    // Reset trạng thái kéo bất kể kết quả
    draggingRectId.value = null;
    console.log('[DrawProcess] handleDrop: Finished processing drop.');
};

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
</style>
