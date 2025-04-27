<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content form-builder-modal">
            <h2>Xây dựng Form Nhập liệu Động (Có Tabs)</h2>

            <div class="form-builder-layout">
                <!-- Palette chứa các loại trường mẫu -->
                <div class="palette">
                    <h4>Kéo loại trường:</h4>
                    <div
                        v-for="fieldType in availableFieldTypes"
                        :key="fieldType.type"
                        class="palette-item"
                        draggable="true"
                        @dragstart="handlePaletteDragStart($event, fieldType.type)"
                    >
                        {{ fieldType.label }}
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
                             <!-- Field List for the Active Tab -->
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
                                >
                                    <span class="drag-handle" title="Kéo để sắp xếp trong tab">⠿</span>
                                    <!-- Key Input - Needs careful handling for uniqueness -->
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

                                    <!-- Default Value Input -->
                                    <input v-if="isValueType(fieldSchema.type, ['text', 'email', 'url', 'date'])" :type="fieldSchema.type" v-model="fieldSchema.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                                    <input v-else-if="fieldSchema.type === 'number'" type="number" v-model.number="fieldSchema.value" placeholder="Giá trị mặc định" class="field-value-input"/>
                                    <textarea v-else-if="fieldSchema.type === 'textarea'" v-model="fieldSchema.value" placeholder="Giá trị mặc định" rows="1" class="field-value-input"></textarea>
                                    <input v-else-if="fieldSchema.type === 'boolean'" type="checkbox" v-model="fieldSchema.value" class="field-value-input-cb"/>


                                    <!-- Add inputs for other props like placeholder, required, description if needed -->
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
                <button type="button" @click="handleSaveSchema" class="btn btn-save">Lưu Cấu trúc Form</button>
                <button type="button" @click="handleCancel" class="btn btn-cancel">Hủy</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits, nextTick } from 'vue';
// import draggable from 'vuedraggable'; // Consider if simple HTML5 D&D becomes too complex

const props = defineProps({
    visible: Boolean,
    // Schema ban đầu để chỉnh sửa, expected new structure with tabs
    initialSchema: {
        type: Object,
        default: () => ({ tabs: [] }) // Default to empty tabs array
    }
});

const emit = defineEmits(['saveSchema', 'cancel']);

// Available field types
const availableFieldTypes = ref([
    { type: 'text', label: 'Chữ (Text)' },
    { type: 'number', label: 'Số (Number)' },
    { type: 'date', label: 'Ngày (Date)' },
    { type: 'textarea', label: 'Văn bản dài (Textarea)' },
    { type: 'boolean', label: 'Đúng/Sai (Checkbox)' },
    { type: 'email', label: 'Email' },
    { type: 'url', label: 'URL' },
    // Add 'select' and 'reference' if you want to configure them here too
    // { type: 'select', label: 'Lựa chọn (Select)' },
    // { type: 'reference', label: 'Tham chiếu (Reference)' },
]);

// Internal state: Array of tab objects
const builtSchemaTabs = ref([]);
const activeTabIndex = ref(0); // Index of the currently active tab

// Drag & Drop State
const draggingFieldType = ref(null); // Type from palette
const draggingTabIndex = ref(null);  // Source tab index when dragging field
const draggingFieldKey = ref(null);  // Source field key when dragging field
const dragOverFieldKey = ref(null); // Target field key when dragging over

