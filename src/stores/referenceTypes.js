import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

// Lấy API Base URL từ biến môi trường (Vite)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const useReferenceTypesStore = defineStore('referenceTypes', () => {
    // --- State ---
    // Lưu trữ mảng đầy đủ các object định nghĩa từ API
    const definitions = ref([]);
    // Trạng thái loading khi fetch danh sách định nghĩa
    const isLoading = ref(false);
    // Lỗi xảy ra khi fetch danh sách định nghĩa
    const error = ref(null);
    // Cờ đánh dấu đã fetch thành công ít nhất một lần chưa
    const hasFetched = ref(false);

    // --- Actions ---
    /**
     * Fetches the list of reference type definitions from the API.
     * Only fetches if not already fetched or currently loading.
     */
    async function fetchTypes() {
        // Chỉ fetch nếu chưa fetch hoặc không đang fetch
        if (hasFetched.value || isLoading.value) {
            console.log("Pinia Store: Reference type definitions already fetched or currently loading.");
            return;
        }

        // Kiểm tra API_BASE_URL
        if (!API_BASE_URL) {
            console.error("Pinia Store: VITE_API_BASE_URL is not configured.");
            error.value = "Lỗi cấu hình: API Base URL chưa được thiết lập.";
            isLoading.value = false;
            definitions.value = [];
            hasFetched.value = false; // Đánh dấu chưa fetch thành công
            return;
        }

        isLoading.value = true;
        error.value = null;
        const apiUrl = `${API_BASE_URL}/api/listapi`;
        console.log("Pinia Store: Fetching reference type definitions from:", apiUrl);

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            const data = await response.json();

            // Validate data is an array and filter for valid items
            if (Array.isArray(data)) {
                definitions.value = data.filter(item => item && typeof item.name === 'string' && item.name.trim() !== '' && typeof item.url === 'string' && item.url.trim() !== '');
                console.log("Pinia Store: Successfully fetched and filtered reference type definitions:", definitions.value);

                if (definitions.value.length === 0 && data.length > 0) {
                    console.warn("Pinia Store: API returned items, but none had valid 'name' and 'url' properties.");
                    error.value = "API trả về dữ liệu nhưng không có định nghĩa tham chiếu hợp lệ.";
                } else if (definitions.value.length === 0) {
                     console.warn("Pinia Store: API returned an empty list of reference types.");
                     // Có thể không coi đây là lỗi, tùy yêu cầu
                     // error.value = "API không trả về loại tham chiếu nào.";
                }

                hasFetched.value = true; // Đánh dấu đã fetch thành công
            } else {
                console.error("Pinia Store: API response is not an array:", data);
                throw new Error("Dữ liệu API trả về không phải là một danh sách (array).");
            }
        } catch (err) {
            console.error("Pinia Store: Failed to fetch reference type definitions:", err);
            error.value = err.message || "Lỗi không xác định khi tải danh sách loại tham chiếu.";
            definitions.value = []; // Clear definitions on error
            hasFetched.value = false; // Đánh dấu fetch thất bại
        } finally {
            isLoading.value = false;
        }
    }

    // --- Getters ---
    /**
     * Gets the API URL for a specific reference type name.
     * @param {string} name - The name of the reference type (e.g., 'customers').
     * @returns {string | null} The relative API URL or null if not found.
     */
    const getUrlByName = (name) => {
        if (!name) return null;
        const definition = definitions.value.find(def => def.name === name);
        return definition?.url || null;
    };

    /**
     * Returns an array of just the reference type names.
     * Useful for components like RefEditForm that only need the names.
     */
    const typeNames = computed(() => definitions.value.map(def => def.name));

    // --- Return ---
    return {
        // State
        definitions,
        isLoading,
        error,
        hasFetched,
        // Actions
        fetchTypes,
        // Getters
        getUrlByName,
        typeNames,
    };
});
