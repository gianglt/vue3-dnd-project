// src/components/drawing/DrawingCanvas.vue
<template>
    <!-- Template không đổi -->
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
// Sử dụng debounce từ lodash-es (cần cài đặt: npm install lodash-es)
// Hoặc bạn có thể tự viết hàm debounce đơn giản
import { debounce } from 'lodash-es';
import DrawnRectangle from './DrawnRectangle.vue';
import ContextMenu from './ContextMenu.vue';
import EditFormModal from './EditFormModal.vue';
import { sourceData, getSchemaById } from '../../data/drawingSchemas.js';
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../../types/drawingTypes.js';

// --- State --- (Không đổi)
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

// --- Computed --- (Không đổi)
const sortedRectangles = computed(() => {
    // console.log('Drawn Rectangles:', drawnRectangles.value);
    const sorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
    // console.log('Sorted Rectangles for Lines:', sorted);
    return sorted;
});

// --- Helpers --- (Không đổi)
const getSchemaForRect = (rect) => {
    return rect ? getSchemaById(rect.schemaId) : {};
};

const calculateElbowPoints = (rectA, rectB) => {
    // console.log('Calculating points for:', rectA?.order, '->', rectB?.order);
    if (!rectA || !rectB) {
         // console.warn('calculateElbowPoints: Missing rectA or rectB');
         return "";
    }
    // --- Logic tính toán điểm không đổi ---
    // Giả sử rect.x, rect.y là tương đối với canvas và đã chính xác
    const startX = rectA.x + rectA.width;
    const startY = rectA.y + rectA.height / 2;
    const endX = rectB.x;
    const endY = rectB.y + rectB.height / 2;

    // Tính điểm giữa (góc vuông)
    // Cách 1: Đường ngang trước, đường dọc sau
    // const midX = endX;
    // const midY = startY;

    // Cách 2: Đường dọc trước, đường ngang sau (như code gốc của bạn gợi ý)
    const cornerX = startX; // Đi ngang ra từ A
    const cornerY = endY;   // Đi thẳng xuống/lên tới ngang B

    // Cách 3: Điểm giữa đường chéo (có thể không phải góc vuông)
    // const midX = (startX + endX) / 2;
    // const midY = (startY + endY) / 2; // Điểm này không tạo góc vuông

    // Cách 4: Điểm góc vuông thông minh hơn một chút (ví dụ: đi ngang nửa đường rồi dọc)
    // const midX = (startX + endX) / 2;
    // const pointsStr = `${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
    // return pointsStr; // Trả về 4 điểm nếu muốn 2 đoạn vuông góc

    // Giữ nguyên logic gốc của bạn (3 điểm tạo 1 góc vuông)
    const pointsStr = `${startX},${startY} ${cornerX},${cornerY} ${endX},${endY}`;
    // console.log('Calculated points string:', pointsStr);
    return pointsStr;
};

// --- Event Handlers ---

// Hàm xử lý khi cửa sổ thay đổi kích thước hoặc cuộn (ĐÃ DEBOUNCE)
const handleWindowChange = debounce(() => {
    // Chỉ đóng context menu nếu nó đang mở
    // Không cần tính toán lại vị trí các hình chữ nhật ở đây
    // vì tọa độ x, y là tương đối với canvas và getBoundingClientRect
    // sẽ được gọi lại khi cần (ví dụ trong handleDrop).
    if (contextMenu.value.visible) {
        console.log('Window changed (resize/scroll), closing context menu.');
        closeContextMenu();
    }
}, 150); // Chờ 150ms sau lần resize/scroll cuối cùng mới thực thi

// --- Lifecycle Hooks ---
onMounted(() => {
    window.addEventListener('click', handleClickOutside);
    // Sử dụng hàm đã debounce
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true); // true để bắt sự kiện trong capturing phase
});
onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside);
    // Gỡ bỏ đúng hàm đã debounce
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);
    handleWindowChange.cancel(); // Hủy bỏ bất kỳ lệnh debounce nào đang chờ (nếu dùng lodash)
});

