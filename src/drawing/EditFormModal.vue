// src/components/drawing/EditFormModal.vue
<template>
    <div v-if="visible" class="modal-overlay" @click.self="emit('cancel')">
        <div class="modal-content">
            <h3>Chỉnh sửa thông tin (Hình #{{ rectData?.order }})</h3>
            <form @submit.prevent="save">
                <div v-if="!schema || Object.keys(schema).length === 0">
                    Không có thông tin để chỉnh sửa.
                </div>
                <div v-else v-for="(defaultValue, key) in schema" :key="key" class="form-group">
                    <label :for="'modal-field-' + key">{{ key }}:</label>
                    <input
                        :id="'modal-field-' + key"
                        v-model="localFormData[key]"
                        type="text"
                        required
                    >
                </div>

                <div class="modal-actions">
                    <button type="submit">Save</button>
                    <button type="button" @click="emit('cancel')">Cancel</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
    visible: Boolean,
    rectData: Object, // Dữ liệu gốc của hình chữ nhật đang sửa
    schema: Object    // Schema tương ứng
});

const emit = defineEmits(['save', 'cancel']);

const localFormData = ref({}); // Dữ liệu form cục bộ trong modal

// Theo dõi khi modal được mở hoặc dữ liệu gốc thay đổi
watch(() => props.visible, (newValue) => {
    if (newValue && props.rectData) {
        // Tạo bản sao sâu khi mở modal
        try {
            localFormData.value = structuredClone(props.rectData.formData || {});
        } catch (e) {
            console.warn("structuredClone not supported, using JSON fallback.");
            localFormData.value = JSON.parse(JSON.stringify(props.rectData.formData || {}));
        }
        // Đảm bảo các trường schema tồn tại với giá trị mặc định
        if (props.schema) {
            for (const key in props.schema) {
                if (!(key in localFormData.value)) {
                    localFormData.value[key] = props.schema[key]; // Gán giá trị mặc định
                }
            }
        }
    } else if (!newValue) {
        // Reset khi đóng modal (tùy chọn, vì nó sẽ được ghi đè khi mở lại)
        localFormData.value = {};
    }
});

const save = () => {
    // Gửi dữ liệu đã chỉnh sửa lên component cha
    emit('save', localFormData.value);
};

</script>

<style scoped>
/* Copy CSS của .modal-overlay, .modal-content, .form-group, .modal-actions từ file cũ */
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6); display: flex;
    justify-content: center; align-items: center; z-index: 1100;
}
.modal-content {
    background-color: white; padding: 25px; border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); min-width: 300px; max-width: 90%;
}
.modal-content h3 { margin-top: 0; margin-bottom: 1.5rem; text-align: center; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: 0.3rem; font-weight: bold; font-size: 0.9em; }
.form-group input[type="text"] {
    width: 100%; padding: 0.5rem; border: 1px solid #ccc;
    border-radius: 4px; box-sizing: border-box;
}
.modal-actions {
    margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem;
}
.modal-actions button {
    padding: 0.6rem 1.2rem; border: none; border-radius: 4px;
    cursor: pointer; font-weight: bold;
}
.modal-actions button[type="submit"] { background-color: #007bff; color: white; }
.modal-actions button[type="button"] { background-color: #6c757d; color: white; }
.modal-actions button:hover { opacity: 0.9; }
</style>
