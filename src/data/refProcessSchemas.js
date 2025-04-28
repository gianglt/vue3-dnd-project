
import { ref, reactive } from 'vue';

// Ref này chứa thông tin cơ bản cho palette của DrawProcess
export const paletteItems = ref([]);

// Cache để lưu trữ các schema đã được load đầy đủ cho DrawProcess
// Cache sẽ lưu { schemaId, color, formSchema: { tabs: [...] } }
const loadedSchemasCache = reactive({});

// --- Helper lấy giá trị mặc định (tương tự trong TabProcessCanvas) ---
const getDefaultValue = (type) => {
    switch (type) {
        case 'number': return 0; // Hoặc null nếu muốn
        case 'boolean': return false;
        case 'date': return '';
        case 'reference': return null;
        default: return ''; // text, textarea, email, url etc.
    }
};

/**
 * CẬP NHẬT: Helper function để parse nội dung XML của một file template duy nhất.
 * Hàm này giờ đây ưu tiên tìm cấu trúc <Tabs>, nếu không thấy sẽ trả về schema rỗng.
 * @param {string} xmlText Nội dung XML của file.
 * @param {string} filename Tên file (để log lỗi).
 * @returns {object | null} Đối tượng { schemaId, color, formSchema: { tabs: [...] } } hoặc null nếu lỗi nghiêm trọng.
 */
