<template>
    <div v-if="visible" class="data-entry-modal-overlay" @click.self="handleCancel">
        <div class="data-entry-modal-content">
            <h3>Nhập dữ liệu cho Bước Quy trình</h3>

            <!-- Thêm class="modal-form" vào thẻ form -->
            <form @submit.prevent="handleSave" class="modal-form">
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

                        <!-- Input Select (Standard) -->
                        <select v-else-if="fieldSchema.type === 'select' && fieldSchema.options"
                                :id="'field-' + fieldKey"
                                v-model="localFormData[fieldKey]"
                                :required="fieldSchema.required || false">
                            <option disabled value="">-- Chọn --</option>
                            <option v-for="option in fieldSchema.options" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>

                        <!-- Input Select (Reference) -->
                        <select v-else-if="fieldSchema.type === 'reference' && fieldSchema.referenceType"
                                :id="'field-' + fieldKey"
                                v-model="localFormData[fieldKey]"
                                :required="fieldSchema.required || false"
                                :disabled="isLoadingReference[fieldSchema.referenceType] || !referenceData[fieldSchema.referenceType]">
                            <option disabled value="">
                                {{ isLoadingReference[fieldSchema.referenceType] ? 'Đang tải...' : '-- Chọn --' }}
                            </option>
                            <!-- Assume reference data items have 'id' and 'name' -->
                            <option v-for="item in referenceData[fieldSchema.referenceType]" :key="item.id" :value="item.id">
                                {{ item.name }}
                            </option>
                             <option v-if="!isLoadingReference[fieldSchema.referenceType] && (!referenceData[fieldSchema.referenceType] || referenceData[fieldSchema.referenceType]?.length === 0)" disabled value="">
                                (Không có dữ liệu)
                            </option>
                        </select>
                        <div v-if="fieldSchema.type === 'reference' && loadError[fieldSchema.referenceType]" class="reference-error">
                            Lỗi tải dữ liệu: {{ loadError[fieldSchema.referenceType] }}
                        </div>


                        <!-- Fallback cho các type không hỗ trợ -->
                        <span v-else-if="fieldSchema.type !== 'select' && fieldSchema.type !== 'reference'" class="unsupported-field">
                            (Loại trường '{{ fieldSchema.type }}' chưa được hỗ trợ)
                        </span>
                         <!-- Handle cases where select/reference is defined but missing options/referenceType -->
                         <span v-else-if="fieldSchema.type === 'select' && !fieldSchema.options" class="unsupported-field">
                            (Thiếu 'options' cho trường select)
                         </span>
                         <span v-else-if="fieldSchema.type === 'reference' && !fieldSchema.referenceType" class="unsupported-field">
                            (Thiếu 'referenceType' cho trường reference)
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
                    <button type="submit" :disabled="!schema || Object.keys(schema).length === 0 || isAnyReferenceLoading">Lưu Dữ liệu</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch,  computed, reactive } from 'vue';

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
// State để lưu trữ dữ liệu tham chiếu đã tải
const referenceData = ref({});
// State để theo dõi trạng thái tải của từng loại tham chiếu
const isLoadingReference = reactive({});
// State để lưu lỗi tải của từng loại tham chiếu
const loadError = reactive({});

// Helper function to get the JSON file path based on reference type
// Note: Assumes files are in the public/data directory
const getReferenceDataPath = (type) => {
    if (!type) return null;
    // Simple mapping for known types, adjust as needed
    const typeMap = {
        'Customer': 'customers',
        'Employee': 'employees',
        'DocumentType': 'documentTypes',
        // Add other types here
    };
    const fileName = typeMap[type];
    return fileName ? `/data/${fileName}.json` : null;
};

