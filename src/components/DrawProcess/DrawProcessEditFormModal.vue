<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content">
            <h2>Chỉnh sửa thông tin quy trình</h2> <!-- Sửa tiêu đề -->
            <form @submit.prevent="handleSave">
                <div v-for="(fieldData, key) in schema" :key="key" class="form-group">
                    <label :for="'proc-field-' + key">{{ key }}:</label> <!-- Thêm prefix cho ID -->

                    <!-- Input Text -->
                    <input v-if="fieldData.type === 'text'" type="text" :id="'proc-field-' + key" v-model="formData[key]" />
                    <!-- Input Number -->
                    <input v-else-if="fieldData.type === 'number'" type="number" :id="'proc-field-' + key" v-model.number="formData[key]" />
                    <!-- Input Date -->
                    <input v-else-if="fieldData.type === 'date'" type="date" :id="'proc-field-' + key" v-model="formData[key]" />
                    <!-- Textarea -->
                    <textarea v-else-if="fieldData.type === 'textarea'" :id="'proc-field-' + key" v-model="formData[key]" rows="3"></textarea>
                    <!-- Checkbox (Boolean) -->
                    <input v-else-if="fieldData.type === 'boolean'" type="checkbox" :id="'proc-field-' + key" v-model="formData[key]" class="form-checkbox" />
                    <!-- Input Email -->
                     <input v-else-if="fieldData.type === 'email'" type="email" :id="'proc-field-' + key" v-model="formData[key]" />
                     <!-- Input URL -->
                     <input v-else-if="fieldData.type === 'url'" type="url" :id="'proc-field-' + key" v-model="formData[key]" />
                    <!-- Fallback -->
                    <input v-else type="text" :id="'proc-field-' + key" v-model="formData[key]" :placeholder="`Unknown type: ${fieldData.type}`" />
                </div>

                <div class="modal-actions">
                    <button type="submit" class="btn btn-save">Lưu</button>
                    <button type="button" @click="handleCancel" class="btn btn-cancel">Hủy</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    visible: Boolean,
    rectData: Object,
    schema: Object // { key: { value: ..., type: ... } }
});

const emit = defineEmits(['save', 'cancel']);
const formData = ref({});

watch(() => [props.rectData, props.schema], ([newRectData, newSchema]) => {
    if (newRectData && newSchema && Object.keys(newSchema).length > 0) {
        const initialData = {};
        for (const key in newSchema) {
            initialData[key] = newRectData.formData?.[key] !== undefined
                               ? newRectData.formData[key]
                               : newSchema[key]?.value ?? '';
        }
        formData.value = initialData;
    } else {
        formData.value = {};
    }
}, { immediate: true, deep: true });

const handleSave = () => {
    emit('save', { ...formData.value });
};

const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
/* Style giữ nguyên như EditFormModal gốc */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background-color: #fff; padding: 25px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); min-width: 350px; max-width: 500px; }
h2 { margin-top: 0; margin-bottom: 20px; color: #333; text-align: center; }
.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
.form-group input[type="text"], .form-group input[type="number"], .form-group input[type="date"], .form-group input[type="email"], .form-group input[type="url"], .form-group textarea { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 1rem; }
.form-group textarea { resize: vertical; }
.form-group input[type="checkbox"].form-checkbox { width: auto; margin-right: 5px; vertical-align: middle; }
.form-group input[type="checkbox"].form-checkbox + label { display: inline-block; margin-bottom: 0; vertical-align: middle; }
.modal-actions { margin-top: 25px; text-align: right; }
.btn { padding: 10px 18px; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; margin-left: 10px; transition: background-color 0.2s ease; }
.btn-save { background-color: #28a745; color: white; }
.btn-save:hover { background-color: #218838; }
.btn-cancel { background-color: #6c757d; color: white; }
.btn-cancel:hover { background-color: #5a6268; }
</style>
