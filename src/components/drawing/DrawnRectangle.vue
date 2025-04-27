// src/components/drawing/DrawnRectangle.vue
<template>
    <div
        class="drawn-rect"
        :style="{
            backgroundColor: rect.color,
            left: rect.x + 'px',
            top: rect.y + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px'
        }"
        :draggable="!preventDrag"
        @dragstart="onDragStart"
        @dragend="onDragEnd"
        @contextmenu.prevent="onContextMenu"
        @click="onClick"
    >
        <span class="rect-order">{{ rect.order }}</span>
    </div>
</template>

<script setup>
// Script không đổi

const props = defineProps({ rect: { type: Object, required: true }, preventDrag: { type: Boolean, default: false } });
const emit = defineEmits(['dragstart', 'dragend', 'contextmenu', 'open-edit']);
const onDragStart = (event) => { emit('dragstart', event, props.rect); };
const onDragEnd = (event) => { emit('dragend', event); };
const onContextMenu = (event) => { emit('contextmenu', event, props.rect); };
const onClick = () => { emit('open-edit', props.rect); };
</script>

<style scoped>
.drawn-rect {
    position: absolute;
    border: 1px solid rgba(0, 0, 0, 0.2);
    box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
    cursor: grab;
    user-select: none;
    transition: opacity 0.2s ease;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2; /* Đảm bảo nằm trên SVG */
}
.drawn-rect:active { cursor: grabbing; }
.rect-order { font-size: 1.2em; font-weight: bold; color: white; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7); pointer-events: none; }
</style>