// Function to load reference data
const loadReferenceData = async (type) => {
    if (!type || referenceData.value[type] || isLoadingReference[type]) {
        // Already loaded, loading, or invalid type
        return;
    }

    const path = getReferenceDataPath(type);
    if (!path) {
        console.error(`Invalid referenceType or no path defined for: ${type}`);
        loadError[type] = `Loại tham chiếu không hợp lệ: ${type}`;
        return;
    }

    isLoadingReference[type] = true;
    loadError[type] = null; // Clear previous error
    console.log(`Loading reference data for ${type} from ${path}...`);

    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Ensure data is an array
        referenceData.value[type] = Array.isArray(data) ? data : [];
        console.log(`Successfully loaded data for ${type}:`, referenceData.value[type]);
    } catch (error) {
        console.error(`Failed to load reference data for ${type} from ${path}:`, error);
        loadError[type] = error.message || 'Không thể tải dữ liệu.';
        referenceData.value[type] = []; // Set to empty array on error
    } finally {
        isLoadingReference[type] = false;
    }
};

// Watcher để cập nhật localFormData và tải reference data khi modal mở
watch(() => props.visible, async (newVisible) => {
    if (newVisible) {
        // --- Initialize localFormData ---
        try {
            // Sử dụng structuredClone để tạo bản sao sâu, tránh thay đổi trực tiếp props.initialData
            localFormData.value = structuredClone(props.initialData || {});
        } catch (e) {
            // Fallback nếu structuredClone không được hỗ trợ (rất hiếm)
            console.warn("structuredClone failed, using JSON fallback for initial data.");
            localFormData.value = JSON.parse(JSON.stringify(props.initialData || {}));
        }

        const dataLoadPromises = [];
        if (props.schema) {
            for (const key in props.schema) {
                 // Initialize missing keys in localFormData với giá trị mặc định từ schema hoặc type
                if (!(key in localFormData.value)) {
                    // Ưu tiên giá trị 'value' trong schema, nếu không có thì dùng getDefaultValue
                    localFormData.value[key] = props.schema[key]?.value ?? getDefaultValue(props.schema[key]?.type);
                }
                // --- Trigger reference data loading ---
                const fieldSchema = props.schema[key];
                if (fieldSchema?.type === 'reference' && fieldSchema.referenceType) {
                    // Chỉ load nếu chưa có dữ liệu và chưa đang load
                    if (!referenceData.value[fieldSchema.referenceType] && !isLoadingReference[fieldSchema.referenceType]) {
                       dataLoadPromises.push(loadReferenceData(fieldSchema.referenceType));
                    } else if (!isLoadingReference[fieldSchema.referenceType]) {
                        // Đảm bảo trạng thái loading là false nếu dữ liệu đã có sẵn
                        isLoadingReference[fieldSchema.referenceType] = false;
                        loadError[fieldSchema.referenceType] = null; // Xóa lỗi cũ nếu dữ liệu đã tồn tại
                    }
                }
            }
        }
        // Chờ tất cả các promise load data hoàn thành (mặc dù hàm loadReferenceData không trả về promise trực tiếp,
        // nhưng việc gọi await Promise.all vẫn hữu ích để đảm bảo tất cả các lệnh gọi bất đồng bộ được khởi chạy)
        if (dataLoadPromises.length > 0) {
            // Lưu ý: Promise.all ở đây chỉ đảm bảo các hàm async loadReferenceData được gọi.
            // Trạng thái loading thực tế được quản lý bởi isLoadingReference.
            await Promise.all(dataLoadPromises);
            console.log("All required reference data loading initiated.");
        }

    } else {
         // Optional: Xóa lỗi khi đóng modal
         Object.keys(loadError).forEach(key => loadError[key] = null);
         // Không xóa referenceData ở đây để cache cho lần mở modal tiếp theo
    }
}, { immediate: true }); // immediate: true để chạy ngay khi component mount nếu visible=true

// Watch sự thay đổi của initialData khi modal đang mở (ví dụ: dữ liệu được cập nhật từ bên ngoài)
watch(() => props.initialData, (newInitialData) => {
    if (props.visible) {
         try {
            localFormData.value = structuredClone(newInitialData || {});
        } catch (e) {
            console.warn("structuredClone failed, using JSON fallback for initial data.");
            localFormData.value = JSON.parse(JSON.stringify(newInitialData || {}));
        }
         // Đảm bảo các giá trị mặc định cho các key trong schema mà không có trong initialData mới
         if (props.schema) {
            for (const key in props.schema) {
                if (!(key in localFormData.value)) {
                    localFormData.value[key] = props.schema[key]?.value ?? getDefaultValue(props.schema[key]?.type);
                }
            }
        }
    }
}, { deep: true }); // deep: true để theo dõi sâu các thay đổi trong object initialData


