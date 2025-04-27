// src/data/drawingSchemas.js
import { ref } from 'vue'; // Import ref nếu bạn muốn nó là reactive ngay từ đầu

// Dữ liệu nguồn với schema JSON
export const sourceData = ref([
    {
        color: '#ff6b6b', // Đỏ
        schemaId: 'schema_red',
        formSchema: {
            "Tên": "Hình đỏ",
            "Mô tả": "Một hình chữ nhật màu đỏ",
            "Giá trị": 10
        }
    },
    {
        color: '#4ecdc4', // Xanh ngọc
        schemaId: 'schema_teal',
        formSchema: {
            "Đối tượng": "Khối Teal",
            "Trạng thái": "Hoạt động",
        }
    },
    {
        color: '#45b7d1', // Xanh dương
        schemaId: 'schema_blue',
        formSchema: {
            "ID Người dùng": "",
            "Ghi chú": "Không có",
            "Ưu tiên": "Trung bình"
        }
    }
]);

// Helper để lấy schema dựa trên schemaId (có thể đặt ở đây hoặc trong component chính)
export const getSchemaById = (schemaId) => {
    const sourceItem = sourceData.value.find(item => item.schemaId === schemaId);
    return sourceItem ? sourceItem.formSchema : {};
};