// --- Watchers ---
watch(() => props.visible, (newVisible) => {
    if (newVisible) {
        // Deep clone initial schema to avoid modifying prop
        let schemaToLoad;
        try {
            schemaToLoad = structuredClone(props.initialSchema || { tabs: [] });
        } catch (e) {
            console.warn("structuredClone failed, using JSON fallback for initial schema.");
            schemaToLoad = JSON.parse(JSON.stringify(props.initialSchema || { tabs: [] }));
        }

        // Ensure schema has the 'tabs' array structure
        if (!schemaToLoad || !Array.isArray(schemaToLoad.tabs)) {
            console.warn("Initial schema is missing or invalid 'tabs' array. Creating default tab.");
            builtSchemaTabs.value = [{ id: `tab_${Date.now()}`, label: 'Tab 1', fields: {} }];
        } else if (schemaToLoad.tabs.length === 0) {
             builtSchemaTabs.value = [{ id: `tab_${Date.now()}`, label: 'Tab 1', fields: {} }];
             console.log("Initial schema has no tabs. Created default tab.");
        }
        else {
            // Ensure each tab has an ID and a fields object
            builtSchemaTabs.value = schemaToLoad.tabs.map((tab, index) => ({
                id: tab.id || `tab_${Date.now()}_${index}`, // Generate ID if missing
                label: tab.label || `Tab ${index + 1}`,
                fields: tab.fields && typeof tab.fields === 'object' ? tab.fields : {} // Ensure fields is an object
            }));
            console.log("Form builder initialized with tabs:", builtSchemaTabs.value);
        }
        activeTabIndex.value = 0; // Activate the first tab
    } else {
        // Reset state when closing
        builtSchemaTabs.value = [];
        activeTabIndex.value = 0;
        draggingFieldType.value = null;
        draggingTabIndex.value = null;
        draggingFieldKey.value = null;
        dragOverFieldKey.value = null;
        console.log("Form builder closed and reset.");
    }
}, { immediate: true, deep: true }); // Deep watch might be needed if initialSchema changes while modal is open

// --- Helper Functions ---
const isValueType = (type, typesArray) => typesArray.includes(type);

const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return '';
        default: return '';
    }
};

const generateUniqueFieldKey = (baseKey, tabIndex) => {
    let newKey = baseKey.trim().replace(/\s+/g, '_'); // Basic sanitization
    if (!newKey) newKey = 'new_field';
    let counter = 1;
    const currentKeys = Object.keys(builtSchemaTabs.value[tabIndex]?.fields || {});
    let finalKey = newKey;
    while (currentKeys.includes(finalKey)) {
        finalKey = `${newKey}_${counter}`;
        counter++;
    }
    return finalKey;
};

// --- Tab Management ---
const addTab = () => {
    const newTabId = `tab_${Date.now()}`;
    builtSchemaTabs.value.push({
        id: newTabId,
        label: `Tab Mới ${builtSchemaTabs.value.length + 1}`,
        fields: {}
    });
    // Activate the newly added tab
    activeTabIndex.value = builtSchemaTabs.value.length - 1;
    console.log("Added new tab:", newTabId);
};

const removeTab = (tabIndex) => {
    if (builtSchemaTabs.value.length <= 1) {
        alert("Không thể xóa tab cuối cùng.");
        return;
    }
    if (confirm(`Bạn có chắc muốn xóa tab "${builtSchemaTabs.value[tabIndex].label}" và tất cả các trường trong đó?`)) {
        builtSchemaTabs.value.splice(tabIndex, 1);
        // Adjust active tab index if necessary
        if (activeTabIndex.value >= tabIndex && activeTabIndex.value > 0) {
            activeTabIndex.value--;
        } else if (builtSchemaTabs.value.length > 0) {
             activeTabIndex.value = 0; // Go to first tab if active one was deleted
        } else {
            activeTabIndex.value = -1; // Should not happen due to guard above
        }
        console.log("Removed tab at index:", tabIndex);
    }
};

// --- Drag & Drop Handlers ---

// Palette Drag Start
const handlePaletteDragStart = (event, fieldType) => {
    draggingFieldType.value = fieldType;
    draggingTabIndex.value = null; // Ensure not dragging internal field
    draggingFieldKey.value = null;
    event.dataTransfer.effectAllowed = 'copy';
    try { event.dataTransfer.setData('text/plain', fieldType); } catch(e) {}
    console.log(`Dragging from palette: ${fieldType}`);
};