// --- Event Handlers --- (Các hàm khác không đổi)
const handleClickOutside = (event) => {
    // Logic đóng context menu khi click ra ngoài (không đổi)
    const contextMenuElement = contextMenuRef.value?.$el || contextMenuRef.value;
    // Kiểm tra kỹ hơn, đảm bảo contextMenuElement thực sự là DOM element
    const isClickInsideMenu = contextMenuElement instanceof Element && contextMenuElement.contains(event.target);

    if (contextMenu.value.visible && !isClickInsideMenu) {
        // Kiểm tra thêm xem có click vào chính hình chữ nhật đã mở menu không
        // (Trong trường hợp bạn muốn giữ menu mở khi click lại vào target)
        // Tuy nhiên, hành vi phổ biến là đóng menu khi click bất cứ đâu bên ngoài.
        closeContextMenu();
    }
};

// --- Context Menu Handlers --- (Không đổi)
const showContextMenu = (event, rect) => {
    if (isModalVisible.value) return;
    // Đóng menu cũ trước khi mở menu mới (nếu có)
    if (contextMenu.value.visible) {
        closeContextMenu();
    }
    // Ngăn không cho menu trình duyệt mặc định xuất hiện
    event.preventDefault();
    contextMenu.value.visible = true;
    // Sử dụng clientX/clientY vì chúng là tọa độ tuyệt đối của viewport,
    // phù hợp với việc định vị menu (thường là position: fixed hoặc absolute so với body)
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
            drawnRectangles.value.splice(indexToDelete, 1);
            // Sắp xếp lại và cập nhật thứ tự
            const remainingSorted = drawnRectangles.value.slice().sort((a, b) => a.order - b.order);
            remainingSorted.forEach((rect, index) => {
                rect.order = index + 1;
            });
            currentOrder.value = drawnRectangles.value.length + 1;
            console.log(`Đã xóa hình ID: ${idToDelete}. Thứ tự cập nhật. Current order: ${currentOrder.value}`);
        }
    }
};

// --- Modal Handlers --- (Không đổi)
const openEditModal = (rect) => {
    // Không mở modal nếu đang kéo thả
    if (!rect || draggingRectId.value !== null) return;
    // Đóng context menu nếu đang mở
    closeContextMenu();
    // Sao chép dữ liệu để tránh sửa đổi trực tiếp state gốc trước khi lưu
    // editingRect.value = { ...rect, formData: structuredClone(rect.formData || {}) }; // Deep clone formData
     try {
        // structuredClone là cách tốt nhất để deep clone
        editingRect.value = { ...rect, formData: structuredClone(rect.formData || {}) };
    } catch (e) {
        console.warn("structuredClone not supported or failed, using JSON fallback for deep clone.");
        // Fallback nếu structuredClone không được hỗ trợ hoặc lỗi
        editingRect.value = { ...rect, formData: JSON.parse(JSON.stringify(rect.formData || {})) };
    }
    isModalVisible.value = true;
};

const saveForm = (updatedFormData) => {
    if (!editingRect.value) return;
    const originalRectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
    if (originalRectIndex > -1) {
        console.log("Lưu dữ liệu từ modal:", updatedFormData);
        // Cập nhật formData trong mảng chính
         try {
             // Gán lại bản sao sâu của dữ liệu đã cập nhật
            drawnRectangles.value[originalRectIndex].formData = structuredClone(updatedFormData);
        } catch (e) {
            console.warn("structuredClone not supported or failed during save, using JSON fallback.");
            drawnRectangles.value[originalRectIndex].formData = JSON.parse(JSON.stringify(updatedFormData));
        }
        // Không cần cập nhật các thuộc tính khác như x, y ở đây trừ khi form cho phép sửa
    }
    cancelForm(); // Đóng modal
};

const cancelForm = () => {
    isModalVisible.value = false;
    editingRect.value = null;
};