const parseSingleTemplateXML = (xmlText, filename) => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        const parserErrors = xmlDoc.getElementsByTagName("parsererror");
        if (parserErrors.length > 0) {
            console.error(`[TabProcess] XML Parsing Error in ${filename}:`, parserErrors[0].textContent);
            return null;
        }

        const itemNode = xmlDoc.querySelector("sourceItem > item");
        if (!itemNode) {
            console.warn(`[TabProcess] Could not find <item> node within <sourceItem> in ${filename}`);
            return null;
        }

        const schemaId = itemNode.getAttribute('schemaId');
        const color = itemNode.getAttribute('color');

        if (!schemaId || !color) {
            console.warn(`[TabProcess] Skipping item from ${filename} due to missing schemaId or color.`);
            return null;
        }

        // --- Logic phân tích cấu trúc Tabs ---
        const formSchema = { tabs: [] }; // Khởi tạo cấu trúc schema mới
        const tabsNode = itemNode.querySelector("formSchema > Tabs"); // Tìm thẻ <Tabs>

        if (tabsNode) {
            const tabElements = tabsNode.querySelectorAll("Tab"); // Lấy tất cả các Tab bên trong

            tabElements.forEach((tabElement, tabIndex) => {
                const tabData = {
                    // Lấy ID từ attribute, nếu không có thì tạo ID duy nhất tạm thời
                    id: tabElement.getAttribute("id") || `tab_parsed_${Date.now()}_${tabIndex}`,
                    label: tabElement.getAttribute("label") || `Tab ${tabIndex + 1}`, // Lấy label, có fallback
                    fields: {} // Object chứa các field của tab này
                };

                const fieldElements = tabElement.querySelectorAll("Field"); // Lấy các Field trong Tab hiện tại

                fieldElements.forEach(fieldElement => {
                    const key = fieldElement.getAttribute("key");
                    if (!key) {
                        console.warn(`[TabProcess] Skipping field without 'key' in tab '${tabData.label}' of ${filename}`);
                        return; // Bỏ qua field không có key
                    }

                    const type = fieldElement.getAttribute("type") || 'text'; // Mặc định là text
                    const label = fieldElement.getAttribute("label") || key; // Mặc định label là key
                    const requiredAttr = fieldElement.getAttribute("required");
                    const required = requiredAttr === "true"; // Chuyển thành boolean
                    const referenceType = fieldElement.getAttribute("referenceType"); // Lấy referenceType nếu có
                    const valueAttr = fieldElement.getAttribute("value"); // Lấy giá trị dạng chuỗi từ XML

                    let value;
                    // Chuyển đổi giá trị từ chuỗi sang kiểu phù hợp
                    switch (type) {
                        case 'number': 
                        {
                            const parsedNum = parseFloat(valueAttr);
                            value = (valueAttr === null || valueAttr === "" || isNaN(parsedNum))
                                    ? getDefaultValue(type) // Dùng default nếu rỗng hoặc không phải số
                                    : parsedNum;
                            break;
                        }
                        case 'boolean':
                            value = (valueAttr === null || valueAttr === undefined)
                                    ? getDefaultValue(type) // Dùng default nếu thiếu
                                    : valueAttr.toLowerCase() === "true"; // Chỉ "true" mới là true
                            break;
                        case 'reference':
                            // Giá trị tham chiếu thường là ID (string/number) hoặc null/rỗng
                            value = (valueAttr === null || valueAttr === "") ? null : valueAttr;
                            break;
                        case 'date': // Giữ nguyên dạng chuỗi cho input date
                        case 'text':
                        case 'textarea':
                        case 'email':
                        case 'url':
                        default: {
                            // Giữ nguyên dạng chuỗi, hoặc default nếu không có
                            value = (valueAttr === null || valueAttr === undefined) ? getDefaultValue(type) : valueAttr;
                        }
                    }

                    // Tạo object field data
                    const fieldData = {
                        type: type,
                        label: label,
                        value: value, // Giá trị đã được chuyển đổi kiểu
                        required: required,
                    };

                    // Chỉ thêm referenceType nếu field là type 'reference' và có thuộc tính này
                    if (type === 'reference' && referenceType) {
                        fieldData.referenceType = referenceType;
                    } else if (type === 'reference' && !referenceType) {
                        // Cảnh báo nếu thiếu referenceType cho trường reference
                        console.warn(`[TabProcess] Reference field '${key}' in tab '${tabData.label}' of ${filename} is missing 'referenceType' attribute.`);
                        // Có thể gán giá trị mặc định ở đây nếu muốn, ví dụ:
                        // fieldData.referenceType = 'DefaultReference';
                    }

                    // Thêm field vào object fields của tab hiện tại
                    tabData.fields[key] = fieldData;
                }); // Kết thúc duyệt Fields

                // Thêm tab đã xử lý vào mảng tabs của schema
                formSchema.tabs.push(tabData);
            }); // Kết thúc duyệt Tabs

        } else {
            // Nếu không tìm thấy thẻ <Tabs>, ghi log và trả về schema rỗng (hoặc xử lý khác nếu muốn)
            console.warn(`[TabProcess] Could not find <Tabs> element within <formSchema> in ${filename}. Returning empty schema structure.`);
            // formSchema vẫn là { tabs: [] }
        }

        // Trả về đối tượng đầy đủ bao gồm schemaId, color và formSchema mới
        return { schemaId, color, formSchema };

    } catch (error) {
        console.error(`[TabProcess] Error parsing XML from ${filename}:`, error);
        return null; // Lỗi nghiêm trọng khi parse
    }
};


/**
 * Hàm bất đồng bộ để tải thông tin cơ bản cho palette từ manifest.
 * (Giữ nguyên không đổi)
 * @param {string} manifestPath Đường dẫn đến file manifest JSON
 * @returns {Promise<void>}
 * @throws {Error} Nếu có lỗi khi fetch manifest.
 */
export const loadPaletteData = async (manifestPath = '/ref_templates/manifest.json') => { // Đảm bảo đường dẫn đúng
    console.log(`[RefProcess] Attempting to load palette data from manifest: ${manifestPath}`);
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
            filename: item.filename // Giữ filename để load chi tiết sau
        }));

        console.log('[RefProcess] Successfully loaded palette data:', paletteItems.value);

    } catch (error) {
        console.error("[RefProcess] Error loading or parsing manifest file:", error);
        paletteItems.value = [];
        throw error;
    }
};

/**
 * CẬP NHẬT: Hàm bất đồng bộ để lấy hoặc tải cấu hình đầy đủ (bao gồm formSchema dạng tabs) của một schemaId.
 * @param {string} schemaId ID của schema cần lấy/load.
 * @returns {Promise<object | null>} Promise trả về đối tượng formSchema { tabs: [...] } hoặc null nếu lỗi/không tìm thấy.
 */
