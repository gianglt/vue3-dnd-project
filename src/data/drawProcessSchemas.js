// src/data/drawProcessSchemas.js
import { ref, reactive } from 'vue';

// Ref này chứa thông tin cơ bản cho palette của DrawProcess
export const paletteItems = ref([]);

// Cache để lưu trữ các schema đã được load đầy đủ cho DrawProcess
const loadedSchemasCache = reactive({});

/**
 * Helper function để parse nội dung XML của một file template duy nhất.
 * (Giữ nguyên logic parse từ phiên bản trước)
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
        const itemNode = xmlDoc.querySelector("sourceItem > item");
         if (!itemNode) {
             console.warn(`Could not find <item> node within <sourceItem> in ${filename}`);
             return null;
        }

        const schemaId = itemNode.getAttribute('schemaId');
        const color = itemNode.getAttribute('color');
        const formSchemaNode = itemNode.querySelector("formSchema");
        const formSchema = {}; // Cấu trúc: { key: { value: ..., type: ... } }

        if (formSchemaNode) {
            const fieldNodes = formSchemaNode.querySelectorAll("field");
            fieldNodes.forEach(fieldNode => {
                const key = fieldNode.getAttribute('key');
                const type = fieldNode.getAttribute('type') || 'text';
                let value = fieldNode.textContent || "";

                if (type === 'boolean') {
                    value = value.toLowerCase() === 'true';
                }
                // Thêm xử lý type khác nếu cần

                if (key) {
                    formSchema[key] = { value: value, type: type };
                }
            });
        }

        if (schemaId && color) {
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
export const loadPaletteData = async (manifestPath = '/process_templates/manifest.json') => { // SỬA ĐƯỜNG DẪN MẶC ĐỊNH
    console.log(`[DrawProcess] Attempting to load palette data from manifest: ${manifestPath}`);
    try {
        const response = await fetch(manifestPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${manifestPath}`);
        }
        const manifestData = await response.json();

        if (!Array.isArray(manifestData)) {
            throw new Error(`Manifest file ${manifestPath} did not contain a valid JSON array.`);
        }

        paletteItems.value = manifestData.map(item => ({
            schemaId: item.schemaId,
            color: item.color,
            filename: item.filename
        }));

        console.log('[DrawProcess] Successfully loaded palette data:', paletteItems.value);

    } catch (error) {
        console.error("[DrawProcess] Error loading or parsing manifest file:", error);
        paletteItems.value = [];
        throw error;
    }
};

/**
 * Hàm bất đồng bộ để lấy hoặc tải cấu hình đầy đủ (bao gồm formSchema) của một schemaId.
 * @param {string} schemaId ID của schema cần lấy/load.
 * @returns {Promise<object | null>} Promise trả về đối tượng formSchema hoặc null nếu lỗi/không tìm thấy.
 */
export const getOrLoadFormSchema = async (schemaId) => {
    if (loadedSchemasCache[schemaId]) {
        console.log(`[DrawProcess] Schema ${schemaId} found in cache.`);
        return loadedSchemasCache[schemaId].formSchema;
    }

    const itemInfo = paletteItems.value.find(p => p.schemaId === schemaId);
    if (!itemInfo || !itemInfo.filename) {
        console.error(`[DrawProcess] Schema info or filename not found for schemaId: ${schemaId} in paletteItems.`);
        return null;
    }

    // SỬA ĐƯỜNG DẪN KHI FETCH XML
    const xmlFilePath = `/process_templates/${itemInfo.filename}`;
    console.log(`[DrawProcess] Schema ${schemaId} not in cache. Loading from ${xmlFilePath}...`);
    try {
        const response = await fetch(xmlFilePath);
        if (!response.ok) {
            console.error(`[DrawProcess] HTTP error! status: ${response.status} while fetching ${xmlFilePath}`);
            return null;
        }
        const xmlText = await response.text();
        const fullSchemaData = parseSingleTemplateXML(xmlText, itemInfo.filename);

        if (fullSchemaData && fullSchemaData.formSchema) {
            loadedSchemasCache[schemaId] = fullSchemaData;
            console.log(`[DrawProcess] Schema ${schemaId} loaded and cached.`);
            return fullSchemaData.formSchema;
        } else {
            console.error(`[DrawProcess] Failed to parse valid schema data from ${xmlFilePath}`);
            return null;
        }
    } catch (error) {
        console.error(`[DrawProcess] Error fetching or processing ${xmlFilePath}:`, error);
        return null;
    }
};

/**
 * Helper để lấy formSchema đã được load (chỉ từ cache).
 * @param {string} schemaId
 * @returns {object} formSchema hoặc {} nếu không có trong cache.
 */
export const getCachedSchemaById = (schemaId) => {
    const cachedData = loadedSchemasCache[schemaId];
     try {
        return cachedData ? structuredClone(cachedData.formSchema) : {};
    } catch (e) {
        console.warn("[DrawProcess] structuredClone failed in getCachedSchemaById, using JSON fallback.");
        return cachedData ? JSON.parse(JSON.stringify(cachedData.formSchema)) : {};
    }
};
