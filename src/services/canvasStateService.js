// src/services/canvasStateService.js

/**
 * Lưu trạng thái các hình chữ nhật vào file JSON và kích hoạt tải xuống.
 * @param {Array<object>} rectanglesData Mảng dữ liệu drawnRectangles.
 * @param {string} [filename='drawing_state.json'] Tên file để lưu.
 */
export function saveCanvasStateToFile(rectanglesData, filename = 'drawing_state.json') {
    try {
        // 1. Chuyển đổi sang JSON (với định dạng đẹp để dễ đọc)
        const jsonString = JSON.stringify(rectanglesData, null, 2); // null, 2 để thụt lề

        // 2. Tạo Blob (Binary Large Object) từ chuỗi JSON
        const blob = new Blob([jsonString], { type: 'application/json' });

        // 3. Tạo URL tạm thời cho Blob
        const url = URL.createObjectURL(blob);

        // 4. Tạo một thẻ <a> ẩn để kích hoạt tải xuống
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // Đặt tên file tải xuống
        document.body.appendChild(a); // Cần thêm vào DOM để hoạt động trên Firefox
        a.click(); // Kích hoạt click để tải file

        // 5. Dọn dẹp: Xóa thẻ <a> và thu hồi URL tạm thời
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`State saved to ${filename}`);

    } catch (error) {
        console.error("Error saving canvas state:", error);
        alert("Đã xảy ra lỗi khi lưu trạng thái. Vui lòng kiểm tra console.");
    }
}

/**
 * Mở hộp thoại chọn file và đọc trạng thái từ file JSON.
 * @returns {Promise<Array<object> | null>} Promise trả về mảng dữ liệu đã load hoặc null nếu hủy/lỗi.
 */
export function loadCanvasStateFromFile() {
    return new Promise((resolve, reject) => {
        // 1. Tạo một input type="file" ẩn
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json'; // Chỉ chấp nhận file JSON

        // 2. Lắng nghe sự kiện 'change' (khi người dùng chọn file)
        input.onchange = (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                console.log("No file selected or operation cancelled.");
                resolve(null); // Người dùng hủy
                return;
            }

            // 3. Sử dụng FileReader để đọc nội dung file
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const jsonString = e.target?.result;
                    if (typeof jsonString !== 'string') {
                         throw new Error("Failed to read file content as string.");
                    }
                    // 4. Parse JSON
                    const loadedData = JSON.parse(jsonString);

                    // 5. Kiểm tra cơ bản xem có phải là mảng không
                    if (!Array.isArray(loadedData)) {
                        throw new Error("Loaded file does not contain a valid JSON array.");
                    }

                    console.log("State loaded successfully:", loadedData);
                    resolve(loadedData); // Trả về dữ liệu đã load thành công

                } catch (error) {
                    console.error("Error parsing loaded JSON file:", error);
                    alert("Lỗi đọc hoặc phân tích file trạng thái. File có thể không đúng định dạng JSON hoặc bị hỏng.");
                    reject(error); // Báo lỗi
                }
            };

            reader.onerror = (error) => {
                console.error("Error reading file:", error);
                alert("Đã xảy ra lỗi khi đọc file.");
                reject(error); // Báo lỗi
            };

            // Bắt đầu đọc file dưới dạng text
            reader.readAsText(file);
        };

        // 4. Kích hoạt click vào input để mở hộp thoại chọn file
        input.click();
    });
}
