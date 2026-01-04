import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "app": {
        "name": "NeoDB"
      },
      "sidebar": {
        "connections": "Connections"
      },
      "common": {
        "noActiveConnection": "No Active Connection",
        "selectConnection": "Select a connection from the sidebar to start.",
        "close": "Close",
        "closeOthers": "Close Others",
        "closeRight": "Close to the Right",
        "closeLeft": "Close to the Left",
        "closeAll": "Close All",
        "settings": "Settings",
        "theme": "Theme",
        "name": "Name",
        "type": "Type",
        "host": "Host",
        "port": "Port",
        "username": "Username",
        "password": "Password",
        "database": "Database",
        "actions": "Actions",
        "create": "Create",
        "connect": "Connect",
        "save": "Save",
        "cancel": "Cancel",
        "searchPlaceholder": "Search connections...",
        "searchExplorer": "Search databases/tables...",
        "noConnectionsFound": "No connections found.",
        "confirmDelete": "Are you sure you want to delete this connection?",
        "edit": "Edit",
        "delete": "Delete",
        "connection": "Connection",
        "name_required": "Name is required",
        "host_required": "Host is required",
        "port_invalid": "Port must be a valid number > 0",
        "path_required": "Database path is required",
        "rightClickToFormat": "Right-click to Format/View",
        "format": "Format",
        "copy": "Copy",
        "copied": "Copied!",
        "textFormatter": "Text Formatter",
        "viewFormatted": "View Formatted",
        "quickFormat": "Quick Format",
        "formatTransform": "Format / Transform",
        "originalData": "Original Data"
      },
      "menu": {
        "file": "File",
        "newConnection": "New Connection",
        "exit": "Exit",
        "edit": "Edit",
        "view": "View",
        "help": "Help",
        "about": "About"
      },
      "mysql": {
        "query": "Query",
        "table": "Table",
        "view": "View",
        "run": "Run",
        "tables": "TABLES"
      },
      "redis": {
        "connected": "Connected",
        "filterKeys": "Filter keys...",
        "addKey": "Key",
        "type": "Type",
        "key": "Key",
        "ttl": "TTL",
        "size": "Size",
        "field": "Field",
        "value": "Value",
        "member": "Member",
        "score": "Score",
        "index": "Index",
        "addField": "Add Field",
        "addMember": "Add Member",
        "addItem": "Add Item",
        "saveChanges": "Save Changes",
        "saving": "Saving...",
        "adding": "Adding...",
        "total": "Total",
        "loading": "Loading...",
        "noFields": "No fields found",
        "noMembers": "No members found",
        "listEmpty": "List is empty",
        "prettify": "Prettify JSON",
        "minify": "Minify JSON",
        "confirmDelete": "Are you sure?",
        "deleteConfirm": "This will delete the item. Continue?",
        "position": "Position",
        "head": "Head (LPUSH)",
        "tail": "Tail (RPUSH)",
        "enterField": "Enter field name",
        "enterValue": "Enter value",
        "enterMember": "Enter member value",
        "addNewKey": "Add New Key",
        "keyNameRequired": "Key name is required",
        "failedToCreate": "Failed to create key",
        "enterKeyName": "Enter key name",
        "enterScore": "Enter score",
        "enterInitialMember": "Enter initial member value",
        "selectType": "Select type",
        "element": "Element",
        "sortedSet": "Sorted Set"
      }
    }
  },
  zh: {
    translation: {
      "app": {
        "name": "NeoDB"
      },
      "sidebar": {
        "connections": "连接列表",
        "explorer": "全部连接"
      },
      "common": {
        "noActiveConnection": "无活动连接",
        "selectConnection": "请从侧边栏选择一个连接以开始。",
        "close": "关闭",
        "closeOthers": "关闭其他",
        "closeRight": "关闭右侧",
        "closeLeft": "关闭左侧",
        "closeAll": "关闭全部",
        "settings": "设置",
        "theme": "主题",
        "language": "语言",
        "name": "名称",
        "type": "类型",
        "host": "主机",
        "port": "端口",
        "username": "用户名",
        "password": "密码",
        "database": "数据库",
        "actions": "操作",
        "create": "创建",
        "connect": "连接",
        "save": "保存",
        "cancel": "取消",
        "searchPlaceholder": "搜索连接...",
        "searchExplorer": "搜索库/表...",
        "noConnectionsFound": "未找到连接。",
        "confirmDelete": "确定要删除此连接吗？",
        "edit": "编辑",
        "delete": "删除",
        "connection": "连接",
        "name_required": "请输入连接名称",
        "host_required": "请输入主机地址",
        "port_invalid": "端口必须是有效的正整数",
        "path_required": "请输入数据库路径",
        "rightClickToFormat": "右键点击可进行格式化/查看",
        "format": "格式",
        "copy": "复制",
        "copied": "已复制!",
        "textFormatter": "文本格式化器",
        "viewFormatted": "查看格式化",
        "quickFormat": "快速格式化",
        "formatTransform": "格式化 / 转换",
        "originalData": "原始数据"
      },
      "menu": {
        "home": "首页",
        "file": "文件",
        "newConnection": "新建连接",
        "exit": "退出",
        "edit": "编辑",
        "view": "视图",
        "help": "帮助",
        "about": "关于"
      },
      "mysql": {
        "query": "查询",
        "table": "表",
        "view": "视图",
        "run": "运行",
        "tables": "表"
      },
      "redis": {
        "connected": "已连接",
        "filterKeys": "过滤键...",
        "addKey": "键",
        "type": "类型",
        "key": "键名",
        "ttl": "过期时间",
        "size": "大小",
        "field": "字段",
        "value": "值",
        "member": "成员",
        "score": "分数",
        "index": "索引",
        "addField": "添加字段",
        "addMember": "添加成员",
        "addItem": "添加项",
        "saveChanges": "保存更改",
        "saving": "保存中...",
        "adding": "添加中...",
        "total": "总数",
        "loading": "加载中...",
        "noFields": "未找到字段",
        "noMembers": "未找到成员",
        "listEmpty": "列表为空",
        "prettify": "美化 JSON",
        "minify": "压缩 JSON",
        "confirmDelete": "确定要删除吗？",
        "deleteConfirm": "这将删除该项。继续？",
        "position": "位置",
        "head": "头部 (LPUSH)",
        "tail": "尾部 (RPUSH)",
        "enterField": "输入字段名",
        "enterValue": "输入值",
        "enterMember": "输入成员值",
        "addNewKey": "添加新键",
        "keyNameRequired": "请输入键名",
        "failedToCreate": "创建键失败",
        "enterKeyName": "输入键名",
        "enterScore": "输入分数",
        "enterInitialMember": "输入初始成员值",
        "selectType": "选择类型",
        "element": "元素",
        "sortedSet": "ZSet"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh', // 默认中文
    lng: 'zh', // 强制默认中文
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
