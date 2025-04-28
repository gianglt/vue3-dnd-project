<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content form-builder-modal">
            <h2>Xây dựng Form Nhập liệu Động (Có Tabs và Tham chiếu)</h2>

            <!-- Optional: Display error if fetching reference types failed -->
            <div v-if="referenceTypesError" class="api-error-message">
                Lỗi tải danh sách loại tham chiếu: {{ referenceTypesError }}. Vui lòng thử lại hoặc kiểm tra cấu hình API.
            </div>

            <div class="form-builder-layout">
                <!-- Palette -->
                <div class="palette">
                    <h4>Kéo loại trường:</h4>
                    <div
                        v-for="fieldType in availableFieldTypes"
                        :key="fieldType.type"
                        class="palette-item"
                        draggable="true"
                        @dragstart="handlePaletteDragStart($event, fieldType.type)"
                        :title="fieldType.type === 'reference' && isLoadingReferenceTypes ? 'Đang tải loại tham chiếu...' : ''"
                        :style="{ opacity: fieldType.type === 'reference' && isLoadingReferenceTypes ? 0.6 : 1, cursor: fieldType.type === 'reference' && isLoadingReferenceTypes ? 'not-allowed' : 'grab' }"
                        :draggable="!(fieldType.type === 'reference' && isLoadingReferenceTypes)"
                    >
                        {{ fieldType.label }}
                        <span v-if="fieldType.type === 'reference' && isLoadingReferenceTypes"> (Loading...)</span>
                    </div>
                     <hr>
                     <button @click="addTab" class="btn btn-add-tab">Thêm Tab Mới</button>
                </div>

                <!-- Canvas/Khu vực xây dựng form -->
                <div class="form-builder-canvas">
                    <div v-if="builtSchemaTabs.length === 0" class="canvas-placeholder">
                        Thêm tab và thả trường vào...
                    </div>
                    <div v-else class="tabs-container">
                         <!-- Tab Navigation -->
                         <div class="tab-headers">
                             <div
                                 v-for="(tab, tabIndex) in builtSchemaTabs"
                                 :key="tab.id"
                                 class="tab-header"
                                 :class="{ active: activeTabIndex === tabIndex }"
                                 @click="activeTabIndex = tabIndex"
                             >
                                 <input type="text" v-model="tab.label" placeholder="Tên Tab" class="tab-label-input"/>
                                 <button
                                     @click.stop="removeTab(tabIndex)"
                                     class="delete-tab-btn"
                                     title="Xóa Tab này"
                                     v-if="builtSchemaTabs.length > 1"
                                 >
                                     ×
                                 </button>
                             </div>
                         </div>

                         <!-- Tab Content (Fields) -->
                         <div
                            v-for="(tab, tabIndex) in builtSchemaTabs"
                            :key="tab.id + '-content'"
                            v-show="activeTabIndex === tabIndex"
                            class="tab-content"
                            @dragover.prevent="handleCanvasDragOver($event, tabIndex)"
                            @drop.prevent="handleCanvasDrop($event, tabIndex)"
                         >
                             <div v-if="!tab.fields || Object.keys(tab.fields).length === 0" class="canvas-placeholder-inner">
                                 Thả các trường cho tab "{{ tab.label || 'này' }}" vào đây...
                             </div>
                             <!-- Field List -->
                             <div v-else class="fields-list">
                                <div
                                    v-for="(fieldSchema, fieldKey, fieldIndex) in tab.fields"
                                    :key="fieldKey"
                                    class="form-field-preview"
                                    draggable="true"
                                    @dragstart="handleFieldDragStart($event, tabIndex, fieldKey)"
                                    @dragover.prevent="handleFieldDragOver($event, tabIndex, fieldKey)"
                                    @drop.prevent="handleFieldDrop($event, tabIndex, fieldKey)"
                                    @dragend="handleFieldDragEnd"
                                    :class="{ 'drag-over': dragOverFieldKey === fieldKey && draggingFieldKey !== fieldKey }"
                                    :data-field-key="fieldKey" 
                                >
                                    <span class="drag-handle" title="Kéo để sắp xếp trong tab">⠿</span>
                                    <!-- Key Input -->
                                    <input
                                        type="text"
                                        :value="fieldKey"
                                        @input="updateFieldKey(tabIndex, fieldKey, $event.target.value)"
                                        placeholder="Mã định danh (Key)"
                                        class="field-key-input"
                                        required
                                    />
                                    <!-- Label Input -->
                                    <input type="text" v-model="fieldSchema.label" placeholder="Nhãn hiển thị" class="field-label-input"/>
                                    <span class="field-type-label">({{ fieldSchema.type }})</span>

                                    <!-- Default Value Input (Conditional) -->
                                    <input v-if="isValueType(fieldSchema.type, ['text', 'email', 'url', 'date'])" :type="fieldSchema.type" v-model="fieldSchema.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                                    <input v-else-if="fieldSchema.type === 'number'" type="number" v-model.number="fieldSchema.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                                    <textarea v-else-if="fieldSchema.type === 'textarea'" v-model="fieldSchema.value" placeholder="Giá trị mặc định" rows="1" class="field-value-input"></textarea>
                                    <input v-else-if="fieldSchema.type === 'boolean'" type="checkbox" v-model="fieldSchema.value" class="field-value-input-cb"/>

                                    <!-- *** UPDATED: Reference Type Selector *** -->
                                    <select
                                        v-else-if="fieldSchema.type === 'reference'"
                                        v-model="fieldSchema.referenceType"
                                        class="field-reference-type-select"
                                        title="Chọn loại tham chiếu"
                                        :disabled="isLoadingReferenceTypes || availableReferenceTypes.length === 0"
                                    >
                                        <option :value="null" disabled>
                                            {{ isLoadingReferenceTypes ? 'Đang tải...' : (availableReferenceTypes.length === 0 ? '(Không có loại)' : '-- Chọn loại --') }}
                                        </option>
                                        <option v-for="refType in availableReferenceTypes" :key="refType" :value="refType">
                                            {{ refType }}
                                        </option>
                                    </select>

                                    <!-- Required Checkbox -->
                                     <!-- <input type="checkbox" v-model="fieldSchema.required" :id="'req-'+tabIndex+'-'+fieldKey" class="field-required-cb" title="Bắt buộc nhập">
                                     <label :for="'req-'+tabIndex+'-'+fieldKey" class="field-required-label">Req?</label> -->

                                    <button @click="removeField(tabIndex, fieldKey)" class="delete-field-btn" title="Xóa trường">×</button>
                                </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" @click="handleSaveSchema" class="btn btn-save" :disabled="isLoadingReferenceTypes">Lưu Cấu trúc Form</button>
                <button type="button" @click="handleCancel" class="btn btn-cancel">Hủy</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

