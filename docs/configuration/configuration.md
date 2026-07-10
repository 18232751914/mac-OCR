# 配置说明

> 本文件由 `README.md` 第 7 节拆出，汇总构建期环境变量、默认快捷键与主题配置。

## 环境变量（构建期，Vite `import.meta.env`）

| 变量 | 用途 |
|------|------|
| `VITE_API_URL` | 远端业务服务基地址（`ApiClient` 调用 `POST {VITE_API_URL}/{service}/invoke|stream`） |
| `VITE_APP_NAME` | 运行时覆盖 `<title>` 与动态 manifest 名称 |
| `VITE_APP_DESCRIPTION` | 动态 manifest 描述 |
| `ELECTRON_RENDERER_URL` | 开发模式下渲染进程加载地址（默认 `http://localhost:3000`）；生产模式走 `file://dist/index.html` |

## 快捷键（默认）

| 动作 | 默认组合 |
|------|----------|
| 普通截图 | `CommandOrControl+Shift+1`（`⌘/Ctrl + ⇧ + 1`） |
| 长截图 | `CommandOrControl+Shift+2`（`⌘/Ctrl + ⇧ + 2`） |
| 截图至剪贴板 | `CommandOrControl+Shift+3`（`⌘/Ctrl + ⇧ + 3`） |
| 唤起菜单 | `CommandOrControl+Shift+M`（`⌘/Ctrl + ⇧ + M`） |

设置面板可重新录制；相同组合键在三处重复或组合键被系统占用均会提示注册失败。

## 主题

设置面板「主题色」提供 7 种预设：红 (hue 25) / 橙 (50) / 黄 (95) / 绿 (142) / 青 (195) / 蓝 (255, 默认) / 紫 (285)。选择后界面实时切换，持久化至 `localStorage['app-theme-id']`。
