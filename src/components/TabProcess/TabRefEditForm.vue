<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content form-builder-modal">
            <!-- Title changed to reflect tabs -->
            <h2>Xây dựng Form Nhập liệu Động (Có Tabs và Tham chiếu)</h2>

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

                <!-- Canvas/Khu vực xây dựng form (Tab Structure from TabEditForm) -->
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
                                    <!-- *** NEW: Reference Type Selector *** -->
                                    <select v-else-if="fieldSchema.type === 'reference'" v-model="fieldSchema.referenceType" class="field-reference-type-select" title="Chọn loại tham chiếu">
                                        <option v-for="refType in availableReferenceTypes" :key="refType" :value="refType">
                                            {{ refType }}
                                        </option>
                                    </select>
                                    <!-- Optional: Input for default reference ID (can be added later if needed) -->
                                    <!-- <input v-if="fieldSchema.type === 'reference'" v-model="fieldSchema.value" placeholder="Default ID (optional)" class="field-value-input"/> -->


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
                <button type="button" @click="handleSaveSchema" class="btn btn-save">Lưu Cấu trúc Form</button>
                <button type="button" @click="handleCancel" class="btn btn-cancel">Hủy</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits, nextTick } from 'vue';

const props = defineProps({
    visible: Boolean,
    // Schema ban đầu để chỉnh sửa, expected new structure with tabs
    initialSchema: {
        type: Object,
        default: () => ({ tabs: [] }) // Default to empty tabs array
    }
});

const emit = defineEmits(['saveSchema', 'cancel']);

// Available field types (including reference)
const availableFieldTypes = ref([
    { type: 'text', label: 'Chữ (Text)' },
    { type: 'number', label: 'Số (Number)' },
    { type: 'date', label: 'Ngày (Date)' },
    { type: 'textarea', label: 'Văn bản dài (Textarea)' },
    { type: 'boolean', label: 'Đúng/Sai (Checkbox)' },
    { type: 'email', label: 'Email' },
    { type: 'url', label: 'URL' },
    { type: 'reference', label: 'Tham chiếu (Reference)' }, // <-- ADDED reference type
]);

// *** NEW: Available reference types ***
const availableReferenceTypes = ref(['Customer', 'Employee', 'DocumentType']); // Example types

// Internal state: Array of tab objects (from TabEditForm)
const builtSchemaTabs = ref([]);
const activeTabIndex = ref(0); // Index of the currently active tab

// Drag & Drop State (from TabEditForm)
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
            // Ensure each tab has an ID and a fields object, and handle referenceType
            builtSchemaTabs.value = schemaToLoad.tabs.map((tab, index) => {
                const processedFields = {};
                if (tab.fields && typeof tab.fields === 'object') {
                    for (const key in tab.fields) {
                        const field = tab.fields[key];
                        processedFields[key] = { ...field }; // Clone field data
                        // *** NEW: Ensure referenceType is set for reference fields ***
                        if (field.type === 'reference') {
                            processedFields[key].referenceType = field.referenceType && availableReferenceTypes.value.includes(field.referenceType)
                                ? field.referenceType
                                : availableReferenceTypes.value[0]; // Default if missing/invalid
                            // Ensure value is appropriate (likely null)
                            processedFields[key].value = field.value ?? getDefaultValue('reference');
                        } else {
                            // Ensure value exists for other types
                             processedFields[key].value = field.value ?? getDefaultValue(field.type);
                        }
                        // Ensure other common props exist
                        processedFields[key].label = field.label || key;
                        processedFields[key].required = field.required || false;
                    }
                }
                return {
                    id: tab.id || `tab_${Date.now()}_${index}`, // Generate ID if missing
                    label: tab.label || `Tab ${index + 1}`,
                    fields: processedFields // Use processed fields
                };
            });
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
}, { immediate: true, deep: true });

// --- Helper Functions ---
const isValueType = (type, typesArray) => typesArray.includes(type);

