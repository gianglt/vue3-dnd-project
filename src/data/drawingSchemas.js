// src/data/drawingSchemas.js
import { ref, reactive } from 'vue'; // Thêm reactive cho cache

// Ref này giờ chỉ chứa thông tin cơ bản cho palette
export const paletteItems = ref([]);

// Cache để lưu trữ các schema đã được load đầy đủ (schemaId -> { schemaId, color, formSchema })
// Sử dụng reactive để nếu cần có thể theo dõi sự thay đổi của cache ở nơi khác
const loadedSchemasCache = reactive({});

/**
 * Helper function để parse nội dung XML của một file template duy nhất.
 * (Giữ nguyên hàm parseSingleTemplateXML từ lần trước)
 * @param {string} xmlText Nội dung XML của file.
 * @param {string} filename Tên file (để log lỗi).
 * @returns {object | null} Đối tượng template đã parse hoặc null nếu lỗi.
 */
const parseSingleTemplateXML = (xmlText, filename) => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        const parserErrors = xmlDoc.getElementsByTagName("parsererror");
        if (parserErrors.length > 0) {
            console.error(`XML Parsing Error in ${filename}:`, parserErrors[0].textContent);
            return null;
        }
        // Tìm thẻ <item> bên trong thẻ gốc <sourceItem>
        const itemNode = xmlDoc.querySelector("sourceItem > item");
         if (!itemNode) {
             console.warn(`Could not find <item> node within <sourceItem> in ${filename}`);
             return null;
        }

        const schemaId = itemNode.getAttribute('schemaId');
        const color = itemNode.getAttribute('color');
        const formSchemaNode = itemNode.querySelector("formSchema");
        const formSchema = {};

        if (formSchemaNode) {
            const fieldNodes = formSchemaNode.querySelectorAll("field");
            fieldNodes.forEach(fieldNode => {
                const key = fieldNode.getAttribute('key');
                const type = fieldNode.getAttribute('type');
                let value = fieldNode.textContent || "";

                if (type === 'number') {
                    value = parseFloat(value);
                    if (isNaN(value)) {
                        console.warn(`Could not parse number for key "${key}" in ${filename}. Value: "${fieldNode.textContent}"`);
                        value = 0;
                    }
                }
                // Thêm xử lý type khác nếu cần

                if (key) {
                    formSchema[key] = value;
                }
            });
        }

        if (schemaId && color) {
            // Trả về đối tượng đầy đủ bao gồm cả formSchema
            return { schemaId, color, formSchema };
        } else {
            console.warn(`Skipping item from ${filename} due to missing schemaId or color.`);
            return null;
        }

    } catch (error) {
        console.error(`Error parsing XML from ${filename}:`, error);
        return null;
    }
};


/**
 * Hàm bất đồng bộ để tải thông tin cơ bản cho palette từ manifest.
 * @param {string} manifestPath Đường dẫn đến file manifest JSON
 * @returns {Promise<void>}
 * @throws {Error} Nếu có lỗi khi fetch manifest.
 */
export const loadPaletteData = async (manifestPath) => {
    console.log(`Attempting to load palette data from manifest: ${manifestPath}`);
    try {
        const response = await fetch(manifestPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${manifestPath}`);
        }
        const manifestData = await response.json();

        if (!Array.isArray(manifestData)) {
            throw new Error(`Manifest file ${manifestPath} did not contain a valid JSON array.`);
        }

        // Chỉ lưu thông tin cần thiết cho palette (bao gồm filename để load sau)
        paletteItems.value = manifestData.map(item => ({
            schemaId: item.schemaId,
            color: item.color,
            filename: item.filename // Quan trọng: Giữ lại filename
        }));

        console.log('Successfully loaded palette data:', paletteItems.value);

    } catch (error) {
        console.error("Error loading or parsing manifest file:", error);
        paletteItems.value = []; // Reset nếu lỗi
        throw error;
    }
};

/**
 * Hàm bất đồng bộ để lấy hoặc tải cấu hình đầy đủ (bao gồm formSchema) của một schemaId.
 * Sẽ kiểm tra cache trước, nếu không có sẽ tải và parse file XML tương ứng.
 * @param {string} schemaId ID của schema cần lấy/load.
 * @returns {Promise<object | null>} Promise trả về đối tượng formSchema hoặc null nếu lỗi/không tìm thấy.
 */
export const getOrLoadFormSchema = async (schemaId) => {
    // 1. Kiểm tra cache trước
    if (loadedSchemasCache[schemaId]) {
        console.log(`Schema ${schemaId} found in cache.`);
        // Trả về formSchema từ cache
        return loadedSchemasCache[schemaId].formSchema;
    }

    // 2. Nếu không có trong cache, tìm thông tin file trong paletteItems
    const itemInfo = paletteItems.value.find(p => p.schemaId === schemaId);
    if (!itemInfo || !itemInfo.filename) {
        console.error(`Schema info or filename not found for schemaId: ${schemaId} in paletteItems.`);
        return null; // Không tìm thấy thông tin để load
    }

    // 3. Tải file XML cụ thể
    const xmlFilePath = `/templates/${itemInfo.filename}`;
    console.log(`Schema ${schemaId} not in cache. Loading from ${xmlFilePath}...`);
    try {
        const response = await fetch(xmlFilePath);
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} while fetching ${xmlFilePath}`);
            return null; // Lỗi fetch
        }
        const xmlText = await response.text();

        // 4. Parse XML
        const fullSchemaData = parseSingleTemplateXML(xmlText, itemInfo.filename);

        if (fullSchemaData && fullSchemaData.formSchema) {
            // 5. Lưu vào cache
            loadedSchemasCache[schemaId] = fullSchemaData;
            console.log(`Schema ${schemaId} loaded and cached.`);
            // 6. Trả về formSchema
            return fullSchemaData.formSchema;
        } else {
            console.error(`Failed to parse valid schema data from ${xmlFilePath}`);
            return null; // Lỗi parse hoặc dữ liệu không hợp lệ
        }
    } catch (error) {
        console.error(`Error fetching or processing ${xmlFilePath}:`, error);
        return null; // Lỗi mạng hoặc lỗi khác
    }
};

/**
 * Helper để lấy formSchema đã được load (chỉ từ cache).
 * Dùng cho EditFormModal, giả định schema đã được load khi hình chữ nhật được tạo.
 * @param {string} schemaId
 * @returns {object} formSchema hoặc {} nếu không có trong cache.
 */
export const getCachedSchemaById = (schemaId) => {
    // Chỉ lấy từ cache, không trigger load mới ở đây
    const cachedData = loadedSchemasCache[schemaId];
    // Trả về một bản sao để tránh sửa đổi trực tiếp schema gốc trong cache
    return cachedData ? { ...cachedData.formSchema } : {};
};