// --- Drag and Drop Handlers --- (Không đổi)
const handleSourceDragStart = (event, item) => {
    // Đóng context menu nếu đang mở
    closeContextMenu();
    // Chuẩn bị dữ liệu để truyền đi
    const dataToTransfer = { color: item.color, schemaId: item.schemaId };
    try {
        const dataStr = JSON.stringify(dataToTransfer);
        event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, dataStr);
        event.dataTransfer.effectAllowed = 'copy';
        draggingRectId.value = null; // Đảm bảo không có ID nào đang được kéo
        console.log('Source Drag Start - Data:', dataStr);
    } catch (e) {
        console.error("Source Drag Start Error: Failed to stringify data", e, dataToTransfer);
    }
};

const handleRectDragStart = (event, rect) => {
    // Đóng context menu nếu đang mở
    if (contextMenu.value.visible) closeContextMenu();
    // Ngăn kéo khi modal đang mở
    if (isModalVisible.value) {
         event.preventDefault();
         return;
    }

    try {
        event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
        // Tính toán và lưu offset của chuột bên trong hình chữ nhật được kéo
        const offsetX = event.offsetX;
        const offsetY = event.offsetY;
        const offsetData = JSON.stringify({ x: offsetX, y: offsetY });
        event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, offsetData);
        event.dataTransfer.effectAllowed = 'move';
        draggingRectId.value = rect.id; // Đánh dấu ID đang được kéo
        console.log(`Bắt đầu kéo hình ID: ${rect.id} với offset:`, offsetData);

        // Thêm class tạm thời để thay đổi giao diện khi kéo (ví dụ: giảm opacity)
        // event.target.classList.add('dragging'); // Cần CSS tương ứng
    } catch (e) {
         console.error("Rect Drag Start Error:", e);
         event.preventDefault(); // Ngăn kéo nếu có lỗi
    }
};

const handleRectDragEnd = (event) => {
    // Xóa class tạm thời (nếu có)
    // event.target.classList.remove('dragging');
    draggingRectId.value = null; // Reset ID đang kéo
    console.log(`Kết thúc kéo hình`);
};