// --- Configuration ---
// Get API Base URL from environment variables (Vite example)
// Make sure to create a .env file in your project root with VITE_API_BASE_URL=http://your-api-url
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''; // Provide a fallback if needed

if (!API_BASE_URL) {
    console.warn("VITE_API_BASE_URL is not defined in your environment variables. API calls might fail.");
}

const props = defineProps({
    visible: Boolean,
    initialSchema: {
        type: Object,
        default: () => ({ tabs: [] })
    }
});

const emit = defineEmits(['saveSchema', 'cancel']);

// --- State ---
const availableFieldTypes = ref([
    { type: 'text', label: 'Chữ (Text)' },
    { type: 'number', label: 'Số (Number)' },
    { type: 'date', label: 'Ngày (Date)' },
    { type: 'textarea', label: 'Văn bản dài (Textarea)' },
    { type: 'boolean', label: 'Đúng/Sai (Checkbox)' },
    { type: 'email', label: 'Email' },
    { type: 'url', label: 'URL' },
    { type: 'reference', label: 'Tham chiếu (Reference)' },
]);

// *** NEW: State for dynamic reference types ***
const availableReferenceTypes = ref([]); // Initialize as empty
const isLoadingReferenceTypes = ref(false);
const referenceTypesError = ref(null);

const builtSchemaTabs = ref([]);
const activeTabIndex = ref(0);

// Drag & Drop State
const draggingFieldType = ref(null);
const draggingTabIndex = ref(null);
const draggingFieldKey = ref(null);
const dragOverFieldKey = ref(null);

