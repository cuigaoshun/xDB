# NeoDB

<img src="public/app-icon.svg" width="128" align="right" />

NeoDB 是一个现代化的、跨平台的数据库管理工具，旨在提供类似 Navicat 的流畅体验。基于 Tauri 构建，拥有轻量级、高性能的特点。

## ✨ 功能特性

- **多数据库支持**
  - 🐬 **MySQL**: 支持连接管理、SQL 执行、表结构查看与设计、DDL 面板显示等。
  - 🔑 **Redis**: 支持键值对管理、数据库选择、批量操作、虚拟滚动等。
  - 🐘 **PostgreSQL**: 支持 PostgreSQL 连接与操作。
  - 💾 **SQLite**: 支持 SQLite 文件数据库连接与管理。
  - 🗄️ **Memcached**: 支持 Memcached 缓存服务连接。
- **多标签页设计**
  - 支持同时打开多个连接和查询窗口，类似浏览器的多标签页体验，提高工作效率。
  - 智能标签页复用策略，避免标签页过多。
  - 支持右键菜单操作（关闭、关闭其他、关闭左侧/右侧等）。
- **侧边栏功能**
  - 连接树形结构显示，支持数据库和表浏览。
  - 搜索过滤功能，快速定位连接和表。
  - 可调整高度的数据库列表，防止界面过长。
- **SQL 编辑器**
  - 语法高亮支持，适配明暗主题。
  - 智能初始 SQL 生成。
  - 实时状态同步。
- **跨平台**
  - 支持 Windows, macOS 和 Linux。
- **现代化 UI**
  - 简洁直观的用户界面，支持暗色模式。

## 🛠️ 技术栈

- **前端**: [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **后端**: [Rust](https://www.rust-lang.org/), [Tauri](https://tauri.app/)
- **UI 框架**: [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)

## 🚀 开发指南

### 环境要求

- [Node.js](https://nodejs.org/) (建议 v18+)
- [Rust](https://www.rust-lang.org/tools/install) (用于 Tauri 后端)
- [pnpm](https://pnpm.io/) (推荐) 或 npm/yarn

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
# 同时启动前端和 Tauri 窗口
pnpm tauri dev
```

### 构建

```bash
pnpm tauri build
```

## 📝 已实现功能

- [x] MySQL 连接与基本查询
- [x] Redis 连接与基本操作  
- [x] 多标签页状态管理
- [x] 侧边栏连接树形结构
- [x] 表数据查看功能
- [x] DDL 面板显示
- [x] 语法高亮支持
- [x] 搜索过滤功能
- [x] 国际化支持 (中英文)
- [x] 智能标签页管理
- [x] 连接表单UI优化

## 📝 待办事项

- [ ] PostgreSQL 连接实现
- [ ] SQLite 连接实现  
- [ ] Memcached 连接实现
- [ ] SQL 查询结果编辑功能
- [ ] 数据导入导出功能
- [ ] 查询历史记录
- [ ] 更多数据库类型支持

## 📄 许可证

MIT
