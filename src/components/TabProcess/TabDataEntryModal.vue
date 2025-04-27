<template>
    <div v-if="visible" class="data-entry-modal-overlay" @click.self="handleCancel">
        <div class="data-entry-modal-content">
            <h3>Nhập dữ liệu cho Bước Quy trình</h3>

            <!-- Tab Navigation -->
            <div v-if="schema && schema.tabs && schema.tabs.length > 0" class="modal-tabs">
                <button v-for="(tab, index) in schema.tabs" :key="tab.id" @click="activeTabId = tab.id"
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

                                <!-- Input Select (Reference) -->
                                <select v-else-if="fieldSchema.type === 'reference' && fieldSchema.referenceType"
                                    :id="'field-' + fieldKey" v-model="localFormData[fieldKey]"
                                    :required="fieldSchema.required || false"
                                    :disabled="isLoadingReference[fieldSchema.referenceType] || !referenceData[fieldSchema.referenceType]">
                                    <option disabled value="">
                                        {{ isLoadingReference[fieldSchema.referenceType] ? 'Đang tải...' : '-- Chọn --'
                                        }}
                                    </option>
                                    <!-- Assume reference data items have 'id' and 'name' -->
                                    <option v-for="item in referenceData[fieldSchema.referenceType]" :key="item.id"
                                        :value="item.id">
                                        {{ item.name }}
                                        <!-- Adjust 'name' if your reference data uses a different display field -->
                                    </option>
                                    <option
                                        v-if="!isLoadingReference[fieldSchema.referenceType] && (!referenceData[fieldSchema.referenceType] || referenceData[fieldSchema.referenceType]?.length === 0)"
                                        disabled value="">
                                        (Không có dữ liệu)
                                    </option>
                                </select>
                                <div v-if="fieldSchema.type === 'reference' && loadError[fieldSchema.referenceType]"
                                    class="reference-error">
                                    Lỗi tải dữ liệu: {{ loadError[fieldSchema.referenceType] }}
                                </div>

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
                    <!-- Disable save if schema is invalid or loading -->
                    <button type="submit"
                        :disabled="!schema || !schema.tabs || schema.tabs.length === 0 || isAnyReferenceLoading">Lưu
                        Dữ liệu</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, computed, reactive, nextTick } from 'vue';

const props = defineProps({
    visible: {
        type: Boolean,
        required: true,
    },
    schema: { // Expected structure: { tabs: [ { id, label, fields: { key: { type, label, value, ... } } } ] }
        type: Object,
        default: () => ({ tabs: [] }), // Default to empty tabs array
    },
    initialData: { // formData remains flat: { fieldKey1: value1, fieldKey2: value2, ... }
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits(['saveData', 'cancel']);

// --- State ---
const localFormData = ref({});
const referenceData = ref({});
const isLoadingReference = reactive({});
const loadError = reactive({});
const activeTabId = ref(null); // ID of the currently active tab

// --- Computed Properties ---
const isAnyReferenceLoading = computed(() => {
    return Object.values(isLoadingReference).some(loading => loading);
});

// Check if the schema is valid for display (has tabs and the first tab has an ID)
const isValidSchema = computed(() => {
    return props.schema && Array.isArray(props.schema.tabs) && props.schema.tabs.length > 0 && props.schema.tabs[0]?.id;
});

// --- Helper Functions ---
const getReferenceDataPath = (type) => {
    if (!type) return null;
    const typeMap = {
        'Customer': 'customers',
        'Employee': 'employees',
        'DocumentType': 'documentTypes',
    };
    const fileName = typeMap[type];
    return fileName ? `/data/${fileName}.json` : null;
};

const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return null; // Use null for numbers initially? Or 0? Let's stick with null for empty state.
        case 'boolean': return false;
        case 'date': return '';
        case 'select': return '';
        case 'reference': return ''; // Or null
        case 'textarea': return '';
        case 'text':
        case 'email':
        case 'url':
        default: return '';
    }
};

// --- Data Loading ---
const loadReferenceData = async (type) => {
    if (!type || referenceData.value[type] || isLoadingReference[type]) return;
    const path = getReferenceDataPath(type);
    if (!path) {
        console.error(`Invalid referenceType or no path defined for: ${type}`);
        loadError[type] = `Loại tham chiếu không hợp lệ: ${type}`;
        isLoadingReference[type] = false; // Ensure loading is false
        return;
    }

    isLoadingReference[type] = true;
    loadError[type] = null;
    console.log(`Loading reference data for ${type} from ${path}...`);
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        referenceData.value[type] = Array.isArray(data) ? data : [];
        console.log(`Successfully loaded data for ${type}:`, referenceData.value[type]);
    } catch (error) {
        console.error(`Failed to load reference data for ${type} from ${path}:`, error);
        loadError[type] = error.message || 'Không thể tải dữ liệu.';
        referenceData.value[type] = [];
    } finally {
        isLoadingReference[type] = false;
    }
};