const handleDragOver = (event) => {
    // Luôn cần preventDefault để cho phép drop
    event.preventDefault();
    // Xác định loại thao tác dựa trên dữ liệu đang được kéo
    if (event.dataTransfer.types.includes(RECT_ID_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "move";
    } else if (event.dataTransfer.types.includes(SOURCE_ITEM_DATA_TYPE)) {
        event.dataTransfer.dropEffect = "copy";
    } else {
         event.dataTransfer.dropEffect = "none"; // Không cho phép thả loại khác
    }
    // console.log('Drag Over - Allowed Effect:', event.dataTransfer.dropEffect); // Log ít thôi
};

const handleDrop = (event) => {
    event.preventDefault();
    closeContextMenu(); // Đảm bảo context menu đóng khi thả
    console.log('--- Handle Drop ---');

    // Lấy thông tin canvas MỚI NHẤT tại thời điểm thả
    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) {
        console.error('Drop Error: Cannot get canvas bounds.');
        draggingRectId.value = null; // Reset trạng thái kéo nếu lỗi
        return;
    }

    // Tính toán tọa độ thả TƯƠNG ĐỐI với canvas
    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;
    console.log(`Drop Coords (Viewport): clientX=${event.clientX}, clientY=${event.clientY}`);
    console.log(`Canvas Rect: left=${canvasRect.left}, top=${canvasRect.top}`);
    console.log(`Drop Coords (Relative to Canvas): dropX=${dropX}, dropY=${dropY}`);
    console.log('DataTransfer Types:', event.dataTransfer.types);

    // --- Xử lý DI CHUYỂN hình chữ nhật hiện có ---
    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    if (draggedRectIdStr) {
        console.log('Handling MOVE for ID:', draggedRectIdStr);
        try {
            const draggedRectId = parseInt(draggedRectIdStr, 10);
            const offsetData = event.dataTransfer.getData(DRAG_OFFSET_DATA_TYPE);
            let offsetX = 0, offsetY = 0;
            try {
                const offset = JSON.parse(offsetData || '{}'); // Thêm fallback nếu offsetData rỗng
                offsetX = offset.x || 0; // Thêm fallback nếu x không có
                offsetY = offset.y || 0; // Thêm fallback nếu y không có
            } catch (e) { console.warn('Could not parse drag offset data:', offsetData, e); }

            const rectToMove = drawnRectangles.value.find(r => r.id === draggedRectId);
            if (rectToMove) {
                // Tính toán vị trí mới dựa trên điểm thả và offset chuột
                rectToMove.x = dropX - offsetX;
                rectToMove.y = dropY - offsetY;
                console.log(`Moved rect ID ${draggedRectId} to x=${rectToMove.x}, y=${rectToMove.y}`);
            } else {
                 console.error(`Move Error: Cannot find rect with ID ${draggedRectId} in drawnRectangles.`);
            }
        } catch (e) {
            console.error("Error processing move drop:", e);
        }
    }
    // --- Xử lý TẠO MỚI hình chữ nhật từ palette ---
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        console.log('Attempting to get SOURCE_ITEM:', sourceItemDataStr);
        if (sourceItemDataStr) {
            console.log('Handling CREATE NEW');
            try {
                const sourceItemData = JSON.parse(sourceItemDataStr);
                const schema = getSchemaById(sourceItemData.schemaId);
                if (!schema) {
                     console.error(`Create Error: Cannot find schema with ID ${sourceItemData.schemaId}`);
                     draggingRectId.value = null; // Reset trạng thái kéo
                     return;
                }

                // Khởi tạo formData từ giá trị mặc định của schema
                const initialFormData = {};
                // Chỉ lấy các key có trong schema để làm formData ban đầu
                Object.keys(schema).forEach(key => {
                     // Có thể cần kiểm tra kiểu dữ liệu hoặc giá trị mặc định phức tạp hơn ở đây
                     initialFormData[key] = schema[key]; // Giả sử schema chứa giá trị mặc định
                });


                const newRect = {
                    id: Date.now(), // Sử dụng timestamp làm ID đơn giản
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId,
                    // Đặt tâm của hình chữ nhật mới vào điểm thả
                    x: dropX - defaultRectWidth / 2,
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value, // Gán thứ tự hiện tại
                    formData: initialFormData // Gán formData đã khởi tạo
                };
                console.log('Creating new rectangle:', newRect);
                drawnRectangles.value.push(newRect);
                currentOrder.value++; // Tăng thứ tự cho hình chữ nhật tiếp theo
                console.log('drawnRectangles count:', drawnRectangles.value.length);
            } catch (e) {
                console.error("Drop Error: Failed to parse source item data or create new rect:", e, sourceItemDataStr);
            }
        } else {
            console.warn('Drop Warning: No valid data (RECT_ID or SOURCE_ITEM) found in dataTransfer.');
        }
    }
    // Luôn reset trạng thái kéo sau khi xử lý xong drop
    draggingRectId.value = null;
};

</script>

<style scoped>
/* CSS không đổi */
.drawing-app { display: flex; gap: 2rem; font-family: sans-serif; }
.palette { border: 1px solid #ccc; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background-color: #f8f8f8; height: fit-content; }
.palette h3 { margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555; }
.source-rect { width: 50px; height: 50px; border: 1px solid #eee; cursor: grab; transition: transform 0.2s ease; }
.source-rect:active { cursor: grabbing; transform: scale(1.1); }
.canvas { border: 2px dashed #007bff; /*width: 500px; height: 400px;*/ /* Bỏ width/height cố định nếu muốn nó co giãn */ width: 100%; /* Ví dụ: chiếm toàn bộ chiều rộng còn lại */ height: 500px; /* Hoặc chiều cao mong muốn */ position: relative; background-color: #e9ecef; overflow: hidden; /* Quan trọng nếu nội dung vượt quá */ }
.canvas h3 { position: absolute; top: 5px; left: 10px; margin: 0; font-size: 0.9em; color: #6c757d; pointer-events: none; }

/* CSS cho SVG layer */
.connection-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Để click xuyên qua SVG tới các hình chữ nhật */
    z-index: 1; /* Nằm dưới hình chữ nhật (z-index: 2) */
}

/* Optional: Style for dragging element */
/* .drawn-rect.dragging {
    opacity: 0.5;
    cursor: grabbing;
} */

</style>
