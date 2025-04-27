// src/data/drawingSchemas.js
import { ref } from 'vue';

// sourceData vẫn là ref chứa kết quả cuối cùng
export const sourceData = ref([]);

/**
 * Helper function để parse nội dung XML của một file template duy nhất.
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
            return null; // Trả về null nếu parse lỗi
        }

        // Tìm thẻ <item> (giả sử nó là con trực tiếp của thẻ gốc <sourceItem>)
        const itemNode = xmlDoc.querySelector("sourceItem > item"); // Điều chỉnh selector nếu cấu trúc XML khác
        if (!itemNode) {
             console.warn(`Could not find <item> node within <sourceItem> in ${filename}`);
             // Thử tìm item không cần thẻ gốc <sourceItem> nếu cấu trúc linh hoạt hơn
             // const itemNode = xmlDoc.querySelector("item");
             // if (!itemNode) {
             //    console.warn(`Could not find <item> node in ${filename}`);
             //    return null;
             // }
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
            return { schemaId, color, formSchema };
        } else {
            console.warn(`Skipping item from ${filename} due to missing schemaId or color.`);
            return null;
        }

    } catch (error) {
        console.error(`Error parsing XML from ${filename}:`, error);
        return null; // Trả về null nếu có lỗi khác
    }
};

/**
 * Hàm bất đồng bộ để tải danh sách template từ manifest, sau đó tải và parse từng file XML.
 * @param {string} manifestPath Đường dẫn đến file manifest JSON (ví dụ: '/templates/manifest.json')
 * @returns {Promise<void>}
 * @throws {Error} Nếu có lỗi nghiêm trọng khi fetch manifest hoặc không load được file nào.
 */
export const loadTemplatesFromManifest = async (manifestPath) => {
    console.log(`Attempting to load templates using manifest: ${manifestPath}`);
    let templateFilenames = [];

    try {
        // 1. Fetch manifest file
        const response = await fetch(manifestPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${manifestPath}`);
        }
        templateFilenames = await response.json(); // Parse manifest JSON

        if (!Array.isArray(templateFilenames)) {
            throw new Error(`Manifest file ${manifestPath} did not contain a valid JSON array.`);
        }
        console.log('Found templates in manifest:', templateFilenames);

    } catch (error) {
        console.error("Error loading or parsing manifest file:", error);
        sourceData.value = []; // Reset nếu không đọc được manifest
        throw error; // Ném lỗi để component gọi biết
    }

    // 2. Tạo danh sách các promise để fetch và parse từng file XML
    const loadPromises = templateFilenames.map(async (filename) => {
        const xmlFilePath = `/templates/${filename}`; // Xây dựng đường dẫn đầy đủ
        try {
            const response = await fetch(xmlFilePath);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status} while fetching ${xmlFilePath}`);
                return null; // Trả về null nếu fetch lỗi file này
            }
            const xmlText = await response.text();
            return parseSingleTemplateXML(xmlText, filename); // Parse nội dung
        } catch (error) {
            console.error(`Error fetching or processing ${xmlFilePath}:`, error);
            return null; // Trả về null nếu có lỗi khác
        }
    });

    // 3. Chờ tất cả các promise hoàn thành (dùng allSettled để không bị dừng nếu 1 file lỗi)
    const results = await Promise.allSettled(loadPromises);

    // 4. Lọc ra các kết quả thành công và cập nhật sourceData
    const loadedItems = results
        .filter(result => result.status === 'fulfilled' && result.value !== null) // Lấy các promise thành công và có giá trị hợp lệ
        .map(result => result.value); // Trích xuất giá trị (đối tượng template)

    sourceData.value = loadedItems;

    if (loadedItems.length === 0 && templateFilenames.length > 0) {
         console.warn("Warning: No templates were successfully loaded, although manifest listed files.");
         // Có thể ném lỗi ở đây nếu việc không load được template nào là nghiêm trọng
         // throw new Error("Failed to load any templates.");
    } else if (loadedItems.length < templateFilenames.length) {
         console.warn(`Warning: Successfully loaded ${loadedItems.length} out of ${templateFilenames.length} templates listed in manifest.`);
    } else {
        console.log(`Successfully loaded ${loadedItems.length} templates:`, sourceData.value);
    }
};

// Helper getSchemaById không thay đổi, vẫn hoạt động trên sourceData đã được load
export const getSchemaById = (schemaId) => {
    const sourceItem = sourceData.value.find(item => item.schemaId === schemaId);
    return sourceItem ? { ...sourceItem.formSchema } : {};
};