// --- Watchers ---
// Watch for modal visibility to initialize data and load references
watch(() => props.visible, async (newVisible) => {
    if (newVisible) {
        // --- Initialize localFormData ---
        let initialDataCopy;
        // try {
        //     initialDataCopy = structuredClone(props.initialData || {});
        // } catch (e) {
        //     console.warn("structuredClone failed, using JSON fallback for initial data.");
        //     initialDataCopy = JSON.parse(JSON.stringify(props.initialData || {}));
        // }

        initialDataCopy = JSON.parse(JSON.stringify(props.initialData || {}));
        const newLocalFormData = {};
        const dataLoadPromises = [];

        // Iterate through the new schema structure (tabs and fields)
        if (isValidSchema.value) {
            props.schema.tabs.forEach(tab => {
                if (tab.fields) {
                    for (const fieldKey in tab.fields) {
                        const fieldSchema = tab.fields[fieldKey];
                        // Set value: Use initialData if present, otherwise use schema default, otherwise use type default
                        newLocalFormData[fieldKey] = initialDataCopy.hasOwnProperty(fieldKey)
                            ? initialDataCopy[fieldKey]
                            : (fieldSchema.hasOwnProperty('value') ? fieldSchema.value : getDefaultValue(fieldSchema.type));

                        // --- Trigger reference data loading ---
                        if (fieldSchema?.type === 'reference' && fieldSchema.referenceType) {
                            if (!referenceData.value[fieldSchema.referenceType] && !isLoadingReference[fieldSchema.referenceType]) {
                                dataLoadPromises.push(loadReferenceData(fieldSchema.referenceType));
                            } else if (!isLoadingReference[fieldSchema.referenceType]) {
                                isLoadingReference[fieldSchema.referenceType] = false;
                                loadError[fieldSchema.referenceType] = null;
                            }
                        }
                    }
                }
            });
            // Set the active tab to the first tab
            activeTabId.value = props.schema.tabs[0].id;

        } else {
            console.warn("Modal opened with invalid or empty schema structure.");
            activeTabId.value = null; // No active tab if schema is invalid
        }

        localFormData.value = newLocalFormData; // Assign the built object

        // Wait for loading initiations
        if (dataLoadPromises.length > 0) {
            await Promise.all(dataLoadPromises);
            console.log("All required reference data loading initiated.");
        }

    } else {
        // Reset state on close
        Object.keys(loadError).forEach(key => loadError[key] = null);
        activeTabId.value = null;
        // Optionally clear referenceData cache here if needed
        // referenceData.value = {};
    }
}, { immediate: true });

