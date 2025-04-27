<template>
  <h1>Danh sách các mục</h1>
  <!-- 
    Sử dụng v-model để ràng buộc với ref 'items'.
    Sử dụng slot #item để render từng phần tử (cách được khuyến nghị cho vuedraggable).
    Thêm 'item-key' để vuedraggable theo dõi các mục hiệu quả hơn.
  -->
  <draggable
    v-model="items"
    @change="log"
    item-key="name"
    tag="div"
    class="list-group"
  >
    <template #item="{ element }">
      <div class="item">
        {{ element.name }}
      </div>
    </template>
  </draggable>
</template>

<script setup>
import { ref } from 'vue';
// Đảm bảo bạn đã cài đặt phiên bản vuedraggable tương thích với Vue 3
// npm install vuedraggable@next hoặc tương tự
import draggable from 'vuedraggable';

// Định nghĩa dữ liệu phản ứng (reactive data) bằng ref
const items = ref([
  { name: 'Mục 1' },
  { name: 'Mục 2' },
  { name: 'Mục 3' },
  { name: 'Mục 4' },
]);

// Định nghĩa phương thức log trực tiếp trong <script setup>
const log = (evt) => {
  console.log('Sự kiện kéo thả:', evt);
  // Bạn có thể xem thứ tự mới của mảng items tại đây
  console.log('Thứ tự mới:', items.value);
};
</script>

<style scoped>
.item {
  border: .0625rem solid #ccc;
  padding: .625rem;
  margin-bottom: .3125rem;
  background-color: #f9f9f9;
  cursor: move; /* Con trỏ di chuyển khi hover */
}

/* Tùy chọn: Thêm một số style cho vùng chứa kéo thả */
.list-group {
  padding: 0;
  min-height: 40px; /* Đảm bảo có vùng để thả vào ngay cả khi rỗng */
}

/* Tùy chọn: Style khi đang kéo (thêm class ghost-class vào draggable) */
.ghost {
  opacity: 0.5;
  background: #c8ebfb;
}
</style>