// --- API Fetching ---
const fetchAvailableReferenceTypes = async () => {
    if (!API_BASE_URL) {
        referenceTypesError.value = "API Base URL chưa được cấu hình.";
        isLoadingReferenceTypes.value = false;
        availableReferenceTypes.value = []; // Ensure it's empty
        return;
    }
    // Optimization: Don't refetch if already loaded (unless forced refresh is needed)
    if (availableReferenceTypes.value.length > 0 && !isLoadingReferenceTypes.value) {
        console.log("Reference types already loaded.");
        return;
    }

    isLoadingReferenceTypes.value = true;
    referenceTypesError.value = null;
    console.log("Fetching available reference types from:", `${API_BASE_URL}/api/listapi`);

    try {
        const response = await fetch(`${API_BASE_URL}/api/listapi`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Assuming the API returns an array of objects like [{ name: 'Customers', ... }, { name: 'Employees', ... }]
        if (Array.isArray(data)) {
            // Extract 'name' and filter out any null/undefined/empty strings
            availableReferenceTypes.value = data.map(item => item.name).filter(name => name && typeof name === 'string' && name.trim() !== '');
            console.log("Successfully fetched reference types:", availableReferenceTypes.value);
            if (availableReferenceTypes.value.length === 0) {
                 console.warn("API returned an empty list or list with invalid 'name' fields for reference types.");
                 referenceTypesError.value = "API không trả về loại tham chiếu hợp lệ nào.";
            }
        } else {
            console.error("API response is not an array:", data);
            throw new Error("Dữ liệu API trả về không phải là một danh sách (array).");
        }
    } catch (error) {
        console.error("Failed to fetch reference types:", error);
        referenceTypesError.value = error.message || "Lỗi không xác định khi tải loại tham chiếu.";
        availableReferenceTypes.value = []; // Clear on error
    } finally {
        isLoadingReferenceTypes.value = false;
    }
};


// --- Watchers ---
watch(() => props.visible, (newVisible) => {
    if (newVisible) {
        // Fetch reference types when modal becomes visible
        fetchAvailableReferenceTypes(); // Trigger the fetch

        // --- Initialize Schema ---
        let schemaToLoad;
        try {
            schemaToLoad = structuredClone(props.initialSchema || { tabs: [] });
        } catch (e) {
            console.warn("structuredClone failed, using JSON fallback for initial schema.");
            schemaToLoad = JSON.parse(JSON.stringify(props.initialSchema || { tabs: [] }));
        }

        if (!schemaToLoad || !Array.isArray(schemaToLoad.tabs)) {
            builtSchemaTabs.value = [{ id: `tab_${Date.now()}`, label: 'Tab 1', fields: {} }];
        } else if (schemaToLoad.tabs.length === 0) {
             builtSchemaTabs.value = [{ id: `tab_${Date.now()}`, label: 'Tab 1', fields: {} }];
        } else {
            builtSchemaTabs.value = schemaToLoad.tabs.map((tab, index) => {
                const processedFields = {};
                if (tab.fields && typeof tab.fields === 'object') {
                    for (const key in tab.fields) {
                        const field = tab.fields[key];
                        processedFields[key] = { ...field };
                        if (field.type === 'reference') {
                            // Keep existing referenceType for now. Validation happens on save.
                            // Set to null if it doesn't exist in the original schema.
                            processedFields[key].referenceType = field.referenceType || null;
                            processedFields[key].value = field.value ?? getDefaultValue('reference');
                        } else {
                             processedFields[key].value = field.value ?? getDefaultValue(field.type);
                        }
                        processedFields[key].label = field.label || key;
                        processedFields[key].required = field.required || false;
                    }
                }
                return {
                    id: tab.id || `tab_${Date.now()}_${index}`,
                    label: tab.label || `Tab ${index + 1}`,
                    fields: processedFields
                };
            });
        }
        activeTabIndex.value = 0;
        console.log("Form builder initialized with schema:", builtSchemaTabs.value);
    } else {
        // Reset state when closing
        builtSchemaTabs.value = [];
        activeTabIndex.value = 0;
        draggingFieldType.value = null;
        draggingTabIndex.value = null;
        draggingFieldKey.value = null;
        dragOverFieldKey.value = null;
        // Keep fetched types cached, don't reset:
        // availableReferenceTypes.value = [];
        // referenceTypesError.value = null;
        console.log("Form builder closed and reset.");
    }
}, { immediate: true }); // Run immediately to fetch types if modal starts visible

// --- Helper Functions ---
const isValueType = (type, typesArray) => typesArray.includes(type);

const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return '';
        case 'reference': return null; // Default value for reference is null (no selection)
        default: return '';
    }
};

// --- Tab Management ---
const addTab = () => {
    const newTabId = `tab_${Date.now()}`;
    builtSchemaTabs.value.push({
        id: newTabId,
        label: `Tab Mới ${builtSchemaTabs.value.length + 1}`,
        fields: {}
    });
    activeTabIndex.value = builtSchemaTabs.value.length - 1;
    console.log("Added new tab:", newTabId);
};

const removeTab = (tabIndex) => {
    if (builtSchemaTabs.value.length <= 1) {
        alert("Không thể xóa tab cuối cùng.");
        return;
    }
    if (confirm(`Bạn có chắc muốn xóa tab "${builtSchemaTabs.value[tabIndex].label}" và tất cả các trường trong đó?`)) {
        const removedTabLabel = builtSchemaTabs.value[tabIndex].label;
        builtSchemaTabs.value.splice(tabIndex, 1);
        // Adjust active tab index
        if (activeTabIndex.value === tabIndex) {
            // If the active tab was deleted, move to the previous one or the first one
            activeTabIndex.value = Math.max(0, tabIndex - 1);
        } else if (activeTabIndex.value > tabIndex) {
            // If a tab before the active one was deleted, shift the active index back
            activeTabIndex.value--;
        }
        // Ensure activeTabIndex is valid if all tabs were somehow removed (shouldn't happen with the check above)
        if (builtSchemaTabs.value.length === 0) {
            activeTabIndex.value = -1; // Or 0 if we immediately add a default tab
        } else if (activeTabIndex.value >= builtSchemaTabs.value.length) {
             activeTabIndex.value = builtSchemaTabs.value.length - 1;
        }

        console.log(`Removed tab "${removedTabLabel}" at index:`, tabIndex);
    }
};

// --- Drag & Drop Handlers ---

const handlePaletteDragStart = (event, fieldType) => {
    // Prevent dragging reference type if still loading or no types available
    if (fieldType === 'reference' && (isLoadingReferenceTypes.value || availableReferenceTypes.value.length === 0)) {
        event.preventDefault();
        return;
    }
    draggingFieldType.value = fieldType;
    draggingTabIndex.value = null;
    draggingFieldKey.value = null;
    event.dataTransfer.effectAllowed = 'copy';
    try { event.dataTransfer.setData('text/plain', fieldType); } catch(e) {}
    console.log(`Dragging from palette: ${fieldType}`);
};

