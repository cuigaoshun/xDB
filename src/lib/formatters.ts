/**
 * Text formatting utilities for various data formats
 */

export type FormatType =
    | 'raw'
    | 'json'
    | 'json-minified'
    | 'php-serialize'
    | 'xml'
    | 'base64-decode'
    | 'base64-encode'
    | 'url-decode'
    | 'url-encode';

export interface FormatResult {
    success: boolean;
    content: string;
    error?: string;
}

/**
 * Detect possible formats for the given text
 */
export function detectFormats(text: string): FormatType[] {
    const formats: FormatType[] = ['raw'];
    if (!text) return formats;

    const trimmed = text.trim();

    // 1. JSON
    let isJson = false;

    // Check if it looks like JSON structure
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        isJson = true;
    }

    // Deep check using parser (handles escaped JSON, double-encoded JSON)
    if (!isJson) {
        try {
            const parsed = tryParseJSON(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
                isJson = true;
            } else if (typeof parsed === 'string') {
                // Check for double encoded strings e.g. "{\"a\":1}"
                try {
                    const inner = JSON.parse(parsed);
                    if (typeof inner === 'object' && inner !== null) {
                        isJson = true;
                    }
                } catch { }
            }
        } catch { }
    }

    if (isJson) {
        formats.push('json', 'json-minified');
    }

    // 2. PHP serialize
    if (trimmed.match(/^((a|O|s|i|d|b):\d+[:;]|N;)/)) {
        formats.push('php-serialize');
    }

    // 3. XML
    if (trimmed.startsWith('<?xml') || trimmed.match(/^<[a-zA-Z]/)) {
        formats.push('xml');
    }

    // 4. Base64
    // Decode: if seems like base64
    if (trimmed.length > 0 && trimmed.match(/^[A-Za-z0-9+/]+=*$/)) {
        formats.push('base64-decode');
    }
    // Always offer Encode
    formats.push('base64-encode');

    // 5. URL
    // Decode: if contains %
    if (trimmed.includes('%')) {
        formats.push('url-decode');
    }
    // Always offer Encode
    formats.push('url-encode');

    return [...new Set(formats)]; // Remove duplicates
}

/**
 * Try to parse JSON, with recovery for common escape patterns
 */
function tryParseJSON(text: string): any {
    try {
        return JSON.parse(text);
    } catch (error) {
        // Try to handle escaped JSON (common in logs)
        // e.g. {\"key\": \"value\"}
        try {
            const unescaped = text
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
            return JSON.parse(unescaped);
        } catch (e) {
            throw error;
        }
    }
}

/**
 * Format JSON with indentation
 */
export function formatJSON(text: string, indent: number = 2): FormatResult {
    try {
        let parsed = tryParseJSON(text);

        // Handle double-encoded JSON strings (e.g. "{\"a\":1}")
        if (typeof parsed === 'string') {
            try {
                const inner = JSON.parse(parsed);
                if (typeof inner === 'object' && inner !== null) {
                    parsed = inner;
                }
            } catch (e) {
                // Ignore
            }
        }

        return {
            success: true,
            content: JSON.stringify(parsed, null, indent)
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'Invalid JSON'
        };
    }
}

/**
 * Minify JSON
 */
export function minifyJSON(text: string): FormatResult {
    try {
        const parsed = tryParseJSON(text);
        return {
            success: true,
            content: JSON.stringify(parsed)
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'Invalid JSON'
        };
    }
}

/**
 * Parse PHP serialized data
 * Improved version supporting nested arrays and objects
 */
