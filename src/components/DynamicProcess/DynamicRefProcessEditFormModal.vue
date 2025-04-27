<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content form-builder-modal">
            <h2>Xây dựng Form Nhập liệu Động</h2>

            <div class="form-builder-layout">
                <!-- Palette chứa các loại trường mẫu -->
                <div class="palette">
                    <h4>Kéo loại trường vào form:</h4>
                    <div
                        v-for="fieldType in availableFieldTypes"
                        :key="fieldType.type"
                        class="palette-item"
                        draggable="true"
                        @dragstart="handlePaletteDragStart($event, fieldType.type)"
                    >
                        {{ fieldType.label }}
                    </div>
                </div>

                <!-- Canvas/Khu vực xây dựng form -->
                <div
                    class="form-builder-canvas"
                    @dragover.prevent="handleCanvasDragOver"
                    @drop.prevent="handleCanvasDrop"
                >
                    <h4>Cấu trúc Form:</h4>
                    <div v-if="builtSchemaFields.length === 0" class="canvas-placeholder">
                        Thả các trường vào đây...
                    </div>
                    <!-- Sử dụng div đơn giản cho kéo thả sắp xếp -->
                    <div v-else>
                        <div
                            v-for="(field, index) in builtSchemaFields"
                            :key="field.id"
                            class="form-field-preview"
                            draggable="true"
                            @dragstart="handleFieldDragStart($event, index)"
                            @dragover.prevent="handleFieldDragOver($event, index)"
                            @drop.prevent="handleFieldDrop($event, index)"
                            @dragend="handleFieldDragEnd"
                            :class="{ 'drag-over': dragOverIndex === index && draggingIndex !== index }"
                        >
                            <span class="drag-handle" title="Kéo để sắp xếp">⠿</span>
                            <input type="text" v-model="field.key" placeholder="Nhãn trường (Key)" class="field-key-input"/>
                            <span class="field-type-label">({{ field.type }})</span>

                            <!-- Input giá trị mặc định tùy theo type -->
                            <!-- Standard Inputs -->
                            <input v-if="field.type === 'text' || field.type === 'email' || field.type === 'url' || field.type === 'date'" :type="field.type" v-model="field.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                            <input v-else-if="field.type === 'number'" type="number" v-model.number="field.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                            <textarea v-else-if="field.type === 'textarea'" v-model="field.value" placeholder="Giá trị mặc định" rows="1" class="field-value-input"></textarea>
                            <input v-else-if="field.type === 'boolean'" type="checkbox" v-model="field.value" class="field-value-input-cb"/>

                            <!-- NEW: Reference Type Selector -->
                            <select v-if="field.type === 'reference'" v-model="field.referenceType" class="field-reference-type-select" title="Chọn loại tham chiếu">
                                <option v-for="refType in availableReferenceTypes" :key="refType" :value="refType">
                                    {{ refType }}
                                </option>
                            </select>
                            <!-- Optional: Input for default reference ID (can be added later if needed) -->
                            <!-- <input v-if="field.type === 'reference'" v-model="field.value" placeholder="Default ID (optional)" class="field-value-input"/> -->


                            <button @click="removeField(field.id)" class="delete-field-btn" title="Xóa trường">×</button>
                        </div>
                    </div>
                     <!-- Cân nhắc dùng thư viện như vuedraggable nếu cần kéo thả phức tạp hơn -->
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" @click="handleSaveSchema" class="btn btn-save">Lưu Cấu trúc Form</button>
                <button type="button" @click="handleCancel" class="btn btn-cancel">Hủy</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
// Nếu dùng vuedraggable, import nó ở đây:
// import draggable from 'vuedraggable';

const props = defineProps({
    visible: Boolean,
    // Schema ban đầu để chỉnh sửa, có cấu trúc { key: { value: ..., type: ..., referenceType?: ... } }
    initialSchema: {
        type: Object,
        default: () => ({})
    }
});

const emit = defineEmits(['saveSchema', 'cancel']);

