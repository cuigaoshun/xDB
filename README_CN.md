# xDB

<img src="public/app-icon.png" width="128" align="right" />

[![GitHub release](https://img.shields.io/github/v/release/cuigaoshun/xDB)](https://github.com/cuigaoshun/xDB/releases)
[![License](https://img.shields.io/github/license/cuigaoshun/xDB)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/cuigaoshun/xDB)

[English](README.md)

**xDB** 是一款基于 Tauri v2 和 React 构建的现代化、极速、跨平台数据库管理枢纽。它旨在打破不同数据库之间的界限，为开发者提供一个全能（Cross-engine）且优雅的操控台。

## ✨ 核心特性

- **🌀 全能连接 (Cross-Engine Support)**
  - 🐬 **MySQL**: 完整的 CRUD 支持、结果集实时编辑、DDL 查看、事务管理、筛选器构建器
  - 💾 **SQLite**: 极简的本地文件数据库连接、查询与结果展示
  - 🔑 **Redis**: 键值对管理、多 DB 切换、TTL 修改、数据类型自动识别（String/Set/List/Hash/ZSet）
  - 🗄️ **Memcached**: 高效的缓存服务连接与基本操作
- **📑 统一格式化器 (Universal Formatter)**
  - 内置强大的文本识别系统，支持 JSON、XML、PHP Serialize、HTML、Base64、SQL 等格式一键美化
- **📟 指令回响 (Command Console)**
  - 实时监控每一条外发指令及其执行时长，让数据库交互透明化
- **🔄 连接管理**
  - 支持连接分组管理、连接导入/导出（JSON 格式）
- **🎨 极致视觉 (Modern UI/UX)**
  - 基于 **shadcn/ui** 的高颜值界面，完美适配暗色模式
  - 支持多标签页切换、可调整面板布局
- **⚡ 性能基因**
  - 后端由 **Rust** 驱动，极致轻量，秒级启动，跨平台支持 (Win/macOS/Linux)
- **🔔 自动更新**
  - 内置自动更新机制，确保您始终使用最新版本
- **🌐 多语言支持**
  - 支持中文/英文界面切换，可在设置中自由切换

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite 7 |
| 后端 | Rust (Tauri v2) |
| 状态 | Zustand |
| UI | Tailwind CSS, shadcn/ui, Radix UI |
| 编辑器 | Monaco Editor |
| 格式化 | sql-formatter |

## 🚀 快速开始

### 前置要求

- **Node.js** >= 20
- **pnpm** >= 8
- **Rust** >= 1.70

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
pnpm tauri dev
```

### 构建生产包

```bash
pnpm tauri build
```

## ⚙️ 设置说明

| 设置项 | 说明 |
|--------|------|
| Redis SCAN 数量 | 每次 SCAN 操作的键数量，影响加载性能 |
| MySQL 预取数据库数 | 首次加载时预取的数据库数量 |
| 显示系统数据库 | 是否在列表中显示系统数据库（如 mysql, information_schema） |

## 📄 许可证

本项目基于 **GNU General Public License v3.0** 开源协议。

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0.html)

查看 [LICENSE](LICENSE) 了解详情。

## 🙏 感谢

- [Tauri](https://tauri.app/) - 构建跨平台应用
- [shadcn/ui](https://ui.shadcn.com/) - 精美的 UI 组件
- [Radix UI](https://www.radix-ui.com/) - 无样式 UI 组件库