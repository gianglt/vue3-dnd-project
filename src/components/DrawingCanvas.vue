<template>
    <div class="drawing-app">
        <!-- Khu vực chứa các hình mẫu nguồn -->
        <div class="palette">
            <h3>Kéo từ đây:</h3>
            <!-- Sử dụng sourceData thay vì sourceColors -->
            <div v-for="item in sourceData" :key="item.schemaId" class="source-rect" :style="{ backgroundColor: item.color }"
                draggable="true" @dragstart="handleSourceDragStart($event, item)"></div>
        </div>

        <!-- Khu vực vẽ (vùng thả) -->
        <div class="canvas" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop" ref="canvasRef">
            <h3>Thả vào đây:</h3>
            <!-- Hiển thị các hình chữ nhật đã vẽ -->
            <div v-for="rect in drawnRectangles" :key="rect.id" class="drawn-rect" :style="{
                backgroundColor: rect.color,
                left: rect.x + 'px',
                top: rect.y + 'px',
                width: rect.width + 'px',
                height: rect.height + 'px'
            }"
                draggable="true"
                @dragstart.stop="handleRectDragStart($event, rect)"  
                @dragend="handleRectDragEnd"
                @contextmenu.prevent="showContextMenu($event, rect)"
                @click="openEditModal(rect)" 
            >
                <!-- Hiển thị số thứ tự -->
                <span class="rect-order">{{ rect.order }}</span>
            </div>
        </div>

        <!-- Menu ngữ cảnh tùy chỉnh -->
        <div
            v-if="contextMenu.visible"
            class="context-menu"
            :style="{ top: contextMenu.top + 'px', left: contextMenu.left + 'px' }"
            ref="contextMenuRef"
        >
            <ul>
                <li @click="handleEdit">Sửa thông tin (Modal)</li> <!-- Đổi tên để rõ ràng -->
                <li @click="handleDelete">Xóa hình</li>
            </ul>
        </div>

        <!-- Modal Chỉnh sửa Thông tin -->
        <div v-if="isModalVisible" class="modal-overlay" @click.self="cancelForm"> <!-- click.self để chỉ đóng khi click vào overlay -->
            <div class="modal-content">
                <h3>Chỉnh sửa thông tin (Hình #{{ editingRect?.order }})</h3>
                <form @submit.prevent="saveForm">
                    <!-- Tạo form động từ schema -->
                    <div v-for="(defaultValue, key) in getSchemaForRect(editingRect)" :key="key" class="form-group">
                         <label :for="'field-' + key">{{ key }}:</label>
                         <!-- Sử dụng modalFormData để binding -->
                         <input
                            :id="'field-' + key"
                            v-model="modalFormData[key]"
                            type="text"
                            required
                         >
                    </div>

                    <div class="modal-actions">
                        <button type="submit">Save</button>
                        <button type="button" @click="cancelForm">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, onMounted, onUnmounted, computed } from 'vue'; // Thêm computed

// --- Constants ---
const RECT_ID_DATA_TYPE = 'application/x-drawn-rect-id';
const DRAG_OFFSET_DATA_TYPE = 'application/json';
const SOURCE_ITEM_DATA_TYPE = 'application/json'; // Kiểu dữ liệu mới cho item nguồn

// --- State ---

// Dữ liệu nguồn với schema JSON
const sourceData = ref([
    {
        color: '#ff6b6b', // Đỏ
        schemaId: 'schema_red',
        formSchema: {
            "Tên": "Hình đỏ", // Label: Default Value
            "Mô tả": "Một hình chữ nhật màu đỏ",
            "Giá trị": 10
        }
    },
    {
        color: '#4ecdc4', // Xanh ngọc
        schemaId: 'schema_teal',
        formSchema: {
            "Đối tượng": "Khối Teal",
            "Trạng thái": "Hoạt động",
        }
    },
    {
        color: '#45b7d1', // Xanh dương
        schemaId: 'schema_blue',
        formSchema: {
            "ID Người dùng": "",
            "Ghi chú": "Không có",
            "Ưu tiên": "Trung bình"
        }
    }
]);

// Cấu trúc drawnRectangles cập nhật: thêm schemaId, formData
const drawnRectangles = ref([]);
const canvasRef = ref(null);
const defaultRectWidth = 50;
const defaultRectHeight = 50;
const draggingRectId = ref(null);
const currentOrder = ref(1);

// State cho Context Menu
const contextMenuRef = ref(null);
const contextMenu = ref({
    visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null
});

// State cho Modal Chỉnh sửa
const isModalVisible = ref(false);
const editingRect = ref(null); // Lưu trữ toàn bộ object rect đang sửa
const modalFormData = ref({}); // Dữ liệu tạm thời trong modal

