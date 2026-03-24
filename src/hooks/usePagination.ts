/**
 * 分页逻辑 Hook
 */
import { useState, useCallback } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/constants/workspace';

export interface UsePaginationOptions {
    initialPage?: number;
    initialPageSize?: number;
    onPageChange?: (page: number, pageSize: number) => void;
}

export interface UsePaginationReturn {
    currentPage: number;
    pageSize: number;
    pageSizeInput: string;
    setCurrentPage: (page: number) => void;
    setPageSize: (size: number) => void;
    setPageSizeInput: (input: string) => void;
    handlePageChange: (newPage: number) => void;
    handlePageSizeChange: () => boolean;
    resetPagination: () => void;
    getOffset: () => number;
}

/**
 * 分页逻辑 Hook
 * @param options - 分页选项
 * @returns 分页状态和方法
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
    const {
        initialPage = 0,
        initialPageSize = DEFAULT_PAGE_SIZE,
        onPageChange,
    } = options;

    const [currentPage, setCurrentPage] = useState(initialPage);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [pageSizeInput, setPageSizeInput] = useState(String(initialPageSize));

    const handlePageChange = useCallback((newPage: number) => {
        setCurrentPage(newPage);
        onPageChange?.(newPage, pageSize);
    }, [pageSize, onPageChange]);

    const handlePageSizeChange = useCallback((): boolean => {
        const newSize = parseInt(pageSizeInput, 10);
        if (isNaN(newSize) || newSize <= 0) {
            return false;
        }
        setPageSize(newSize);
        setCurrentPage(0);
        onPageChange?.(0, newSize);
        return true;
    }, [pageSizeInput, onPageChange]);

    const resetPagination = useCallback(() => {
        setCurrentPage(0);
        setPageSize(initialPageSize);
        setPageSizeInput(String(initialPageSize));
    }, [initialPageSize]);

    const getOffset = useCallback(() => {
        return currentPage * pageSize;
    }, [currentPage, pageSize]);

    return {
        currentPage,
        pageSize,
        pageSizeInput,
        setCurrentPage,
        setPageSize,
        setPageSizeInput,
        handlePageChange,
        handlePageSizeChange,
        resetPagination,
        getOffset,
    };
}

/**
 * 自动为 SELECT 语句添加 LIMIT 和 OFFSET
 * @param query - SQL 查询语句
 * @param limit - 每页数量
 * @param offset - 偏移量
 * @returns 处理后的 SQL
 */
export function autoAddLimit(query: string, limit: number, offset: number): string {
    let trimmedQuery = query.trim();
    if (trimmedQuery.endsWith(';')) {
        trimmedQuery = trimmedQuery.slice(0, -1).trim();
    }
    const upperQuery = trimmedQuery.toUpperCase();

    // 只处理 SELECT 语句
    if (!upperQuery.startsWith('SELECT')) {
        return query;
    }

    // 如果已经有 LIMIT，先移除它
    let processedQuery = trimmedQuery;
    const limitRegex = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i;
    processedQuery = processedQuery.replace(limitRegex, '');

    // 添加新的 LIMIT 和 OFFSET
    return offset > 0
        ? `${processedQuery} LIMIT ${limit} OFFSET ${offset}; `
        : `${processedQuery} LIMIT ${limit}; `;
}
