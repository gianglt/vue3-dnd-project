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
                <!-- Lặp qua các item từ manifest để hiển thị -->
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
                        <!-- Định nghĩa mũi tên cho đường nối -->
                        <marker id="proc-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3"
                            orient="auto-start-reverse" markerUnits="strokeWidth">
                            <path d="M0,0 L8,3 L0,6 Z" fill="#555" />
                        </marker>
                    </defs>
                    <g>
                        <!-- Vẽ đường nối giữa các hình chữ nhật liền kề -->
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
                    :prevent-drag="isSchemaBuilderVisible" 
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
             ref="contextMenuRef"
         />

         <!-- TODO: Thêm một modal khác nếu cần để *nhập dữ liệu* thực tế dựa trên schema đã xây dựng -->
         <!-- Ví dụ: <DataEntryModal :visible="isDataEntryVisible" :schema="editingRect?.formSchemaDefinition" :initialData="editingRect?.formData" @save="handleDataSaved" @cancel="cancelDataEntry" /> -->

    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { debounce } from 'lodash-es'; // Thư viện debounce cho resize/scroll

// Import các component con đã được tạo/đổi tên cho DrawProcess
import DrawProcessRectangle from './DynamicProcessRectangle.vue';
import DrawProcessContextMenu from './DynamicProcessContextMenu.vue';
import DynamicProcessEditFormModal from './DynamicProcessEditFormModal.vue'; // Modal Builder Schema
import DrawProcessSaveLoadControls from './DynamicProcessSaveLoadControls.vue';

// Import logic quản lý schema và types
import { paletteItems, getCachedSchemaById, loadPaletteData, getOrLoadFormSchema } from '../../data/drawProcessSchemas.js'; // Sử dụng file schema riêng
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js'; // Types dùng chung

// --- Component State ---
const isLoading = ref(true); // Trạng thái loading ban đầu (tải manifest)
const loadError = ref(false); // Trạng thái lỗi load ban đầu
const isSchemaLoading = ref(false); // Trạng thái loading schema từ XML khi thả item mới
const drawnRectangles = ref([]); // Mảng chứa dữ liệu các hình chữ nhật đã vẽ trên canvas
const canvasRef = ref(null); // Tham chiếu tới phần tử DOM của canvas
const defaultRectWidth = 50; // Kích thước mặc định
const defaultRectHeight = 50;
const draggingRectId = ref(null); // ID của hình chữ nhật đang được kéo
const currentOrder = ref(1); // Số thứ tự cho hình chữ nhật tiếp theo
const contextMenuRef = ref(null); // Tham chiếu tới component context menu
const contextMenu = ref({ visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null }); // State của context menu
const isSchemaBuilderVisible = ref(false); // State điều khiển hiển thị modal builder schema
const editingRect = ref(null); // Tham chiếu tới hình chữ nhật đang được chỉnh sửa schema hoặc data

// --- Computed Properties ---
// Mảng các hình chữ nhật đã sắp xếp theo thứ tự 'order' để vẽ đường nối
const sortedRectangles = computed(() => {
    // Tạo bản sao và sắp xếp
    return drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
});

// --- Helper Functions ---

// Lấy schema definition hiện có của một hình chữ nhật để truyền vào modal builder
const getInitialSchema = (rect) => {
    // Trả về formSchemaDefinition nếu tồn tại, nếu không trả về object rỗng
    return rect?.formSchemaDefinition || {};
};