// Các loại trường có sẵn trong palette
const availableFieldTypes = ref([
    { type: 'text', label: 'Chữ (Text)' },
    { type: 'number', label: 'Số (Number)' },
    { type: 'date', label: 'Ngày (Date)' },
    { type: 'textarea', label: 'Văn bản dài (Textarea)' },
    { type: 'boolean', label: 'Đúng/Sai (Checkbox)' },
    { type: 'email', label: 'Email' },
    { type: 'url', label: 'URL' },
    { type: 'reference', label: 'Tham chiếu (Reference)' }, // <-- NEW FIELD TYPE
]);

// NEW: Các loại tham chiếu có sẵn
// Trong ứng dụng thực tế, danh sách này có thể đến từ API hoặc cấu hình
const availableReferenceTypes = ref(['Customer', 'Employee', 'DocumentType']);

// Trạng thái nội bộ: Mảng các đối tượng field đang được xây dựng
// Mỗi field có id, key, type, value (mặc định), và referenceType (nếu type là 'reference')
const builtSchemaFields = ref([]);

// Trạng thái cho drag & drop (HTML5)
const draggingFieldType = ref(null); // Loại field đang kéo từ palette
const draggingIndex = ref(null); // Index của field đang kéo trong canvas
const dragOverIndex = ref(null); // Index của field đang bị kéo qua trong canvas

// --- Watchers ---
// Khởi tạo builtSchemaFields khi modal mở hoặc initialSchema thay đổi
watch(() => props.visible, (newVisible) => {
    if (newVisible && props.initialSchema) {
        const fieldsArray = [];
        let idCounter = Date.now();
        for (const key in props.initialSchema) {
            const schemaField = props.initialSchema[key];
            if (!schemaField) continue; // Bỏ qua nếu key không có giá trị hợp lệ

            const fieldType = schemaField.type || 'text';
            const fieldData = {
                id: idCounter++,
                key: key,
                type: fieldType,
                value: schemaField.value ?? getDefaultValue(fieldType)
            };

            // NEW: Handle reference type initialization
            if (fieldType === 'reference') {
                // Gán referenceType từ schema, hoặc dùng giá trị đầu tiên trong danh sách nếu không có
                fieldData.referenceType = schemaField.referenceType && availableReferenceTypes.value.includes(schemaField.referenceType)
                    ? schemaField.referenceType
                    : availableReferenceTypes.value[0]; // Default to the first available type
            }

            fieldsArray.push(fieldData);
        }
        builtSchemaFields.value = fieldsArray;
        console.log("Form builder initialized with:", builtSchemaFields.value);
    } else if (!newVisible) {
        // Reset khi đóng modal để tránh giữ lại trạng thái cũ
        builtSchemaFields.value = [];
        draggingFieldType.value = null;
        draggingIndex.value = null;
        dragOverIndex.value = null;
        console.log("Form builder closed and reset.");
    }
}, { immediate: true });


// --- Drag & Drop Handlers (HTML5) ---

// Kéo từ Palette
const handlePaletteDragStart = (event, fieldType) => {
    try {
        draggingFieldType.value = fieldType;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', fieldType);
        console.log(`Dragging from palette: ${fieldType}`);
    } catch (e) {
        console.error("Error setting drag data:", e);
    }
};

// Kéo qua Canvas
const handleCanvasDragOver = (event) => {
    event.preventDefault();
    if (draggingFieldType.value) {
        event.dataTransfer.dropEffect = 'copy';
    } else if (draggingIndex.value !== null) {
        event.dataTransfer.dropEffect = 'move';
    } else {
        event.dataTransfer.dropEffect = 'none';
    }
};

// Thả vào Canvas (từ Palette)
const handleCanvasDrop = (event) => {
    event.preventDefault();
    const fieldType = draggingFieldType.value || event.dataTransfer.getData('text/plain');
    console.log(`Dropped on canvas. Type detected: ${fieldType}`);

    if (fieldType && availableFieldTypes.value.some(f => f.type === fieldType)) {
        const newField = {
            id: Date.now() + Math.random(),
            key: `Trường mới ${builtSchemaFields.value.length + 1}`,
            type: fieldType,
            value: getDefaultValue(fieldType)
        };

        // NEW: Set default referenceType if the field is a reference
        if (fieldType === 'reference') {
            newField.referenceType = availableReferenceTypes.value[0]; // Default to the first type
        }

        builtSchemaFields.value.push(newField);
        console.log("Added new field:", newField);
    } else {
        console.warn("Invalid or no field type dropped.");
    }
    draggingFieldType.value = null;
    handleFieldDragEnd();
};