// Helper lấy giá trị mặc định dựa trên type
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return ''; // Hoặc null tùy yêu cầu
        case 'select': return ''; // Giá trị mặc định cho select
        case 'reference': return ''; // Giá trị mặc định cho reference select
        case 'textarea': return '';
        case 'text': return '';
        default: return ''; // Mặc định là chuỗi rỗng
    }
};

// Computed property để kiểm tra xem có bất kỳ reference data nào đang tải không
const isAnyReferenceLoading = computed(() => {
    return Object.values(isLoadingReference).some(loading => loading);
});


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
    z-index: 1000;
}

.data-entry-modal-content {
    background-color: white;
    padding: 25px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    width: 90%;
    max-width: 550px;
    max-height: 80vh; /* Giới hạn chiều cao tổng thể */
    display: flex;
    flex-direction: column; /* Chồng các con trực tiếp (h3, form) */
    overflow: hidden; /* Ngăn modal content bị tràn nếu có lỗi layout */
}

.data-entry-modal-content h3 {
    margin-top: 0;
    margin-bottom: 20px;
    color: #333;
    text-align: center;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
    flex-shrink: 0; /* Không co lại */
}

/* --- Áp dụng flex cho thẻ form --- */
.modal-form { /* Class này được thêm vào thẻ <form> trong template */
    display: flex;
    flex-direction: column; /* Chồng các con của form (form-fields, modal-actions) */
    flex-grow: 1; /* Cho phép form chiếm không gian còn lại trong modal-content */
    overflow: hidden; /* Ngăn form tự tạo scrollbar */
    min-height: 0; /* Quan trọng cho flex lồng nhau để tính toán đúng không gian */
}

/* --- Khu vực nội dung form có thể cuộn --- */
.form-fields {
    overflow-y: auto; /* Cho phép cuộn dọc KHI CẦN */
    padding-right: 10px; /* Khoảng đệm cho thanh cuộn */
    flex-grow: 1; /* Cho phép form-fields chiếm không gian còn lại TRONG FORM */
    min-height: 100px; /* Chiều cao tối thiểu */
    padding-bottom: 10px; /* Thêm chút khoảng đệm dưới cùng của vùng cuộn */
}

.no-schema-message {
    text-align: center;
    color: #888;
    padding: 20px;
    border: 1px dashed #ccc;
    border-radius: 4px;
    margin: auto; /* Căn giữa nếu không có trường nào */
}

.form-group {
    margin-bottom: 15px;
}

.form-group:last-child {
    margin-bottom: 0; /* Xóa margin dưới của group cuối cùng trong vùng cuộn */
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
    box-sizing: border-box;
    font-size: 0.95em;
    background-color: #fff;
}
.form-group select:disabled {
    background-color: #e9ecef;
    cursor: not-allowed;
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
    resize: vertical; /* Cho phép thay đổi kích thước dọc */
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
    display: block;
    margin-top: 5px;
}

.reference-error {
    color: #dc3545; /* Màu đỏ báo lỗi */
    font-size: 0.8em;
    margin-top: 4px;
}

/* --- Khu vực nút bấm luôn cố định ở dưới --- */
.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 15px; /* Khoảng cách với form-fields */
    border-top: 1px solid #eee;
    flex-shrink: 0; /* Không co lại */
    margin-top: auto; /* Đẩy actions xuống dưới cùng của .modal-form */
}

.modal-actions button {
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95em;
    transition: background-color 0.2s ease, opacity 0.2s ease;
}

.modal-actions button[type="submit"] {
    background-color: #007bff;
    color: white;
}
.modal-actions button[type="submit"]:hover:not(:disabled) {
    background-color: #0056b3;
}
.modal-actions button[type="submit"]:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
    opacity: 0.7;
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
