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
                                    stroke="#555" stroke-width="1.5" stroke-dasharray="4, 4" marker-end="url(#proc-arrowhead)" />
                            </template>
                        </template>
                    </g>
                </svg>

                <!-- Component Rectangle: Hiển thị các hình chữ nhật đã vẽ -->
                <DrawProcessRectangle
                    v-for="rect in drawnRectangles"
                    :key="rect.id"
                    :rect="rect"
                    :prevent-drag="isSchemaBuilderVisible || isDataEntryVisible"  
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
        <DrawProcessSaveLoadControls
            :current-rectangles="drawnRectangles"
            @state-loaded="onStateLoaded"
            class="controls-container"
        />

        <!-- Modal Builder Schema: Component để xây dựng cấu trúc form -->
        <DynamicProcessEditFormModal
            :visible="isSchemaBuilderVisible"
            :initial-schema="getInitialSchema(editingRect)"
            @saveSchema="handleSchemaSaved"
            @cancel="cancelSchemaBuilder"
        />

        <!-- Modal Context Menu: Menu chuột phải -->
        <DrawProcessContextMenu
             :visible="contextMenu.visible"
             :top="contextMenu.top"
             :left="contextMenu.left"
             @edit="openSchemaBuilderModalFromContextMenu"
             @delete="handleDelete"
             @enterData="openDataEntryModalFromContextMenu"  
             ref="contextMenuRef"
         />

         <!-- Modal Nhập Dữ liệu -->
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
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { debounce } from 'lodash-es';

// Import các component con
import DrawProcessRectangle from './DynamicProcessRectangle.vue';
import DrawProcessContextMenu from './DynamicProcessContextMenu.vue';
import DynamicProcessEditFormModal from './DynamicProcessEditFormModal.vue';
import DrawProcessSaveLoadControls from './DynamicProcessSaveLoadControls.vue';
import DataEntryModal from './DataEntryModal.vue'; // Import modal mới

// Import logic quản lý schema và types
import { paletteItems, getCachedSchemaById, loadPaletteData, getOrLoadFormSchema } from '../../data/drawProcessSchemas.js';
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
const isSchemaBuilderVisible = ref(false);
const isDataEntryVisible = ref(false); // State cho modal nhập dữ liệu
const editingRect = ref(null); // Dùng chung cho cả 2 modal

// --- Computed Properties ---
const sortedRectangles = computed(() => {
    return drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
});

// --- Helper Functions ---
const getInitialSchema = (rect) => {
    return rect?.formSchemaDefinition || {};
};

