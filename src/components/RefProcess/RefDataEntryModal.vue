<template>
    <div v-if="visible" class="data-entry-modal-overlay" @click.self="handleCancel">
        <div class="data-entry-modal-content">
            <h3>Nhập dữ liệu cho Bước Quy trình</h3>

            <!-- Display general error from Pinia store (loading definitions) -->
            <div v-if="referenceTypesError" class="api-error-message">
                Lỗi tải cấu hình loại tham chiếu: {{ referenceTypesError }}. Vui lòng kiểm tra cấu hình hoặc thử lại.
            </div>

            <!-- Tab Navigation -->
            <div v-if="isValidSchema" class="modal-tabs">
                <button v-for="(tab) in schema.tabs" :key="tab.id" @click="activeTabId = tab.id"
                    :class="{ active: activeTabId === tab.id }" class="tab-button">
                    {{ tab.label }}
                </button>
            </div>
            <div v-else-if="schema && (!schema.tabs || schema.tabs.length === 0)" class="no-schema-message">
                Cấu hình form không hợp lệ (thiếu tabs). Vui lòng kiểm tra lại Schema.
            </div>
            <div v-else class="no-schema-message">
                Chưa có cấu hình form (schema) cho bước này. Vui lòng "Chỉnh sửa Schema" trước.
            </div>


            <!-- Form Content based on Active Tab -->
            <form @submit.prevent="handleSave" class="modal-form">
                <div class="form-fields">
                    <!-- Loop through tabs -->
                    <template v-for="tab in schema?.tabs" :key="tab.id">
                        <!-- Show fields only for the active tab -->
                        <div v-if="activeTabId === tab.id && tab.fields && Object.keys(tab.fields).length > 0"
                            class="active-tab-fields">
                            <!-- Loop through fields in the active tab -->
                            <div v-for="(fieldSchema, fieldKey) in tab.fields" :key="fieldKey" class="form-group">
                                <label :for="'field-' + fieldKey">
                                    {{ fieldSchema.label || fieldKey }}
                                    <span v-if="fieldSchema.required" class="required-indicator">*</span>:
                                </label>

                                <!-- Input Text -->
                                <input
                                    v-if="!fieldSchema.type || fieldSchema.type === 'text' || fieldSchema.type === 'email' || fieldSchema.type === 'url'"
                                    :id="'field-' + fieldKey"
                                    :type="fieldSchema.type === 'email' ? 'email' : (fieldSchema.type === 'url' ? 'url' : 'text')"
                                    v-model="localFormData[fieldKey]" :placeholder="fieldSchema.placeholder || ''"
                                    :required="fieldSchema.required || false" />

                                <!-- Input Number -->
                                <input v-else-if="fieldSchema.type === 'number'" :id="'field-' + fieldKey" type="number"
                                    v-model.number="localFormData[fieldKey]"
                                    :placeholder="fieldSchema.placeholder || ''"
                                    :required="fieldSchema.required || false" />

                                <!-- Input Checkbox (Boolean) -->
                                <input v-else-if="fieldSchema.type === 'boolean'" :id="'field-' + fieldKey"
                                    type="checkbox" v-model="localFormData[fieldKey]" class="form-checkbox" />

                                <!-- Input Date -->
                                <input v-else-if="fieldSchema.type === 'date'" :id="'field-' + fieldKey" type="date"
                                    v-model="localFormData[fieldKey]" :required="fieldSchema.required || false" />

                                <!-- Input Textarea -->
                                <textarea v-else-if="fieldSchema.type === 'textarea'" :id="'field-' + fieldKey"
                                    v-model="localFormData[fieldKey]" :placeholder="fieldSchema.placeholder || ''"
                                    :required="fieldSchema.required || false" rows="3">
                                </textarea>

                                <!-- Input Select (Standard) -->
                                <select v-else-if="fieldSchema.type === 'select' && fieldSchema.options"
                                    :id="'field-' + fieldKey" v-model="localFormData[fieldKey]"
                                    :required="fieldSchema.required || false">
                                    <option disabled value="">-- Chọn --</option>
                                    <option v-for="option in fieldSchema.options" :key="option.value"
                                        :value="option.value">
                                        {{ option.label }}
                                    </option>
                                </select>

                                <!-- Input Select (Reference) - Updated -->
                                <template v-else-if="fieldSchema.type === 'reference' && fieldSchema.referenceType">
                                    <select
                                        :id="'field-' + fieldKey"
                                        v-model="localFormData[fieldKey]"
                                        :required="fieldSchema.required || false"
                                        :disabled="isLoadingReferenceTypes || isLoadingReference[fieldSchema.referenceType] || !referenceData[fieldSchema.referenceType]">
                                        <option disabled value="">
                                            {{ isLoadingReferenceTypes ? 'Đang tải cấu hình...' : (isLoadingReference[fieldSchema.referenceType] ? 'Đang tải dữ liệu...' : '-- Chọn --') }}
                                        </option>
                                        <!-- Assume reference data items have 'id' and a display field -->
                                        <option v-for="item in referenceData[fieldSchema.referenceType]" :key="item.id"
                                            :value="item.id">
                                            {{ item.name || item.label || item.title || item.id }} <!-- Fallback display -->
                                        </option>
                                        <option
                                            v-if="!isLoadingReferenceTypes && !isLoadingReference[fieldSchema.referenceType] && (!referenceData[fieldSchema.referenceType] || referenceData[fieldSchema.referenceType]?.length === 0)"
                                            disabled value="">
                                            (Không có dữ liệu)
                                        </option>
                                    </select>
                                    <!-- Error specific to loading data for this reference type -->
                                    <div v-if="loadError[fieldSchema.referenceType]" class="reference-error">
                                        Lỗi tải dữ liệu {{ fieldSchema.referenceType }}: {{ loadError[fieldSchema.referenceType] }}
                                    </div>
                                    <!-- Error if the reference type itself is invalid (not found in store) -->
                                    <div v-if="!isLoadingReferenceTypes && !referenceTypesStore.getUrlByName(fieldSchema.referenceType)"
                                        class="reference-error">
                                        Lỗi: Loại tham chiếu '{{ fieldSchema.referenceType }}' không hợp lệ hoặc chưa được cấu hình.
                                    </div>
                                </template>


                                <!-- Fallback/Error Messages -->
                                <span v-else-if="fieldSchema.type === 'select' && !fieldSchema.options"
                                    class="unsupported-field">
                                    (Thiếu 'options' cho trường select)
                                </span>
                                <span v-else-if="fieldSchema.type === 'reference' && !fieldSchema.referenceType"
                                    class="unsupported-field">
                                    (Thiếu 'referenceType' cho trường reference)
                                </span>
                                <span
                                    v-else-if="!['text', 'email', 'url', 'number', 'boolean', 'date', 'textarea', 'select', 'reference'].includes(fieldSchema.type)"
                                    class="unsupported-field">
                                    (Loại trường '{{ fieldSchema.type }}' chưa được hỗ trợ)
                                </span>

                                <!-- Description -->
                                <small v-if="fieldSchema.description" class="field-description">
                                    {{ fieldSchema.description }}
                                </small>
                            </div>
                        </div>
                        <div v-else-if="activeTabId === tab.id && (!tab.fields || Object.keys(tab.fields).length === 0)"
                            class="no-fields-in-tab">
                            Tab này không có trường dữ liệu nào được cấu hình.
                        </div>
                    </template>
                </div>

                <div class="modal-actions">
                    <button type="button" @click="handleCancel">Hủy</button>
                    <!-- Disable save if schema is invalid or any loading is happening -->
                    <button type="submit"
                        :disabled="!isValidSchema || isAnyReferenceLoading || isLoadingReferenceTypes">Lưu
                        Dữ liệu</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, computed, reactive } from 'vue';