export const getOrLoadFormSchema = async (schemaId) => {
    // 1. Kiểm tra cache
    if (loadedSchemasCache[schemaId]) {
        console.log(`[RefProcess] Schema ${schemaId} found in cache.`);
        // Trả về bản sao sâu của formSchema từ cache để tránh sửa đổi ngoài ý muốn
        try {
            return structuredClone(loadedSchemasCache[schemaId].formSchema);
        } catch(e) {
             console.warn("[RefProcess] structuredClone failed in getOrLoadFormSchema (cache hit), using JSON fallback.");
             return JSON.parse(JSON.stringify(loadedSchemasCache[schemaId].formSchema));
        }
    }

    // 2. Tìm thông tin file trong paletteItems
    const itemInfo = paletteItems.value.find(p => p.schemaId === schemaId);
    if (!itemInfo || !itemInfo.filename) {
        console.error(`[RefProcess] Schema info or filename not found for schemaId: ${schemaId} in paletteItems.`);
        return null;
    }

    // 3. Tải file XML (Đảm bảo đường dẫn đúng)
    const xmlFilePath = `/ref_templates/${itemInfo.filename}`; // Đường dẫn cho tab templates
    console.log(`[RefProcess] Schema ${schemaId} not in cache. Loading from ${xmlFilePath}...`);
    try {
        const response = await fetch(xmlFilePath);
        if (!response.ok) {
            console.error(`[RefProcess] HTTP error! status: ${response.status} while fetching ${xmlFilePath}`);
            return null;
        }
        const xmlText = await response.text();

        // 4. Parse XML bằng hàm parseSingleTemplateXML đã cập nhật
        const fullSchemaData = parseSingleTemplateXML(xmlText, itemInfo.filename);

        // 5. Xử lý kết quả parse
        if (fullSchemaData && fullSchemaData.formSchema && Array.isArray(fullSchemaData.formSchema.tabs)) {
            // Lưu toàn bộ object vào cache (bao gồm schemaId, color, formSchema)
            loadedSchemasCache[schemaId] = JSON.parse(JSON.stringify(fullSchemaData));
            console.log(`[RefProcess] Schema ${schemaId} loaded and cached.`);
            // Trả về chỉ phần formSchema { tabs: [...] }
            // Tạo bản sao sâu trước khi trả về
            return JSON.parse(JSON.stringify(fullSchemaData.formSchema));
        } else {
            console.error(`[RefProcess] Failed to parse valid schema data (with tabs structure) from ${xmlFilePath}. Result:`, fullSchemaData);
            // Có thể cache kết quả lỗi (ví dụ: cache null) để tránh load lại liên tục nếu file lỗi
            // loadedSchemasCache[schemaId] = null; // Hoặc một giá trị đặc biệt
            return null; // Trả về null nếu parse lỗi hoặc cấu trúc không đúng
        }
    } catch (error) {
        console.error(`[RefProcess] Error fetching or processing ${xmlFilePath}:`, error);
        return null;
    }
};

/**
 * Helper để lấy formSchema đã được load (chỉ từ cache).
 * @param {string} schemaId
 * @returns {object} formSchema { tabs: [...] } hoặc { tabs: [] } nếu không có trong cache.
 */
export const getCachedSchemaById = (schemaId) => {
    const cachedData = loadedSchemasCache[schemaId];
    // Luôn trả về cấu trúc { tabs: [...] }, kể cả khi rỗng
    const schemaToReturn = cachedData?.formSchema && Array.isArray(cachedData.formSchema.tabs)
                           ? cachedData.formSchema
                           : { tabs: [] }; // Fallback nếu cache không hợp lệ

     try {
        return structuredClone(schemaToReturn);
    } catch (e) {
        console.warn("[TabProcess] structuredClone failed in getCachedSchemaById, using JSON fallback.");
        return JSON.parse(JSON.stringify(schemaToReturn));
    }
};
