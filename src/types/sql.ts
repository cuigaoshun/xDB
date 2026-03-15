/**
 * SQL 相关的共享类型定义
 */

/**
 * 列信息
 */
export interface ColumnInfo {
    name: string;
    type_name: string;
    comment?: string;
}

/**
 * 扩展列信息（包含 SHOW COLUMNS 返回的完整信息）
 */
export interface ExtendedColumnInfo {
    Field: string;
    Type: string;
    Null: string;
    Key: string;
    Default: string | null;
    Extra: string;
    Comment?: string;
}

/**
 * SQL 执行结果
 */
export interface SqlResult {
    columns: ColumnInfo[];
    rows: Record<string, any>[];
    affected_rows: number;
}

/**
 * 编辑中的单元格信息
 */
export interface EditingCell {
    rowIdx: number;
    colName: string;
    isNewRow: boolean;
}

/**
 * 分页状态
 */
export interface PaginationState {
    currentPage: number;
    pageSize: number;
    pageSizeInput: string;
}

/**
 * 索引信息
 */
export interface IndexInfo {
    Table: string;
    Non_unique: number;
    Key_name: string;
    Seq_in_index: number;
    Column_name: string;
    Collation: string | null;
    Cardinality: number | null;
    Sub_part: number | null;
    Packed: string | null;
    Null: string;
    Index_type: string;
    Comment: string;
}

/**
 * 筛选类型
 */
export type FilterType = 'condition' | 'group';

/**
 * 逻辑运算符
 */
export type LogicOperator = 'AND' | 'OR';

/**
 * 筛选节点
 */
export interface FilterNode {
    id: string;
    type: FilterType;
    isActive: boolean;
    // For condition type
    field?: string;
    operator?: string;
    value?: string;
    // For group type
    children?: FilterNode[];
    logic?: LogicOperator;
    // Logic operator for joining with next sibling
    nextLogic?: LogicOperator;
}

/**
 * ORDER BY 子句
 */
export interface OrderByClause {
    field: string;
    direction: 'ASC' | 'DESC';
}
