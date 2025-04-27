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
                    :prevent-drag="isAnyModalVisible"  
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

        <!-- Modal Builder Schema (Original): Component để xây dựng cấu trúc form -->
        <DynamicProcessEditFormModal
            :visible="isSchemaBuilderVisible"
            :initial-schema="getInitialSchema(editingRect)"
            @saveSchema="handleSchemaSaved"
            @cancel="cancelSchemaBuilder"
        />

        <!-- NEW: Modal Builder Schema (Reference): Component mới -->
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
import DynamicRefProcessEditFormModal from './DynamicRefProcessEditFormModal.vue'; // <-- NEW IMPORT
import DrawProcessSaveLoadControls from './DynamicProcessSaveLoadControls.vue';
import DataEntryModal from './DataEntryModal.vue';

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
const isRefSchemaBuilderVisible = ref(false); // <-- NEW STATE for Ref Modal
const isDataEntryVisible = ref(false);
const editingRect = ref(null); // Dùng chung cho cả 3 modal

// --- Computed Properties ---
const sortedRectangles = computed(() => {
    // Sắp xếp các hình chữ nhật dựa trên thuộc tính 'order'
    return drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
});

// NEW: Computed property to check if *any* modal is visible
const isAnyModalVisible = computed(() => {
    // Trả về true nếu bất kỳ modal nào đang hiển thị
    return isSchemaBuilderVisible.value || isRefSchemaBuilderVisible.value || isDataEntryVisible.value;
});


// --- Helper Functions ---
const getInitialSchema = (rect) => {
    // Trả về schema của rect hoặc object rỗng nếu không có
    // Đảm bảo trả về một bản sao sâu để tránh sửa đổi không mong muốn trạng thái gốc
    const schema = rect?.formSchemaDefinition;
    if (schema && typeof schema === 'object') {
        try {
            return structuredClone(schema);
        } catch (e) {
            // Fallback cho môi trường không hỗ trợ structuredClone
            console.warn("[DrawProcess] Using JSON fallback for cloning initial schema.");
            return JSON.parse(JSON.stringify(schema));
        }
    }
    return {}; // Trả về object rỗng nếu không có schema hợp lệ
};