// Tính toán các điểm cho đường nối gấp khúc giữa hai hình chữ nhật
const calculateElbowPoints = (rectA, rectB) => {
    if (!rectA || !rectB) return ""; // Trả về chuỗi rỗng nếu thiếu dữ liệu

    let startX, endX;
    const startY = rectA.y + rectA.height / 2; // Điểm giữa cạnh dọc của rect A
    const endY = rectB.y + rectB.height / 2;   // Điểm giữa cạnh dọc của rect B

    // Xác định điểm bắt đầu (startX) và kết thúc (endX) dựa trên vị trí tương đối
    if (rectB.x >= rectA.x + rectA.width) { // Rect B nằm hoàn toàn bên phải Rect A
        startX = rectA.x + rectA.width; // Bắt đầu từ cạnh phải A
        endX = rectB.x;                 // Kết thúc ở cạnh trái B
    } else if (rectB.x + rectB.width <= rectA.x) { // Rect B nằm hoàn toàn bên trái Rect A
        startX = rectA.x;                 // Bắt đầu từ cạnh trái A
        endX = rectB.x + rectB.width;   // Kết thúc ở cạnh phải B
    } else { // Các trường hợp khác (chồng lấp, gần nhau) - mặc định nối từ phải A sang trái B
        startX = rectA.x + rectA.width;
        endX = rectB.x;
    }

    // Tạo chuỗi điểm cho polyline (ngang -> dọc -> ngang)
    const midX = (startX + endX) / 2; // Điểm giữa theo chiều ngang
    return `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
};

// --- Event Handlers ---

// Xử lý sự kiện resize/scroll cửa sổ (đã debounce)
const handleWindowChange = debounce(() => {
    // Đóng context menu nếu đang mở khi resize/scroll
    if (contextMenu.value.visible) closeContextMenu();
}, 150); // Delay 150ms

// --- Lifecycle Hooks ---

// Chạy khi component được mount vào DOM
onMounted(async () => {
    try {
        // Tải dữ liệu cơ bản cho palette từ manifest
        await loadPaletteData('/process_templates/manifest.json'); // Sử dụng đường dẫn mới
        loadError.value = false; // Đặt lại trạng thái lỗi nếu thành công
    } catch (error) {
        console.error("[DrawProcess] Failed to initialize due to palette data loading error:", error);
        loadError.value = true; // Đặt trạng thái lỗi
    } finally {
        isLoading.value = false; // Luôn tắt trạng thái loading
    }
    // Đăng ký các event listener toàn cục
    window.addEventListener('click', handleClickOutside); // Đóng menu/modal khi click ra ngoài
    window.addEventListener('resize', handleWindowChange); // Xử lý resize
    window.addEventListener('scroll', handleWindowChange, true); // Xử lý scroll
});

// Chạy ngay trước khi component bị unmount
onUnmounted(() => {
    // Gỡ bỏ các event listener để tránh memory leak
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
    handleWindowChange.cancel?.(); // Hủy bỏ các lệnh debounce đang chờ (nếu dùng lodash)
});

// --- Component Methods / Event Handlers ---

// Xử lý khi trạng thái được tải từ file (emit từ SaveLoadControls)
const onStateLoaded = (loadedRectangles) => {
    console.log("[DrawProcess] Received loaded state:", loadedRectangles);
    // Đảm bảo các thuộc tính cần thiết tồn tại khi load state
    drawnRectangles.value = loadedRectangles.map(rect => ({
        ...rect,
        formSchemaDefinition: rect.formSchemaDefinition || {}, // Đảm bảo có formSchemaDefinition
        formData: rect.formData || {} // Đảm bảo có formData
    }));
    // Cập nhật lại số thứ tự tiếp theo
    currentOrder.value = loadedRectangles.length > 0 ? Math.max(...loadedRectangles.map(r => r.order)) + 1 : 1;
    console.log("[DrawProcess] Canvas state restored. New currentOrder:", currentOrder.value);

    // Tùy chọn: Pre-load schema gốc từ XML vào cache để tăng tốc độ mở modal sau này
    const uniqueSchemaIds = [...new Set(loadedRectangles.map(r => r.schemaId))];
    console.log("[DrawProcess] Pre-loading schemas for IDs:", uniqueSchemaIds);
    uniqueSchemaIds.forEach(id => {
        getOrLoadFormSchema(id).catch(err => {
            console.error(`[DrawProcess] Failed to pre-load schema ${id} after state load:`, err);
        });
    });
};

// Xử lý click ra ngoài để đóng context menu
const handleClickOutside = (event) => {
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    // Kiểm tra xem click có nằm trong context menu không
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);
    if (contextMenu.value.visible && !isClickInsideMenu) {
        closeContextMenu();
    }
    // Lưu ý: Modal builder đã có @click.self để tự đóng khi click overlay
};

// Hiển thị context menu tại vị trí chuột phải
const showContextMenu = (event, rect) => {
    if (isSchemaBuilderVisible.value) return; // Không mở nếu modal builder đang hiển thị
    if (contextMenu.value.visible) closeContextMenu(); // Đóng menu cũ nếu có
    event.preventDefault(); // Ngăn menu mặc định của trình duyệt
    // Cập nhật state của context menu
    contextMenu.value = {
        visible: true,
        top: event.clientY,
        left: event.clientX,
        targetRectId: rect.id,
        targetRectOrder: rect.order
    };
};

// Đóng context menu
const closeContextMenu = () => {
    if (contextMenu.value.visible) {
        // Reset state context menu
        contextMenu.value = { visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null };
    }
};

// Xử lý sự kiện "Xóa" từ context menu
const handleDelete = () => {
    const idToDelete = contextMenu.value.targetRectId;
    closeContextMenu(); // Đóng menu trước
    if (idToDelete !== null) {
        const indexToDelete = drawnRectangles.value.findIndex(r => r.id === idToDelete);
        if (indexToDelete > -1) {
            // Xóa hình chữ nhật khỏi mảng
            drawnRectangles.value.splice(indexToDelete, 1);
            // Cập nhật lại thứ tự các hình còn lại
            const remainingSorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
            remainingSorted.forEach((rect, index) => { rect.order = index + 1; });
            // Cập nhật số thứ tự tiếp theo
            currentOrder.value = drawnRectangles.value.length + 1;
            console.log(`[DrawProcess] Deleted rect ID: ${idToDelete}. Order updated.`);
        }
    }
};

// Mở Modal Builder Schema (chung)
const openSchemaBuilderModal = (rect) => {
    if (!rect || draggingRectId.value !== null) return; // Kiểm tra điều kiện hợp lệ
    closeContextMenu(); // Đóng context menu nếu đang mở
    editingRect.value = rect; // Lưu lại hình chữ nhật đang được chỉnh sửa
    isSchemaBuilderVisible.value = true; // Hiển thị modal builder
    console.log(`[DrawProcess] Opening schema builder for rect ID: ${rect.id}`);
};

// Xử lý sự kiện "Edit" từ context menu để mở modal builder
const openSchemaBuilderModalFromContextMenu = () => {
     if (contextMenu.value.targetRectId) {
        // Tìm hình chữ nhật tương ứng trong mảng
        const rectToEdit = drawnRectangles.value.find(r => r.id === contextMenu.value.targetRectId);
        if (rectToEdit) {
            openSchemaBuilderModal(rectToEdit); // Gọi hàm mở modal chung
        }
    }
    closeContextMenu(); // Luôn đóng context menu sau khi xử lý
};

// Xử lý khi schema được lưu từ Modal Builder (sự kiện @saveSchema)
const handleSchemaSaved = (newSchemaDefinition) => {
    console.log('[DrawProcess] Received new schema definition:', newSchemaDefinition);
    if (editingRect.value) {
        // 1. Cập nhật schema definition cho hình chữ nhật đang chỉnh sửa
        editingRect.value.formSchemaDefinition = newSchemaDefinition;

        // 2. Cập nhật formData dựa trên schema mới (reset về giá trị mặc định)
        const newFormData = {};
        for (const key in newSchemaDefinition) {
            // Lấy giá trị mặc định từ schema definition mới
            newFormData[key] = newSchemaDefinition[key]?.value ?? getDefaultValue(newSchemaDefinition[key]?.type);
        }
         try {
             // Gán lại formData bằng bản sao sâu của dữ liệu mới
             editingRect.value.formData = structuredClone(newFormData);
             console.log("[DrawProcess] Updated formData based on new schema:", editingRect.value.formData);
         } catch(e) {
             // Fallback nếu structuredClone lỗi
             editingRect.value.formData = JSON.parse(JSON.stringify(newFormData));
             console.warn("[DrawProcess] Used JSON fallback to update formData based on new schema:", editingRect.value.formData);
         }
    }
    cancelSchemaBuilder(); // Đóng modal builder sau khi lưu
};

// Đóng Modal Builder Schema và reset trạng thái
const cancelSchemaBuilder = () => {
    isSchemaBuilderVisible.value = false;
    editingRect.value = null; // Reset hình chữ nhật đang chỉnh sửa
    console.log("[DrawProcess] Schema builder cancelled/closed.");
};

// --- Drag & Drop Handlers ---

// Bắt đầu kéo từ Palette
const handleSourceDragStart = (event, item) => {
    closeContextMenu(); // Đóng menu nếu đang mở
    // Chuẩn bị dữ liệu cần truyền (schemaId, color, filename)
    const dataToTransfer = { schemaId: item.schemaId, color: item.color, filename: item.filename };
    try {
        // Đặt dữ liệu vào dataTransfer dưới dạng chuỗi JSON
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
        event.dataTransfer.effectAllowed = 'copy'; // Cho phép sao chép
        draggingRectId.value = null; // Đảm bảo không có rect nào đang được kéo
    } catch (e) { console.error("[DrawProcess] Source Drag Start Error:", e, dataToTransfer); }
};

// Bắt đầu kéo một hình chữ nhật đã có trên canvas
const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu(); // Đóng menu
    if (isSchemaBuilderVisible.value) { event.preventDefault(); return; } // Ngăn kéo khi modal mở
    try {
        // Đặt ID của rect vào dataTransfer
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        // Tính và đặt offset của chuột bên trong rect
        const offsetData = JSON.stringify({ x: event.offsetX, y: event.offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move'; // Cho phép di chuyển
        draggingRectId.value = rect.id; // Lưu ID đang kéo
    } catch (e) { console.error("[DrawProcess] Rect Drag Start Error:", e); event.preventDefault(); }
};

// Kết thúc kéo một hình chữ nhật trên canvas
const handleRectDragEnd = (event) => {
    draggingRectId.value = null; // Reset ID đang kéo
};

// Xử lý khi kéo qua canvas (cần để cho phép drop)
const handleDragOver = (event) => {
    event.preventDefault(); // Quan trọng: Ngăn hành vi mặc định để cho phép drop
    // Xác định loại thao tác dựa trên dữ liệu đang kéo
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) event.dataTransfer.dropEffect = "move";
    else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) event.dataTransfer.dropEffect = "copy";
    else event.dataTransfer.dropEffect = "none"; // Không cho phép thả loại khác
};

// Xử lý khi thả vào canvas
const handleDrop = async (event) => {
    event.preventDefault(); // Ngăn hành vi mặc định (ví dụ: mở file)
    closeContextMenu(); // Đóng menu nếu đang mở

    // Lấy vị trí và kích thước MỚI NHẤT của canvas tại thời điểm thả
    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) { console.error('[DrawProcess] Drop Error: Cannot get canvas bounds.'); draggingRectId.value = null; return; }

    // Tính tọa độ thả tương đối so với canvas
    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    // Lấy dữ liệu từ dataTransfer
    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);

    // --- Xử lý DI CHUYỂN hình chữ nhật hiện có ---
    if (draggedRectIdStr) {
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            // Parse offset, có fallback nếu lỗi
            try { const offset = JSON.parse(offsetData || '{}'); offsetX = offset.x || 0; offsetY = offset.y || 0; }
            catch (e) { console.warn('[DrawProcess] Could not parse drag offset data:', offsetData, e); }
            // Tìm hình chữ nhật cần di chuyển
            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) {
                // Cập nhật tọa độ mới dựa trên điểm thả và offset
                rectToMove.x = dropX - offsetX;
                rectToMove.y = dropY - offsetY;
                console.log(`[DrawProcess] Moved rect ID ${draggedRectId} to (${rectToMove.x}, ${rectToMove.y})`);
            } else { console.error(`[DrawProcess] Move Error: Cannot find rect with ID ${draggedRectId}.`); }
        } catch (e) { console.error("[DrawProcess] Error processing move drop:", e); }
    }
    // --- Xử lý TẠO MỚI hình chữ nhật từ palette ---
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        if (sourceItemDataStr) {
            let sourceItemData;
            try {
                sourceItemData = JSON.parse(sourceItemDataStr);
                console.log('[DrawProcess] Handling CREATE NEW for:', sourceItemData);

                // Bắt đầu loading schema gốc từ XML
                isSchemaLoading.value = true;
                let formSchemaDefinitionFromXml = null;
                try {
                    // Load schema gốc (có thể từ cache hoặc fetch)
                    formSchemaDefinitionFromXml = await getOrLoadFormSchema(sourceItemData.schemaId);
                } finally {
                    isSchemaLoading.value = false; // Kết thúc loading
                }

                // Xử lý nếu load schema gốc lỗi
                if (formSchemaDefinitionFromXml === null) {
                     console.error(`[DrawProcess] Failed to load base formSchema for ${sourceItemData.schemaId}. Creating rect with empty schema and data.`);
                     formSchemaDefinitionFromXml = {}; // Sử dụng schema rỗng
                }

                // Tạo formData ban đầu từ giá trị mặc định trong schema gốc
                const initialFormDataValues = {};
                for (const key in formSchemaDefinitionFromXml) {
                    initialFormDataValues[key] = formSchemaDefinitionFromXml[key]?.value ?? getDefaultValue(formSchemaDefinitionFromXml[key]?.type);
                }

                // Clone dữ liệu ban đầu và schema gốc để tránh tham chiếu
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

                // Tạo đối tượng hình chữ nhật mới
                const newRect = {
                    id: Date.now(), // ID duy nhất
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId, // Giữ lại để biết nguồn gốc
                    x: dropX - defaultRectWidth / 2, // Căn giữa vào điểm thả
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value, // Gán thứ tự hiện tại
                    formSchemaDefinition: clonedSchemaDefinition, // Lưu schema definition (có thể sửa sau)
                    formData: clonedInitialValues // Lưu dữ liệu nhập ban đầu
                };
                // Thêm hình mới vào mảng
                drawnRectangles.value.push(newRect);
                // Tăng số thứ tự cho lần thả tiếp theo
                currentOrder.value++;
                console.log("[DrawProcess] Created new rect:", newRect);

            } catch (e) {
                console.error("[DrawProcess] Drop Error (Create New):", e, sourceItemDataStr);
                isSchemaLoading.value = false; // Đảm bảo tắt loading nếu có lỗi
            }
        } else {
            // Trường hợp không có dữ liệu hợp lệ nào được thả
            console.warn('[DrawProcess] Drop Warning: No valid data (RECT_ID or SOURCE_ITEM) found.');
        }
    }
    // Luôn reset ID đang kéo sau khi xử lý xong drop
    draggingRectId.value = null;
};

// Helper lấy giá trị mặc định (cần thiết ở đây cho handleDrop)
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null
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