// Kéo Field bên trong Canvas (để sắp xếp lại)
const handleFieldDragStart = (event, index) => {
    draggingIndex.value = index;
    event.dataTransfer.effectAllowed = 'move';
    event.target.classList.add('dragging-field');
    console.log(`Start dragging field at index: ${index}`);
};

const handleFieldDragOver = (event, index) => {
    event.preventDefault();
    if (draggingIndex.value !== null && draggingIndex.value !== index) {
        dragOverIndex.value = index;
        event.dataTransfer.dropEffect = 'move';
    } else {
         dragOverIndex.value = null;
         event.dataTransfer.dropEffect = 'none';
    }
};

const handleFieldDrop = (event, targetIndex) => {
    event.preventDefault();
    console.log(`Drop field onto index: ${targetIndex}. Dragging index: ${draggingIndex.value}`);
    if (draggingIndex.value !== null && draggingIndex.value !== targetIndex) {
        const itemToMove = builtSchemaFields.value[draggingIndex.value];
        builtSchemaFields.value.splice(draggingIndex.value, 1);
        builtSchemaFields.value.splice(targetIndex, 0, itemToMove);
        console.log("Moved field. New order:", builtSchemaFields.value.map(f => f.key));
    }
    handleFieldDragEnd();
};

const handleFieldDragEnd = (event) => {
    if (event?.target) {
        event.target.classList.remove('dragging-field');
    }
    draggingIndex.value = null;
    dragOverIndex.value = null;
    console.log("Drag field end.");
};


// --- Field Management ---

const removeField = (fieldId) => {
    const indexToRemove = builtSchemaFields.value.findIndex(field => field.id === fieldId);
    if (indexToRemove > -1) {
        builtSchemaFields.value.splice(indexToRemove, 1);
        console.log(`Removed field with id: ${fieldId}`);
    }
};

// Helper lấy giá trị mặc định
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return '';
        case 'reference': return null; // Default value for reference is null (no selection)
        default: return '';
    }
};

// --- Modal Actions ---

const handleSaveSchema = () => {
    const finalSchema = {};
    let hasError = false;
    const seenKeys = new Set();

    for (const field of builtSchemaFields.value) {
        const key = field.key?.trim();
        if (key) {
            if (seenKeys.has(key)) {
                alert(`Lỗi: Nhãn trường (Key) "${key}" bị trùng lặp. Vui lòng sửa lại.`);
                hasError = true;
                break;
            }
            seenKeys.add(key);

            let finalValue = field.value;
            const fieldDefinition = { type: field.type }; // Start with type

            // Chuyển đổi kiểu dữ liệu chặt chẽ hơn khi lưu
            try {
                if (field.type === 'number') {
                    finalValue = field.value === '' || field.value === null ? null : parseFloat(field.value);
                    if (field.value !== '' && field.value !== null && isNaN(finalValue)) finalValue = 0;
                } else if (field.type === 'boolean') {
                    finalValue = Boolean(field.value);
                } else if (field.type === 'reference') {
                    // NEW: Add referenceType to the saved schema definition
                    if (!field.referenceType) {
                         console.warn(`Field "${key}" is of type 'reference' but has no referenceType selected. Defaulting to ${availableReferenceTypes.value[0]}`);
                         fieldDefinition.referenceType = availableReferenceTypes.value[0];
                    } else {
                         fieldDefinition.referenceType = field.referenceType;
                    }
                    // Value for reference is typically an ID, keep it as is (could be null)
                    finalValue = field.value; // Keep the value (likely null or a default ID if implemented)
                }
                // Các kiểu khác giữ nguyên (text, date, textarea, email, url)
            } catch (e) {
                 console.error(`Error processing value for key "${key}":`, e);
                 finalValue = getDefaultValue(field.type);
            }

            // Assign value and other properties (like referenceType)
            fieldDefinition.value = finalValue;
            finalSchema[key] = fieldDefinition;

        } else {
            console.warn("Skipping field without a key:", field);
            // alert("Cảnh báo: Có một trường chưa được đặt Nhãn (Key) và sẽ bị bỏ qua khi lưu.");
        }
    }

    if (!hasError) {
        console.log("Saving built schema:", finalSchema);
        emit('saveSchema', finalSchema);
    }
};