export function parsePhpSerialize(text: string): FormatResult {
    try {
        const trimmed = text.trim();
        if (!trimmed) {
            return { success: false, content: text, error: 'Empty content' };
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const bytes = encoder.encode(trimmed);

        let offset = 0;

        function readUntil(char: string): string {
            const charCode = char.charCodeAt(0);
            let end = offset;
            while (end < bytes.length && bytes[end] !== charCode) {
                end++;
            }
            const sub = bytes.subarray(offset, end);
            offset = end + 1; // skip delimiter
            return decoder.decode(sub);
        }

        function parse(): any {
            if (offset >= bytes.length) return null;
            const type = String.fromCharCode(bytes[offset]);
            offset += 2; // skip type and colon

            switch (type) {
                case 'N': // null
                    return null;
                case 'b': { // boolean
                    const value = readUntil(';') === '1';
                    return value;
                }
                case 'i': { // integer
                    const value = parseInt(readUntil(';'), 10);
                    return value;
                }
                case 'd': { // float
                    const value = parseFloat(readUntil(';'));
                    return value;
                }
                case 's': { // string
                    const lengthStr = readUntil(':');
                    const length = parseInt(lengthStr, 10);
                    offset += 1; // skip "

                    const value = decoder.decode(bytes.subarray(offset, offset + length));
                    offset += length + 2; // skip content and ";
                    return value;
                }
                case 'a': { // array
                    const lengthStr = readUntil(':');
                    const length = parseInt(lengthStr, 10);
                    offset += 1; // skip {
                    const result: any = {};
                    let isArray = true;
                    for (let i = 0; i < length; i++) {
                        const key = parse();
                        const value = parse();
                        result[key] = value;
                        if (String(key) !== String(i)) isArray = false;
                    }
                    offset += 1; // skip }
                    return isArray ? Object.values(result) : result;
                }
                case 'O': { // object
                    const nameLengthStr = readUntil(':');
                    const nameLength = parseInt(nameLengthStr, 10);
                    offset += 1; // skip "

                    const className = decoder.decode(bytes.subarray(offset, offset + nameLength));
                    offset += nameLength + 2; // skip name and ":

                    const propsLengthStr = readUntil(':');
                    const propsLength = parseInt(propsLengthStr, 10);
                    offset += 1; // skip {

                    const properties: any = { __className: className };
                    for (let i = 0; i < propsLength; i++) {
                        const key = parse();
                        const value = parse();
                        properties[key] = value;
                    }
                    offset += 1; // skip }
                    return properties;
                }
                default:
                    throw new Error(`Unknown PHP type: ${type}`);
            }
        }

        const result = parse();

        return {
            success: true,
            content: JSON.stringify(result, null, 2)
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'Parse error'
        };
    }
}

/**
 * Format XML with indentation
 */
export function formatXML(text: string): FormatResult {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            return {
                success: false,
                content: text,
                error: 'Invalid XML'
            };
        }

        // Simple XML formatting
        const formatted = formatXMLNode(xmlDoc, 0);
        return {
            success: true,
            content: formatted
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'XML parse error'
        };
    }
}

function formatXMLNode(node: Node, indent: number): string {
    const indentStr = '  '.repeat(indent);

    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        return text ? text : '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        let result = `${indentStr}<${element.tagName}`;

        // Add attributes
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            result += ` ${attr.name}="${attr.value}"`;
        }

        if (element.childNodes.length === 0) {
            result += ' />';
            return result;
        }

        result += '>';

        // Format children
        const children: string[] = [];
        for (let i = 0; i < element.childNodes.length; i++) {
            const childFormatted = formatXMLNode(element.childNodes[i], indent + 1);
            if (childFormatted) {
                children.push(childFormatted);
            }
        }

        if (children.length > 0) {
            result += '\n' + children.join('\n') + '\n' + indentStr;
        }

        result += `</${element.tagName}>`;
        return result;
    }

    if (node.nodeType === Node.DOCUMENT_NODE) {
        const children: string[] = [];
        for (let i = 0; i < node.childNodes.length; i++) {
            const childFormatted = formatXMLNode(node.childNodes[i], indent);
            if (childFormatted) {
                children.push(childFormatted);
            }
        }
        return children.join('\n');
    }

    return '';
}

/**
 * Decode Base64
 */
export function decodeBase64(text: string): FormatResult {
    try {
        const decoded = atob(text.trim());
        return {
            success: true,
            content: decoded
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: 'Invalid Base64 string'
        };
    }
}

/**
 * Encode to Base64
 */
export function encodeBase64(text: string): FormatResult {
    try {
        const encoded = btoa(text);
        return {
            success: true,
            content: encoded
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'Encoding error'
        };
    }
}

/**
 * Decode URL encoded string
 */
export function decodeURL(text: string): FormatResult {
    try {
        const decoded = decodeURIComponent(text);
        return {
            success: true,
            content: decoded
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: 'Invalid URL encoded string'
        };
    }
}

/**
 * Encode to URL format
 */
export function encodeURL(text: string): FormatResult {
    try {
        const encoded = encodeURIComponent(text);
        return {
            success: true,
            content: encoded
        };
    } catch (error) {
        return {
            success: false,
            content: text,
            error: error instanceof Error ? error.message : 'Encoding error'
        };
    }
}

/**
 * Apply formatting based on format type
 */
export function applyFormat(text: string, format: FormatType): FormatResult {
    switch (format) {
        case 'raw':
            return { success: true, content: text };
        case 'json':
            return formatJSON(text);
        case 'json-minified':
            return minifyJSON(text);
        case 'php-serialize':
            return parsePhpSerialize(text);
        case 'xml':
            return formatXML(text);
        case 'base64-decode':
            return decodeBase64(text);
        case 'base64-encode':
            return encodeBase64(text);
        case 'url-decode':
            return decodeURL(text);
        case 'url-encode':
            return encodeURL(text);
        default:
            return { success: true, content: text };
    }
}

/**
 * Get human-readable label for format type
 */
export function getFormatLabel(format: FormatType): string {
    const labels: Record<FormatType, string> = {
        'raw': 'Raw',
        'json': 'JSON (Formatted)',
        'json-minified': 'JSON (Minified)',
        'php-serialize': 'PHP Serialize',
        'xml': 'XML',
        'base64-decode': 'Base64 Decode',
        'base64-encode': 'Base64 Encode',
        'url-decode': 'URL Decode',
        'url-encode': 'URL Encode'
    };
    return labels[format] || format;
}
