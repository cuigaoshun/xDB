// src/components/redis/RedisKeyTree.tsx
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useVirtualizer } from "@tanstack/react-virtual";

interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  length: number | null;
}

interface TreeNode {
  id: string;           // 唯一标识
  name: string;         // 当前节点显示名称
  fullPath: string;     // 完整路径前缀
  isLeaf: boolean;      // 是否是叶子节点（实际的 key）
  children: TreeNode[]; // 子节点
  keyDetail?: KeyDetail; // 叶子节点的详细信息
  keyCount: number;     // 子节点中的 key 数量
}

interface FlatNode {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
}

interface RedisKeyTreeProps {
  keys: KeyDetail[];
  delimiter: string;
  selectedKey: string | null;
  onKeyClick: (keyItem: KeyDetail) => void;
  loading: boolean;
  formatTTL: (seconds?: number) => string;
}

// 获取类型颜色
const getTypeColor = (type?: string): string => {
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

// 格式化大小
const formatSize = (bytes?: number | null): string => {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
};

const TREE_ITEM_HEIGHT = 36;

export function RedisKeyTree({
  keys,
  delimiter,
  selectedKey,
  onKeyClick,
  loading,
  formatTTL,
}: RedisKeyTreeProps) {
  const { t } = useTranslation();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  // 构建树结构
  const tree = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      name: "root",
      fullPath: "",
      isLeaf: false,
      children: [],
      keyCount: 0,
    };

    // 如果分隔符为空，直接返回扁平列表
    if (!delimiter) {
      root.children = keys.map((key) => ({
        id: key.key,
        name: key.key,
        fullPath: key.key,
        isLeaf: true,
        children: [],
        keyDetail: key,
        keyCount: 1,
      }));
      root.keyCount = keys.length;
      return root;
    }

    for (const keyDetail of keys) {
      const parts = keyDetail.key.split(delimiter);
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const fullPath = parts.slice(0, i + 1).join(delimiter);

        let childNode = currentNode.children.find((n) => n.name === part && n.fullPath === fullPath);

        if (!childNode) {
          childNode = {
            id: isLast ? keyDetail.key : `folder:${fullPath}`,
            name: part,
            fullPath,
            isLeaf: isLast,
            children: [],
            keyDetail: isLast ? keyDetail : undefined,
            keyCount: 0,
          };
          currentNode.children.push(childNode);
        }

        if (isLast) {
          childNode.keyDetail = keyDetail;
          childNode.isLeaf = true;
        }

        currentNode = childNode;
      }
    }

    // 计算每个节点的 key 数量
    const calculateKeyCount = (node: TreeNode): number => {
      if (node.isLeaf) {
        node.keyCount = 1;
        return 1;
      }
      node.keyCount = node.children.reduce((sum, child) => sum + calculateKeyCount(child), 0);
      return node.keyCount;
    };
    calculateKeyCount(root);

    // 排序：文件夹优先，然后按名称排序
    const sortChildren = (node: TreeNode) => {
      node.children.sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) {
          return a.isLeaf ? 1 : -1; // 文件夹优先
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    };
    sortChildren(root);

    return root;
  }, [keys, delimiter]);

  // 扁平化树结构用于虚拟滚动
  const flattenedNodes = useMemo(() => {
    const result: FlatNode[] = [];

    const traverse = (node: TreeNode, depth: number) => {
      // 跳过根节点
      if (node.id !== "root") {
        const isExpanded = expandedNodes.has(node.id);
        result.push({ node, depth, isExpanded });

        // 如果不是叶子节点且未展开，跳过子节点
        if (!node.isLeaf && !isExpanded) {
          return;
        }
      }

      // 遍历子节点
      for (const child of node.children) {
        traverse(child, node.id === "root" ? 0 : depth + 1);
      }
    };

    traverse(tree, -1);
    return result;
  }, [tree, expandedNodes]);

  // 切换展开/折叠
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 虚拟列表
  const rowVirtualizer = useVirtualizer({
    count: flattenedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TREE_ITEM_HEIGHT,
    overscan: 10,
  });

  if (keys.length === 0 && !loading) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        {t("redis.noKeys")}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const { node, depth, isExpanded } = flattenedNodes[virtualRow.index];
          const isSelected = node.isLeaf && node.keyDetail?.key === selectedKey;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={`flex items-center h-full px-2 cursor-pointer hover:bg-accent/50 transition-colors ${
                  isSelected ? "bg-accent" : ""
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => {
                  if (node.isLeaf && node.keyDetail) {
                    onKeyClick(node.keyDetail);
                  } else {
                    toggleNode(node.id);
                  }
                }}
              >
                {/* 展开/折叠图标 或 占位 */}
                {!node.isLeaf ? (
                  <button
                    className="p-0.5 hover:bg-accent rounded mr-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNode(node.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                ) : (
                  <span className="w-5 mr-1" />
                )}

                {/* 图标 */}
                {node.isLeaf ? (
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 h-4 rounded min-w-[32px] justify-center uppercase border-0 mr-2 ${getTypeColor(
                      node.keyDetail?.type
                    )}`}
                  >
                    {node.keyDetail?.type || "..."}
                  </Badge>
                ) : isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-yellow-600 mr-2 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-yellow-600 mr-2 shrink-0" />
                )}

                {/* 名称 */}
                <span
                  className={`flex-1 text-sm truncate ${
                    node.isLeaf ? "font-mono" : "font-medium"
                  }`}
                  title={node.isLeaf ? node.keyDetail?.key : node.fullPath}
                >
                  {node.name}
                </span>

                {/* 右侧信息 */}
                {node.isLeaf ? (
                  <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0 whitespace-nowrap ml-2">
                    <span>{formatTTL(node.keyDetail?.ttl)}</span>
                    <span>{formatSize(node.keyDetail?.length)}</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {node.keyCount}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="p-4 text-center text-muted-foreground text-xs">
          {t("common.loading")}
        </div>
      )}
    </div>
  );
}
