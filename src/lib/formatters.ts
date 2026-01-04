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
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
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
 * Format JSON with indentation
 */
export function formatJSON(text: string, indent: number = 2): FormatResult {
    try {
        const parsed = JSON.parse(text);
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
        const parsed = JSON.parse(text);
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
    let offset = 0;

    function parse(): any {
        const type = text[offset];
        offset += 2; // skip type and colon

        switch (type) {
            case 'N': // null
                return null;
            case 'b': { // boolean
                const end = text.indexOf(';', offset);
                const value = text.substring(offset, end) === '1';
                offset = end + 1;
                return value;
            }
            case 'i': { // integer
                const end = text.indexOf(';', offset);
                const value = parseInt(text.substring(offset, end));
                offset = end + 1;
                return value;
            }
            case 'd': { // float
                const end = text.indexOf(';', offset);
                const value = parseFloat(text.substring(offset, end));
                offset = end + 1;
                return value;
            }
            case 's': { // string
                const lengthEnd = text.indexOf(':', offset);
                const length = parseInt(text.substring(offset, lengthEnd));
                offset = lengthEnd + 2; // skip length and :"
                const value = text.substring(offset, offset + length);
                offset += length + 2; // skip string and ";
                return value;
            }
            case 'a': { // array
                const lengthEnd = text.indexOf(':', offset);
                const length = parseInt(text.substring(offset, lengthEnd));
                offset = lengthEnd + 2; // skip length and :{
                const result: any = {};
                let isArray = true;
                for (let i = 0; i < length; i++) {
                    const key = parse();
                    const value = parse();
                    result[key] = value;
                    if (key !== i) isArray = false;
                }
                offset += 1; // skip }
                return isArray ? Object.values(result) : result;
            }
            case 'O': { // object
                const nameLengthEnd = text.indexOf(':', offset);
                const nameLength = parseInt(text.substring(offset, nameLengthEnd));
                offset = nameLengthEnd + 2; // skip length and :"
                const className = text.substring(offset, offset + nameLength);
                offset += nameLength + 2; // skip name and ":

                const propsLengthEnd = text.indexOf(':', offset);
                const propsLength = parseInt(text.substring(offset, propsLengthEnd));
                offset = propsLengthEnd + 2; // skip length and :{

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

    try {
        const trimmed = text.trim();
        if (!trimmed) {
            return { success: false, content: text, error: 'Empty content' };
        }

        // Reset offset for actual text
        offset = 0;
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
