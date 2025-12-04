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
        "language": "Language",
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
        "path_required": "Database path is required"
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
        "size": "Size"
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
        "path_required": "请输入数据库路径"
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
        "size": "大小"
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
