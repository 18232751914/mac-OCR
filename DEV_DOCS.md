# Screen OCR — 开发文档

> 基于 Electron + React 的 macOS 桌面离线 OCR 截图工具，支持多显示器跨屏框选、实时离线文字识别、长截图合并。

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈](#2-技术栈)
- [3. 项目结构](#3-项目结构)
- [4. 开发环境搭建](#4-开发环境搭建)
- [5. 架构设计](#5-架构设计)
  - [5.1 进程模型](#51-进程模型)
  - [5.2 窗口体系](#52-窗口体系)
  - [5.3 IPC 通信](#53-ipc-通信)
  - [5.4 状态管理](#54-状态管理)
- [6. 核心功能](#6-核心功能)
  - [6.1 单次截图](#61-单次截图)
  - [6.2 长截图](#62-长截图)
  - [6.3 多显示器支持](#63-多显示器支持)
  - [6.4 OCR 离线识别](#64-ocr-离线识别)
  - [6.5 全局快捷键](#65-全局快捷键)
  - [6.6 托盘菜单](#66-托盘菜单)
- [7. 可用脚本](#7-可用脚本)
- [8. 配置说明](#8-配置说明)

---

## 1. 项目概览

| 属性 | 值 |
|------|-----|
| 项目名 | `idl` |
| 版本 | `0.3.15` |
| 类型 | ESM (`"type": "module"`) |
| 主进程入口 | `electron/main.mjs` |
| 渲染进程入口 | `src/main.tsx` |
| 平台 | macOS only（OCR 依赖 Vision 框架） |
| 框架 | Electron 43 + React 18 + TypeScript + Tailwind CSS v4 |

### 功能特性

- **离线 OCR**：基于 Apple Vision 框架，无需网络，支持中/英/日/韩多语言
- **多显示器**：每屏独立叠加层，支持任意显示器间拖拽框选
- **长截图**：多次采集 + 自动去重合并
- **全局快捷键**：可自定义普通截图和长截图快捷键
- **托盘菜单**：左键弹出面板，右键快捷菜单

---

## 2. 技术栈

### 核心依赖

| 类别 | 技术 | 版本 |
|------|------|------|
| 运行时 | Electron | 43.0.0 |
| UI 框架 | React | 18.3.1 |
| 语言 | TypeScript | 5.6.2 |
| 样式 | Tailwind CSS v4 | 4.3.0 |
| 组件库 | shadcn/ui (Radix) | 4.10.0 |
| 状态管理 | Zustand | 4.5.5 |
| 构建工具 | Vite | 5.4.20 |
| 图标 | lucide-react | 1.17.0 |
| 测试 | Vitest | 2.0.5 |
| 格式化 | Prettier | 3.3.3 |
| 代码检查 | ESLint | 9.9.0 |

### 平台特定

| 平台 | 依赖 | 用途 |
|------|------|------|
| macOS | Apple Vision Framework | 离线 OCR 文字识别 |
| macOS | `screen` / `systemPreferences` | 屏幕捕获与权限检测 |
| macOS | `desktopCapturer` | 屏幕截图获取 |
| macOS | `globalShortcut` | 全局快捷键注册 |
| macOS | `Tray` | 菜单栏托盘 |

---

## 3. 项目结构

```
idl/
├── electron/                      # Electron 主进程（Node.js 端）
│   ├── main.mjs                   # 主进程入口，窗口/截图/IPC 全部逻辑
│   ├── preload.mjs                # 预加载脚本，暴露桌面 API 到渲染进程
│   ├── dev.mjs                    # 开发环境启动脚本（Vite + Electron）
│   └── ocr.swift                  # Swift 脚本，调用 Vision 框架做 OCR
├── src/                           # 渲染进程（React 应用）
│   ├── main.tsx                   # React 入口
│   ├── default.css                # 全局样式（主题、CSS 变量、drag 区域）
│   ├── components/                # 可复用组件
│   │   ├── ui/                    # shadcn/ui 组件（button, card, textarea 等）
│   │   └── DesktopCaptureOverlay.tsx  # 截图框选覆盖层
│   ├── views/
│   │   └── DesktopShellView.tsx   # 多 surface 视图（面板/结果/设置/覆盖层/工具栏）
│   ├── lib/
│   │   ├── desktopHostState.ts    # 状态 Hook + 类型定义
│   │   ├── desktopHost.ts         # 环境检测辅助
│   │   └── utils.ts               # cn() 工具函数
│   └── types/
│       └── desktop-host.d.ts      # Window.desktopHost 类型声明
├── public/
│   └── img/
│       └── favicon/               # 托盘图标及 favicon
├── package.json
├── tsconfig.json
├── tsconfig.ride.json             # 额外的 TS 配置
├── vite.config.ts                 # Vite 构建配置
├── eslint.config.js
├── prettier.config.mjs
├── components.json                # shadcn/ui 配置
├── index.html                     # HTML 入口
└── DEV_DOCS.md                    # 本文档
```

---

## 4. 开发环境搭建

### 环境要求

- **macOS** 11.0+ (Big Sur 及以上，OCR 依赖 Vision 框架)
- **Node.js** 18+
- **npm** 9+

### 安装与启动

```bash
# 安装依赖
npm install

# 开发模式（Vite dev server + Electron）
npm run desktop:dev

# 仅启动 Web 开发服务器（浏览器预览，无 Electron 功能）
npm run dev

# 生产构建
npm run desktop:build
npm run build
```

### 开发调试

- 主进程日志输出至终端控制台
- 渲染进程可在 Electron DevTools 中调试
- `ELECTRON_RENDERER_URL` 环境变量控制渲染进程加载地址

---

## 5. 架构设计

### 5.1 进程模型

```
┌─────────────────────────────────────────────────┐
│                   Main Process                   │
│              (electron/main.mjs)                 │
│                                                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Window  │ │ Screenshot│ │   OCR (Swift)    │ │
│  │ Manager │ │  Capture  │ │  child_process   │ │
│  └─────────┘ └──────────┘ └──────────────────┘ │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Tray   │ │Shortcuts │ │   State Sync     │ │
│  └─────────┘ └──────────┘ └──────────────────┘ │
└─────────────────┬───────────────────────────────┘
                  │  IPC (contextBridge)
┌─────────────────▼───────────────────────────────┐
│                 Preload Script                   │
│           (electron/preload.mjs)                 │
│         window.desktopHost.* API                 │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              Renderer Processes                  │
│              (React + TypeScript)                │
│  ┌──────┐ ┌───────┐ ┌──────────┐ ┌───────────┐ │
│  │Panel │ │Result │ │ Settings │ │  Overlay  │ │
│  │ 窗口 │ │ 窗口  │ │   窗口   │ │   窗口    │ │
│  └──────┘ └───────┘ └──────────┘ └───────────┘ │
└─────────────────────────────────────────────────┘
```

### 5.2 窗口体系

项目使用多窗口架构，通过 `surface` URL 参数区分窗口身份：

| Surface | 窗口变量 | 尺寸 | 特性 |
|---------|---------|------|------|
| `panel` | `panelWindow` | 420×580 | 菜单栏弹出面板，失焦自动隐藏，可拖动，`hiddenInMissionControl` |
| `result` | `resultWindow` | 560×420 | 识别结果编辑窗口，隐藏标题栏 |
| `settings` | `settingsWindow` | 460×360 | 快捷键设置窗口 |
| `overlay` | `overlayWindows[]` | 等于显示器 bounds | 每显示器一个，透明全屏，框选区域用 |
| `long-toolbar` | `longToolbarWindow` | 340×92 | 长截图悬浮控制条 |

**通用窗口属性**（`createHostWindow`）：
- `frame: false`, `titleBarStyle: 'hiddenInset'` — 无边框 macOS 风格
- `vibrancy: 'sidebar'` — 半透明毛玻璃效果
- `visualEffectState: 'active'` — 始终激活毛玻璃
- `resizable: false`, `maximizable: false` — 不可改变尺寸
- `contextIsolation: true`, `nodeIntegration: false` — 安全隔离

### 5.3 IPC 通信

渲染进程通过 `preload.mjs` 暴露的 `window.desktopHost` API 与主进程通信：

| IPC Channel | 方向 | 参数 | 返回值 | 功能 |
|------------|------|------|--------|------|
| `desktop-host:get-shell-state` | Renderer → Main | 无 | `HostShellState` | 获取完整应用状态 |
| `desktop-host:shell-state-updated` | Main → Renderer | `HostShellState` | - | 状态变更广播 |
| `desktop-host:toggle-panel-window` | Renderer → Main | 无 | `{ success }` | 切换面板显示 |
| `desktop-host:show-result-window` | Renderer → Main | 无 | `{ success }` | 显示结果窗口 |
| `desktop-host:show-settings-window` | Renderer → Main | 无 | `{ success }` | 显示设置窗口 |
| `desktop-host:start-screen-capture` | Renderer → Main | 无 | `{ success }` | 启动单次截图 |
| `desktop-host:start-long-screen-capture` | Renderer → Main | 无 | `{ success }` | 启动长截图 |
| `desktop-host:complete-screen-capture` | Renderer → Main | `OverlaySelection` | `{ success }` | 提交框选区域 |
| `desktop-host:cancel-capture-session` | Renderer → Main | 无 | `{ success }` | 取消截图会话 |
| `desktop-host:capture-long-segment` | Renderer → Main | 无 | `{ success }` | 采集长截图下一段 |
| `desktop-host:finish-long-capture` | Renderer → Main | 无 | `{ success }` | 完成并合并长截图 |
| `desktop-host:save-recent-result-text` | Renderer → Main | `{ text }` | `{ success }` | 保存编辑后的文本 |
| `desktop-host:copy-result-text` | Renderer → Main | `{ text }` | `{ success }` | 复制文本到剪贴板 |
| `desktop-host:save-shortcut-preference` | Renderer → Main | `{ mode, accelerator }` | `{ success }` | 保存快捷键偏好 |
| `desktop-host:save-advanced-features` | Renderer → Main | `{ config: AdvancedFeaturesConfig }` | `{ success }` | 保存高级功能后处理配置（过滤符号/字符替换/正则） |
| `desktop-host:open-screen-capture-preferences` | Renderer → Main | 无 | `{ success }` | 打开系统权限设置 |
| `desktop-host:close-current-window` | Renderer → Main | 无 | `{ success }` | 关闭/隐藏当前窗口 |

### 5.4 状态管理

主进程维护全局 `hostState` 对象，通过 `broadcastShellState()` 广播到所有渲染进程。渲染进程使用 `useDesktopHostState()` Hook 订阅状态更新。

```typescript
// HostShellState 核心字段
hostState = {
  permissions: { screenCapture: 'granted' | 'denied' | 'restricted' | 'unknown' },
  captureDisplays: CaptureDisplay[],      // 截图时各显示器信息
  recentCaptureResult: HostCaptureResult, // 最近一次识别结果
  activeCaptureSession: HostCaptureSession, // 当前截图会话
  longCaptureSession: LongCaptureSession,   // 长截图会话
  captureErrorMessage: string | null,
  shortcutPreferences: ShortcutPreferences, // 快捷键偏好
  shortcutRegistrationError: string | null,
}
```

---

## 6. 核心功能

### 6.1 单次截图流程

```
用户触发（快捷键/按钮/托盘）
    ↓
startScreenCapture('single')
    ↓
权限检查（screenCapture === 'granted'）
    ↓
获取所有显示器信息 → desktopCapturer 截取所有屏幕
    ↓
为每个显示器创建独立 overlay 窗口（透明全屏）
    ↓
用户在 overlay 上拖拽框选
    ↓ DesktopCaptureOverlay 组件
    ↓ onConfirm(selection) → completeScreenCapture
    ↓
resolveCaptureFromOverlaySelection() — 定位选区所在显示器
    ↓
cropScreenshot() — 按缩放比例精确裁剪图片
    ↓
finalizeSingleCapture() → recognizeTextFromImage() — OCR识别
    ↓ child_process.spawn('swift', [ocr.swift, tempFile])
    ↓
保存结果 → 显示 result 窗口
```

### 6.2 长截图流程

与单次截图的区别：初次框选后进入 `longCaptureSession`，保存选区相对坐标。后续通过 `captureLongSegment()` 以相同选区重复截取新内容，`mergeLongCaptureText()` 按"上一段末尾 = 下一段开头"规则去重合并文本。

```
框选区域 → OCR识别首段
    ↓
显示长截图工具栏
    ↓
用户滚动内容 → 点击"继续采集"
    ↓
captureLongSegment() → 同区域截取 → OCR → 追加文本
    ↓
重复上述步骤
    ↓
点击"完成长截图"
    ↓
mergeLongCaptureText() — 合并去重（最多8行重叠检测）
    ↓
保存合并结果 → 显示 result 窗口
```

### 6.3 多显示器支持

**核心设计**：每个显示器创建独立的透明 overlay 窗口，避免 Electron 单窗口跨屏时非主显示器鼠标事件丢失的问题。

```
startScreenCapture()
    ↓
screen.getAllDisplays() → 获取所有显示器
    ↓
desktopCapturer.getSources() → 截取所有屏幕
    ↓
for each display:
    ├── 存储 screenshot + bounds + thumbnailSize
    └── createOverlayWindow() → setBounds(display.bounds)
    ↓
overlayWindows = [win1, win2, ...]  // 每个显示器一个窗口
    ↓
用户框选 → 发送方 overlay 窗口的 bounds
    ↓
resolveCaptureFromOverlaySelection(selection, senderWindow)
    ├── 通过 senderWindow.getBounds() 匹配显示器
    └── 计算 crop 坐标 (选择已经在 display-local 坐标中)
```

**DP/Retina 处理**：通过 `thumbnailSize / bounds` 比例缩放到实际像素坐标。

### 6.4 OCR 离线识别

**文件**: `electron/ocr.swift`

**原理**: 调用 macOS Apple Vision 框架的 `VNRecognizeTextRequest`。

**配置**:
```swift
recognitionLevel = .accurate           // 精确模式
revision = VNRecognizeTextRequestRevision3  // 最新模型
usesLanguageCorrection = true          // 语言纠正
automaticallyDetectsLanguage = true    // 语言自动检测
recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP", "ko-KR"]
minimumTextHeight = 0.0               // 不设最小文本高度
```

**流程**:
1. 主进程将 dataURL 解码写入临时 PNG（`/tmp/screen-ocr-{timestamp}.png`）
2. `spawn('swift', [ocrScriptPath, tempFilePath])` 调用 Swift 脚本
3. Swift 使用 `CGImageSource` 直接加载图片（绕过 NSImage 分辨率缩放）
4. Vision 框架识别文字，取 top 3 candidates 中最长者
5. 输出 JSON `{"text":"..."}` → 主进程解析
6. 清理临时文件

**语言支持**: 简体中文、繁体中文、英文、日文、韩文

### 6.5 全局快捷键

- 默认快捷键：`⌘⇧1`（普通截图）/ `⌘⇧2`（长截图）
- 使用 Electron `globalShortcut` API 注册
- 支持在设置面板录制自定义快捷键
- 格式如 `CommandOrControl+Shift+1`，显示为 `⌘/Ctrl + ⇧ + 1`
- 若快捷键被占用，会提示注册失败

### 6.6 托盘菜单

- **左键点击**：弹出/隐藏面板窗口（自动对齐到菜单栏图标下方）
- **右键点击**：弹出快捷菜单
  - 显示/隐藏面板（动态切换）
  - 开始截图 / 长截图
  - 打开结果窗口
  - 打开设置
  - 退出应用
- 图标：单色模板图标（`setTemplateImage(true)`），自动适配明暗模式

---

## 7. 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（浏览器预览模式） |
| `npm run build` | tsc 类型检查 + Vite 生产构建 |
| `npm run desktop:dev` | Electron + Vite 开发模式 |
| `npm run desktop:build` | 生产构建（同 `npm run build`） |
| `npm run desktop:start` | 以 Electron 启动（需先启动 Vite dev server） |
| `npm run preview` | 预览生产构建 |
| `npm run test` | 运行 Vitest 测试 |
| `npm run type` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npm run format` | Prettier 格式化 `src/` 目录 |

---

## 8. 配置说明

### TypeScript (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Vite (`vite.config.ts`)

- 插件：`@vitejs/plugin-react-swc` + `@tailwindcss/vite` + `vite-tsconfig-paths`
- Base：`./`（相对路径，适配 Electron file:// 加载）
- 别名：`@` → `src/`

### Tailwind CSS v4

- CSS-first 配置方式，无 `tailwind.config.js`
- 主题 token 定义在 `src/default.css` 的 `@theme inline` 块
- 颜色使用 OKLCH 色彩空间，支持明暗主题
- 字体：Inter Variable

### shadcn/ui

- 配置：`components.json`
- 组件目录：`src/components/ui/`
- 共 19 个组件（button, card, textarea, dialog 等）

---

> **文档维护**: 项目迭代时请同步更新本文档，特别是新增 IPC 通道、窗口类型、功能流程时。
