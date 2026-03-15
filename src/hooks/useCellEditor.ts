/**
 * 单元格编辑逻辑 Hook
 */
import { useState, useCallback } from 'react';
import type { EditingCell } from '@/types/sql';

export interface UseCellEditorReturn {
    editingCell: EditingCell | null;
    editValue: string;
    setEditValue: (value: string) => void;
    startEdit: (rowIdx: number, colName: string, currentValue: any, isNewRow: boolean) => void;
    cancelEdit: () => void;
    isEditing: (rowIdx: number, colName: string, isNewRow: boolean) => boolean;
    getEditingRowIdx: () => number | null;
}

/**
 * 单元格编辑逻辑 Hook
 * @returns 编辑状态和方法
 */
export function useCellEditor(): UseCellEditorReturn {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    /**
     * 开始编辑单元格
     */
    const startEdit = useCallback((
        rowIdx: number,
        colName: string,
        currentValue: any,
        isNewRow: boolean
    ) => {
        setEditingCell({ rowIdx, colName, isNewRow });

        // 格式化值为字符串
        let valueStr = '';
        if (currentValue !== null && currentValue !== undefined) {
            if (typeof currentValue === 'object') {
                valueStr = JSON.stringify(currentValue);
            } else {
                valueStr = String(currentValue);
            }
        }
        setEditValue(valueStr);
    }, []);

    /**
     * 取消编辑
     */
    const cancelEdit = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
    }, []);

    /**
     * 检查指定单元格是否正在编辑
     */
    const isEditing = useCallback((
        rowIdx: number,
        colName: string,
        isNewRow: boolean
    ): boolean => {
        if (!editingCell) return false;
        return (
            editingCell.rowIdx === rowIdx &&
            editingCell.colName === colName &&
            editingCell.isNewRow === isNewRow
        );
    }, [editingCell]);

    /**
     * 获取正在编辑的行索引
     */
    const getEditingRowIdx = useCallback((): number | null => {
        return editingCell?.rowIdx ?? null;
    }, [editingCell]);

    return {
        editingCell,
        editValue,
        setEditValue,
        startEdit,
        cancelEdit,
        isEditing,
        getEditingRowIdx,
    };
}

/**
 * 格式化单元格值用于显示
 * @param value - 原始值
 * @param maxLength - 最大显示长度
 * @returns 格式化后的字符串
 */
export function formatCellValue(value: any, maxLength: number = 100): string {
    if (value === null || value === undefined) {
        return '';
    }

    let str: string;
    if (typeof value === 'object') {
        str = JSON.stringify(value);
    } else {
        str = String(value);
    }

    if (str.length > maxLength) {
        return str.slice(0, maxLength) + '...';
    }

    return str;
}

/**
 * 解析编辑值为目标类型
 * @param editValue - 编辑框中的字符串值
 * @returns 解析后的值（空字符串转为 null）
 */
export function parseEditValue(editValue: string): any {
    if (editValue === '') {
        return null;
    }
    return editValue;
}