import { storeToRefs } from 'pinia';
import { useReferenceTypesStore } from '@/stores/referenceTypes'; // Import store

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const props = defineProps({
    visible: {
        type: Boolean,
        required: true,
    },
    schema: { // Expected structure: { tabs: [ { id, label, fields: { key: { type, label, value, ... } } } ] }
        type: Object,
        default: () => ({ tabs: [] }),
    },
    initialData: { // formData remains flat: { fieldKey1: value1, fieldKey2: value2, ... }
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits(['saveData', 'cancel']);

// --- Pinia Store Integration ---
const referenceTypesStore = useReferenceTypesStore();
const {
    // definitions, // Không cần definitions trực tiếp ở đây, dùng getter
    isLoading: isLoadingReferenceTypes, // Loading state for the definitions themselves
    error: referenceTypesError,         // Error state for loading definitions
} = storeToRefs(referenceTypesStore);
// Lấy action fetchTypes từ store, đổi tên cho rõ ràng
const { fetchTypes: fetchReferenceTypeDefinitions } = referenceTypesStore;

// --- Local State ---
const localFormData = ref({});
// Cache cho dữ liệu tham chiếu đã fetch: { referenceType: [data] }
const referenceData = ref({});
// Trạng thái loading cho từng loại tham chiếu: { referenceType: boolean }
const isLoadingReference = reactive({});
// Trạng thái lỗi cho từng loại tham chiếu: { referenceType: string | null }
const loadError = reactive({});
// ID của tab đang active
const activeTabId = ref(null);

// --- Computed Properties ---
// Kiểm tra xem có bất kỳ dữ liệu tham chiếu nào đang được load không
const isAnyReferenceLoading = computed(() => {
    return Object.values(isLoadingReference).some(loading => loading);
});

// Kiểm tra schema có hợp lệ để hiển thị không
const isValidSchema = computed(() => {
    return props.schema && Array.isArray(props.schema.tabs) && props.schema.tabs.length > 0 && props.schema.tabs[0]?.id;
});

// --- Helper Functions ---
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return null;
        case 'boolean': return false;
        case 'date': return '';
        case 'select': return '';
        case 'reference': return ''; // Hoặc null, tùy thuộc vào cách bạn muốn xử lý giá trị rỗng
        case 'textarea': return '';
        case 'text':
        case 'email':
        case 'url':
        default: return '';
    }
};

// --- Data Loading (Refactored) ---
/**
 * Loads data for a specific reference type using the URL from the Pinia store.
 * @param {string} type - The name of the reference type (e.g., 'customers').
 */
const loadReferenceData = async (type) => {
    // 1. Guard Clauses: Exit early if conditions aren't met
    if (!type) {
        console.warn("loadReferenceData called with no type.");
        return;
    }
    // Don't load if definitions are still loading or failed
    if (isLoadingReferenceTypes.value) {
        console.log(`Skipping load for ${type}: Reference type definitions still loading.`);
        return;
    }
    if (referenceTypesError.value) {
        console.log(`Skipping load for ${type}: Error loading reference type definitions.`);
        // Optionally set a local error if needed, but the general error is already shown
        // loadError[type] = "Không thể tải cấu hình tham chiếu.";
        return;
    }
    // Don't load if already loaded or currently loading this specific type
    if (referenceData.value[type] || isLoadingReference[type]) {
        // console.log(`Skipping load for ${type}: Already loaded or loading.`);
        return;
    }

    // 2. Get URL from Pinia Store
    const apiUrlPath = referenceTypesStore.getUrlByName(type); // Use the getter

    if (!apiUrlPath) {
        console.error(`Invalid referenceType or URL not found in store for: ${type}`);
        loadError[type] = `Loại tham chiếu '${type}' không hợp lệ hoặc URL không được cấu hình.`;
        isLoadingReference[type] = false;
        referenceData.value[type] = []; // Ensure empty array on error
        return;
    }

    // 3. Construct Full URL
    // Ensure API_BASE_URL is set and handle potential double slashes
    if (!API_BASE_URL && !apiUrlPath.startsWith('http')) {
         console.error(`API_BASE_URL is not set, cannot construct full URL for relative path: ${apiUrlPath}`);
         loadError[type] = `Lỗi cấu hình: API Base URL chưa được thiết lập cho đường dẫn ${apiUrlPath}.`;
         isLoadingReference[type] = false;
         referenceData.value[type] = [];
         return;
    }
    const fullUrl = apiUrlPath.startsWith('http')
        ? apiUrlPath // If it's already a full URL
        : `${API_BASE_URL}${apiUrlPath.startsWith('/') ? '' : '/'}${apiUrlPath}`;


    // 4. Fetch Data
    isLoadingReference[type] = true;
    loadError[type] = null;
    console.log(`Loading reference data for ${type} from ${fullUrl}...`);

    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        const data = await response.json();

        // Basic validation: expect an array, assume items have 'id' and a display field
        if (Array.isArray(data)) {
             // Map data to ensure 'id' and a display field ('name', 'label', 'title', fallback to 'id')
             referenceData.value[type] = data.map(item => ({
                 id: item.id, // Assume 'id' exists and is the value
                 name: item.name || item.label || item.title || item.id // Display field fallback
             })).filter(item => item.id !== undefined && item.id !== null); // Ensure items have an ID

             if(referenceData.value[type].length !== data.length){
                 console.warn(`Filtered out some items for ${type} due to missing 'id'.`);
             }

        } else {
             console.warn(`Data fetched for ${type} from ${fullUrl} is not an array:`, data);
             referenceData.value[type] = [];
             throw new Error("Dữ liệu trả về không phải là danh sách.");
        }

        console.log(`Successfully loaded data for ${type}:`, referenceData.value[type].length, "items");

    } catch (error) {
        console.error(`Failed to load reference data for ${type} from ${fullUrl}:`, error);
        loadError[type] = error.message || 'Không thể tải dữ liệu.';
        referenceData.value[type] = []; // Clear data on error

    } finally {
        isLoadingReference[type] = false;
    }
};