// Canvas Drag Over (Tab Content Area)
const handleCanvasDragOver = (event, tabIndex) => {
    event.preventDefault();
    if (draggingFieldType.value) { // Dragging from palette
        event.dataTransfer.dropEffect = 'copy';
    } else if (draggingTabIndex.value !== null && draggingTabIndex.value === tabIndex) { // Dragging within the same tab
        event.dataTransfer.dropEffect = 'move';
    } else if (draggingTabIndex.value !== null && draggingTabIndex.value !== tabIndex) { // Dragging from another tab
        event.dataTransfer.dropEffect = 'copy'; // Treat as copy/move between tabs for now
         // TODO: Implement move between tabs if needed (more complex state management)
    }
    else {
        event.dataTransfer.dropEffect = 'none';
    }
};

// Canvas Drop (Tab Content Area) - Handles drops from Palette
const handleCanvasDrop = (event, targetTabIndex) => {
    event.preventDefault();
    const fieldType = draggingFieldType.value || event.dataTransfer.getData('text/plain');
    console.log(`Dropped on tab index: ${targetTabIndex}. Type detected: ${fieldType}`);

    if (fieldType && availableFieldTypes.value.some(f => f.type === fieldType)) {
        const baseKey = `Trường mới`;
        const newFieldKey = generateUniqueFieldKey(baseKey, targetTabIndex);
        const newFieldSchema = {
            label: baseKey, // Default label
            type: fieldType,
            value: getDefaultValue(fieldType),
            required: false // Default required to false
            // Add other default properties like placeholder, description here if needed
        };

        // Ensure the target tab's fields object exists
        if (!builtSchemaTabs.value[targetTabIndex].fields) {
             builtSchemaTabs.value[targetTabIndex].fields = {};
        }

        // Add the new field
        builtSchemaTabs.value[targetTabIndex].fields[newFieldKey] = newFieldSchema;
        console.log(`Added new field '${newFieldKey}' to tab ${targetTabIndex}:`, newFieldSchema);

        // Use nextTick to ensure DOM is updated before potential focus or scroll
        nextTick(() => {
            // Maybe scroll the new field into view or focus its key input
        });

    } else if (draggingTabIndex.value !== null && draggingTabIndex.value !== targetTabIndex) {
        // --- Handle Drop From Another Tab (Move Logic) ---
        const sourceTab = builtSchemaTabs.value[draggingTabIndex.value];
        const targetTab = builtSchemaTabs.value[targetTabIndex];
        const fieldKeyToMove = draggingFieldKey.value;

        if (sourceTab && targetTab && fieldKeyToMove && sourceTab.fields[fieldKeyToMove]) {
             // Check for key collision in target tab
             if (targetTab.fields[fieldKeyToMove]) {
                 alert(`Lỗi: Mã định danh (Key) "${fieldKeyToMove}" đã tồn tại trong tab đích. Vui lòng đổi tên trước khi di chuyển.`);
             } else {
                 // Move the field
                 targetTab.fields[fieldKeyToMove] = sourceTab.fields[fieldKeyToMove];
                 delete sourceTab.fields[fieldKeyToMove];
                 console.log(`Moved field '${fieldKeyToMove}' from tab ${draggingTabIndex.value} to ${targetTabIndex}`);
             }
        } else {
             console.warn("Could not move field between tabs. Invalid state.");
        }
    }
     else {
        console.warn("Invalid drop operation on canvas.");
    }

    // Reset palette drag state
    draggingFieldType.value = null;
    // Reset internal drag state completely
    handleFieldDragEnd();
};


// Field Drag Start (Inside a Tab)
const handleFieldDragStart = (event, tabIndex, fieldKey) => {
    draggingTabIndex.value = tabIndex;
    draggingFieldKey.value = fieldKey;
    draggingFieldType.value = null; // Ensure not dragging from palette
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', fieldKey); } catch(e) {} // Set data for potential external drop?
    event.target.classList.add('dragging-field');
    console.log(`Start dragging field '${fieldKey}' from tab index: ${tabIndex}`);
};

