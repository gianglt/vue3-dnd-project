<template>
  <div
    class="draw-process-rectangle-wrapper"
    :style="style"
    :draggable="!preventDrag"
    @dragstart="!preventDrag ? $emit('dragstart', $event) : null"
    @dragend="$emit('dragend', $event)"
    
    @contextmenu="$emit('contextmenu', $event)"
    @dblclick="!preventDrag ? $emit('open-edit', rect) : null"
    
  >
    <!-- Nội dung của hình chữ nhật -->
    {{ rect.id }} <!-- Ví dụ hiển thị ID -->
    <!-- Bạn có thể thêm nội dung khác ở đây -->

    <!-- Nút Test Click (nếu bạn đã thêm từ bước trước) -->
    <!-- <button @click.stop="logClick" style="font-size: 8px; position: absolute; bottom: 0; right: 0;">Test Click</button> -->
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  rect: {
    type: Object,
    required: true,
  },
  preventDrag: { // Prop nhận từ component cha
    type: Boolean,
    default: false,
  }
});

// Khai báo các emits mà component này có thể phát ra
defineEmits(['dragstart', 'dragend', 'contextmenu', 'open-edit']);

// Tính toán style cho hình chữ nhật
const style = computed(() => ({
  position: 'absolute',
  left: `${props.rect.x}px`,
  top: `${props.rect.y}px`,
  width: `${props.rect.width}px`,
  height: `${props.rect.height}px`,
  backgroundColor: props.rect.color,
  border: '1px solid black',
  cursor: props.preventDrag ? 'default' : 'grab',
  zIndex: 2,
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  fontSize: '10px',
  overflow: 'hidden',
  boxSizing: 'border-box',
}));

// // --- HÀM MỚI: Xử lý sự kiện mousemove ---
// const handleMouseMove = (event) => {
//   // In ra console tọa độ chuột liên quan đến viewport và phần tử
//   console.log(
//     `[TabRectangle] Mouse move over Rect ID: ${props.rect.id} | ` +
//     `Viewport Coords (clientX, clientY): (${event.clientX}, ${event.clientY}) | ` +
//     `Element Offset (offsetX, offsetY): (${event.offsetX}, ${event.offsetY})`
//   );
// };

// Hàm logClick (nếu bạn đã thêm từ bước trước)
// const logClick = () => {
//     console.log(`[TabRectangle] Clicked on rect ID: ${props.rect.id}, PreventDrag=${props.preventDrag}`);
// };

</script>

<style scoped>
.draw-process-rectangle-wrapper {
  /* Các style cụ thể nếu cần */
}
.draw-process-rectangle-wrapper:active {
    cursor: grabbing;
}
</style>