// --- Watchers ---
// Watch for modal visibility to initialize data and load references
watch(() => props.visible, async (newVisible) => {
    if (newVisible) {
        console.log("Data Entry Modal became visible. Initializing...");
        // --- 1. Ensure Reference Type Definitions are loaded ---
        // Call the store's action. It will only fetch if needed.
        await fetchReferenceTypeDefinitions();

        // --- 2. Check for errors after fetching definitions ---
        if (referenceTypesError.value) {
            console.error("Cannot initialize form: Failed to load reference type definitions from store.");
            // Reset local state related to form display
            activeTabId.value = null;
            localFormData.value = {};
            // Clear any potentially stale reference data/errors
            referenceData.value = {};
            Object.keys(isLoadingReference).forEach(key => isLoadingReference[key] = false);
            Object.keys(loadError).forEach(key => loadError[key] = null);
            return; // Stop initialization
        }
        console.log("Reference type definitions loaded or already available.");

        // --- 3. Initialize localFormData and Trigger Data Loading ---
        const initialDataCopy = JSON.parse(JSON.stringify(props.initialData || {}));
        const newLocalFormData = {};
        const dataLoadPromises = []; // Keep track of load initiations if needed

        if (isValidSchema.value) {
            props.schema.tabs.forEach(tab => {
                if (tab.fields) {
                    for (const fieldKey in tab.fields) {
                        const fieldSchema = tab.fields[fieldKey];

                        // Set initial value for the field
                        newLocalFormData[fieldKey] = initialDataCopy.hasOwnProperty(fieldKey)
                            ? initialDataCopy[fieldKey]
                            : (fieldSchema.hasOwnProperty('value') ? fieldSchema.value : getDefaultValue(fieldSchema.type));

                        // Trigger reference data loading if it's a reference field
                        if (fieldSchema?.type === 'reference' && fieldSchema.referenceType) {
                            // Reset loading/error state for this specific type for this modal instance
                            isLoadingReference[fieldSchema.referenceType] = false;
                            loadError[fieldSchema.referenceType] = null;
                            // Initiate loading (loadReferenceData handles internal checks)
                            // No need to push to promises unless you specifically need to await *initiation*
                            loadReferenceData(fieldSchema.referenceType);
                        }
                    }
                }
            });
            // Set the active tab to the first tab's ID
            activeTabId.value = props.schema.tabs[0].id;
            console.log("Form data initialized, active tab set:", activeTabId.value);
        } else {
            console.warn("Modal opened with invalid or empty schema structure.");
            activeTabId.value = null; // No active tab if schema is invalid
        }

        localFormData.value = newLocalFormData; // Assign the built object

        console.log("Initialization complete. Reference data loading triggered where necessary.");

    } else {
        // Reset state when modal closes
        console.log("Data Entry Modal closed. Resetting state.");
        Object.keys(loadError).forEach(key => loadError[key] = null);
        Object.keys(isLoadingReference).forEach(key => isLoadingReference[key] = false);
        activeTabId.value = null;
        localFormData.value = {}; // Clear form data
        // Decide whether to clear the referenceData cache on close
        // referenceData.value = {}; // Uncomment to clear cache on close
    }
}, { immediate: true }); // Run immediately if modal starts visible

