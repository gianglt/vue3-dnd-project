<template>
    <div v-if="visible" class="data-entry-modal-overlay" @click.self="handleCancel">
        <div class="data-entry-modal-content">
            <h3>Nhập dữ liệu cho Bước Quy trình</h3>
            <form @submit.prevent="handleSave">
                <div v-if="!schema || Object.keys(schema).length === 0" class="no-schema-message">
                    Chưa có cấu hình form (schema) cho bước này. Vui lòng "Chỉnh sửa Schema" trước.
                </div>
                <div v-else class="form-fields">
                    <!-- Lặp qua các trường trong schema để tạo input -->
                    <div v-for="(fieldSchema, fieldKey) in schema" :key="fieldKey" class="form-group">
                        <label :for="'field-' + fieldKey">{{ fieldSchema.label || fieldKey }}:</label>

                        <!-- Input Text -->
                        <input v-if="!fieldSchema.type || fieldSchema.type === 'text'"
                               :id="'field-' + fieldKey"
                               type="text"
                               v-model="localFormData[fieldKey]"
                               :placeholder="fieldSchema.placeholder || ''"
                               :required="fieldSchema.required || false" />

                        <!-- Input Number -->
                        <input v-else-if="fieldSchema.type === 'number'"
                               :id="'field-' + fieldKey"
                               type="number"
                               v-model.number="localFormData[fieldKey]"
                               :placeholder="fieldSchema.placeholder || ''"
                               :required="fieldSchema.required || false" />

                        <!-- Input Checkbox (Boolean) -->
                        <input v-else-if="fieldSchema.type === 'boolean'"
                               :id="'field-' + fieldKey"
                               type="checkbox"
                               v-model="localFormData[fieldKey]"
                               class="form-checkbox" />

                        <!-- Input Date -->
                         <input v-else-if="fieldSchema.type === 'date'"
                               :id="'field-' + fieldKey"
                               type="date"
                               v-model="localFormData[fieldKey]"
                               :required="fieldSchema.required || false" />

                        <!-- Input Textarea -->
                        <textarea v-else-if="fieldSchema.type === 'textarea'"
                                  :id="'field-' + fieldKey"
                                  v-model="localFormData[fieldKey]"
                                  :placeholder="fieldSchema.placeholder || ''"
                                  :required="fieldSchema.required || false"
                                  rows="3">
                        </textarea>

                        <!-- Input Select -->
                        <select v-else-if="fieldSchema.type === 'select' && fieldSchema.options"
                                :id="'field-' + fieldKey"
                                v-model="localFormData[fieldKey]"
                                :required="fieldSchema.required || false">
                            <option disabled value="">-- Chọn --</option>
                            <option v-for="option in fieldSchema.options" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>

                        <!-- Fallback cho các type không hỗ trợ -->
                        <span v-else class="unsupported-field">
                            (Loại trường '{{ fieldSchema.type }}' chưa được hỗ trợ)
                        </span>

                        <!-- Hiển thị mô tả nếu có -->
                        <small v-if="fieldSchema.description" class="field-description">
                            {{ fieldSchema.description }}
                        </small>
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="button" @click="handleCancel">Hủy</button>
                    <!-- Chỉ bật nút Lưu nếu có schema -->
                    <button type="submit" :disabled="!schema || Object.keys(schema).length === 0">Lưu Dữ liệu</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
    visible: {
        type: Boolean,
        required: true,
    },
    schema: { // formSchemaDefinition
        type: Object,
        default: () => ({}),
    },
    initialData: { // formData
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits(['saveData', 'cancel']);

// Local state để chỉnh sửa data mà không ảnh hưởng trực tiếp đến props
const localFormData = ref({});

// Watcher để cập nhật localFormData khi modal mở hoặc initialData thay đổi
watch(() => [props.visible, props.initialData], ([newVisible, newInitialData]) => {
    if (newVisible) {
        // Tạo bản sao sâu của initialData để tránh thay đổi ngoài ý muốn
        try {
            localFormData.value = structuredClone(newInitialData || {});
        } catch (e) {
            // Fallback nếu structuredClone không được hỗ trợ hoặc lỗi
            console.warn("structuredClone failed, using JSON fallback for initial data.");
            localFormData.value = JSON.parse(JSON.stringify(newInitialData || {}));
        }
        // Đảm bảo tất cả các key trong schema đều tồn tại trong localFormData
        // và gán giá trị mặc định nếu thiếu
        if (props.schema) {
            for (const key in props.schema) {
                if (!(key in localFormData.value)) {
                    localFormData.value[key] = props.schema[key]?.value ?? getDefaultValue(props.schema[key]?.type);
                }
            }
        }

    }
}, { immediate: true, deep: true }); // immediate để chạy lần đầu, deep để theo dõi thay đổi sâu trong initialData

// Helper lấy giá trị mặc định dựa trên type
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null
        case 'select': return ''; // Giá trị mặc định cho select
        default: return '';
    }
};

const handleSave = () => {
    // Tạo bản sao sâu của dữ liệu đã chỉnh sửa trước khi emit
    let dataToSave;
     try {
        dataToSave = structuredClone(localFormData.value);
     } catch(e) {
        console.warn("structuredClone failed, using JSON fallback for saving data.");
        dataToSave = JSON.parse(JSON.stringify(localFormData.value));
     }
    emit('saveData', dataToSave);
};

const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
.data-entry-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000; /* Đảm bảo modal nổi lên trên */
}

.data-entry-modal-content {
    background-color: white;
    padding: 25px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    width: 90%;
    max-width: 550px; /* Giới hạn chiều rộng tối đa */
    max-height: 80vh; /* Giới hạn chiều cao tối đa */
    display: flex;
    flex-direction: column;
}

.data-entry-modal-content h3 {
    margin-top: 0;
    margin-bottom: 20px;
    color: #333;
    text-align: center;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
}

.form-fields {
    overflow-y: auto; /* Cho phép cuộn nếu nội dung dài */
    margin-bottom: 20px;
    padding-right: 10px; /* Khoảng đệm nhỏ cho thanh cuộn */
}

.no-schema-message {
    text-align: center;
    color: #888;
    padding: 20px;
    border: 1px dashed #ccc;
    border-radius: 4px;
    margin-bottom: 20px;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
    color: #555;
    font-size: 0.9em;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="date"],
.form-group textarea,
.form-group select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box; /* Quan trọng để padding không làm tăng kích thước */
    font-size: 0.95em;
}
.form-group input[type="checkbox"] {
    margin-right: 5px;
    vertical-align: middle;
}
.form-checkbox {
    width: auto; /* Reset width cho checkbox */
    margin-left: 5px;
}

.form-group textarea {
    resize: vertical; /* Cho phép thay đổi kích thước theo chiều dọc */
}

.field-description {
    display: block;
    font-size: 0.8em;
    color: #777;
    margin-top: 3px;
}

.unsupported-field {
    color: #999;
    font-style: italic;
    font-size: 0.9em;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: auto; /* Đẩy nút xuống dưới cùng */
    padding-top: 15px;
    border-top: 1px solid #eee;
}

.modal-actions button {
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95em;
    transition: background-color 0.2s ease;
}

.modal-actions button[type="submit"] {
    background-color: #007bff;
    color: white;
}
.modal-actions button[type="submit"]:hover {
    background-color: #0056b3;
}
.modal-actions button[type="submit"]:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
}


.modal-actions button[type="button"] {
    background-color: #f0f0f0;
    color: #333;
    border: 1px solid #ccc;
}
.modal-actions button[type="button"]:hover {
    background-color: #e0e0e0;
}
</style>