const calculateElbowPoints = (rectA, rectB) => {
    if (!rectA || !rectB) return "";
    let startX, endX;
    const startY = rectA.y + rectA.height / 2;
    const endY = rectB.y + rectB.height / 2;
    if (rectB.x >= rectA.x + rectA.width) {
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    } else if (rectB.x + rectB.width <= rectA.x) {
        startX = rectA.x;
        endX = rectB.x + rectB.width;
    } else {
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    }
    const midX = (startX + endX) / 2;
    return `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
};

// --- Event Handlers ---
const handleWindowChange = debounce(() => {
    if (contextMenu.value.visible) closeContextMenu();
}, 150);

// --- Lifecycle Hooks ---
onMounted(async () => {
    try {
        await loadPaletteData('/process_templates/manifest.json');
        loadError.value = false;
    } catch (error) {
        console.error("[DrawProcess] Failed to initialize due to palette data loading error:", error);
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
    handleWindowChange.cancel?.();
});

// --- Component Methods / Event Handlers ---

const onStateLoaded = (loadedRectangles) => {
    console.log("[DrawProcess] Received loaded state:", loadedRectangles);
    drawnRectangles.value = loadedRectangles.map(rect => ({
        ...rect,
        formSchemaDefinition: rect.formSchemaDefinition || {},
        formData: rect.formData || {}
    }));
    currentOrder.value = loadedRectangles.length > 0 ? Math.max(...loadedRectangles.map(r => r.order)) + 1 : 1;
    console.log("[DrawProcess] Canvas state restored. New currentOrder:", currentOrder.value);
    const uniqueSchemaIds = [...new Set(loadedRectangles.map(r => r.schemaId))];
    console.log("[DrawProcess] Pre-loading schemas for IDs:", uniqueSchemaIds);
    uniqueSchemaIds.forEach(id => {
        getOrLoadFormSchema(id).catch(err => {
            console.error(`[DrawProcess] Failed to pre-load schema ${id} after state load:`, err);
        });
    });
};

const handleClickOutside = (event) => {
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);
    if (contextMenu.value.visible && !isClickInsideMenu) {
        closeContextMenu();
    }
    // Lưu ý: Các modal đã có @click.self để tự đóng khi click overlay
};

const showContextMenu = (event, rect) => {
    // Không mở context menu nếu một trong các modal đang mở
    if (isSchemaBuilderVisible.value || isDataEntryVisible.value) return;
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
        contextMenu.value = { visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null };
    }
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
            console.log(`[DrawProcess] Deleted rect ID: ${idToDelete}. Order updated.`);
        }
    }
};

// --- Schema Builder Modal Logic ---
const openSchemaBuilderModal = (rect) => {
    if (!rect || draggingRectId.value !== null || isDataEntryVisible.value) return; // Ngăn mở nếu modal data đang mở
    closeContextMenu();
    editingRect.value = rect;
    isSchemaBuilderVisible.value = true;
    console.log(`[DrawProcess] Opening schema builder for rect ID: ${rect.id}`);
};

const openSchemaBuilderModalFromContextMenu = () => {
     if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openSchemaBuilderModal(rectToEdit);
        }
    }
    closeContextMenu();
};

const handleSchemaSaved = (newSchemaDefinition) => {
    console.log('[DrawProcess] Received new schema definition:', newSchemaDefinition);
    if (editingRect.value) {
        editingRect.value.formSchemaDefinition = newSchemaDefinition;
        const newFormData = {};
        for (const key in newSchemaDefinition) {
            newFormData[key] = newSchemaDefinition[key]?.value ?? getDefaultValue(newSchemaDefinition[key]?.type);
        }
         try {
             editingRect.value.formData = structuredClone(newFormData);
             console.log("[DrawProcess] Updated formData based on new schema:", editingRect.value.formData);
         } catch(e) {
             editingRect.value.formData = JSON.parse(JSON.stringify(newFormData));
             console.warn("[DrawProcess] Used JSON fallback to update formData based on new schema:", editingRect.value.formData);
         }
    }
    cancelSchemaBuilder();
};

const cancelSchemaBuilder = () => {
    isSchemaBuilderVisible.value = false;
    editingRect.value = null;
    console.log("[DrawProcess] Schema builder cancelled/closed.");
};

// --- Data Entry Modal Logic ---
const openDataEntryModal = (rect) => {
    if (!rect || draggingRectId.value !== null || isSchemaBuilderVisible.value) return; // Ngăn mở nếu modal schema đang mở
    closeContextMenu();
    editingRect.value = rect; // Lưu lại rect đang chỉnh sửa data
    isDataEntryVisible.value = true; // Hiển thị modal nhập liệu
    console.log(`[DrawProcess] Opening data entry for rect ID: ${rect.id}`);
};

const openDataEntryModalFromContextMenu = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openDataEntryModal(rectToEdit); // Gọi hàm mở modal data entry
        }
    }
    closeContextMenu(); // Luôn đóng context menu
};

const handleDataSaved = (newData) => {
    console.log('[DrawProcess] Received updated form data:', newData);
    if (editingRect.value) {
        const rectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
        if (rectIndex !== -1) {
            // Cập nhật formData của hình chữ nhật tương ứng
            // Đảm bảo là bản sao sâu để tránh các vấn đề tham chiếu không mong muốn
            try {
                drawnRectangles.value[rectIndex].formData = structuredClone(newData);
            } catch(e) {
                console.warn("[DrawProcess] Used JSON fallback to save form data.");
                drawnRectangles.value[rectIndex].formData = JSON.parse(JSON.stringify(newData));
            }
            console.log(`[DrawProcess] Updated formData for rect ID: ${editingRect.value.id}`, drawnRectangles.value[rectIndex].formData);
        } else {
            console.error(`[DrawProcess] Cannot find rect with ID ${editingRect.value.id} to save data.`);
        }
    }
    cancelDataEntry(); // Đóng modal sau khi lưu
};

const cancelDataEntry = () => {
    isDataEntryVisible.value = false;
    editingRect.value = null; // Reset hình chữ nhật đang chỉnh sửa
    console.log("[DrawProcess] Data entry modal cancelled/closed.");
};


// --- Drag & Drop Handlers ---
const handleSourceDragStart = (event, item) => {
    closeContextMenu();
    const dataToTransfer = { schemaId: item.schemaId, color: item.color, filename: item.filename };
    try {
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
        event.dataTransfer.effectAllowed = 'copy';
        draggingRectId.value = null;
    } catch (e) { console.error("[DrawProcess] Source Drag Start Error:", e, dataToTransfer); }
};

const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu();
    // Ngăn kéo nếu một trong các modal đang mở
    if (isSchemaBuilderVisible.value || isDataEntryVisible.value) {
        event.preventDefault();
        return;
    }
    try {
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        const offsetData = JSON.stringify({ x: event.offsetX, y: event.offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move';
        draggingRectId.value = rect.id;
    } catch (e) { console.error("[DrawProcess] Rect Drag Start Error:", e); event.preventDefault(); }
};

const handleRectDragEnd = (event) => {
    draggingRectId.value = null;
};

const handleDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) event.dataTransfer.dropEffect = "move";
    else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) event.dataTransfer.dropEffect = "copy";
    else event.dataTransfer.dropEffect = "none";
};

const handleDrop = async (event) => {
    event.preventDefault();
    closeContextMenu();

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) { console.error('[DrawProcess] Drop Error: Cannot get canvas bounds.'); draggingRectId.value = null; return; }

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);

    // --- Move existing rectangle ---
    if (draggedRectIdStr) {
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try { const offset = JSON.parse(offsetData || '{}'); offsetX = offset.x || 0; offsetY = offset.y || 0; }
            catch (e) { console.warn('[DrawProcess] Could not parse drag offset data:', offsetData, e); }
            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) {
                rectToMove.x = dropX - offsetX;
                rectToMove.y = dropY - offsetY;
                console.log(`[DrawProcess] Moved rect ID ${draggedRectId} to (${rectToMove.x}, ${rectToMove.y})`);
            } else { console.error(`[DrawProcess] Move Error: Cannot find rect with ID ${draggedRectId}.`); }
        } catch (e) { console.error("[DrawProcess] Error processing move drop:", e); }
    }
    // --- Create new rectangle from palette ---
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        if (sourceItemDataStr) {
            let sourceItemData;
            try {
                sourceItemData = JSON.parse(sourceItemDataStr);
                console.log('[DrawProcess] Handling CREATE NEW for:', sourceItemData);

                isSchemaLoading.value = true;
                let formSchemaDefinitionFromXml = null;
                try {
                    formSchemaDefinitionFromXml = await getOrLoadFormSchema(sourceItemData.schemaId);
                } finally {
                    isSchemaLoading.value = false;
                }

                if (formSchemaDefinitionFromXml === null) {
                     console.error(`[DrawProcess] Failed to load base formSchema for ${sourceItemData.schemaId}. Creating rect with empty schema and data.`);
                     formSchemaDefinitionFromXml = {};
                }

                const initialFormDataValues = {};
                for (const key in formSchemaDefinitionFromXml) {
                    initialFormDataValues[key] = formSchemaDefinitionFromXml[key]?.value ?? getDefaultValue(formSchemaDefinitionFromXml[key]?.type);
                }

                let clonedInitialValues;
                let clonedSchemaDefinition;
                 try {
                    clonedInitialValues = structuredClone(initialFormDataValues);
                    clonedSchemaDefinition = structuredClone(formSchemaDefinitionFromXml);
                 } catch(e) {
                    clonedInitialValues = JSON.parse(JSON.stringify(initialFormDataValues));
                    clonedSchemaDefinition = JSON.parse(JSON.stringify(formSchemaDefinitionFromXml));
                    console.warn("[DrawProcess] Used JSON fallback for cloning initial data/schema.");
                 }

                const newRect = {
                    id: Date.now(),
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId,
                    x: dropX - defaultRectWidth / 2,
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value,
                    formSchemaDefinition: clonedSchemaDefinition,
                    formData: clonedInitialValues
                };
                drawnRectangles.value.push(newRect);
                currentOrder.value++;
                console.log("[DrawProcess] Created new rect:", newRect);

            } catch (e) {
                console.error("[DrawProcess] Drop Error (Create New):", e, sourceItemDataStr);
                isSchemaLoading.value = false;
            }
        } else {
            console.warn('[DrawProcess] Drop Warning: No valid data (RECT_ID or SOURCE_ITEM) found.');
        }
    }
    draggingRectId.value = null;
};

// Helper lấy giá trị mặc định (cần thiết ở đây cho handleDrop và handleSchemaSaved)
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null
        case 'select': return ''; // Giá trị mặc định cho select
        default: return '';
    }
};

</script>

<style scoped>
/* Style giữ nguyên như các phiên bản trước */
.draw-process-app-container { display: flex; flex-direction: column; }
.draw-process-app { display: flex; gap: 2rem; font-family: sans-serif; }
.controls-container { margin: 1rem auto; width: fit-content; }
.schema-loading-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(255, 255, 255, 0.7); display: flex; justify-content: center; align-items: center; font-size: 1.2em; color: #333; z-index: 10; }
.loading-indicator, .error-message { padding: 2rem; text-align: center; font-style: italic; color: #666; }
.error-message { color: red; font-weight: bold; }
.palette { border: 1px solid #ccc; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background-color: #f8f8f8; height: fit-content; }
.palette h3 { margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555; }
.source-rect { width: 50px; height: 50px; border: 1px solid #eee; cursor: grab; transition: transform 0.2s ease; }
.source-rect:active { cursor: grabbing; transform: scale(1.1); }
.canvas { border: 2px dashed #007bff; width: 100%; height: 500px; position: relative; background-color: #e9ecef; overflow: hidden; }
.canvas h3 { position: absolute; top: 5px; left: 10px; margin: 0; font-size: 0.9em; color: #6c757d; pointer-events: none; }
.connection-lines { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
</style>