// Watch for external changes in initialData while modal is open
watch(() => props.initialData, (newInitialData) => {
    // Update only if modal is visible, schema is valid, and definitions loaded ok
    if (props.visible && isValidSchema.value && !referenceTypesError.value) {
        console.log("Initial data prop changed while modal is open, updating local form data...");
        const initialDataCopy = JSON.parse(JSON.stringify(newInitialData || {}));
        const updatedLocalFormData = { ...localFormData.value }; // Start with existing local data

        props.schema.tabs.forEach(tab => {
            if (tab.fields) {
                for (const fieldKey in tab.fields) {
                    const fieldSchema = tab.fields[fieldKey];
                    // Update if the key exists in the new initial data
                    if (initialDataCopy.hasOwnProperty(fieldKey)) {
                        updatedLocalFormData[fieldKey] = initialDataCopy[fieldKey];
                    }
                    // Ensure keys from schema exist, even if not in newInitialData (use default if missing)
                    // This prevents fields disappearing if initialData is incomplete
                    else if (!updatedLocalFormData.hasOwnProperty(fieldKey)) {
                        updatedLocalFormData[fieldKey] = fieldSchema.hasOwnProperty('value')
                            ? fieldSchema.value
                            : getDefaultValue(fieldSchema.type);
                    }
                }
            }
        });
        localFormData.value = updatedLocalFormData;
    }
}, { deep: true });


