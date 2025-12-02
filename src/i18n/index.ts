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
        "settings": "Settings",
        "theme": "Theme",
        "language": "Language"
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
        "settings": "设置",
        "theme": "主题",
        "language": "语言",
        "name": "名称",
        "type": "类型",
        "host": "主机/端口",
        "actions": "操作",
        "create": "创建",
        "connect": "连接",
        "searchPlaceholder": "搜索连接...",
        "noConnectionsFound": "未找到连接。"
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