// Field Drag Over (Another Field in the Same Tab)
const handleFieldDragOver = (event, tabIndex, targetFieldKey) => {
    event.preventDefault();
    // Allow drop only if dragging within the same tab and not over itself
    if (draggingTabIndex.value === tabIndex && draggingFieldKey.value !== targetFieldKey) {
        dragOverFieldKey.value = targetFieldKey;
        event.dataTransfer.dropEffect = 'move';
    } else {
        dragOverFieldKey.value = null;
        event.dataTransfer.dropEffect = 'none';
    }
};

// Field Drop (Onto Another Field in the Same Tab) - Reordering
const handleFieldDrop = (event, targetTabIndex, targetFieldKey) => {
    event.preventDefault();
    console.log(`Drop field onto key: '${targetFieldKey}' in tab ${targetTabIndex}. Dragging key: '${draggingFieldKey.value}' from tab ${draggingTabIndex.value}`);

    // Check if it's a valid reorder drop within the same tab
    if (draggingTabIndex.value === targetTabIndex && draggingFieldKey.value && draggingFieldKey.value !== targetFieldKey) {
        const tabFields = builtSchemaTabs.value[targetTabIndex].fields;
        const fieldKeys = Object.keys(tabFields);
        const fieldSchemas = Object.values(tabFields);

        const draggedIndex = fieldKeys.indexOf(draggingFieldKey.value);
        const targetIndex = fieldKeys.indexOf(targetFieldKey);

        if (draggedIndex > -1 && targetIndex > -1) {
            // Reorder logic: Create a new ordered object
            const newOrderedFields = {};
            const draggedItemKey = fieldKeys.splice(draggedIndex, 1)[0]; // Remove dragged key
            const draggedItemSchema = fieldSchemas.splice(draggedIndex, 1)[0]; // Remove dragged schema

            // Insert at the target position
            fieldKeys.splice(targetIndex, 0, draggedItemKey);
            fieldSchemas.splice(targetIndex, 0, draggedItemSchema);

            // Rebuild the fields object
            fieldKeys.forEach((key, index) => {
                newOrderedFields[key] = fieldSchemas[index];
            });

            builtSchemaTabs.value[targetTabIndex].fields = newOrderedFields;
            console.log("Reordered fields in tab. New order:", Object.keys(newOrderedFields));
        } else {
             console.error("Error reordering fields: Could not find dragged or target index.");
        }
    } else {
         console.warn("Invalid field drop for reordering.");
    }

    // Reset drag state
    handleFieldDragEnd();
};

// Field Drag End
const handleFieldDragEnd = (event) => {
    if (event?.target && typeof event.target.classList?.remove === 'function') {
        event.target.classList.remove('dragging-field');
    }
    draggingTabIndex.value = null;
    draggingFieldKey.value = null;
    dragOverFieldKey.value = null;
    draggingFieldType.value = null; // Also reset palette drag type just in case
    // console.log("Drag field end.");
};


// --- Field Management ---

const removeField = (tabIndex, fieldKey) => {
    if (builtSchemaTabs.value[tabIndex]?.fields && builtSchemaTabs.value[tabIndex].fields[fieldKey]) {
        if (confirm(`Bạn có chắc muốn xóa trường "${builtSchemaTabs.value[tabIndex].fields[fieldKey].label || fieldKey}"?`)) {
            delete builtSchemaTabs.value[tabIndex].fields[fieldKey];
            console.log(`Removed field '${fieldKey}' from tab ${tabIndex}`);
        }
    }
};