const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1000;
}
.modal-content {
    background-color: #fff; padding: 25px; border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.form-builder-modal {
    min-width: 700px; /* Increased width slightly */
    max-width: 90vw;
}

h2 {
    margin-top: 0; margin-bottom: 20px; color: #333; text-align: center;
}

.form-builder-layout {
    display: flex; gap: 20px; margin-top: 15px; margin-bottom: 20px;
    min-height: 350px;
}

.palette {
    width: 220px;
    border: 1px solid #e0e0e0; padding: 15px; background-color: #f9f9f9;
    border-radius: 4px; height: fit-content; flex-shrink: 0;
}

.palette h4 {
    margin-top: 0; margin-bottom: 10px; font-size: 0.95em; color: #444;
}

.palette-item {
    background-color: #e7f3ff; border: 1px solid #b3d7ff; padding: 8px 12px;
    margin-bottom: 8px; border-radius: 4px; cursor: grab; font-size: 0.9rem;
    text-align: center; transition: background-color 0.2s ease;
}
.palette-item:hover { background-color: #d0e8ff; }
.palette-item:active { cursor: grabbing; background-color: #b3d7ff; }

.form-builder-canvas {
    flex-grow: 1; border: 2px dashed #ccc; padding: 20px; border-radius: 4px;
    background-color: #fff; min-height: 350px; position: relative;
    overflow-y: auto;
}

.form-builder-canvas h4 {
     margin-top: 0; margin-bottom: 15px; font-size: 0.95em; color: #444;
}

.canvas-placeholder {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #aaa; font-style: italic; text-align: center;
}

.form-field-preview {
    background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 10px 12px;
    margin-bottom: 10px; border-radius: 4px; display: flex; align-items: center;
    gap: 8px; /* Slightly reduced gap */
    cursor: move; transition: background-color 0.1s ease;
}
.form-field-preview.dragging-field { opacity: 0.5; background-color: #e9ecef; }

.drag-handle {
    cursor: grab; color: #adb5bd; padding-right: 5px; font-size: 1.2em;
}
.form-field-preview:active .drag-handle { cursor: grabbing; }

.field-key-input {
    flex-grow: 1; padding: 5px 8px; border: 1px solid #ced4da;
    border-radius: 3px; font-size: 0.9rem; min-width: 100px;
}

.field-type-label {
    font-size: 0.8em; color: #6c757d; white-space: nowrap;
}

.field-value-input, .field-value-input-cb, .field-reference-type-select { /* Added select */
    padding: 5px 8px; border: 1px solid #ced4da; border-radius: 3px;
    font-size: 0.9rem; max-width: 150px; /* Adjusted max-width */
    background-color: white; /* Ensure select background is white */
    line-height: 1.3; /* Consistent line height */
    height: 2.2em; /* Consistent height */
    box-sizing: border-box; /* Include padding/border in height */
}
.field-value-input-cb {
     max-width: none; width: auto; margin-left: 5px; height: auto; /* Checkbox height is different */
}
textarea.field-value-input {
    max-width: 150px; /* Adjusted max-width */
    resize: none;
    height: 2.2em;
}
/* Specific style for the reference type dropdown */
.field-reference-type-select {
    max-width: 120px; /* Slightly smaller max-width for select */
    cursor: pointer;
}


.delete-field-btn {
    background: none; border: none; color: #dc3545; font-size: 1.4rem;
    cursor: pointer; padding: 0 5px; line-height: 1; margin-left: auto;
}
.delete-field-btn:hover { color: #a71d2a; }

.form-field-preview.drag-over {
    border-top: 3px solid #0d6efd;
    margin-top: -2px;
}

.modal-actions {
    margin-top: 25px; text-align: right; padding-top: 15px;
    border-top: 1px solid #eee;
}
.btn {
    padding: 10px 18px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 1rem; margin-left: 10px; transition: background-color 0.2s ease;
}
.btn-save { background-color: #198754; color: white; }
.btn-save:hover { background-color: #157347; }
.btn-cancel { background-color: #6c757d; color: white; }
.btn-cancel:hover { background-color: #5a6268; }
</style>