// Watch for external changes in initialData while modal is open
watch(() => props.initialData, (newInitialData) => {
    if (props.visible && isValidSchema.value) {
        console.log("Initial data changed while modal is open, updating local form data...");
        let initialDataCopy;
        //  try {
        //     initialDataCopy = structuredClone(newInitialData || {});
        // } catch (e) {
        //     console.warn("structuredClone failed, using JSON fallback for initial data update.");
        //     initialDataCopy = JSON.parse(JSON.stringify(newInitialData || {}));
        // }

        initialDataCopy = JSON.parse(JSON.stringify(newInitialData || {}));
        const updatedLocalFormData = { ...localFormData.value }; // Start with existing local data

        props.schema.tabs.forEach(tab => {
            if (tab.fields) {
                for (const fieldKey in tab.fields) {
                    const fieldSchema = tab.fields[fieldKey];
                    // Update only if the key exists in the new initial data
                    if (initialDataCopy.hasOwnProperty(fieldKey)) {
                        updatedLocalFormData[fieldKey] = initialDataCopy[fieldKey];
                    }
                    // Ensure keys from schema exist, even if not in newInitialData (use default if missing)
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
    let dataToSave;
    //  try {
    //     dataToSave = structuredClone(localFormData.value);
    //  } catch(e) {
    //     console.warn("structuredClone failed, using JSON fallback for saving data.");
    //     dataToSave = JSON.parse(JSON.stringify(localFormData.value));
    //  }
    dataToSave = JSON.parse(JSON.stringify(localFormData.value));
    // Optional: Add validation logic here based on schema.required before emitting
    emit('saveData', dataToSave);
};

const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
/* --- Base Modal Styles (Keep existing) --- */
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
    max-width: 600px;
    /* Adjust width as needed */
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.data-entry-modal-content h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #333;
    text-align: center;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
    flex-shrink: 0;
}

/* --- Tab Styles --- */
.modal-tabs {
    display: flex;
    flex-wrap: wrap;
    /* Allow tabs to wrap on smaller screens */
    margin-bottom: 15px;
    border-bottom: 1px solid #ccc;
    flex-shrink: 0;
    /* Prevent tabs from shrinking */
}

.tab-button {
    padding: 10px 15px;
    cursor: pointer;
    border: none;
    background-color: #f1f1f1;
    border-bottom: 1px solid #ccc;
    /* Default border */
    margin-bottom: -1px;
    /* Overlap container border */
    font-size: 0.95em;
    color: #555;
    transition: background-color 0.2s ease, color 0.2s ease;
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
}

.tab-button:hover {
    background-color: #e0e0e0;
}

.tab-button.active {
    background-color: #fff;
    border: 1px solid #ccc;
    border-bottom: 1px solid #fff;
    /* Make bottom border white to blend */
    color: #007bff;
    font-weight: bold;
}

/* --- Form Layout --- */
.modal-form {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow: hidden;
    min-height: 0;
}

.form-fields {
    overflow-y: auto;
    padding-right: 10px;
    flex-grow: 1;
    min-height: 150px;
    /* Ensure some minimum height for the scroll area */
    padding-bottom: 10px;
}

.active-tab-fields {
    /* Add padding if needed specifically for the active tab's content */
    padding-top: 10px;
}

.no-schema-message,
.no-fields-in-tab {
    text-align: center;
    color: #888;
    padding: 20px;
    border: 1px dashed #ccc;
    border-radius: 4px;
    margin: 10px 0;
}

.no-fields-in-tab {
    margin-top: 20px;
    font-style: italic;
}

/* --- Form Group & Fields (Keep existing styles, adjust if needed) --- */
.form-group {
    margin-bottom: 18px;
}

.form-group:last-child {
    margin-bottom: 0;
}

.form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: bold;
    color: #555;
    font-size: 0.9em;
}

.required-indicator {
    color: #dc3545;
    margin-left: 2px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="date"],
.form-group input[type="email"],
.form-group input[type="url"],
.form-group textarea,
.form-group select {
    width: 100%;
    padding: 9px 12px;
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
    width: auto;
    margin-left: 5px;
    height: 1.1em;
    width: 1.1em;
}

.form-group textarea {
    resize: vertical;
}

.field-description {
    display: block;
    font-size: 0.8em;
    color: #777;
    margin-top: 4px;
}

.unsupported-field {
    color: #999;
    font-style: italic;
    font-size: 0.9em;
    display: block;
    margin-top: 5px;
}

.reference-error {
    color: #dc3545;
    font-size: 0.8em;
    margin-top: 4px;
}

/* --- Modal Actions (Keep existing styles) --- */
.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 20px;
    border-top: 1px solid #eee;
    flex-shrink: 0;
    margin-top: auto;
    /* Push actions down */
}

.modal-actions button {
    padding: 9px 16px;
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