// Handle Key Input Change - Crucial for maintaining object structure
const updateFieldKey = (tabIndex, oldKey, newKeyInput) => {
    const newKey = newKeyInput.trim();
    if (newKey === oldKey || !newKey) return; // No change or empty key

    const fields = builtSchemaTabs.value[tabIndex].fields;

    // Check if the new key already exists in this tab
    if (fields.hasOwnProperty(newKey)) {
        alert(`Lỗi: Mã định danh (Key) "${newKey}" đã tồn tại trong tab này. Vui lòng chọn key khác.`);
        // Reset input visually - find the input element and set its value back
         nextTick(() => {
             const inputElement = document.querySelector(`.form-field-preview input[value="${oldKey}"]`); // Might need a more specific selector
             if (inputElement) inputElement.value = oldKey;
         });
        return;
    }

    // Rebuild the fields object preserving order and changing the key
    const newFields = {};
    for (const key in fields) {
        if (key === oldKey) {
            newFields[newKey] = fields[oldKey]; // Assign schema to the new key
        } else {
            newFields[key] = fields[key]; // Keep other fields as they are
        }
    }
    builtSchemaTabs.value[tabIndex].fields = newFields;
    console.log(`Updated field key from '${oldKey}' to '${newKey}' in tab ${tabIndex}`);

     // If this field was being dragged, update the dragging key state
     if (draggingTabIndex.value === tabIndex && draggingFieldKey.value === oldKey) {
         draggingFieldKey.value = newKey;
     }
};


// --- Modal Actions ---