// --- Event Handlers ---
const handleSave = () => {
    // Prevent saving if definitions or specific data are loading
    if (isLoadingReferenceTypes.value || isAnyReferenceLoading.value) {
        alert("Vui lòng đợi tất cả dữ liệu tham chiếu tải xong.");
        return;
    }
    // Prevent saving if schema is invalid
    if (!isValidSchema.value) {
        alert("Cấu trúc form không hợp lệ, không thể lưu.");
        return;
    }

    // Deep clone data before emitting
    const dataToSave = JSON.parse(JSON.stringify(localFormData.value));

    // Optional: Add validation logic here based on schema.required before emitting
    // e.g., loop through active tab fields, check required, show alert if needed

    console.log("Saving data:", dataToSave);
    emit('saveData', dataToSave);
};

const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
/* --- Base Modal Styles --- */
.data-entry-modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1000;
}
.data-entry-modal-content {
    background-color: white; padding: 25px; border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); width: 90%;
    max-width: 600px; max-height: 85vh; display: flex;
    flex-direction: column; overflow: hidden;
}
.data-entry-modal-content h3 {
    margin-top: 0; margin-bottom: 15px; color: #333; text-align: center;
    border-bottom: 1px solid #eee; padding-bottom: 10px; flex-shrink: 0;
}