const calculateElbowPoints = (rectA, rectB) => {
    // Tính toán các điểm cho đường nối khuỷu tay giữa hai hình chữ nhật
    if (!rectA || !rectB) return ""; // Trả về chuỗi rỗng nếu thiếu rect

    let startX, endX;
    const startY = rectA.y + rectA.height / 2; // Điểm giữa cạnh phải/trái của rectA
    const endY = rectB.y + rectB.height / 2;   // Điểm giữa cạnh phải/trái của rectB

    // Xác định điểm bắt đầu và kết thúc dựa trên vị trí tương đối
    if (rectB.x >= rectA.x + rectA.width) { // rectB ở bên phải rectA
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    } else if (rectB.x + rectB.width <= rectA.x) { // rectB ở bên trái rectA
        startX = rectA.x;
        endX = rectB.x + rectB.width;
    } else { // Trường hợp chồng chéo hoặc thẳng hàng (ít xảy ra với logic hiện tại)
        // Mặc định nối từ phải rectA sang trái rectB nếu không rõ ràng
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    }

    // Điểm giữa theo trục X để tạo khuỷu tay
    const midX = (startX + endX) / 2;

    // Trả về chuỗi điểm cho thẻ <polyline>
    return `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
};

// --- Event Handlers ---
// Debounce function để xử lý thay đổi cửa sổ (resize, scroll)
const handleWindowChange = debounce(() => {
    // Đóng context menu nếu nó đang mở khi cửa sổ thay đổi
    if (contextMenu.value.visible) closeContextMenu();
}, 150); // Chờ 150ms sau lần thay đổi cuối cùng

// --- Lifecycle Hooks ---
onMounted(async () => {
    // Chạy khi component được mount
    try {
        // Tải dữ liệu palette từ manifest.json
        await loadPaletteData('/process_templates/manifest.json');
        loadError.value = false; // Đặt lỗi thành false nếu tải thành công
    } catch (error) {
        console.error("[DrawProcess] Failed to initialize due to palette data loading error:", error);
        loadError.value = true; // Đặt lỗi thành true nếu có vấn đề
    } finally {
        isLoading.value = false; // Kết thúc trạng thái loading
    }
    // Thêm các event listener cho window
    window.addEventListener('click', handleClickOutside); // Đóng context menu khi click ra ngoài
    window.addEventListener('resize', handleWindowChange); // Xử lý resize
    window.addEventListener('scroll', handleWindowChange, true); // Xử lý scroll (capture phase)
});

onUnmounted(() => {
    // Chạy khi component bị unmount
    // Gỡ bỏ các event listener để tránh memory leak
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
    handleWindowChange.cancel?.(); // Hủy bỏ debounce timer nếu có
});

// --- Component Methods / Event Handlers ---

// Xử lý khi trạng thái được tải từ Save/Load Controls
const onStateLoaded = (loadedRectangles) => {
    console.log("[DrawProcess] Received loaded state:", loadedRectangles);
    // Cập nhật drawnRectangles với dữ liệu đã tải, đảm bảo có schema và data mặc định
    drawnRectangles.value = loadedRectangles.map(rect => ({
        ...rect,
        formSchemaDefinition: rect.formSchemaDefinition || {}, // Đảm bảo luôn là object
        formData: rect.formData || {} // Đảm bảo luôn là object
    }));
    // Cập nhật thứ tự hiện tại dựa trên thứ tự lớn nhất đã tải
    currentOrder.value = loadedRectangles.length > 0 ? Math.max(...loadedRectangles.map(r => r.order)) + 1 : 1;
    console.log("[DrawProcess] Canvas state restored. New currentOrder:", currentOrder.value);

    // Tải trước các schema cần thiết dựa trên schemaId trong dữ liệu đã tải
    const uniqueSchemaIds = [...new Set(loadedRectangles.map(r => r.schemaId).filter(id => id))]; // Lọc ra các ID hợp lệ
    console.log("[DrawProcess] Pre-loading schemas for IDs:", uniqueSchemaIds);
    uniqueSchemaIds.forEach(id => {
        getOrLoadFormSchema(id).catch(err => {
            console.error(`[DrawProcess] Failed to pre-load schema ${id} after state load:`, err);
        });
    });
};

// Xử lý click ra ngoài để đóng context menu
const handleClickOutside = (event) => {
    // Lấy element của context menu
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    // Kiểm tra xem click có nằm trong context menu không
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);
    // Nếu context menu đang hiển thị và click ra ngoài nó, đóng menu
    if (contextMenu.value.visible && !isClickInsideMenu) {
        closeContextMenu();
    }
    // Các modal khác đã có xử lý đóng riêng (@click.self)
};

// Hiển thị context menu tại vị trí click chuột phải
const showContextMenu = (event, rect) => {
    // Ngăn mở context menu nếu bất kỳ modal nào đang hiển thị
    if (isAnyModalVisible.value) {
        event.preventDefault(); // Ngăn menu mặc định của trình duyệt
        return;
    }
    // Đóng menu cũ nếu đang mở
    if (contextMenu.value.visible) closeContextMenu();
    event.preventDefault(); // Ngăn menu mặc định của trình duyệt
    // Cập nhật state của context menu
    contextMenu.value = {
        visible: true,
        top: event.clientY, // Vị trí Y
        left: event.clientX, // Vị trí X
        targetRectId: rect.id, // ID của rect được click
        targetRectOrder: rect.order // Thứ tự của rect được click
    };
};

// Đóng context menu
const closeContextMenu = () => {
    if (contextMenu.value.visible) {
        // Reset state của context menu
        contextMenu.value = { visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null };
    }
};

// Xử lý xóa hình chữ nhật từ context menu
const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    closeContextMenu(); // Đóng menu trước khi xử lý
    if (idToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            // Xóa rect khỏi mảng
            drawnRectangles.value.splice(indexToDelete, 1);
            // Cập nhật lại thứ tự ('order') của các rect còn lại
            const remainingSorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
            remainingSorted.forEach((rect, index) => { rect.order = index + 1; });
            // Cập nhật lại thứ tự tiếp theo sẽ được gán
            currentOrder.value = drawnRectangles.value.length + 1;
            console.log(`[DrawProcess] Deleted rect ID: ${idToDelete}. Order updated.`);
        }
    }
};

// --- Schema Builder Modal Logic (Original) ---
// Mở modal chỉnh sửa schema gốc
const openSchemaBuilderModal = (rect) => {
    // Ngăn mở nếu đang kéo, hoặc có modal khác đang mở
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu(); // Đóng context menu nếu đang mở
    editingRect.value = rect; // Lưu rect đang chỉnh sửa
    isSchemaBuilderVisible.value = true; // Hiển thị modal
    console.log(`[DrawProcess] Opening ORIGINAL schema builder for rect ID: ${rect.id}`);
};

// Mở modal chỉnh sửa schema gốc từ context menu
const openSchemaBuilderModalFromContextMenu = () => {
     if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openSchemaBuilderModal(rectToEdit); // Gọi hàm mở modal
        }
    }
    closeContextMenu(); // Luôn đóng context menu
};

// Hủy/Đóng modal chỉnh sửa schema gốc
const cancelSchemaBuilder = () => {
    isSchemaBuilderVisible.value = false; // Ẩn modal
    editingRect.value = null; // Reset rect đang chỉnh sửa
    console.log("[DrawProcess] Original schema builder cancelled/closed.");
};

// --- NEW: Schema Builder Modal Logic (Reference) ---
// Mở modal chỉnh sửa schema mới (có Reference)
const openRefSchemaBuilderModal = (rect) => {
    // Ngăn mở nếu đang kéo, hoặc có modal khác đang mở
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu(); // Đóng context menu nếu đang mở
    editingRect.value = rect; // Lưu rect đang chỉnh sửa
    isRefSchemaBuilderVisible.value = true; // Hiển thị modal mới
    console.log(`[DrawProcess] Opening REFERENCE schema builder for rect ID: ${rect.id}`);
};

// Mở modal chỉnh sửa schema mới từ context menu
const openRefSchemaBuilderModalFromContextMenu = () => {
     if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openRefSchemaBuilderModal(rectToEdit); // Gọi hàm mở modal mới
        }
    }
    closeContextMenu(); // Luôn đóng context menu
};

// Hủy/Đóng modal chỉnh sửa schema mới
const cancelRefSchemaBuilder = () => {
    isRefSchemaBuilderVisible.value = false; // Ẩn modal mới
    editingRect.value = null; // Reset rect đang chỉnh sửa
    console.log("[DrawProcess] Reference schema builder cancelled/closed.");
};

// --- Common Schema Save Handler ---
// Xử lý lưu schema từ BẤT KỲ modal schema nào
const handleSchemaSaved = (newSchemaDefinition) => {
    console.log('[DrawProcess] Received new schema definition:', newSchemaDefinition);
    if (editingRect.value) {
        const rectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
        if (rectIndex !== -1) {
            // Cập nhật định nghĩa schema của hình chữ nhật
            // Sử dụng structuredClone để đảm bảo là bản sao sâu
            try {
                drawnRectangles.value[rectIndex].formSchemaDefinition = structuredClone(newSchemaDefinition);
            } catch(e) {
                console.warn("[DrawProcess] Used JSON fallback to save schema definition.");
                drawnRectangles.value[rectIndex].formSchemaDefinition = JSON.parse(JSON.stringify(newSchemaDefinition));
            }

            // Reset formData dựa trên giá trị mặc định của schema mới
            const newFormData = {};
            for (const key in newSchemaDefinition) {
                // Lấy giá trị 'value' từ schema đã lưu làm giá trị mặc định mới
                newFormData[key] = newSchemaDefinition[key]?.value ?? getDefaultValue(newSchemaDefinition[key]?.type);
            }
            // Cập nhật formData (cũng dùng bản sao sâu)
            try {
                drawnRectangles.value[rectIndex].formData = structuredClone(newFormData);
                console.log("[DrawProcess] Updated formData based on new schema:", drawnRectangles.value[rectIndex].formData);
            } catch(e) {
                drawnRectangles.value[rectIndex].formData = JSON.parse(JSON.stringify(newFormData));
                console.warn("[DrawProcess] Used JSON fallback to update formData based on new schema:", drawnRectangles.value[rectIndex].formData);
            }
             console.log(`[DrawProcess] Updated schema definition for rect ID: ${editingRect.value.id}`, drawnRectangles.value[rectIndex].formSchemaDefinition);
        } else {
             console.error(`[DrawProcess] Cannot find rect with ID ${editingRect.value.id} to save schema.`);
        }
    }
    // Đóng cả hai modal schema (chỉ một cái thực sự đang mở)
    cancelSchemaBuilder();
    cancelRefSchemaBuilder();
};


// --- Data Entry Modal Logic ---
// Mở modal nhập dữ liệu
const openDataEntryModal = (rect) => {
    // Ngăn mở nếu đang kéo, hoặc có modal schema đang mở
    if (!rect || draggingRectId.value !== null || isAnyModalVisible.value) return;
    closeContextMenu(); // Đóng context menu nếu đang mở
    editingRect.value = rect; // Lưu rect đang chỉnh sửa data
    isDataEntryVisible.value = true; // Hiển thị modal nhập liệu
    console.log(`[DrawProcess] Opening data entry for rect ID: ${rect.id}`);
};

// Mở modal nhập dữ liệu từ context menu
const openDataEntryModalFromContextMenu = () => {
    if (contextMenu.value.targetRectId) {
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openDataEntryModal(rectToEdit); // Gọi hàm mở modal data entry
        }
    }
    closeContextMenu(); // Luôn đóng context menu
};

// Xử lý lưu dữ liệu từ modal nhập liệu
const handleDataSaved = (newData) => {
    console.log('[DrawProcess] Received updated form data:', newData);
    if (editingRect.value) {
        const rectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
        if (rectIndex !== -1) {
            // Cập nhật formData của hình chữ nhật tương ứng
            // Đảm bảo là bản sao sâu
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

// Hủy/Đóng modal nhập liệu
const cancelDataEntry = () => {
    isDataEntryVisible.value = false; // Ẩn modal
    editingRect.value = null; // Reset hình chữ nhật đang chỉnh sửa
    console.log("[DrawProcess] Data entry modal cancelled/closed.");
};


// --- Drag & Drop Handlers ---
// Bắt đầu kéo từ Palette
const handleSourceDragStart = (event, item) => {
    closeContextMenu(); // Đóng context menu nếu đang mở
    // Chuẩn bị dữ liệu để truyền đi
    const dataToTransfer = { schemaId: item.schemaId, color: item.color, filename: item.filename };
    try {
        // Đặt dữ liệu vào dataTransfer
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
        event.dataTransfer.effectAllowed = 'copy'; // Cho phép sao chép
        draggingRectId.value = null; // Đảm bảo không ở trạng thái kéo rect cũ
    } catch (e) { console.error("[DrawProcess] Source Drag Start Error:", e, dataToTransfer); }
};

// Bắt đầu kéo một hình chữ nhật đã có trên Canvas
const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu(); // Đóng context menu
    // Ngăn kéo nếu bất kỳ modal nào đang mở
    if (isAnyModalVisible.value) {
        event.preventDefault(); // Ngăn sự kiện kéo
        return;
    }
    try {
        // Đặt ID của rect đang kéo vào dataTransfer
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        // Lưu vị trí con trỏ chuột tương đối so với góc trên trái của rect
        const offsetData = JSON.stringify({ x: event.offsetX, y: event.offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move'; // Cho phép di chuyển
        draggingRectId.value = rect.id; // Lưu ID của rect đang kéo
    } catch (e) { console.error("[DrawProcess] Rect Drag Start Error:", e); event.preventDefault(); }
};

// Kết thúc kéo một hình chữ nhật
const handleRectDragEnd = (event) => {
    draggingRectId.value = null; // Reset ID rect đang kéo
};

// Xử lý khi kéo qua Canvas
const handleDragOver = (event) => {
    event.preventDefault(); // Cần thiết để cho phép drop
    // Xác định hiệu ứng drop dựa trên loại dữ liệu đang kéo
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move"; // Di chuyển rect cũ
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy"; // Tạo rect mới
    } else {
        event.dataTransfer.dropEffect = "none"; // Không cho phép thả
    }
};

// Xử lý khi thả vào Canvas
const handleDrop = async (event) => {
    event.preventDefault(); // Ngăn hành vi mặc định
    closeContextMenu(); // Đóng context menu

    // Lấy tọa độ của canvas
    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) { console.error('[DrawProcess] Drop Error: Cannot get canvas bounds.'); draggingRectId.value = null; return; }

    // Tính toán tọa độ thả tương đối trong canvas
    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    // Lấy ID của rect đang kéo (nếu có)
    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);

    // --- Trường hợp: Di chuyển hình chữ nhật đã có ---
    if (draggedRectIdStr) {
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            // Lấy dữ liệu offset đã lưu
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try { const offset = JSON.parse(offsetData || '{}'); offsetX = offset.x || 0; offsetY = offset.y || 0; }
            catch (e) { console.warn('[DrawProcess] Could not parse drag offset data:', offsetData, e); }

            // Tìm rect cần di chuyển
            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) {
                // Cập nhật tọa độ mới dựa trên vị trí thả và offset
                rectToMove.x = dropX - offsetX;
                rectToMove.y = dropY - offsetY;
                console.log(`[DrawProcess] Moved rect ID ${draggedRectId} to (${rectToMove.x}, ${rectToMove.y})`);
            } else { console.error(`[DrawProcess] Move Error: Cannot find rect with ID ${draggedRectId}.`); }
        } catch (e) { console.error("[DrawProcess] Error processing move drop:", e); }
    }
    // --- Trường hợp: Tạo hình chữ nhật mới từ Palette ---
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        if (sourceItemDataStr) {
            let sourceItemData;
            try {
                sourceItemData = JSON.parse(sourceItemDataStr);
                console.log('[DrawProcess] Handling CREATE NEW for:', sourceItemData);

                isSchemaLoading.value = true; // Bắt đầu loading schema
                let formSchemaDefinitionFromXml = null;
                try {
                    // Tải hoặc lấy schema từ cache
                    formSchemaDefinitionFromXml = await getOrLoadFormSchema(sourceItemData.schemaId);
                } finally {
                    isSchemaLoading.value = false; // Kết thúc loading schema
                }

                // Xử lý trường hợp không tải được schema
                if (formSchemaDefinitionFromXml === null) {
                     console.error(`[DrawProcess] Failed to load base formSchema for ${sourceItemData.schemaId}. Creating rect with empty schema and data.`);
                     formSchemaDefinitionFromXml = {}; // Sử dụng schema rỗng
                }

                // Tạo formData ban đầu dựa trên giá trị mặc định từ schema
                const initialFormDataValues = {};
                for (const key in formSchemaDefinitionFromXml) {
                    initialFormDataValues[key] = formSchemaDefinitionFromXml[key]?.value ?? getDefaultValue(formSchemaDefinitionFromXml[key]?.type);
                }

                // Tạo bản sao sâu cho schema và data ban đầu
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

                // Tạo đối tượng rect mới
                const newRect = {
                    id: Date.now(), // ID duy nhất dựa trên timestamp
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId,
                    x: dropX - defaultRectWidth / 2, // Căn giữa tại vị trí thả
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value, // Gán thứ tự hiện tại
                    formSchemaDefinition: clonedSchemaDefinition, // Gán schema đã clone
                    formData: clonedInitialValues // Gán data ban đầu đã clone
                };
                // Thêm rect mới vào mảng
                drawnRectangles.value.push(newRect);
                currentOrder.value++; // Tăng thứ tự cho rect tiếp theo
                console.log("[DrawProcess] Created new rect:", newRect);

            } catch (e) {
                console.error("[DrawProcess] Drop Error (Create New):", e, sourceItemDataStr);
                isSchemaLoading.value = false; // Đảm bảo tắt loading nếu có lỗi
            }
        } else {
            console.warn('[DrawProcess] Drop Warning: No valid data (RECT_ID or SOURCE_ITEM) found.');
        }
    }
    // Reset trạng thái kéo sau khi thả
    draggingRectId.value = null;
};

// Helper lấy giá trị mặc định cho các kiểu dữ liệu
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null tùy yêu cầu
        case 'select': return ''; // Giá trị mặc định cho select (nếu có)
        case 'reference': return null; // Giá trị mặc định cho reference là null (chưa chọn)
        // Các kiểu text, textarea, email, url mặc định là chuỗi rỗng
        default: return '';
    }
};

</script>

<style scoped>
/* Style giữ nguyên như các phiên bản trước */
.draw-process-app-container {
    display: flex;
    flex-direction: column; /* Sắp xếp Palette/Canvas và Controls theo chiều dọc */
}
.draw-process-app {
    display: flex;
    gap: 2rem; /* Khoảng cách giữa Palette và Canvas */
    font-family: sans-serif;
}
.controls-container {
    margin: 1rem auto; /* Căn giữa các nút Save/Load */
    width: fit-content;
}
.schema-loading-overlay {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(255, 255, 255, 0.7); /* Nền mờ */
    display: flex; justify-content: center; align-items: center;
    font-size: 1.2em; color: #333;
    z-index: 10; /* Nổi lên trên các rect */
}
.loading-indicator, .error-message {
    padding: 2rem; text-align: center; font-style: italic; color: #666;
}
.error-message {
    color: red; font-weight: bold;
}
.palette {
    border: 1px solid #ccc; padding: 1rem;
    display: flex; flex-direction: column; align-items: center;
    gap: 0.5rem; background-color: #f8f8f8;
    height: fit-content; /* Chiều cao tự động theo nội dung */
}
.palette h3 {
    margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555;
}
.source-rect {
    width: 50px; height: 50px; border: 1px solid #eee;
    cursor: grab; /* Con trỏ kéo */
    transition: transform 0.2s ease; /* Hiệu ứng khi kéo */
}
.source-rect:active {
    cursor: grabbing; /* Con trỏ đang kéo */
    transform: scale(1.1); /* Phóng to nhẹ khi kéo */
}
.canvas {
    border: 2px dashed #007bff; /* Viền nét đứt */
    width: 100%; height: 500px; /* Kích thước cố định */
    position: relative; /* Để định vị các phần tử con tuyệt đối */
    background-color: #e9ecef; /* Màu nền nhạt */
    overflow: hidden; /* Ẩn phần vượt ra ngoài */
}
.canvas h3 {
    position: absolute; top: 5px; left: 10px; /* Tiêu đề nhỏ trong canvas */
    margin: 0; font-size: 0.9em; color: #6c757d;
    pointer-events: none; /* Không bắt sự kiện chuột */
}
.connection-lines {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; /* Không bắt sự kiện chuột */
    z-index: 1; /* Nằm dưới các hình chữ nhật */
}
</style>
