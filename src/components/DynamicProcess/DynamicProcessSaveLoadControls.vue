<template>
    <div class="save-load-controls">
        <button @click="handleSave" class="btn btn-save-state" :disabled="!canSave">Lưu Quy trình</button>
        <button @click="handleLoad" class="btn btn-load-state">Tải Quy trình</button>
    </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue';
// Đảm bảo import đúng service dùng chung
import { saveCanvasStateToFile, loadCanvasStateFromFile } from '../../services/canvasStateService.js';

const props = defineProps({
    currentRectangles: { type: Array, required: true }
});
const emit = defineEmits(['stateLoaded']);

const canSave = computed(() => props.currentRectangles && props.currentRectangles.length > 0);

const handleSave = () => {
    if (!canSave.value) return;
    // Có thể đổi tên file lưu mặc định
    saveCanvasStateToFile(props.currentRectangles, 'my_process.json');
};

const handleLoad = async () => {
    try {
        const loadedData = await loadCanvasStateFromFile();
        if (loadedData) emit('stateLoaded', loadedData);
    } catch (error) {
        console.error("[DrawProcess] Load operation failed in component:", error);
        alert("Tải quy trình thất bại.");
    }
};
</script>

<style scoped>
/* Style giữ nguyên như SaveLoadControls gốc */
.save-load-controls { margin-top: 1rem; padding: 0.5rem; background-color: #f0f0f0; border-radius: 4px; display: flex; gap: 10px; justify-content: center; }
.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; transition: background-color 0.2s ease, opacity 0.2s ease; }
.btn-save-state { background-color: #007bff; color: white; }
.btn-save-state:hover { background-color: #0056b3; }
.btn-save-state:disabled { background-color: #cccccc; cursor: not-allowed; opacity: 0.7; }
.btn-load-state { background-color: #ffc107; color: #333; }
.btn-load-state:hover { background-color: #e0a800; }
</style>