/* --- API Error Message --- */
.api-error-message {
    background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;
    padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9em;
}

/* --- Tab Styles --- */
.modal-tabs {
    display: flex; flex-wrap: wrap; margin-bottom: 15px;
    border-bottom: 1px solid #ccc; flex-shrink: 0;
}
.tab-button {
    padding: 10px 15px; cursor: pointer; border: none; background-color: #f1f1f1;
    border-bottom: 1px solid #ccc; margin-bottom: -1px; font-size: 0.95em;
    color: #555; transition: background-color 0.2s ease, color 0.2s ease;
    border-top-left-radius: 4px; border-top-right-radius: 4px;
}
.tab-button:hover { background-color: #e0e0e0; }
.tab-button.active {
    background-color: #fff; border: 1px solid #ccc; border-bottom: 1px solid #fff;
    color: #007bff; font-weight: bold;
}

/* --- Form Layout --- */
.modal-form {
    display: flex; flex-direction: column; flex-grow: 1;
    overflow: hidden; min-height: 0;
}
.form-fields {
    overflow-y: auto; padding-right: 10px; flex-grow: 1;
    min-height: 150px; padding-bottom: 10px; margin-right: -10px;
}
.active-tab-fields { padding-top: 10px; }
.no-schema-message, .no-fields-in-tab {
    text-align: center; color: #888; padding: 20px; border: 1px dashed #ccc;
    border-radius: 4px; margin: 10px 0;
}
.no-fields-in-tab { margin-top: 20px; font-style: italic; }

/* --- Form Group & Fields --- */
.form-group { margin-bottom: 18px; }
.form-group:last-child { margin-bottom: 0; }
.form-group label {
    display: block; margin-bottom: 6px; font-weight: bold;
    color: #555; font-size: 0.9em;
}
.required-indicator { color: #dc3545; margin-left: 2px; }
.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="date"],
.form-group input[type="email"],
.form-group input[type="url"],
.form-group textarea,
.form-group select {
    width: 100%; padding: 9px 12px; border: 1px solid #ccc; border-radius: 4px;
    box-sizing: border-box; font-size: 0.95em; background-color: #fff;
    transition: border-color 0.2s ease, background-color 0.2s ease;
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
    border-color: #86b7fe; outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
}
.form-group select:disabled {
    background-color: #e9ecef; cursor: not-allowed; opacity: 0.7;
}
.form-group input[type="checkbox"] {
    margin-right: 5px; vertical-align: middle; width: auto;
    height: 1.1em; width: 1.1em;
}
.form-group textarea { resize: vertical; min-height: 60px; }
.field-description {
    display: block; font-size: 0.8em; color: #777; margin-top: 4px;
}
.unsupported-field {
    color: #999; font-style: italic; font-size: 0.9em;
    display: block; margin-top: 5px;
}
.reference-error {
    color: #dc3545; font-size: 0.8em; margin-top: 4px;
}

/* --- Modal Actions --- */
.modal-actions {
    display: flex; justify-content: flex-end; gap: 10px; padding-top: 20px;
    border-top: 1px solid #eee; flex-shrink: 0; margin-top: auto;
}
.modal-actions button {
    padding: 9px 16px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 0.95em; transition: background-color 0.2s ease, opacity 0.2s ease;
}
.modal-actions button[type="submit"] { background-color: #007bff; color: white; }
.modal-actions button[type="submit"]:hover:not(:disabled) { background-color: #0056b3; }
.modal-actions button[type="submit"]:disabled {
    background-color: #cccccc; cursor: not-allowed; opacity: 0.7;
}
.modal-actions button[type="button"] {
    background-color: #f0f0f0; color: #333; border: 1px solid #ccc;
}
.modal-actions button[type="button"]:hover { background-color: #e0e0e0; }
</style>