const handleSaveSchema = () => {
    const finalSchema = { tabs: [] };
    let hasError = false;
    const allKeys = new Set(); // Track keys across ALL tabs

    for (const tab of builtSchemaTabs.value) {
        const finalTab = {
            id: tab.id,
            label: tab.label?.trim() || 'Tab không tên',
            fields: {}
        };

        if (!finalTab.label) {
             alert(`Lỗi: Một tab chưa được đặt tên.`);
             hasError = true;
             break;
        }

        const currentTabKeys = new Set(); // Track keys within the current tab for intra-tab validation (already handled by updateFieldKey, but good failsafe)

        for (const fieldKey in tab.fields) {
            const key = fieldKey.trim(); // Should already be trimmed by updateFieldKey
            const fieldSchema = tab.fields[fieldKey];

            if (!key) {
                alert(`Lỗi: Có một trường trong tab "${finalTab.label}" chưa có Mã định danh (Key).`);
                hasError = true;
                break;
            }
             if (!fieldSchema.label || !fieldSchema.label.trim()) {
                alert(`Lỗi: Trường "${key}" trong tab "${finalTab.label}" chưa có Nhãn hiển thị.`);
                hasError = true;
                break;
            }

            // Check for duplicate key across all tabs
            if (allKeys.has(key)) {
                alert(`Lỗi: Mã định danh (Key) "${key}" bị trùng lặp giữa các tab. Key phải là duy nhất trong toàn bộ form.`);
                hasError = true;
                break;
            }
            allKeys.add(key);
            currentTabKeys.add(key); // Add to current tab set as well

            // Prepare final field schema (type conversion, etc.)
            let finalValue = fieldSchema.value;
            try {
                if (fieldSchema.type === 'number') {
                    finalValue = (fieldSchema.value === '' || fieldSchema.value === null) ? null : parseFloat(fieldSchema.value);
                    if (fieldSchema.value !== '' && fieldSchema.value !== null && isNaN(finalValue)) finalValue = 0;
                } else if (fieldSchema.type === 'boolean') {
                    finalValue = Boolean(fieldSchema.value);
                }
            } catch (e) {
                 console.error(`Error converting value for key "${key}":`, e);
                 finalValue = getDefaultValue(fieldSchema.type);
            }

            finalTab.fields[key] = {
                // Include all relevant properties
                label: fieldSchema.label.trim(),
                type: fieldSchema.type,
                value: finalValue,
                required: fieldSchema.required || false,
                placeholder: fieldSchema.placeholder || '',
                description: fieldSchema.description || '',
                // Add options/referenceType if you manage them here
                ...(fieldSchema.type === 'select' && { options: fieldSchema.options || [] }),
                ...(fieldSchema.type === 'reference' && { referenceType: fieldSchema.referenceType || '' }),
            };
        } // End loop through fields in a tab

        if (hasError) break; // Stop processing tabs if error found

        finalSchema.tabs.push(finalTab);

    } // End loop through tabs

    if (!hasError) {
        // Final validation: Ensure at least one tab exists
        if (finalSchema.tabs.length === 0) {
             alert("Lỗi: Cấu trúc form phải có ít nhất một tab.");
             hasError = true;
        }
        // Optional: Ensure at least one field exists somewhere?
        // const totalFields = finalSchema.tabs.reduce((count, tab) => count + Object.keys(tab.fields).length, 0);
        // if (totalFields === 0) {
        //     alert("Lỗi: Cấu trúc form phải có ít nhất một trường dữ liệu.");
        //     hasError = true;
        // }
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
/* --- Base Modal Styles (Keep existing) --- */
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1000;
}
.modal-content {
    background-color: #fff; padding: 25px; border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    display: flex; /* Make content flex column */
    flex-direction: column;
    overflow: hidden; /* Prevent content overflow */
}

/* --- Form Builder Specific Styles --- */
.form-builder-modal {
    min-width: 750px; /* Wider for tabs */
    max-width: 95vw;
    min-height: 550px; /* Taller */
    max-height: 90vh;
}

h2 {
    margin-top: 0; margin-bottom: 20px; color: #333; text-align: center;
    flex-shrink: 0; /* Prevent shrinking */
}

.form-builder-layout {
    display: flex; gap: 20px; margin-bottom: 20px;
    flex-grow: 1; /* Allow layout to fill space */
    min-height: 0; /* Important for nested flex/overflow */
    overflow: hidden; /* Prevent layout overflow */
}

/* --- Palette --- */
.palette {
    width: 200px;
    border: 1px solid #e0e0e0; padding: 15px; background-color: #f9f9f9;
    border-radius: 4px; flex-shrink: 0;
    display: flex; flex-direction: column; /* Stack items vertically */
    overflow-y: auto; /* Allow palette scrolling if needed */
}
.palette h4 { margin-top: 0; margin-bottom: 10px; font-size: 0.95em; color: #444; }
.palette-item {
    background-color: #e7f3ff; border: 1px solid #b3d7ff; padding: 8px 12px;
    margin-bottom: 8px; border-radius: 4px; cursor: grab; font-size: 0.9rem;
    text-align: center; transition: background-color 0.2s ease;
}
.palette-item:hover { background-color: #d0e8ff; }
.palette-item:active { cursor: grabbing; background-color: #b3d7ff; }
.palette hr { width: 100%; border: 0; border-top: 1px solid #e0e0e0; margin: 15px 0; }
.btn-add-tab {
    background-color: #28a745; color: white; border: none; padding: 8px 12px;
    border-radius: 4px; cursor: pointer; font-size: 0.9rem; margin-top: 5px;
}
.btn-add-tab:hover { background-color: #218838; }

/* --- Canvas & Tabs --- */
.form-builder-canvas {
    flex-grow: 1; border: 1px solid #ccc; border-radius: 4px;
    background-color: #fff; display: flex; flex-direction: column; /* Stack tabs vertically */
    overflow: hidden; /* Prevent canvas overflow */
}
.tabs-container {
    display: flex; flex-direction: column;
    flex-grow: 1; /* Allow tabs container to fill space */
    min-height: 0; /* Important for nested flex/overflow */
}
.tab-headers {
    display: flex; flex-wrap: wrap; /* Allow tabs to wrap */
    border-bottom: 1px solid #ccc; background-color: #f1f1f1;
    flex-shrink: 0; /* Prevent shrinking */
}
.tab-header {
    padding: 8px 10px; cursor: pointer; border-right: 1px solid #ccc;
    background-color: #e9ecef; color: #495057; font-size: 0.9em;
    position: relative; /* For positioning delete button */
    display: flex; /* Align input and button */
    align-items: center;
    gap: 5px;
    min-width: 100px; /* Minimum width for a tab */
}
.tab-header:last-child { border-right: none; }
.tab-header:hover { background-color: #dee2e6; }
.tab-header.active {
    background-color: #fff; border-bottom: 1px solid #fff; margin-bottom: -1px; /* Overlap border */
    color: #007bff; font-weight: bold;
}
.tab-label-input {
    border: none; background: transparent; font-size: inherit; color: inherit;
    font-weight: inherit; padding: 2px 4px; outline: none;
    width: 100%; /* Take available space */
    min-width: 80px;
}
.tab-header.active .tab-label-input {
    border-bottom: 1px dashed #ccc; /* Indicate editable */
}
.delete-tab-btn {
    background: none; border: none; color: #dc3545; font-size: 1.2rem;
    cursor: pointer; padding: 0 3px; line-height: 1;
    opacity: 0.5;
}
.tab-header:hover .delete-tab-btn { opacity: 1; }
.delete-tab-btn:hover { color: #a71d2a; }

.tab-content {
    padding: 20px; flex-grow: 1; /* Allow content to fill space */
    overflow-y: auto; /* Enable scrolling for fields list */
    background-color: #fff;
    border: 2px dashed transparent; /* Placeholder for drag over */
    min-height: 200px; /* Ensure drop zone is accessible */
}
.tab-content[style*="display: none;"] { /* Hide content of inactive tabs */
    /* display: none; */ /* v-show handles this */
}
.canvas-placeholder, .canvas-placeholder-inner {
    text-align: center; color: #aaa; font-style: italic; padding: 40px 10px;
    position: relative; /* Needed if using absolute positioning inside */
}
.canvas-placeholder-inner { padding: 20px 10px; }

/* --- Fields List & Preview --- */
.fields-list {
    /* No extra styles needed unless specific layout required */
}
.form-field-preview {
    background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 8px 10px; /* Slightly smaller padding */
    margin-bottom: 8px; border-radius: 4px; display: flex; align-items: center;
    gap: 8px; /* Slightly smaller gap */
    cursor: move; transition: background-color 0.1s ease, border-top 0.1s ease;
    font-size: 0.9rem; /* Smaller base font */
}
.form-field-preview.dragging-field { opacity: 0.5; background-color: #e9ecef; }
.drag-handle { cursor: grab; color: #adb5bd; padding-right: 4px; font-size: 1.1em; }
.form-field-preview:active .drag-handle { cursor: grabbing; }

/* Input fields within preview */
.field-key-input, .field-label-input, .field-value-input {
    padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px;
    font-size: 0.85rem; /* Smaller font in fields */
}
.field-key-input { flex: 0 1 120px; font-family: monospace; } /* Fixed width, monospace */
.field-label-input { flex: 1 1 150px; } /* Flexible width */
.field-value-input { flex: 0 1 140px; } /* Fixed width */
textarea.field-value-input { resize: none; line-height: 1.3; height: auto; min-height: 2.2em; }
.field-value-input-cb { width: auto; margin-left: 5px; flex-shrink: 0; }
.field-required-cb { margin-left: 5px; flex-shrink: 0; }
.field-required-label { font-size: 0.8em; color: #6c757d; flex-shrink: 0; cursor: pointer; }

.field-type-label { font-size: 0.75em; color: #6c757d; white-space: nowrap; flex-shrink: 0; }
.delete-field-btn {
    background: none; border: none; color: #dc3545; font-size: 1.3rem;
    cursor: pointer; padding: 0 4px; line-height: 1; margin-left: auto; /* Push to end */
    flex-shrink: 0;
}
.delete-field-btn:hover { color: #a71d2a; }

/* Drag over field indicator */
.form-field-preview.drag-over {
    border-top: 3px solid #0d6efd;
    margin-top: -2px; /* Adjust for border */
}

/* --- Modal Actions --- */
.modal-actions {
    margin-top: 20px; text-align: right; padding-top: 15px;
    border-top: 1px solid #eee; flex-shrink: 0; /* Prevent shrinking */
}
.btn {
    padding: 9px 16px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 0.95rem; margin-left: 10px; transition: background-color 0.2s ease;
}
.btn-save { background-color: #198754; color: white; }
.btn-save:hover { background-color: #157347; }
.btn-cancel { background-color: #6c757d; color: white; }
.btn-cancel:hover { background-color: #5a6268; }

</style>