const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return '';
        case 'reference': return null; // Default value for reference
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

// --- Tab Management (from TabEditForm) ---
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
        builtSchemaTabs.value.splice(tabIndex, 1);
        if (activeTabIndex.value >= tabIndex && activeTabIndex.value > 0) {
            activeTabIndex.value--;
        } else if (builtSchemaTabs.value.length > 0) {
             activeTabIndex.value = 0;
        } else {
            activeTabIndex.value = -1;
        }
        console.log("Removed tab at index:", tabIndex);
    }
};

// --- Drag & Drop Handlers (from TabEditForm, adapted for reference type) ---

const handlePaletteDragStart = (event, fieldType) => {
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
        event.dataTransfer.dropEffect = 'move';
    } else if (draggingTabIndex.value !== null && draggingTabIndex.value !== tabIndex) {
        event.dataTransfer.dropEffect = 'copy'; // Or 'move' if implementing true move between tabs
    }
    else {
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleCanvasDrop = (event, targetTabIndex) => {
    event.preventDefault();
    const fieldType = draggingFieldType.value || event.dataTransfer.getData('text/plain');
    console.log(`Dropped on tab index: ${targetTabIndex}. Type detected: ${fieldType}`);

    if (fieldType && availableFieldTypes.value.some(f => f.type === fieldType)) {
        const baseKey = `Trường mới`;
        const newFieldKey = crypto.randomUUID(); // Generate a unique key
        
        const newFieldSchema = {
            label: baseKey,
            type: fieldType,
            value: getDefaultValue(fieldType),
            required: false
        };

        // *** NEW: Set default referenceType if needed ***
        if (fieldType === 'reference') {
            newFieldSchema.referenceType = availableReferenceTypes.value[0]; // Default to first type
        }

        if (!builtSchemaTabs.value[targetTabIndex].fields) {
             builtSchemaTabs.value[targetTabIndex].fields = {};
        }

        builtSchemaTabs.value[targetTabIndex].fields[newFieldKey] = newFieldSchema;
        console.log(`Added new field '${newFieldKey}' to tab ${targetTabIndex}:`, newFieldSchema);

        nextTick(() => { /* Optional: focus/scroll */ });

    } else if (draggingTabIndex.value !== null && draggingTabIndex.value !== targetTabIndex) {
        // Handle Drop From Another Tab (Move Logic)
        const sourceTab = builtSchemaTabs.value[draggingTabIndex.value];
        const targetTab = builtSchemaTabs.value[targetTabIndex];
        const fieldKeyToMove = draggingFieldKey.value;

        if (sourceTab && targetTab && fieldKeyToMove && sourceTab.fields[fieldKeyToMove]) {
             if (targetTab.fields[fieldKeyToMove]) {
                 alert(`Lỗi: Mã định danh (Key) "${fieldKeyToMove}" đã tồn tại trong tab đích. Vui lòng đổi tên trước khi di chuyển.`);
             } else {
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

    draggingFieldType.value = null;
    handleFieldDragEnd();
};


const handleFieldDragStart = (event, tabIndex, fieldKey) => {
    draggingTabIndex.value = tabIndex;
    draggingFieldKey.value = fieldKey;
    draggingFieldType.value = null;
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', fieldKey); } catch(e) {}
    event.target.classList.add('dragging-field');
    console.log(`Start dragging field '${fieldKey}' from tab index: ${tabIndex}`);
};

const handleFieldDragOver = (event, tabIndex, targetFieldKey) => {
    event.preventDefault();
    if (draggingTabIndex.value === tabIndex && draggingFieldKey.value !== targetFieldKey) {
        dragOverFieldKey.value = targetFieldKey;
        event.dataTransfer.dropEffect = 'move';
    } else {
        dragOverFieldKey.value = null;
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleFieldDrop = (event, targetTabIndex, targetFieldKey) => {
    event.preventDefault();
    console.log(`Drop field onto key: '${targetFieldKey}' in tab ${targetTabIndex}. Dragging key: '${draggingFieldKey.value}' from tab ${draggingTabIndex.value}`);

    if (draggingTabIndex.value === targetTabIndex && draggingFieldKey.value && draggingFieldKey.value !== targetFieldKey) {
        const tabFields = builtSchemaTabs.value[targetTabIndex].fields;
        const fieldKeys = Object.keys(tabFields);
        const fieldSchemas = Object.values(tabFields);

        const draggedIndex = fieldKeys.indexOf(draggingFieldKey.value);
        const targetIndex = fieldKeys.indexOf(targetFieldKey);

        if (draggedIndex > -1 && targetIndex > -1) {
            const newOrderedFields = {};
            const draggedItemKey = fieldKeys.splice(draggedIndex, 1)[0];
            const draggedItemSchema = fieldSchemas.splice(draggedIndex, 1)[0];

            fieldKeys.splice(targetIndex, 0, draggedItemKey);
            fieldSchemas.splice(targetIndex, 0, draggedItemSchema);

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
    handleFieldDragEnd();
};

const handleFieldDragEnd = (event) => {
    if (event?.target && typeof event.target.classList?.remove === 'function') {
        event.target.classList.remove('dragging-field');
    }
    draggingTabIndex.value = null;
    draggingFieldKey.value = null;
    dragOverFieldKey.value = null;
    draggingFieldType.value = null;
};


// --- Field Management (from TabEditForm) ---

const removeField = (tabIndex, fieldKey) => {
    if (builtSchemaTabs.value[tabIndex]?.fields && builtSchemaTabs.value[tabIndex].fields[fieldKey]) {
        if (confirm(`Bạn có chắc muốn xóa trường "${builtSchemaTabs.value[tabIndex].fields[fieldKey].label || fieldKey}"?`)) {
            delete builtSchemaTabs.value[tabIndex].fields[fieldKey];
            console.log(`Removed field '${fieldKey}' from tab ${tabIndex}`);
        }
    }
};

const updateFieldKey = (tabIndex, oldKey, newKeyInput) => {
    const newKey = newKeyInput.trim();
    if (newKey === oldKey || !newKey) return;

    const fields = builtSchemaTabs.value[tabIndex].fields;

    if (fields.hasOwnProperty(newKey)) {
        alert(`Lỗi: Mã định danh (Key) "${newKey}" đã tồn tại trong tab này. Vui lòng chọn key khác.`);
         nextTick(() => {
             const inputElement = document.querySelector(`.form-field-preview input[value="${oldKey}"]`);
             if (inputElement) inputElement.value = oldKey;
         });
        return;
    }

    const newFields = {};
    for (const key in fields) {
        if (key === oldKey) {
            newFields[newKey] = fields[oldKey];
        } else {
            newFields[key] = fields[key];
        }
    }
    builtSchemaTabs.value[tabIndex].fields = newFields;
    console.log(`Updated field key from '${oldKey}' to '${newKey}' in tab ${tabIndex}`);

     if (draggingTabIndex.value === tabIndex && draggingFieldKey.value === oldKey) {
         draggingFieldKey.value = newKey;
     }
};


// --- Modal Actions (from TabEditForm, adapted for reference type) ---

const handleSaveSchema = () => {
    const finalSchema = { tabs: [] };
    let hasError = false;
    const allKeys = new Set();

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

        const currentTabKeys = new Set();

        for (const fieldKey in tab.fields) {
            const key = fieldKey.trim();
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

            if (allKeys.has(key)) {
                alert(`Lỗi: Mã định danh (Key) "${key}" bị trùng lặp giữa các tab. Key phải là duy nhất trong toàn bộ form.`);
                hasError = true;
                break;
            }
            allKeys.add(key);
            currentTabKeys.add(key);

            // Prepare final field schema
            let finalValue = fieldSchema.value;
            const finalFieldDefinition = {
                label: fieldSchema.label.trim(),
                type: fieldSchema.type,
                required: fieldSchema.required || false,
                placeholder: fieldSchema.placeholder || '',
                description: fieldSchema.description || '',
            };

            try {
                if (fieldSchema.type === 'number') {
                    finalValue = (fieldSchema.value === '' || fieldSchema.value === null) ? null : parseFloat(fieldSchema.value);
                    if (fieldSchema.value !== '' && fieldSchema.value !== null && isNaN(finalValue)) finalValue = 0;
                } else if (fieldSchema.type === 'boolean') {
                    finalValue = Boolean(fieldSchema.value);
                } else if (fieldSchema.type === 'reference') {
                    // *** NEW: Add referenceType to the saved schema ***
                    if (!fieldSchema.referenceType || !availableReferenceTypes.value.includes(fieldSchema.referenceType)) {
                         console.warn(`Field "${key}" in tab "${finalTab.label}" is type 'reference' but has invalid/missing referenceType. Defaulting.`);
                         finalFieldDefinition.referenceType = availableReferenceTypes.value[0]; // Default on save if invalid
                    } else {
                         finalFieldDefinition.referenceType = fieldSchema.referenceType;
                    }
                    // Value for reference is typically an ID, keep it as is (likely null)
                    finalValue = fieldSchema.value;
                }
                // Add options if managing select type here
                // ...(fieldSchema.type === 'select' && { options: fieldSchema.options || [] }),
            } catch (e) {
                 console.error(`Error converting value for key "${key}":`, e);
                 finalValue = getDefaultValue(fieldSchema.type);
            }

            finalFieldDefinition.value = finalValue;
            finalTab.fields[key] = finalFieldDefinition;

        } // End loop through fields in a tab

        if (hasError) break;

        finalSchema.tabs.push(finalTab);

    } // End loop through tabs

    if (!hasError) {
        if (finalSchema.tabs.length === 0) {
             alert("Lỗi: Cấu trúc form phải có ít nhất một tab.");
             hasError = true;
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
/* --- Base Modal Styles (Keep existing from TabEditForm) --- */
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1000;
}
.modal-content {
    background-color: #fff; padding: 25px; border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    display: flex; flex-direction: column;
    overflow: hidden;
}

/* --- Form Builder Specific Styles (Keep existing from TabEditForm) --- */
.form-builder-modal {
    min-width: 750px; max-width: 95vw;
    min-height: 550px; max-height: 90vh;
}

h2 {
    margin-top: 0; margin-bottom: 20px; color: #333; text-align: center;
    flex-shrink: 0;
}

.form-builder-layout {
    display: flex; gap: 20px; margin-bottom: 20px;
    flex-grow: 1; min-height: 0; overflow: hidden;
}

/* --- Palette (Keep existing from TabEditForm) --- */
.palette {
    width: 200px;
    border: 1px solid #e0e0e0; padding: 15px; background-color: #f9f9f9;
    border-radius: 4px; flex-shrink: 0;
    display: flex; flex-direction: column; overflow-y: auto;
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

/* --- Canvas & Tabs (Keep existing from TabEditForm) --- */
.form-builder-canvas {
    flex-grow: 1; border: 1px solid #ccc; border-radius: 4px;
    background-color: #fff; display: flex; flex-direction: column;
    overflow: hidden;
}
.tabs-container {
    display: flex; flex-direction: column;
    flex-grow: 1; min-height: 0;
}
.tab-headers {
    display: flex; flex-wrap: wrap;
    border-bottom: 1px solid #ccc; background-color: #f1f1f1;
    flex-shrink: 0;
}
.tab-header {
    padding: 8px 10px; cursor: pointer; border-right: 1px solid #ccc;
    background-color: #e9ecef; color: #495057; font-size: 0.9em;
    position: relative; display: flex; align-items: center;
    gap: 5px; min-width: 100px;
}
.tab-header:last-child { border-right: none; }
.tab-header:hover { background-color: #dee2e6; }
.tab-header.active {
    background-color: #fff; border-bottom: 1px solid #fff; margin-bottom: -1px;
    color: #007bff; font-weight: bold;
}
.tab-label-input {
    border: none; background: transparent; font-size: inherit; color: inherit;
    font-weight: inherit; padding: 2px 4px; outline: none;
    width: 100%; min-width: 80px;
}
.tab-header.active .tab-label-input { border-bottom: 1px dashed #ccc; }
.delete-tab-btn {
    background: none; border: none; color: #dc3545; font-size: 1.2rem;
    cursor: pointer; padding: 0 3px; line-height: 1; opacity: 0.5;
}
.tab-header:hover .delete-tab-btn { opacity: 1; }
.delete-tab-btn:hover { color: #a71d2a; }

.tab-content {
    padding: 20px; flex-grow: 1; overflow-y: auto;
    background-color: #fff; border: 2px dashed transparent;
    min-height: 200px;
}
.canvas-placeholder, .canvas-placeholder-inner {
    text-align: center; color: #aaa; font-style: italic; padding: 40px 10px;
    position: relative;
}
.canvas-placeholder-inner { padding: 20px 10px; }

/* --- Fields List & Preview (Keep existing from TabEditForm, add select style) --- */
.fields-list { }
.form-field-preview {
    background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 8px 10px;
    margin-bottom: 8px; border-radius: 4px; display: flex; align-items: center;
    gap: 8px; cursor: move; transition: background-color 0.1s ease, border-top 0.1s ease;
    font-size: 0.9rem;
}
.form-field-preview.dragging-field { opacity: 0.5; background-color: #e9ecef; }
.drag-handle { cursor: grab; color: #adb5bd; padding-right: 4px; font-size: 1.1em; }
.form-field-preview:active .drag-handle { cursor: grabbing; }

/* Input fields within preview */
.field-key-input, .field-label-input, .field-value-input, .field-reference-type-select { /* Added select */
    padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px;
    font-size: 0.85rem;
    background-color: white; /* Ensure select background */
    line-height: 1.3; /* Consistent line height */
    height: 2.2em; /* Consistent height */
    box-sizing: border-box; /* Include padding/border in height */
}
.field-key-input { flex: 0 1 120px; font-family: monospace; }
.field-label-input { flex: 1 1 150px; }
.field-value-input { flex: 0 1 140px; }
textarea.field-value-input { resize: none; height: auto; min-height: 2.2em; }
.field-value-input-cb { width: auto; margin-left: 5px; flex-shrink: 0; height: auto; }
.field-required-cb { margin-left: 5px; flex-shrink: 0; }
.field-required-label { font-size: 0.8em; color: #6c757d; flex-shrink: 0; cursor: pointer; }

/* *** NEW/ADJUSTED: Style for reference type select *** */
.field-reference-type-select {
    flex: 0 1 120px; /* Adjust width as needed */
    cursor: pointer;
}

.field-type-label { font-size: 0.75em; color: #6c757d; white-space: nowrap; flex-shrink: 0; }
.delete-field-btn {
    background: none; border: none; color: #dc3545; font-size: 1.3rem;
    cursor: pointer; padding: 0 4px; line-height: 1; margin-left: auto;
    flex-shrink: 0;
}
.delete-field-btn:hover { color: #a71d2a; }

/* Drag over field indicator */
.form-field-preview.drag-over {
    border-top: 3px solid #0d6efd;
    margin-top: -2px;
}

/* --- Modal Actions (Keep existing from TabEditForm) --- */
.modal-actions {
    margin-top: 20px; text-align: right; padding-top: 15px;
    border-top: 1px solid #eee; flex-shrink: 0;
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