const handleCanvasDragOver = (event, tabIndex) => {
    event.preventDefault();
    if (draggingFieldType.value) {
        event.dataTransfer.dropEffect = 'copy';
    } else if (draggingTabIndex.value !== null && draggingTabIndex.value === tabIndex) {
        event.dataTransfer.dropEffect = 'move'; // Moving within the same tab
    } else if (draggingTabIndex.value !== null && draggingTabIndex.value !== tabIndex) {
        event.dataTransfer.dropEffect = 'copy'; // Moving to a different tab (treat as copy for now)
    } else {
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleCanvasDrop = (event, targetTabIndex) => {
    event.preventDefault();
    const fieldType = draggingFieldType.value || event.dataTransfer.getData('text/plain');
    console.log(`Dropped on tab index: ${targetTabIndex}. Type detected: ${fieldType}`);

    // Handle Drop From Palette
    if (fieldType && availableFieldTypes.value.some(f => f.type === fieldType)) {
        // *** Prevent dropping reference if types haven't loaded or failed ***
        if (fieldType === 'reference' && (isLoadingReferenceTypes.value || availableReferenceTypes.value.length === 0)) {
             alert(`Không thể thêm trường Tham chiếu: ${isLoadingReferenceTypes.value ? 'Đang tải danh sách loại...' : 'Không có loại tham chiếu nào được tải.'}`);
             draggingFieldType.value = null; // Reset dragging state
             handleFieldDragEnd(); // Clean up other drag states
             return;
        }

        const baseKey = `Trường mới`;
        const newFieldKey = crypto.randomUUID(); // Generate a unique key

        const newFieldSchema = {
            label: baseKey,
            type: fieldType,
            value: getDefaultValue(fieldType),
            required: false
        };

        // *** Set referenceType to null initially, user must select ***
        if (fieldType === 'reference') {
            newFieldSchema.referenceType = null; // Default to null, forcing user selection
        }

        // Ensure the target tab has a fields object
        if (!builtSchemaTabs.value[targetTabIndex]) {
            console.error("Target tab index is invalid:", targetTabIndex);
            handleFieldDragEnd();
            return;
        }
        if (!builtSchemaTabs.value[targetTabIndex].fields) {
             builtSchemaTabs.value[targetTabIndex].fields = {};
        }

        // Add the new field
        builtSchemaTabs.value[targetTabIndex].fields[newFieldKey] = newFieldSchema;
        console.log(`Added new field '${newFieldKey}' to tab ${targetTabIndex}:`, newFieldSchema);

        // Optional: Scroll to the new field or focus it
        // nextTick(() => { ... });

    }
    // Handle Drop From Another Tab (Move Logic)
    else if (draggingTabIndex.value !== null && draggingFieldKey.value && draggingTabIndex.value !== targetTabIndex) {
        const sourceTab = builtSchemaTabs.value[draggingTabIndex.value];
        const targetTab = builtSchemaTabs.value[targetTabIndex];
        const fieldKeyToMove = draggingFieldKey.value;

        if (sourceTab && targetTab && fieldKeyToMove && sourceTab.fields[fieldKeyToMove]) {
             // Check for key collision in the target tab
             if (targetTab.fields && targetTab.fields[fieldKeyToMove]) {
                 alert(`Lỗi: Mã định danh (Key) "${fieldKeyToMove}" đã tồn tại trong tab đích "${targetTab.label}". Vui lòng đổi tên trường nguồn trước khi di chuyển.`);
             } else {
                 // Perform the move
                 if (!targetTab.fields) { targetTab.fields = {}; } // Ensure target fields object exists
                 targetTab.fields[fieldKeyToMove] = sourceTab.fields[fieldKeyToMove]; // Copy field data
                 delete sourceTab.fields[fieldKeyToMove]; // Remove from source
                 console.log(`Moved field '${fieldKeyToMove}' from tab ${draggingTabIndex.value} to ${targetTabIndex}`);
             }
        } else {
             console.warn("Could not move field between tabs. Invalid state or field not found.");
        }
    }
     else {
        console.warn("Invalid drop operation on canvas. Dragging state:", {
            draggingFieldType: draggingFieldType.value,
            draggingTabIndex: draggingTabIndex.value,
            draggingFieldKey: draggingFieldKey.value
        });
    }

    // Reset dragging state regardless of outcome
    draggingFieldType.value = null;
    handleFieldDragEnd();
};


const handleFieldDragStart = (event, tabIndex, fieldKey) => {
    draggingTabIndex.value = tabIndex;
    draggingFieldKey.value = fieldKey;
    draggingFieldType.value = null; // Not dragging from palette
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', fieldKey); } catch(e) {} // Set data for potential cross-tab drop
    // Add class directly to the element being dragged for visual feedback
    if (event.target.classList.contains('form-field-preview')) {
        event.target.classList.add('dragging-field');
    }
    console.log(`Start dragging field '${fieldKey}' from tab index: ${tabIndex}`);
};

const handleFieldDragOver = (event, tabIndex, targetFieldKey) => {
    event.preventDefault();
    // Allow dropping only if dragging within the same tab and not onto itself
    if (draggingTabIndex.value === tabIndex && draggingFieldKey.value && draggingFieldKey.value !== targetFieldKey) {
        dragOverFieldKey.value = targetFieldKey; // Set state for visual feedback
        event.dataTransfer.dropEffect = 'move';
    } else {
        dragOverFieldKey.value = null; // Reset visual feedback state
        event.dataTransfer.dropEffect = 'none'; // Indicate invalid drop target
    }
};

const handleFieldDrop = (event, targetTabIndex, targetFieldKey) => {
    event.preventDefault();
    console.log(`Drop field onto key: '${targetFieldKey}' in tab ${targetTabIndex}. Dragging key: '${draggingFieldKey.value}' from tab ${draggingTabIndex.value}`);

    // Handle reordering within the same tab
    if (draggingTabIndex.value === targetTabIndex && draggingFieldKey.value && draggingFieldKey.value !== targetFieldKey) {
        const tabFields = builtSchemaTabs.value[targetTabIndex].fields;
        if (!tabFields) {
            console.error("Cannot reorder, target tab fields object is missing.");
            handleFieldDragEnd();
            return;
        }

        const fieldKeys = Object.keys(tabFields);
        const draggedIndex = fieldKeys.indexOf(draggingFieldKey.value);
        const targetIndex = fieldKeys.indexOf(targetFieldKey);

        if (draggedIndex > -1 && targetIndex > -1) {
            // Create a new ordered object
            const newOrderedFields = {};
            const items = Object.entries(tabFields); // [ [key1, schema1], [key2, schema2], ... ]

            // Remove the dragged item
            const [draggedItem] = items.splice(draggedIndex, 1);

            // Insert the dragged item at the target position
            items.splice(targetIndex, 0, draggedItem);

            // Reconstruct the fields object from the ordered array
            for (const [key, schema] of items) {
                newOrderedFields[key] = schema;
            }

            builtSchemaTabs.value[targetTabIndex].fields = newOrderedFields;
            console.log("Reordered fields in tab. New order:", Object.keys(newOrderedFields));
        } else {
             console.error("Error reordering fields: Could not find dragged or target index.", { draggedIndex, targetIndex });
        }
    } else {
         console.warn("Invalid field drop for reordering (different tab or dropping on self).");
    }
    // Clean up drag state regardless of drop success
    handleFieldDragEnd();
};

const handleFieldDragEnd = (event) => {
    // Clean up dragging class from the element that was dragged
    const draggingElement = document.querySelector('.dragging-field');
    if (draggingElement) {
        draggingElement.classList.remove('dragging-field');
    }
    // Reset all drag-related state variables
    draggingTabIndex.value = null;
    draggingFieldKey.value = null;
    dragOverFieldKey.value = null;
    draggingFieldType.value = null; // Ensure this is reset too
    // console.log("Field drag ended."); // Optional log
};


// --- Field Management ---

const removeField = (tabIndex, fieldKey) => {
    const tab = builtSchemaTabs.value[tabIndex];
    if (tab?.fields && tab.fields[fieldKey]) {
        if (confirm(`Bạn có chắc muốn xóa trường "${tab.fields[fieldKey].label || fieldKey}"?`)) {
            delete tab.fields[fieldKey];
            console.log(`Removed field '${fieldKey}' from tab ${tabIndex}`);
            // Force reactivity update if needed, though direct delete should be reactive
            // builtSchemaTabs.value = [...builtSchemaTabs.value];
        }
    } else {
        console.warn(`Attempted to remove non-existent field '${fieldKey}' from tab ${tabIndex}`);
    }
};

const updateFieldKey = (tabIndex, oldKey, newKeyInput) => {
    const newKey = newKeyInput.trim();
    // Don't proceed if key is unchanged or empty
    if (newKey === oldKey || !newKey) return;

    const fields = builtSchemaTabs.value[tabIndex].fields;
    if (!fields) return; // Should not happen if field exists

    // Check for key collision within the same tab
    if (fields.hasOwnProperty(newKey)) {
        alert(`Lỗi: Mã định danh (Key) "${newKey}" đã tồn tại trong tab này. Vui lòng chọn key khác.`);
         // Reset the input value back to the old key visually
         nextTick(() => {
             const fieldElement = document.querySelector(`.form-field-preview[data-field-key="${oldKey}"]`);
             const inputElement = fieldElement?.querySelector('.field-key-input');
             if (inputElement) inputElement.value = oldKey;
         });
        return;
    }

    // Rebuild the fields object preserving order
    const newFields = {};
    for (const key in fields) {
        if (key === oldKey) {
            // Use the new key but keep the same field schema object
            newFields[newKey] = fields[oldKey];
        } else {
            // Keep other keys and their schemas
            newFields[key] = fields[key];
        }
    }
    builtSchemaTabs.value[tabIndex].fields = newFields;
    console.log(`Updated field key from '${oldKey}' to '${newKey}' in tab ${tabIndex}`);

    // If the currently dragged field's key was changed, update the dragging state
     if (draggingTabIndex.value === tabIndex && draggingFieldKey.value === oldKey) {
         draggingFieldKey.value = newKey;
         console.log("Updated draggingFieldKey to:", newKey);
     }
};


// --- Modal Actions ---

const handleSaveSchema = () => {
    if (isLoadingReferenceTypes.value) {
        alert("Đang tải dữ liệu tham chiếu, vui lòng đợi...");
        return;
    }

    const finalSchema = { tabs: [] };
    let hasError = false;
    const allKeysAcrossTabs = new Set(); // To check for unique keys across the entire form

    for (let i = 0; i < builtSchemaTabs.value.length; i++) {
        const tab = builtSchemaTabs.value[i];
        const finalTab = {
            id: tab.id,
            label: tab.label?.trim() || '', // Trim label
            fields: {}
        };

        // Validate Tab Label
        if (!finalTab.label) {
             alert(`Lỗi: Tab thứ ${i + 1} chưa được đặt tên.`);
             hasError = true;
             activeTabIndex.value = i; // Focus the tab with error
             break;
        }

        const currentTabKeys = new Set(); // Keys within the current tab (for internal checks if needed)

        if (!tab.fields || typeof tab.fields !== 'object') {
            console.warn(`Tab "${finalTab.label}" has no fields or invalid fields structure.`);
            // Allow saving tabs with no fields, just add the empty tab structure
            finalSchema.tabs.push(finalTab);
            continue; // Move to the next tab
        }

        for (const fieldKey in tab.fields) {
            const key = fieldKey.trim(); // Use the actual key from the object
            const fieldSchema = tab.fields[fieldKey];

            // Validate Field Key
            if (!key) {
                // This case should ideally be prevented by the key input logic, but double-check
                alert(`Lỗi: Có một trường trong tab "${finalTab.label}" có Mã định danh (Key) rỗng.`);
                hasError = true;
                activeTabIndex.value = i; // Focus the tab
                break;
            }
            if (!fieldSchema.label || !fieldSchema.label.trim()) {
                alert(`Lỗi: Trường "${key}" trong tab "${finalTab.label}" chưa có Nhãn hiển thị.`);
                hasError = true;
                activeTabIndex.value = i; // Focus the tab
                break;
            }

            // Validate Key Uniqueness Across All Tabs
            if (allKeysAcrossTabs.has(key)) {
                alert(`Lỗi: Mã định danh (Key) "${key}" bị trùng lặp giữa các tab (đã tồn tại trong tab khác). Key phải là duy nhất trong toàn bộ form.`);
                hasError = true;
                activeTabIndex.value = i; // Focus the tab where the duplicate was found
                break;
            }
            allKeysAcrossTabs.add(key);
            currentTabKeys.add(key); // Add to current tab's keys set

            // Prepare final field schema for saving
            const finalFieldDefinition = {
                label: fieldSchema.label.trim(),
                type: fieldSchema.type,
                required: fieldSchema.required || false,
                // Include other potential properties like placeholder, description if they exist
                ...(fieldSchema.placeholder && { placeholder: fieldSchema.placeholder }),
                ...(fieldSchema.description && { description: fieldSchema.description }),
                // Add value last, potentially converting it
            };

            let finalValue = fieldSchema.value; // Start with the current value

            try {
                // Type-specific processing and validation
                if (fieldSchema.type === 'number') {
                    // Convert to number, allow null if empty/null input
                    finalValue = (fieldSchema.value === '' || fieldSchema.value === null || fieldSchema.value === undefined)
                        ? null
                        : parseFloat(fieldSchema.value);
                    // If parsing failed but input wasn't empty/null, default to 0 or handle as error? Let's default to null.
                    if (isNaN(finalValue) && !(fieldSchema.value === '' || fieldSchema.value === null || fieldSchema.value === undefined)) {
                        finalValue = null; // Or maybe throw error?
                        console.warn(`Could not parse number for key "${key}", saving as null.`);
                    }
                } else if (fieldSchema.type === 'boolean') {
                    finalValue = Boolean(fieldSchema.value); // Ensure it's a boolean
                } else if (fieldSchema.type === 'reference') {
                    // *** VALIDATE referenceType on save ***
                    if (!fieldSchema.referenceType || !availableReferenceTypes.value.includes(fieldSchema.referenceType)) {
                         alert(`Lỗi: Trường "${key}" trong tab "${finalTab.label}" là loại 'reference' nhưng chưa chọn Loại tham chiếu hợp lệ từ danh sách.`);
                         hasError = true;
                         activeTabIndex.value = i; // Focus the tab
                         break; // Stop processing this tab
                    }
                    // Add referenceType to the saved definition
                    finalFieldDefinition.referenceType = fieldSchema.referenceType;
                    // Value for reference is typically an ID or null, keep it as is
                    finalValue = fieldSchema.value; // Usually null or a string/number ID
                }
                // Add handling for other types like 'select' options if needed here
            } catch (e) {
                 console.error(`Error processing value for key "${key}":`, e);
                 // Decide how to handle: error out, or save default? Let's save default.
                 finalValue = getDefaultValue(fieldSchema.type);
                 console.warn(`Saving default value for key "${key}" due to processing error.`);
            }

            // Assign the processed value
            finalFieldDefinition.value = finalValue;
            // Add the processed field definition to the final tab's fields
            finalTab.fields[key] = finalFieldDefinition;

        } // End loop through fields in a tab

        if (hasError) break; // Stop processing tabs if an error occurred in the inner loop

        // Add the fully processed tab to the final schema
        finalSchema.tabs.push(finalTab);

    } // End loop through tabs

    // Final check: Ensure there's at least one tab if no errors occurred so far
    if (!hasError && finalSchema.tabs.length === 0) {
         alert("Lỗi: Cấu trúc form phải có ít nhất một tab.");
         hasError = true;
    }

    // Only emit if no errors were found
    if (!hasError) {
        console.log("Saving built schema:", JSON.stringify(finalSchema, null, 2)); // Pretty print JSON
        // Deep clone before emitting to prevent downstream mutations affecting the component state
        let schemaToEmit;
        try {
            schemaToEmit = structuredClone(finalSchema);
        } catch(e) {
            console.warn("structuredClone failed before emitting, using JSON fallback.");
            schemaToEmit = JSON.parse(JSON.stringify(finalSchema));
        }
        emit('saveSchema', schemaToEmit);
    } else {
        console.log("Schema validation failed. Not saving.");
    }
};


const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
/* Add style for API error message */
.api-error-message {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
    padding: 10px 15px;
    border-radius: 4px;
    margin-bottom: 15px;
    font-size: 0.9em;
}

/* Add style for disabled palette item */
.palette-item[draggable="false"] {
    cursor: not-allowed !important; /* Ensure cursor override */
    opacity: 0.6;
}

/* Ensure select looks disabled */
.field-reference-type-select:disabled {
    background-color: #e9ecef;
    cursor: not-allowed;
    opacity: 0.7;
}

/* Ensure save button looks disabled */
.btn-save:disabled {
    background-color: #6c757d; /* Or a lighter green */
    cursor: not-allowed;
    opacity: 0.65;
}

/* --- Base Modal Styles --- */
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1000;
}
.modal-content {
    background-color: #fff; padding: 25px; border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    display: flex; flex-direction: column;
    overflow: hidden; /* Prevent content spill */
}

/* --- Form Builder Specific Styles --- */
.form-builder-modal {
    width: 85%; /* Use percentage for better responsiveness */
    max-width: 950px; /* Max width */
    min-width: 600px; /* Min width */
    height: 80vh; /* Use viewport height */
    min-height: 500px; /* Min height */
    max-height: 90vh; /* Max height */
}

h2 {
    margin-top: 0; margin-bottom: 20px; color: #333; text-align: center;
    flex-shrink: 0; /* Prevent title from shrinking */
    padding-bottom: 15px;
    border-bottom: 1px solid #eee;
}

.form-builder-layout {
    display: flex; gap: 20px; margin-bottom: 20px;
    flex-grow: 1; /* Allow layout to fill space */
    min-height: 0; /* Crucial for flex children scrolling */
    overflow: hidden; /* Prevent layout overflow */
}

/* --- Palette --- */
.palette {
    width: 220px; /* Slightly wider palette */
    border: 1px solid #e0e0e0; padding: 15px; background-color: #f9f9f9;
    border-radius: 4px; flex-shrink: 0;
    display: flex; flex-direction: column;
    overflow-y: auto; /* Allow scrolling if many items */
}
.palette h4 { margin-top: 0; margin-bottom: 10px; font-size: 0.95em; color: #444; }
.palette-item {
    background-color: #e7f3ff; border: 1px solid #b3d7ff; padding: 8px 12px;
    margin-bottom: 8px; border-radius: 4px; cursor: grab; font-size: 0.9rem;
    text-align: center; transition: background-color 0.2s ease, opacity 0.2s ease;
    user-select: none; /* Prevent text selection during drag */
}
.palette-item:hover { background-color: #d0e8ff; }
.palette-item:active { cursor: grabbing; background-color: #b3d7ff; }
.palette hr { width: 100%; border: 0; border-top: 1px solid #e0e0e0; margin: 15px 0; }
.btn-add-tab {
    background-color: #28a745; color: white; border: none; padding: 8px 12px;
    border-radius: 4px; cursor: pointer; font-size: 0.9rem; margin-top: 5px;
    width: 100%; /* Make button full width */
}
.btn-add-tab:hover { background-color: #218838; }

/* --- Canvas & Tabs --- */
.form-builder-canvas {
    flex-grow: 1; border: 1px solid #ccc; border-radius: 4px;
    background-color: #fff; display: flex; flex-direction: column;
    overflow: hidden; /* Contains the scrolling tab content */
}
.tabs-container {
    display: flex; flex-direction: column;
    flex-grow: 1; min-height: 0; /* Needed for child scrolling */
}
.tab-headers {
    display: flex; flex-wrap: wrap; /* Allow tabs to wrap */
    border-bottom: 1px solid #ccc; background-color: #f1f1f1;
    flex-shrink: 0; /* Prevent headers from shrinking */
    padding-left: 5px; /* Small padding */
}
.tab-header {
    padding: 0; /* Remove padding, control with input/button */
    cursor: pointer; border-right: 1px solid #ccc;
    background-color: #e9ecef; color: #495057; font-size: 0.9em;
    position: relative; display: flex; align-items: center;
    /* gap: 5px; */ /* Use padding on children instead */
    min-width: 120px; /* Min width for a tab */
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
    margin-bottom: -1px; /* Overlap bottom border */
    transition: background-color 0.2s ease;
}
.tab-header:last-child { border-right: none; }
.tab-header:hover { background-color: #dee2e6; }
.tab-header.active {
    background-color: #fff; border-bottom-color: #fff; /* Blend bottom border */
    color: #007bff; font-weight: bold;
    z-index: 1; /* Ensure active tab border overlaps others */
}
.tab-label-input {
    border: none; background: transparent; font-size: inherit; color: inherit;
    font-weight: inherit; padding: 8px 10px; outline: none;
    flex-grow: 1; /* Allow input to take available space */
    min-width: 80px;
    border-radius: 4px 0 0 4px; /* Match tab rounding */
}
.tab-header.active .tab-label-input {
     /* Optional: subtle indication */
    /* border-bottom: 1px dashed #ccc; */
}
.delete-tab-btn {
    background: none; border: none; color: #dc3545; font-size: 1.2rem;
    cursor: pointer; padding: 6px 8px; line-height: 1; opacity: 0.5;
    margin-left: auto; /* Push to the right */
    flex-shrink: 0;
    border-radius: 0 4px 4px 0; /* Match tab rounding */
    transition: opacity 0.2s ease, background-color 0.2s ease;
}
.tab-header:hover .delete-tab-btn { opacity: 1; }
.delete-tab-btn:hover { background-color: #f8d7da; color: #a71d2a; }

.tab-content {
    padding: 20px; flex-grow: 1; overflow-y: auto; /* Enable vertical scroll */
    background-color: #fff;
    /* border: 2px dashed transparent; */ /* Remove dashed border */
    min-height: 150px; /* Ensure minimum space for dropping */
}
.canvas-placeholder, .canvas-placeholder-inner {
    text-align: center; color: #aaa; font-style: italic; padding: 40px 10px;
    border: 2px dashed #e0e0e0;
    border-radius: 4px;
    margin: 20px; /* Add margin for placeholder */
}
.canvas-placeholder-inner { padding: 20px 10px; margin: 0; border: none; } /* Inner placeholder simpler */

/* --- Fields List & Preview --- */
.fields-list {
    /* No extra styles needed here usually */
}
.form-field-preview {
    background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 8px 10px;
    margin-bottom: 8px; border-radius: 4px; display: flex; align-items: center;
    gap: 8px; cursor: move; transition: background-color 0.1s ease, border-top 0.1s ease, opacity 0.1s ease;
    font-size: 0.9rem;
}
.form-field-preview.dragging-field {
    opacity: 0.4; /* Make it more transparent when dragging */
    background-color: #e9ecef;
    border-style: dashed;
}
.drag-handle { cursor: grab; color: #adb5bd; padding-right: 4px; font-size: 1.1em; user-select: none; }
.form-field-preview:active .drag-handle { cursor: grabbing; }

/* Input fields within preview */
.field-key-input, .field-label-input, .field-value-input, .field-reference-type-select {
    padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px;
    font-size: 0.85rem;
    background-color: white;
    line-height: 1.3;
    height: 2.2em; /* Consistent height */
    box-sizing: border-box;
    transition: border-color 0.2s ease;
}
.field-key-input:focus, .field-label-input:focus, .field-value-input:focus, .field-reference-type-select:focus {
    border-color: #86b7fe;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
}

.field-key-input { flex: 0 1 140px; font-family: monospace; } /* Slightly wider key */
.field-label-input { flex: 1 1 180px; } /* Allow label to grow more */
.field-value-input { flex: 0 1 150px; }
textarea.field-value-input { resize: none; height: auto; min-height: 2.2em; line-height: 1.4; }
.field-value-input-cb { width: auto; margin-left: 5px; flex-shrink: 0; height: auto; }
.field-required-cb { margin-left: 5px; flex-shrink: 0; }
.field-required-label { font-size: 0.8em; color: #6c757d; flex-shrink: 0; cursor: pointer; user-select: none; }

.field-reference-type-select {
    flex: 0 1 140px; /* Match key width */
    cursor: pointer;
}

.field-type-label { font-size: 0.75em; color: #6c757d; white-space: nowrap; flex-shrink: 0; padding: 0 5px; }
.delete-field-btn {
    background: none; border: none; color: #dc3545; font-size: 1.3rem;
    cursor: pointer; padding: 0 4px; line-height: 1; margin-left: auto;
    flex-shrink: 0; opacity: 0.6; transition: opacity 0.2s ease, color 0.2s ease;
}
.form-field-preview:hover .delete-field-btn { opacity: 1; }
.delete-field-btn:hover { color: #a71d2a; }

/* Drag over field indicator */
.form-field-preview.drag-over {
    border-top: 3px solid #0d6efd;
    margin-top: -2px; /* Adjust margin to keep spacing consistent */
    background-color: #eef; /* Slight highlight */
}

/* --- Modal Actions --- */
.modal-actions {
    margin-top: 20px; text-align: right; padding-top: 15px;
    border-top: 1px solid #eee; flex-shrink: 0; /* Prevent actions shrinking */
}
.btn {
    padding: 9px 16px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 0.95rem; margin-left: 10px; transition: background-color 0.2s ease, opacity 0.2s ease;
}
.btn-save { background-color: #198754; color: white; }
.btn-save:hover:not(:disabled) { background-color: #157347; }
.btn-cancel { background-color: #6c757d; color: white; }
.btn-cancel:hover { background-color: #5a6268; }

</style>
