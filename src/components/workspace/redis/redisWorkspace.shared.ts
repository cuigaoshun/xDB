export interface RedisResult {
  output: any;
}

export interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  length: number | null;
}

export interface ValueScanResult {
  cursor: string;
  values: any[];
}

export interface ScanResult {
  cursor: string;
  keys: KeyDetail[];
}

export const KEY_ITEM_HEIGHT = 52;

export const getSearchPattern = (searchTerm: string): string => {
  if (!searchTerm.trim()) {
    return "*";
  }

  if (searchTerm.endsWith("*")) {
    const prefix = searchTerm.slice(0, -1);
    return prefix ? `${prefix}*` : "*";
  }

  return `${searchTerm}*`;
};

export const getTypeColor = (type?: string): string => {
  switch (type) {
    case "string":
      return "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200";
    case "hash":
      return "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200";
    case "list":
      return "bg-green-100 text-green-700 hover:bg-green-200 border-green-200";
    case "set":
      return "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200";
    case "zset":
      return "bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200";
    default:
      return "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200";
  }
};

export const formatSize = (bytes?: number | null): string => {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
};
