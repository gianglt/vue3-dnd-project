// src/stores/processStore.js
import { defineStore } from 'pinia';
import { nextTick } from 'vue'; // Import nextTick nếu cần
import { debounce } from 'lodash-es'; // Import debounce nếu cần

// Import logic schema và types (giữ nguyên)
import { paletteItems, getCachedSchemaById, loadPaletteData, getOrLoadFormSchema } from '../data/refProcessSchemas.js';
import { RECT_ID_DATA_TYPE, DRAG_OFFSET_DATA_TYPE, SOURCE_ITEM_DATA_TYPE } from '../types/drawingTypes.js';

// Helper (giữ nguyên hoặc chuyển vào đây nếu chỉ dùng trong store)
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0;
        case 'boolean': return false;
        case 'date': return '';
        case 'reference': return null;
        default: return '';
    }
};

export const useProcessStore = defineStore('refProcess', {
    // --- STATE ---
    // Định nghĩa state ban đầu
    state: () => ({
        isLoading: true,
        loadError: false,
        isSchemaLoading: false,
        drawnRectangles: [], // Danh sách các bước quy trình
        currentOrder: 1,     // Thứ tự cho bước tiếp theo
        contextMenu: {       // State cho context menu
            visible: false,
            top: 0,
            left: 0,
            targetRectId: null,
            targetRectOrder: null
        },
        isSchemaBuilderVisible: false, // State cho modal cũ
        isRefSchemaBuilderVisible: false, // State cho modal mới
        isDataEntryVisible: false,     // State cho modal nhập liệu
        editingRectId: null,          // Chỉ lưu ID của rect đang edit
        resizeCounter: 0,           // Có thể vẫn cần nếu dùng key binding
        isDebugVisible: false,        // State cho debug view
        debugTitle: '',
        debugData: '',
        // Lưu ý: Không cần canvasRef ở đây vì nó là DOM element reference
    }),

    // --- GETTERS ---
    // Tương đương với computed properties
    getters: {
        // Sắp xếp các hình chữ nhật theo thứ tự
        sortedRectangles: (state) => {
            return state.drawnRectangles.slice().sort((a, b) => a.order - b.order);
        },
        // Kiểm tra xem có modal nào đang mở không
        isAnyModalVisible: (state) => {
            return state.isSchemaBuilderVisible || state.isRefSchemaBuilderVisible || state.isDataEntryVisible;
        },
        // Lấy thông tin đầy đủ của hình chữ nhật đang được chỉnh sửa
        editingRect: (state) => {
            if (!state.editingRectId) return null;
            return state.drawnRectangles.find(r => r.id === state.editingRectId);
        },
        // Lấy schema ban đầu cho modal (sử dụng getter editingRect)
        initialSchemaForEdit(state) {
            const rect = this.editingRect; // Dùng getter editingRect
            const schema = rect?.formSchemaDefinition;
            if (schema && typeof schema === 'object') {
                // try {
                //     // structuredClone là cách tốt nhất để deep clone
                //     return structuredClone(schema);
                // } catch (e) {
                //     console.warn("[ProcessStore] Using JSON fallback for cloning initial schema.");
                //     return JSON.parse(JSON.stringify(schema));
                // }

                return JSON.parse(JSON.stringify(schema));
            }
            return { tabs: [] }; // Mặc định cấu trúc tabs rỗng
        },
        // Lấy data ban đầu cho modal nhập liệu
        initialDataForEntry(state) {
            const rect = this.editingRect;
            return rect?.formData || {};
        }
    },

    // --- ACTIONS ---
    // Các hàm để thay đổi state (có thể là bất đồng bộ)
    actions: {
        // --- Actions khởi tạo và load/save ---
        async initializeCanvas() {
            console.log('[ProcessStore] Initializing Canvas...');
            this.isLoading = true;
            this.loadError = false;
            try {
                // Giả sử loadPaletteData là async và cần thiết trước khi hiển thị
                await loadPaletteData('/tab_templates/manifest.json');
                // Có thể thêm logic load trạng thái đã lưu ở đây nếu muốn
                // this.loadStateFromStorage(); // Ví dụ
                this.loadError = false;
                console.log('[ProcessStore] Canvas Initialized.');
            } catch (error) {
                console.error("[ProcessStore] Failed to initialize canvas:", error);
                this.loadError = true;
            } finally {
                this.isLoading = false;
            }
        },

        // Action để load state (ví dụ từ localStorage hoặc file)
        loadState(loadedRectangles) {
            console.log("[ProcessStore] Loading state:", loadedRectangles);
            // Cần đảm bảo clone và chuẩn hóa dữ liệu khi load
            this.drawnRectangles = loadedRectangles.map(rect => ({
                ...rect,
                // Đảm bảo formSchemaDefinition là object hợp lệ
                formSchemaDefinition: rect.formSchemaDefinition && typeof rect.formSchemaDefinition === 'object'
                    ? structuredClone(rect.formSchemaDefinition) // Clone để tránh tham chiếu
                    : { tabs: [] },
                // Đảm bảo formData là object hợp lệ
                formData: rect.formData && typeof rect.formData === 'object'
                    ? structuredClone(rect.formData) // Clone
                    : {}
            }));
            // Tính toán lại currentOrder
            this.currentOrder = this.drawnRectangles.length > 0
                ? Math.max(...this.drawnRectangles.map(r => r.order)) + 1
                : 1;
            console.log("[ProcessStore] State restored. New currentOrder:", this.currentOrder);

            // Tải trước schema nếu cần
            const uniqueSchemaIds = [...new Set(this.drawnRectangles.map(r => r.schemaId).filter(id => id))];
            console.log("[ProcessStore] Pre-loading schemas for IDs:", uniqueSchemaIds);
            uniqueSchemaIds.forEach(id => {
                getOrLoadFormSchema(id).catch(err => {
                    console.error(`[ProcessStore] Failed to pre-load schema ${id} after state load:`, err);
                });
            });

            // Có thể cần tăng resizeCounter nếu vẫn dùng key binding
            this.resizeCounter++;
            console.log('[ProcessStore] Resize counter incremented after state load.');
        },

        // --- Actions liên quan đến Rectangles (Thêm, Sửa, Xóa) ---
        async addRectangle(sourceItemData, dropX, dropY, defaultWidth, defaultHeight) {
            console.log('[ProcessStore] Adding new rectangle:', sourceItemData);
            this.isSchemaLoading = true;
            let formSchemaDefinitionFromXml = null;
            try {
                formSchemaDefinitionFromXml = await getOrLoadFormSchema(sourceItemData.schemaId);
                console.log(`[ProcessStore] Loaded schema for ${sourceItemData.schemaId}:`, formSchemaDefinitionFromXml);
            } catch (loadErr) {
                console.error(`[ProcessStore] Error loading schema for ${sourceItemData.schemaId}:`, loadErr);
                formSchemaDefinitionFromXml = { tabs: [] }; // Default nếu lỗi
            } finally {
                this.isSchemaLoading = false;
            }

            // Validate và đảm bảo cấu trúc schema
            if (!formSchemaDefinitionFromXml || !Array.isArray(formSchemaDefinitionFromXml.tabs)) {
                console.warn(`[ProcessStore] Loaded schema for ${sourceItemData.schemaId} is invalid. Using empty structure.`);
                formSchemaDefinitionFromXml = { tabs: [] };
            }

            // Tạo initialFormData phẳng
            const initialFlatFormData = {};
            formSchemaDefinitionFromXml.tabs.forEach(tab => {
                if (tab.fields && typeof tab.fields === 'object') {
                    for (const key in tab.fields) {
                        const fieldSchema = tab.fields[key];
                        initialFlatFormData[key] = fieldSchema.hasOwnProperty('value')
                            ? fieldSchema.value
                            : getDefaultValue(fieldSchema.type);
                    }
                }
            });

            // Clone data và schema
            let clonedFlatData, clonedSchemaDefinition;
            // try {
            //     clonedFlatData = structuredClone(initialFlatFormData);
            //     clonedSchemaDefinition = structuredClone(formSchemaDefinitionFromXml);
            // } catch (e) {
            //     clonedFlatData = JSON.parse(JSON.stringify(initialFlatFormData));
            //     clonedSchemaDefinition = JSON.parse(JSON.stringify(formSchemaDefinitionFromXml));
            //     console.warn("[ProcessStore] Used JSON fallback for cloning initial data/schema.");
            // }

            clonedFlatData = JSON.parse(JSON.stringify(initialFlatFormData));
            clonedSchemaDefinition = JSON.parse(JSON.stringify(formSchemaDefinitionFromXml));

            // Tạo rect mới và thêm vào state
            const newRect = {
                id: Date.now(),
                color: sourceItemData.color,
                schemaId: sourceItemData.schemaId,
                x: dropX - defaultWidth / 2,
                y: dropY - defaultHeight / 2,
                width: defaultWidth,
                height: defaultHeight,
                order: this.currentOrder,
                formSchemaDefinition: clonedSchemaDefinition,
                formData: clonedFlatData
            };
            this.drawnRectangles.push(newRect);
            this.currentOrder++;
            console.log("[ProcessStore] Created new rect:", newRect);
        },

        moveRectangle(rectId, newX, newY) {
            const rectToMove = this.drawnRectangles.find(r => r.id === rectId);
            if (rectToMove) {
                rectToMove.x = newX;
                rectToMove.y = newY;
                console.log(`[ProcessStore] Moved rect ID ${rectId} to (${newX}, ${newY})`);
            } else {
                console.error(`[ProcessStore] Move Error: Cannot find rect with ID ${rectId}.`);
            }
        },

        deleteRectangle(rectId) {
            const indexToDelete = this.drawnRectangles.findIndex(r => r.id === rectId);
            if (indexToDelete > -1) {
                const orderToDelete = this.drawnRectangles[indexToDelete].order;
                this.drawnRectangles.splice(indexToDelete, 1);
                // Cập nhật order
                this.drawnRectangles.forEach(rect => {
                    if (rect.order > orderToDelete) {
                        rect.order -= 1;
                    }
                });
                // Cập nhật currentOrder
                this.currentOrder = this.drawnRectangles.length > 0
                    ? Math.max(...this.drawnRectangles.map(r => r.order)) + 1
                    : 1;
                console.log(`[ProcessStore] Deleted rect ID: ${rectId}. Order updated. New currentOrder: ${this.currentOrder}`);
            }
        },

        // --- Actions liên quan đến Context Menu ---
        showContextMenu(event, rect) {
            console.log(`[ProcessStore] showContextMenu for rect ID=${rect.id}`);
            if (this.isAnyModalVisible) { // Sử dụng getter
                console.log(`[ProcessStore] Prevented context menu: modal visible.`);
                event.preventDefault();
                return;
            }
            if (this.contextMenu.visible) {
                this.closeContextMenu(); // Đóng menu cũ
            }
            event.preventDefault();
            this.contextMenu = {
                visible: true,
                top: event.clientY,
                left: event.clientX,
                targetRectId: rect.id,
                targetRectOrder: rect.order // Lưu cả order nếu cần cho việc xóa
            };
        },

        closeContextMenu() {
            if (this.contextMenu.visible) {
                console.log(`[ProcessStore] Closing context menu for target ID=${this.contextMenu.targetRectId}`);
                this.contextMenu = { visible: false, top: 0, left: 0, targetRectId: null, targetRectOrder: null };
            }
        },

        // --- Actions liên quan đến Modals ---
        openSchemaEditor(rectId, useRefEditor = false) {
            if (!rectId || this.isAnyModalVisible) return;
            this.closeContextMenu(); // Đóng context menu nếu đang mở
            this.editingRectId = rectId;
            if (useRefEditor) {
                this.isRefSchemaBuilderVisible = true;
                console.log(`[ProcessStore] Opening REFERENCE schema builder for rect ID: ${rectId}`);
            } else {
                this.isSchemaBuilderVisible = true;
                console.log(`[ProcessStore] Opening ORIGINAL schema builder for rect ID: ${rectId}`);
            }
        },

        openDataEditor(rectId) {
            if (!rectId || this.isAnyModalVisible) return;
            this.closeContextMenu();
            this.editingRectId = rectId;
            this.isDataEntryVisible = true;
            console.log(`[ProcessStore] Opening data entry for rect ID: ${rectId}`);
        },

        // Lưu schema (dùng chung cho cả 2 modal)
        saveSchema(newSchemaDefinition) {
            console.log('[ProcessStore] Saving schema definition:', newSchemaDefinition);
            if (!this.editingRectId) {
                console.error("[ProcessStore] Cannot save schema, no editingRectId set.");
                this.closeAllModals(); // Đóng modal đề phòng
                return;
            }
            const rectIndex = this.drawnRectangles.findIndex(r => r.id === this.editingRectId);
            if (rectIndex !== -1) {
                // try {
                //     this.drawnRectangles[rectIndex].formSchemaDefinition = structuredClone(newSchemaDefinition);
                // } catch (e) {
                //     this.drawnRectangles[rectIndex].formSchemaDefinition = JSON.parse(JSON.stringify(newSchemaDefinition));
                //     console.warn("[ProcessStore] Used JSON fallback to save schema definition.");
                // }

                this.drawnRectangles[rectIndex].formSchemaDefinition = JSON.parse(JSON.stringify(newSchemaDefinition));

                // Reset formData phẳng dựa trên schema mới
                const newFlatFormData = {};
                if (Array.isArray(newSchemaDefinition.tabs)) {
                    newSchemaDefinition.tabs.forEach(tab => {
                        if (tab.fields && typeof tab.fields === 'object') {
                            for (const key in tab.fields) {
                                const fieldSchema = tab.fields[key];
                                newFlatFormData[key] = fieldSchema.hasOwnProperty('value')
                                    ? fieldSchema.value
                                    : getDefaultValue(fieldSchema.type);
                            }
                        }
                    });
                } // Thêm else if cho schema phẳng nếu cần

                // try {
                //     this.drawnRectangles[rectIndex].formData = structuredClone(newFlatFormData);
                // } catch (e) {
                //     this.drawnRectangles[rectIndex].formData = JSON.parse(JSON.stringify(newFlatFormData));
                //     console.warn("[ProcessStore] Used JSON fallback to reset flat formData.");
                // }
                this.drawnRectangles[rectIndex].formData = JSON.parse(JSON.stringify(newFlatFormData));
                console.log(`[ProcessStore] Updated schema and reset formData for rect ID: ${this.editingRectId}`);
            } else {
                console.error(`[ProcessStore] Cannot find rect with ID ${this.editingRectId} to save schema.`);
            }
            this.closeAllModals(); // Đóng tất cả modal và reset editingRectId
        },

        // Lưu data từ modal nhập liệu
        saveData(newFlatData) {
            console.log('[ProcessStore] Saving form data (flat):', newFlatData);
            if (!this.editingRectId) {
                console.error("[ProcessStore] Cannot save data, no editingRectId set.");
                this.closeAllModals();
                return;
            }
            const rectIndex = this.drawnRectangles.findIndex(r => r.id === this.editingRectId);
            if (rectIndex !== -1) {
                //  try {
                //     this.drawnRectangles[rectIndex].formData = structuredClone(newFlatData);
                // } catch (e) {
                //     this.drawnRectangles[rectIndex].formData = JSON.parse(JSON.stringify(newFlatData));
                //     console.warn("[ProcessStore] Used JSON fallback to save form data.");
                // }

                this.drawnRectangles[rectIndex].formData = JSON.parse(JSON.stringify(newFlatData));
                console.log(`[ProcessStore] Updated flat formData for rect ID: ${this.editingRectId}`);
            } else {
                console.error(`[ProcessStore] Cannot find rect with ID ${this.editingRectId} to save data.`);
            }
            this.closeAllModals();
        },

        // Đóng tất cả các modal và reset ID đang chỉnh sửa
        closeAllModals() {
            this.isSchemaBuilderVisible = false;
            this.isRefSchemaBuilderVisible = false;
            this.isDataEntryVisible = false;
            this.editingRectId = null;
            console.log("[ProcessStore] All modals closed, editingRectId reset.");
        },

        // --- Actions liên quan đến Debug ---
        setDebugInfo(title, dataObject) {
            this.debugTitle = title;
            try {
                this.debugData = JSON.stringify(dataObject, null, 2);
            } catch (e) {
                this.debugData = "Error stringifying debug data.";
                console.error("[ProcessStore] Error stringifying debug data:", e);
            }
            this.isDebugVisible = true;
        },

        clearDebugInfo() {
            this.isDebugVisible = false;
            this.debugTitle = '';
            this.debugData = '';
        },

        // --- Actions liên quan đến Window Events ---
        // Tạo một action được debounce để xử lý resize/scroll
        // Lưu ý: debounce cần được quản lý cẩn thận trong store
        // Cách 1: Tạo instance debounce bên ngoài store (khó quản lý)
        // Cách 2: Tạo instance debounce trong action (sẽ tạo mới mỗi lần gọi)
        // Cách 3: Lưu instance debounce vào state (không nên vì nó không phải state thuần túy)
        // -> Có lẽ tốt hơn là giữ debounce ở component và gọi action không debounce từ đó.
        //    Hoặc nếu muốn debounce trong store, cần cơ chế quản lý instance.
        //    Ví dụ đơn giản: chỉ đóng context menu
        handleWindowChange() {
            console.log('[ProcessStore] handleWindowChange action called.');
            if (this.contextMenu.visible) {
                this.closeContextMenu();
            }
            // Tăng resizeCounter nếu cần thiết cho key binding
            this.resizeCounter++;
            console.log('[ProcessStore] Resize counter incremented:', this.resizeCounter);
        }
    }
});

// Nếu muốn debounce trong store, có thể làm thế này (cần test kỹ):
// let debouncedWindowChangeHandler = null;
// export const useProcessStore = defineStore('process', {
//     // ... state, getters ...
//     actions: {
//         initializeDebouncedHandler() {
//             if (!debouncedWindowChangeHandler) {
//                 debouncedWindowChangeHandler = debounce(() => {
//                     console.log('[ProcessStore] Debounced handler executed.');
//                     if (this.contextMenu.visible) {
//                         this.closeContextMenu();
//                     }
//                     this.resizeCounter++;
//                 }, 300);
//             }
//         },
//         triggerWindowChange() {
//             this.initializeDebouncedHandler(); // Đảm bảo handler được tạo
//             debouncedWindowChangeHandler(); // Gọi handler đã debounce
//         },
//         cancelDebouncedHandler() {
//             debouncedWindowChangeHandler?.cancel();
//         }
//         // ... other actions
//     }
// });