// --- Computed ---
// Helper để lấy schema dựa trên schemaId
const getSchemaById = (schemaId) => {
    const sourceItem = sourceData.value.find(item => item.schemaId === schemaId);
    return sourceItem ? sourceItem.formSchema : {};
};

// Helper để lấy schema cho hình chữ nhật cụ thể (dùng trong modal)
const getSchemaForRect = (rect) => {
    return rect ? getSchemaById(rect.schemaId) : {};
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

// Đóng menu/modal nếu click ra ngoài
const handleClickOutside = (event) => {
    // Đóng context menu
    if (contextMenu.value.visible && !contextMenuRef.value?.contains(event.target)) {
        closeContextMenu();
    }
    // Lưu ý: Modal đã có xử lý @click.self trên overlay
};

// Đóng context menu khi resize/scroll
const handleWindowChange = () => {
    if (contextMenu.value.visible) {
        closeContextMenu();
    }
    // Có thể cân nhắc đóng cả modal nếu cần, nhưng thường không cần thiết
    // if (isModalVisible.value) {
    //     cancelForm();
    // }
};

// --- Context Menu Handlers ---
const showContextMenu = (event, rect) => {
    if (isModalVisible.value) return; // Không mở context menu nếu modal đang mở
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

// Đổi tên handleEdit của context menu để gọi hàm mở modal
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
    const orderToDelete = contextMenu.value.targetRectOrder;
    closeContextMenu(); // Đóng menu trước khi xử lý

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

// --- Modal Handlers ---
const openEditModal = (rect) => {
    if (!rect) return;
    // Không mở modal nếu đang kéo thả
    if (draggingRectId.value !== null) return;
    // Đóng context menu nếu đang mở
    closeContextMenu();

    console.log("Mở modal cho:", rect);
    editingRect.value = rect;
    // Tạo bản sao sâu của formData để chỉnh sửa, tránh thay đổi trực tiếp
    // Sử dụng structuredClone là cách hiện đại và tốt nhất
    try {
        modalFormData.value = structuredClone(rect.formData || {});
    } catch (e) {
        // Fallback cho trình duyệt cũ hơn (không hỗ trợ structuredClone)
        console.warn("structuredClone not supported, using JSON fallback for deep copy.");
        modalFormData.value = JSON.parse(JSON.stringify(rect.formData || {}));
    }

    // Đảm bảo các trường trong schema tồn tại trong modalFormData với giá trị mặc định nếu chưa có
    const schema = getSchemaForRect(rect);
    for (const key in schema) {
        if (!(key in modalFormData.value)) {
             modalFormData.value[key] = schema[key]; // Gán giá trị mặc định từ schema
        }
    }

    isModalVisible.value = true;
};

const saveForm = () => {
    if (!editingRect.value) return;

    const originalRectIndex = drawnRectangles.value.findIndex(r => r.id === editingRect.value.id);
    if (originalRectIndex > -1) {
        console.log("Lưu dữ liệu:", modalFormData.value);
        // Cập nhật formData của hình chữ nhật gốc bằng bản sao sâu
         try {
            drawnRectangles.value[originalRectIndex].formData = structuredClone(modalFormData.value);
        } catch (e) {
            console.warn("structuredClone not supported, using JSON fallback for deep copy.");
            drawnRectangles.value[originalRectIndex].formData = JSON.parse(JSON.stringify(modalFormData.value));
        }
    } else {
        console.error("Không tìm thấy hình chữ nhật gốc để lưu!");
    }

    // Đóng modal và reset state
    isModalVisible.value = false;
    editingRect.value = null;
    modalFormData.value = {};
};

const cancelForm = () => {
    isModalVisible.value = false;
    editingRect.value = null;
    modalFormData.value = {};
};


// --- Drag and Drop Handlers ---
const handleSourceDragStart = (event, item) => {
    // Truyền cả color và schemaId
    const dataToTransfer = { color: item.color, schemaId: item.schemaId };
    event.dataTransfer.setData(SOURCE_ITEM_DATA_TYPE, JSON.stringify(dataToTransfer));
    event.dataTransfer.effectAllowed = 'copy';
    console.log(`Bắt đầu kéo item nguồn: ${item.schemaId}`);
    draggingRectId.value = null;
    closeContextMenu();
};

const handleRectDragStart = (event, rect) => {
    if (contextMenu.value.visible) closeContextMenu();
    if (isModalVisible.value) return; // Không cho kéo nếu modal đang mở

    event.dataTransfer.setData(RECT_ID_DATA_TYPE, rect.id.toString());
    const offsetX = event.offsetX;
    const offsetY = event.offsetY;
    event.dataTransfer.setData(DRAG_OFFSET_DATA_TYPE, JSON.stringify({ x: offsetX, y: offsetY }));
    event.dataTransfer.effectAllowed = 'move';
    draggingRectId.value = rect.id;
};

const handleRectDragEnd = (event) => {
    draggingRectId.value = null;
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

    const canvasRect = canvasRef.value?.getBoundingClientRect();
    if (!canvasRect) return;

    const dropX = event.clientX - canvasRect.left;
    const dropY = event.clientY - canvasRect.top;

    // Trường hợp DI CHUYỂN
    const draggedRectIdStr = event.dataTransfer.getData(RECT_ID_DATA_TYPE);
    if (draggedRectIdStr) {
        // ... (logic di chuyển giữ nguyên) ...
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
    // Trường hợp TẠO MỚI
    else {
        const sourceItemDataStr = event.dataTransfer.getData(SOURCE_ITEM_DATA_TYPE);
        if (sourceItemDataStr) {
            try {
                const sourceItemData = JSON.parse(sourceItemDataStr);
                const schema = getSchemaById(sourceItemData.schemaId);
                // Khởi tạo formData ban đầu từ giá trị mặc định của schema
                const initialFormData = {};
                for(const key in schema) {
                    initialFormData[key] = schema[key]; // Lấy giá trị mặc định
                }

                const newRect = {
                    id: Date.now(),
                    color: sourceItemData.color,
                    schemaId: sourceItemData.schemaId, // Lưu schemaId
                    x: dropX - defaultRectWidth / 2,
                    y: dropY - defaultRectHeight / 2,
                    width: defaultRectWidth,
                    height: defaultRectHeight,
                    order: currentOrder.value,
                    formData: initialFormData // Khởi tạo formData
                };
                drawnRectangles.value.push(newRect);
                currentOrder.value++;
                console.log('Đã vẽ hình chữ nhật mới:', newRect);
            } catch (e) {
                console.error("Lỗi parse dữ liệu item nguồn:", e);
            }
        } else {
            console.warn('Không có dữ liệu hợp lệ được truyền khi thả.');
        }
    }
    draggingRectId.value = null;
};

</script>

<style scoped>
/* ... CSS cũ ... */
.drawing-app { display: flex; gap: 2rem; font-family: sans-serif; }
.palette { border: 1px solid #ccc; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background-color: #f8f8f8; height: fit-content; }
.palette h3 { margin: 0 0 0.5rem 0; font-size: 0.9em; color: #555; }
.source-rect { width: 50px; height: 50px; border: 1px solid #eee; cursor: grab; transition: transform 0.2s ease; }
.source-rect:active { cursor: grabbing; transform: scale(1.1); }
.canvas { border: 2px dashed #007bff; width: 500px; height: 400px; position: relative; background-color: #e9ecef; overflow: hidden; }
.canvas h3 { position: absolute; top: 5px; left: 10px; margin: 0; font-size: 0.9em; color: #6c757d; pointer-events: none; }
.drawn-rect { position: absolute; border: 1px solid rgba(0, 0, 0, 0.2); box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1); cursor: grab; user-select: none; transition: opacity 0.2s ease; display: flex; justify-content: center; align-items: center; }
.drawn-rect:active { cursor: grabbing; }
.rect-order { font-size: 1.2em; font-weight: bold; color: white; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7); pointer-events: none; }
.context-menu { position: fixed; background-color: white; border: 1px solid #ccc; box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15); z-index: 1000; min-width: 120px; }
.context-menu ul { list-style: none; padding: 5px 0; margin: 0; }
.context-menu li { padding: 8px 15px; cursor: pointer; font-size: 0.9em; }
.context-menu li:hover { background-color: #eee; }

/* CSS cho Modal */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6); /* Nền mờ */
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1100; /* Cao hơn context menu */
}

.modal-content {
    background-color: white;
    padding: 25px;
    border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    min-width: 300px;
    max-width: 90%;
}

.modal-content h3 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    text-align: center;
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.3rem;
    font-weight: bold;
    font-size: 0.9em;
}

.form-group input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box; /* Quan trọng để padding không làm tăng kích thước */
}

.modal-actions {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end; /* Đẩy nút sang phải */
    gap: 0.5rem; /* Khoảng cách giữa các nút */
}

.modal-actions button {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}

.modal-actions button[type="submit"] {
    background-color: #007bff;
    color: white;
}

.modal-actions button[type="button"] {
    background-color: #6c757d;
    color: white;
}
.modal-actions button:hover {
    opacity: 0.9;
}

</style>
