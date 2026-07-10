# 屏幕 OCR — 开发文档（DEV_DOCS）

> 基于 Electron + React 的 macOS 桌面离线 OCR 截图工具。本文档描述进程模型、窗口体系、完整 IPC 接口契约、主进程与渲染进程实现细节、前端业务层、关键数据流与配置，内容均与 `react-app/` 当前代码保持一致。

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈与依赖](#2-技术栈与依赖)
- [3. 项目结构](#3-项目结构)
- [4. 开发环境搭建](#4-开发环境搭建)
- [5. 架构设计](#5-架构设计)
  - [5.1 进程模型](#51-进程模型)
  - [5.2 窗口体系](#52-窗口体系)
  - [5.3 渲染进程加载](#53-渲染进程加载)
  - [5.4 IPC 通信](#54-ipc-通信)
  - [5.5 状态管理](#55-状态管理)
- [6. 主进程核心实现（electron/main.mjs）](#6-主进程核心实现electronmainmjs)
  - [6.1 截图采集与多显示器](#61-截图采集与多显示器)
  - [6.2 OCR 离线识别](#62-ocr-离线识别)
  - [6.3 长截图与拼接](#63-长截图与拼接)
  - [6.4 全局快捷键](#64-全局快捷键)
  - [6.5 托盘菜单](#65-托盘菜单)
  - [6.6 开机自启动与权限](#66-开机自启动与权限)
  - [6.7 持久化](#67-持久化)
- [7. OCR 脚本（electron/ocr.swift）](#7-ocr-脚本electronocrswift)
- [8. 拼接窗口（electron/stitcher.html）](#8-拼接窗口electronstitcherhtml)
- [9. 渲染进程架构](#9-渲染进程架构)
  - [9.1 入口与路由](#91-入口与路由)
  - [9.2 主视图切换（DesktopShellView）](#92-主视图切换desktopshellview)
  - [9.3 宿主状态订阅](#93-宿主状态订阅)
  - [9.4 环境降级](#94-环境降级)
- [10. 前端业务层](#10-前端业务层)
  - [10.1 API 调用层（api/）](#101-api-调用层api)
  - [10.2 鉴权（auth/）](#102-鉴权auth)
  - [10.3 主题系统（lib/theme*）](#103-主题系统libtheme)
  - [10.4 文本高级后处理（lib/textTransforms）](#104-文本高级后处理libtexttransforms)
  - [10.5 工具与组件](#105-工具与组件)
- [11. 关键数据流（端到端）](#11-关键数据流端到端)
- [12. 配置与打包](#12-配置与打包)
- [13. 打包脚本（build.sh）](#13-打包脚本buildsh)
- [14. 注释规范](#14-注释规范)

---

## 1. 项目概览

| 属性 | 值 |
|------|-----|
| 包名 | `idl`（`package.json` 中 `name`） |
| 产品名 | `mac-OCR`（`build.productName`） |
| 版本 | `0.3.15`（`package.json` 中 `version`） |
| 类型 | ESM（`"type": "module"`） |
| 主进程入口 | `electron/main.mjs` |
| 渲染进程入口 | `src/main.tsx`（HTML 入口 `index.html`） |
| 包管理器 | pnpm（见 `pnpm-lock.yaml`，已删除 `package-lock.json`） |
| 平台 | macOS only（OCR 依赖 Vision 框架，当前仅构建 arm64 架构） |
| 框架 | Electron 43 + React 18.3.1 + TypeScript 5.6.2 + Tailwind CSS v4 |

### 功能特性

- **离线 OCR**：Apple Vision 框架，无需网络，中/英/日/韩/繁体多语言；表格区域自动重建为 TSV。识别引擎在**打包时编译为原生二进制**（`electron/screen-ocr-engine.bin`）随应用分发，运行时不依赖 Swift 工具链。
- **多显示器跨屏框选**：每屏独立 overlay 窗口。
- **长截图**：多次采集 + 自动重叠去重合并 + 长图拼接。
- **全局快捷键**：普通截图 / 长截图 / 截图到剪贴板 / 唤起菜单，可自定义。
- **托盘菜单**：左键切换面板，右键快捷菜单。
- **动态主题 / 高级文本后处理 / 开机自启动**。

---

## 2. 技术栈与依赖

### 运行依赖（核心）

| 类别 | 包 | 版本 |
|------|----|------|
| 运行时 | `electron` | 43.0.0 |
| UI | `react` / `react-dom` | 18.3.1 |
| 语言 | `typescript`（devDep） | 5.6.2 |
| 样式 | `tailwindcss` / `@tailwindcss/vite` | 4.3.0 |
| 组件 | `radix-ui` / `shadcn` | 1.4.3 / 4.10.0 |
| 状态 | `zustand` | 4.5.5 |
| 构建 | `vite` / `@vitejs/plugin-react-swc` | 5.4.20 / 3.7.0 |
| 工具 | `clsx` / `tailwind-merge` / `class-variance-authority` | 2.1.1 / 3.6.0 / 0.7.1 |
| 图标 | `lucide-react` | 1.17.0 |
| 路由 | `react-router-dom` | 6.26.1 |
| 其它 | `date-fns` / `react-day-picker` / `react-markdown` / `tw-animate-css` / `@fontsource-variable/inter` | — |

### 开发依赖（工具链）

| 工具 | 包 | 版本 |
|------|----|------|
| 测试 | `vitest` / `jsdom` | 2.0.5 / 24.1.1 |
| 类型检查 | `vite-plugin-checker` | 0.11.0 |
| 检查/格式 | `eslint` / `prettier` / `@typescript-eslint/*` | 9.9.0 / 3.3.3 |
| 别名 | `vite-tsconfig-paths` | 5.0.1 |
| 打包 | `electron-builder` | ^26.15.3 |

### 平台特定（macOS 原生）

| 能力 | Electron 模块 | 用途 |
|------|---------------|------|
| 屏幕捕获 | `desktopCapturer` | 截取所有显示器 |
| 权限检测 | `systemPreferences` | 屏幕录制权限 |
| 全局快捷键 | `globalShortcut` | 注册系统级快捷键 |
| 托盘 | `Tray` / `Menu` | 菜单栏图标与右键菜单 |
| 自启动 | `app.setLoginItemSettings` | 登录项管理 |
| OCR | Apple Vision（`ocr.swift` → `screen-ocr-engine.bin`） | 离线文字识别 |

> 包管理器使用 **pnpm**；文档与脚本示例均以 `pnpm` 为准（`npm run xxx` 等价于 `pnpm xxx`）。

---

## 3. 项目结构

```
react-app/
├── build.sh                   # 一键打包脚本：环境检查 → 编译 OCR 二进制 → 前端构建 → 产出 .app → 生成 .dmg
├── electron/
│   ├── main.mjs               # 主进程入口：窗口/截图/OCR/拼接/IPC/托盘/快捷键/自启动/持久化
│   ├── preload.mjs            # 预加载：contextBridge 暴露 window.desktopHost
│   ├── dev.mjs                # 开发启动器：并行 Vite + Electron，互等退出
│   ├── ocr.swift              # Swift 源码：Vision OCR + 表格重建（打包期编译为二进制）
│   ├── screen-ocr-engine.bin  # 构建期由 ocr.swift 编译出的原生二进制（随应用分发，git 忽略）
│   └── stitcher.html          # 隐藏窗口：Canvas 长图拼接与重叠检测
├── src/
│   ├── main.tsx               # React 入口（createRoot + MainApp + default.css）
│   ├── App.tsx                # 根组件（ErrorBoundary + TooltipProvider + Routes + useTheme）
│   ├── default.css            # 全局样式、玻璃拟态设计系统、@theme inline 变量
│   ├── api/                   # 远端业务服务层
│   │   ├── ApiClient.ts       # invokeMethod / streamMethod（注入并刷新 token）
│   │   ├── AppDtos.ts         # 请求/响应 DTO
│   │   ├── AuthManager.ts     # Login/SignUp/GetSession…（薄封装）
│   │   └── Enums.ts           # SampleEnum（示例）
│   ├── auth/AuthStore.ts      # Zustand 登录态 + localStorage 持久化
│   ├── lib/
│   │   ├── desktopHost.ts         # getSurface / isDesktopHostAvailable
│   │   ├── desktopHostState.ts    # HostShellState 类型 + useDesktopHostState
│   │   ├── textTransforms.ts      # 符号过滤 / 字符替换 / 正则
│   │   ├── theme.ts               # 7 色调 OKLCH 推导 + applyTheme
│   │   ├── themeStore.ts          # Zustand 主题色（持久化）
│   │   ├── useTheme.ts            # 挂载主题 + storage 事件同步
│   │   ├── fireworks.ts           # triggerFireworks 动效
│   │   └── utils.ts               # cn()
│   ├── components/
│   │   ├── ui/                    # shadcn/ui 组件
│   │   ├── DesktopCaptureOverlay.tsx # 框选覆盖层
│   │   ├── ErrorBoundary.tsx      # 错误边界
│   │   └── utils.ts               # IconProps
│   ├── routes/
│   │   ├── Routes.tsx             # BrowserRouter 路由表
│   │   └── ProtectedRoute.tsx     # 鉴权守卫
│   ├── utils/                     # debounce / localStorage / sessionStorage / roles
│   ├── types/
│   │   ├── desktop-host.d.ts      # Window.desktopHost 类型契约
│   │   └── json.d.ts              # *.json 模块声明
│   └── views/
│       ├── DesktopShellView.tsx   # 多 surface 主视图（核心）
│       ├── ExampleView.tsx        # 根路由占位页
│       ├── NotFoundView.tsx       # 404
│       └── UnauthorizedView.tsx   # 无权限
├── public/img/                  # 图标与 DMG 背景图（favicon / icon.png / background.png）
├── package.json / tsconfig*.json / vite.config.ts
├── eslint.config.js / prettier.config.mjs / components.json
├── index.html                   # HTML 入口
├── README.md                    # 用户文档
└── DEV_DOCS.md                  # 本文档
```

> 历史工具脚本 `scripts/resize_crop_images.py` 已移除，图片裁剪改由设计侧处理。

---

## 4. 开发环境搭建

### 环境要求

- **macOS** 11.0+（Big Sur 及以上，OCR 依赖 Vision 框架；仅支持 Apple Silicon / arm64）
- **Node.js** 18+
- **pnpm**：`npm install -g pnpm`
- **Xcode 命令行工具**（`xcode-select --install`）：提供 `swiftc`，用于在**打包期**将 `ocr.swift` 编译为内置 OCR 二进制。最终用户运行应用**不需要**安装它。

### 安装与启动

```bash
pnpm install

# 开发模式（Vite dev server + Electron，自动加载渲染进程）
pnpm desktop:dev

# 仅启动 Web 开发服务器（浏览器预览，无 Electron 功能）
pnpm dev

# 生产构建（tsc -b 类型检查 + vite build → dist/）
pnpm desktop:build
```

### 调试

- 主进程日志输出至启动 `dev.mjs` 的终端（stderr/stdout 透传）。
- 渲染进程可用 Electron DevTools 调试。
- 开发模式由 `ELECTRON_RENDERER_URL`（默认 `http://localhost:3000`）控制渲染进程加载地址；生产模式走 `file://dist/index.html`。
- `dev.mjs` 会轮询等待 Vite 就绪（最多 30s），就绪后再启动 Electron；退出时同时终止 Vite 与 Electron 子进程，避免孤儿进程。

### 一键打包

```bash
pnpm dist          # 等价：bash build.sh
```

详见 [第 13 节](#13-打包脚本buildsh)：该脚本完成环境检查、编译 OCR 二进制、前端构建、产出 `.app`、用 `hdiutil` 生成 `.dmg` 全流程。

---

## 5. 架构设计

### 5.1 进程模型

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                        │
│              (electron/main.mjs)                      │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────────┐ │
│  │ Window   │ │ Screenshot │ │  OCR (bundled binary)│ │
│  │ Manager  │ │  Capture   │ │  screen-ocr-engine    │ │
│  └──────────┘ └───────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────────┐ │
│  │  Tray    │ │ Shortcuts  │ │  State Sync + Persist │ │
│  └──────────┘ └───────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌───────────┐                          │
│  │ Stitcher │ │ AutoLaunch │                          │
│  └──────────┘ └───────────┘                          │
└──────────────────┬──────────────────────────────────┘
                   │  IPC (contextBridge)
┌──────────────────▼──────────────────────────────────┐
│              Preload Script (preload.mjs)             │
│         window.desktopHost.* API（ipcRenderer）       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│           Renderer Processes (React + TS)             │
│  panel / result / settings / overlay / long-toolbar   │
│  （同一份产物，由 ?surface= 区分）                     │
└──────────────────────────────────────────────────────┘
```

安全约束：所有窗口 `contextIsolation: true`、`nodeIntegration: false`；渲染进程只能通过 `window.desktopHost` 这一经 `contextBridge` 暴露的窄接口访问主进程能力，绝不直接接触 Node/Electron API。

### 5.2 窗口体系

项目使用多窗口架构，通过 `surface` URL 参数区分窗口身份。通用创建助手 `createHostWindow` 固定选项：`show:false`、`frame:false`、`titleBarStyle:'customButtonsOnHover'`、`vibrancy:'sidebar'`、`visualEffectState:'active'`、`transparent:false`、`hasShadow:true`、`resizable:false`、`maximizable:false`、`minimizable:false`、`fullscreenable:false`、`movable:true`，以及 `webPreferences`（`preload` 指向 `preload.mjs`、`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`）。各窗口再按需覆盖。

| Surface | 变量 | 创建函数 | 尺寸 | 关键覆盖选项 |
|---------|------|----------|------|--------------|
| `panel` | `panelWindow` | `ensurePanelWindow` | 420×580 | `resizable:true`、`hiddenInMissionControl:true`；失焦隐藏（DevTools 打开时除外） |
| `result` | `resultWindow` | `ensureResultWindow` | 560×560（min 360×320） | `resizable:true`、`skipTaskbar:true`、`hiddenInMissionControl:true` |
| `settings` | `settingsWindow` | `ensureSettingsWindow` | 460×600（max = `screen.workArea.height-60`） | `resizable:true`、`skipTaskbar:true`、`hiddenInMissionControl:true` |
| `overlay` | `overlayWindows[]` | `createOverlayWindow` | = 显示器 bounds | 独立窗口（不走 `createHostWindow`）：`transparent:true`、`hasShadow:false`、`alwaysOnTop:true`、`fullscreenable:true`、`movable:false`、`focusable:true`、`skipTaskbar:true`、`roundedCorners:false`；`setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`；每显示器一个 |
| `long-toolbar` | `longToolbarWindow` | `ensureLongToolbarWindow` | 460×200 | `skipTaskbar:true`、`hiddenInMissionControl:true`、`alwaysOnTop:true`；`setVisibleOnAllWorkspaces(...)` |
| （隐藏） | `stitcherWindow` | `ensureStitcherWindow` | 1×1 | 独立窗口：`show:false`、`contextIsolation:false`、`nodeIntegration:false`、`sandbox:false`；`loadFile(stitcher.html)`，**无 surface** |

> `surfaces` 数组（用于 `HostShellState`）：`['panel','result','settings','overlay','long-toolbar']`。`stitcher` 不参与 surface 路由。

### 5.3 渲染进程加载

`loadRenderer(window, surface)`：

```js
const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:3000';
const targetUrl = isDevelopment()
  ? `${devServerUrl}?surface=${surface}`
  : `file://${rendererDistPath}?surface=${surface}`;
await window.loadURL(targetUrl);
```

- `surface` 总是显式传入；无 surface 时不加载渲染进程。
- `stitcherWindow` 例外：经 `stitcherWindow.loadFile(stitcherPath)` 加载本地 HTML，不经 `loadRenderer`，也无 surface 参数。

### 5.4 IPC 通信

渲染进程通过 `preload.mjs` 暴露的 `window.desktopHost` 与主进程通信。**主进程 `ipcMain.handle` 通道（共 24 个）与对应 API 方法**：

| IPC Channel | 方向 | API 方法 | 参数 | 返回 |
|------------|------|----------|------|------|
| `desktop-host:get-shell-state` | R→M | `getShellState()` | — | `HostShellState` |
| `desktop-host:show-result-window` | R→M | `showResultWindow()` | — | `{ success }` |
| `desktop-host:show-settings-window` | R→M | `showSettingsWindow()` | — | `{ success }` |
| `desktop-host:toggle-panel-window` | R→M | `togglePanelWindow()` | — | `{ success }` |
| `desktop-host:start-screen-capture` | R→M | `startScreenCapture('single')` | — | `{ success }` |
| `desktop-host:start-long-screen-capture` | R→M | `startScreenCapture('long')` | — | `{ success }` |
| `desktop-host:start-quick-screen-capture` | R→M | `startScreenCapture('quick')` | — | `{ success }`（截图到剪贴板） |
| `desktop-host:activate-overlay` | R→M | `activateOverlay()` | — | `{ success }` |
| `desktop-host:complete-screen-capture` | R→M | `completeScreenCapture(selection)` | `OverlaySelection` | `{ success }` |
| `desktop-host:cancel-capture-session` | R→M | `cancelCaptureSession()` | — | `{ success }` |
| `desktop-host:capture-long-segment` | R→M | `captureLongSegment()` | — | `{ success }` |
| `desktop-host:finish-long-capture` | R→M | `finishLongCapture()` | — | `{ success }` |
| `desktop-host:set-long-capture-mode` | R→M | `setLongCaptureMode({mode})` | `{ mode: 'auto'\|'manual' }` | `{ success }` |
| `desktop-host:toggle-long-capture-pause` | R→M | `toggleLongCapturePause()` | — | `{ success }` |
| `desktop-host:save-long-image` | R→M | `saveLongImage()` | — | `{ success, canceled?, path? }` |
| `desktop-host:save-recent-result-text` | R→M | `saveRecentResultText({text})` | `{ text }` | `{ success }` |
| `desktop-host:save-shortcut-preference` | R→M | `saveShortcutPreference({mode,accelerator})` | `{ mode:'single'\|'long'\|'menu'\|'quick', accelerator }` | `{ success }` |
| `desktop-host:save-advanced-features` | R→M | `saveAdvancedFeatures({config})` | `{ config: AdvancedFeaturesConfig }` | `{ success }` |
| `desktop-host:copy-result-text` | R→M | `copyResultText({text})` | `{ text }` | `{ success }` |
| `desktop-host:get-recent-capture-images` | R→M | `getRecentCaptureImages()` | — | `{ imageDataUrl, longImageDataUrl }` |
| `desktop-host:open-screen-capture-preferences` | R→M | `openScreenCapturePreferences()` | — | `{ success }` |
| `desktop-host:set-auto-launch` | R→M | `setAutoLaunch({enabled})` | `{ enabled }` | `{ success, error? }` |
| `desktop-host:close-current-window` | R→M | `closeCurrentWindow()` | — | `{ success }` |
| `desktop-host:request-window-fit` | R→M | `requestWindowFit(contentHeight)` | `number` | `{ success }` |

**主进程 → 渲染进程（广播）**：`desktop-host:shell-state-updated`（`HostShellState`）。`preload.subscribeShellState(listener)` 通过 `ipcRenderer.on` 订阅，返回取消订阅函数。

> 类型契约见 `src/types/desktop-host.d.ts`（`DesktopHostApi` 接口），渲染进程调用均返回 `Promise`。

### 5.5 状态管理

主进程维护全局 `hostState`，通过 `broadcastShellState()` 广播到所有渲染进程。渲染进程用 `useDesktopHostState()` 订阅（首屏主动 `getShellState()` 拉取一次 + 后续监听增量更新）。图片等大体积数据**不**走广播，按需经 `getRecentCaptureImages` 拉取。

`HostShellState`（服务端类型定义于 `src/lib/desktopHostState.ts`）：

```typescript
type HostShellState = {
  platform: string;                       // 'darwin' / 'web'
  surfaces: string[];                     // ['panel','result','settings','overlay','long-toolbar']
  permissions: { screenCapture: 'granted' | 'denied' | 'restricted' | 'unknown' };
  recentCaptureResult: {                  // 最近一次识别结果
    text: string; capturedAt: string; wasEmpty: boolean;
    imageDataUrl: string | null; longImageDataUrl?: string | null; loading?: boolean;
  } | null;
  activeCaptureSession: { mode: 'single' | 'long' | 'quick'; overlayBounds: {...} } | null;
  longCaptureSession: {                   // 长截图会话
    selection; displayId; displayBounds; segmentsCaptured: number;
    latestSegmentPreview?; latestSegmentThumbnail?; capturedTexts?;
    mode: 'auto' | 'manual'; isPaused: boolean; capturedImages?;
  } | null;
  captureErrorMessage: string | null;
  shortcutPreferences: {                   // 四组快捷键
    single; long; menu; quick: { accelerator; displayText };
  };
  shortcutRegistrationError: string | null;
  autoLaunch: boolean;
  advancedFeatures: {                     // 高级文本后处理配置
    enabled: boolean; filterSymbols: string[];
    charReplacements: { source; target }[];
    regexRules: { pattern; replacement; flags; mode: 'replace' | 'filter' }[];
  };
};
```

广播前 `getShellState()` 会 **sanitize 图片载荷**（将 `imageDataUrl` / `longImageDataUrl` 置 `null`），仅通过按需接口 `getRecentCaptureImages` 下发，避免每次状态变更向所有窗口推送数 MB base64 造成 IPC/渲染卡顿。

---

## 6. 主进程核心实现（electron/main.mjs）

### 6.1 截图采集与多显示器

`startScreenCapture(mode)`：
1. 校验无进行中会话与屏幕录制权限；
2. `screen.getAllDisplays()` + `desktopCapturer.getSources({ types:['screen'] })` 截取所有显示器；
3. 为每个显示器创建独立 overlay 窗口（`createOverlayWindow`，尺寸 = 显示器 bounds）；
4. 广播状态，等待用户在 overlay 上框选。

跨屏处理：`resolveCaptureFromOverlaySelection(selection, senderWindow)` 通过发送方 overlay 窗口的 `getBounds()` 匹配所属显示器（优先按窗口 bounds，失败按中心点回退）；选区坐标已是显示器本地坐标，按 `thumbnailSize / bounds` 比例缩放到实际像素后由 `cropScreenshot`（基于 `nativeImage`）裁剪，越界钳制到图像范围内。

`DesktopCaptureOverlay` 组件负责在 overlay 窗口内拖拽框选（支持任意方向拖拽、四向遮罩、`ESC` 取消、最小 4×4px 阈值后 `onConfirm`）；跨屏进入新窗口时调用 `activateOverlay()` 重设截图光标并抢焦。

### 6.2 OCR 离线识别

`recognizeTextFromImage(imageDataUrl)`：
- 非 darwin 平台直接抛错；
- 将 data URL 解码写入临时 PNG：`/tmp/screen-ocr-{timestamp}.png`；超大图先降采样到 2000px 内；
- `ensureOcrExecutable()` 定位 OCR 引擎（三路回退，见下）；`spawn` 调用，解析 stdout 的 `{"text":"..."}`；
- 临时文件在 `finally` 中无论成败均清理。

**OCR 引擎解析（关键）**：OCR 引擎在**打包时**由 `build.sh` 用 `swiftc -O` 将 `ocr.swift` 编译为原生二进制 `electron/screen-ocr-engine.bin`，并通过 `asarUnpack` 解包到 `app.asar.unpacked/electron/` 随应用分发。运行时按以下优先级选择：

1. **打包内置二进制**：`getBundledOcrBinaryPath()` 将 `__dirname`（`app.asar/electron` 虚拟路径）映射到 `app.asar.unpacked/electron/screen-ocr-engine.bin`，存在则直接使用（生产环境路径，无需 `swiftc`/`swift`）；
2. **`/tmp` 缓存二进制**：`/tmp/screen-ocr-engine.bin`（开发态或历史编译产物）；
3. **即时编译回退**：本机存在 `swiftc` 时编译到 `/tmp` 缓存（仅开发态可用）；否则返回 `null`。

若以上均不可用且系统未安装 `swift`，提前抛出明确错误「离线 OCR 引擎不可用：内置二进制缺失且系统未安装 swift」而非等到 `spawn` 报 `ENOENT`。

> 之所以在打包期预编译：开发态下 `spawn('swift', [ocr.swift, ...])` 能工作（本机有 Swift 工具链），但打包后的应用运行环境不含 `swift`/`swiftc`，若不预编译，离线识别会静默失败（结果页显示"当前区域未识别到文字"）。

### 6.3 长截图与拼接

- `captureLongSegment()`：以当前选区重复截取新内容并 OCR，文本累积到 `longCaptureSession.capturedTexts`，图片累积到 `capturedImages`；
- `stitchLongImage(imageDataUrls)`：经 `stitcherWindow.webContents.executeJavaScript('window.__stitchImages(...)')` 在隐藏窗口内拼接为完整长图 data URL；
- `mergeLongCaptureText(parts)`：对相邻两段做最多 **8 行**尾部/首部重叠检测，重叠一致则去重拼接，无重叠则换行连接；
- `finishLongCapture()`：拼接全图（`stitchLongImage`）+ 文本去重合并（`mergeLongCaptureText`）+ 对全图再 OCR 取更优结果，写入 `recentCaptureResult` 并广播；
- 模式切换 `setLongCaptureMode({mode})`（`auto`/`manual`）、`toggleLongCapturePause()` 暂停/恢复自动采集、`saveLongImage()` 保存长图为文件（返回 `canceled`/`path`）。

### 6.4 全局快捷键

默认值（`main.mjs` 顶部常量）：
- `defaultSingleShortcut = 'CommandOrControl+Shift+1'`（普通截图识别）
- `defaultLongShortcut = 'CommandOrControl+Shift+2'`（长截图识别）
- `defaultMenuShortcut = 'CommandOrControl+Shift+M'`（唤起菜单）
- `defaultQuickShortcut = 'CommandOrControl+Shift+3'`（截图到剪贴板，不 OCR）

`registerScreenshotShortcut()`：
1. `globalShortcut.unregisterAll()` 清空；
2. 重复检测：若 `single/long/menu/quick` 四加速器出现相同组合 → 报错「普通截图、长截图、唤出菜单与截图（复制到剪贴板）不能使用相同的快捷键…」；
3. 分别注册：`single → startScreenCapture('single')`、`long → startScreenCapture('long')`、`quick → startScreenCapture('quick')`、`menu → togglePanelWindow()`；
4. 任一返回 `false`（系统占用）→ `unregisterAll` 并报错「部分快捷键注册失败…」；
5. 异常 → 「快捷键格式无效…」；
6. 错误写入 `hostState.shortcutRegistrationError` 并广播。

`saveShortcutPreference({mode, accelerator})` 校验后持久化并重新注册。

### 6.5 托盘菜单

- **左键点击**：切换面板窗口（自动对齐菜单栏图标下方），失焦自动隐藏；
- **右键点击**：弹出快捷菜单（截图到剪贴板 / 截图识别 / 长截图识别 / 结果窗口 / 设置 / 退出应用）；
- 图标：`setTemplateImage(true)` 单色模板图标，自动适配明暗模式。

### 6.6 开机自启动与权限

- `setAutoLaunch({enabled})`：`app.setLoginItemSettings({ openAtLogin: enabled })`；失败返回 `{ success:false, error }`；状态持久化到 `hostState.autoLaunch` 并广播。
- 权限：`systemPreferences` 检测屏幕录制权限，结果进入 `hostState.permissions.screenCapture`；`openScreenCapturePreferences()` 打开系统设置引导授权。

### 6.7 持久化

`loadPersistedState()` 在启动时从 `userData/desktop-state.json` 读取并恢复 `shortcutPreferences`、`autoLaunch`、`advancedFeatures` 等；`persistState()` 在变更时写回。状态广播与持久化分离：图片等瞬态数据不入磁盘（仅持久化文本结果）。

---

## 7. OCR 脚本（electron/ocr.swift）

**原理**：调用 macOS Apple Vision 框架 `VNRecognizeTextRequest`，输出 `{"text":"..."}` JSON（stderr 输出调试日志，stdout 仅输出结果 JSON）。

**构建产物**：本文件由 `build.sh` 在打包期经 `swiftc -O` 编译为 `electron/screen-ocr-engine.bin`（Mach-O arm64 可执行文件），随应用分发；运行时不依赖 Swift 工具链。开发态如无内置二进制，主进程也可直接用 `swift ocr.swift` 解释执行。

**识别配置**：
```swift
request.recognitionLevel = .accurate        // 精确模式（空结果回退 .fast）
request.usesLanguageCorrection = true
request.automaticallyDetectsLanguage = true
request.recognitionLanguages = ["zh-Hans","zh-Hant","en-US","ja-JP","ko-KR"]
request.minimumTextHeight = 0.0
```

**多路回退**（确保图片稳定读取）：
1. `CGImageSourceCreateWithURL` → 原始图先 `accurate` 再 `fast`；识别不足 3 块时启用轻度增强（`CIColorControls` 对比度 1.06）回退；
2. `VNImageRequestHandler(url:)` 直接以文件 URL 识别；
3. `NSImage → TIFF → NSBitmapImageRep → CGImage` 识别。

**表格重建**：当识别到的文本块 ≥2 且可聚为 ≥2 列、且按行聚类后平均每行 >2 个单元格（即 `isTableRegion`）时，按列中心聚类（`computeColumnCenters`）、按中心 Y 分行（`assignToColumns`）、生成以首行为表头的 TSV（`formatTableOutput`），否则退化为纯文本（按行 `\n` 连接）。单列表/不足表格条件时输出纯文本。

---

## 8. 拼接窗口（electron/stitcher.html）

隐藏窗口，暴露 `window.__stitchImages(imageDataUrls)` 供主进程经 `executeJavaScript` 调用：
- `findOverlapHeight(prev, next)`：取两段底部/顶部各 30% 条带，缩放到 0.25 倍后逐像素比较 RGB 绝对差，在多个偏移量（`[0..50]`）中找平均差最小的偏移（`MAX_PIXEL_DIFFERENCE_PER_PIXEL = 80` 超过则视为无重叠返回 0）；
- `stitchImages`：按相邻重叠高度在 Canvas 上垂直拼接多张截图，返回拼接后的 PNG data URL；单张直接返回原图。

---

## 9. 渲染进程架构

### 9.1 入口与路由

- `src/main.tsx`：`ReactDOM.createRoot(...).render(<MainApp/>)`，`import './default.css'`（React.StrictMode 默认关闭，保留注释以便开启）。
- `src/App.tsx`：`<ErrorBoundary name="App"><TooltipProvider><Routes/></TooltipProvider></ErrorBoundary>`，并调用 `useTheme()` 应用动态主题。
- `src/routes/Routes.tsx`：`BrowserRouter` 下：`index → DesktopShellView`、`/unauthorized → UnauthorizedView`、`* → NotFoundView`。
- `src/routes/ProtectedRoute.tsx`：鉴权守卫——已登录但无 session 时调用 `AuthManager.GetSession({})` 恢复会话（与 15s 超时竞速）；校验 `roles`；未登录重定向 `/`，权限不足重定向 `/unauthorized`，通过则渲染 `<Outlet/>`。

### 9.2 主视图切换（DesktopShellView）

单一视图按 `getDesktopSurface()` 渲染不同界面：
- **overlay**（且有 `activeCaptureSession`）：渲染 `DesktopCaptureOverlay`，框选后 `completeScreenCapture(selection)` / `cancelCaptureSession()`；
- **long-toolbar**（且有 `longCaptureSession`）：长截图控制条——`auto`/`manual` 模式切换、`toggleLongCapturePause`、`captureLongSegment`、`finishLongCapture`、`cancelCaptureSession`，并显示采集段数与预览缩略图；
- **result**：识别结果编辑器——`textarea` 编辑、去除换行符开关、内联「高级功能」面板（`AdvancedFeaturesPanel`：符号过滤/字符替换/正则，修改即自动保存并自动停用）、保存并复制（`saveRecentResultText` + `copyResultText` + `closeCurrentWindow`）、长图预览与保存/复制；
- **settings**：快捷键录制（4 组，键盘事件经 `toAccelerator` 转为 Electron 风格字符串）、主题色选择、开机自启动开关、错误/成功提示；窗口高度经 `requestWindowFit` + `ResizeObserver` 自适应；
- **panel**（默认/兜底）：主菜单——权限提示、采集错误、长截图进度、普通/长截图/截图到剪贴板主操作卡片、结果/设置入口、最近识别结果预览。

### 9.3 宿主状态订阅

`useDesktopHostState()`（`desktopHostState.ts`）：首屏 `getShellState()` 拉取，随后 `subscribeShellState` 监听增量；`getRecentCaptureImages()` 在 `recentCaptureResult.capturedAt` 变化时按需拉取原图/长图。无宿主时回退 `emptyState`（平台 `'web'`，默认快捷键，权限 `'unknown'`）。

### 9.4 环境降级

`lib/desktopHost.ts`：`getDesktopSurface()` 返回 `window.desktopHost?.getSurface() ?? 'panel'`；`isDesktopHostAvailable()` 判断 `window.desktopHost` 是否存在。面板在浏览器预览模式（`!isDesktopHostAvailable()`）下提示「截图、权限检测和系统级窗体只能在 Electron 桌面宿主里使用」，且禁用截图按钮。

---

## 10. 前端业务层

### 10.1 API 调用层（api/）

- `ApiClient.ts` 暴露两个方法：
  - `invokeMethod<T>(serviceName, managerName, methodName, params, options?)`：`POST {VITE_API_URL}/{service}/invoke`，请求体 `ServiceInvocationRequestDto`（含 `AccessToken`/`RefreshToken`）；401 → `signOut()` 抛 `Unauthorized`，403 → 抛 `Forbidden`；响应信封含新 token/session 时写回 `authStore`；返回 `envelope.Result`。
  - `streamMethod(...)`：`POST {VITE_API_URL}/{service}/stream`，基于 `fetch` + `ReadableStream` 逐行解析；遇 `Type==='auth'` 事件刷新 token/session，其余经 `onData` 回调吐出。
  - `params` 非数组时自动包装为单元素数组；`options.signal` 支持请求取消。
- `AppDtos.ts`：所有请求/响应 DTO（PascalCase 以匹配后端契约），如 `LoginRequestDto`/`LoginResponseDto`/`SessionDto`/`ServiceInvocationResponseEnvelopeDto` 等。
- `AuthManager.ts`：业务方法薄封装，固定 `服务名="Api"`、`管理器="AuthManager"`：`Login`、`SignUp`、`SendPasswordResetEmail`、`ChangePassword`、`UpdateUserEmail`、`UpdateUserPassword`、`UpdateUserName`、`GetSession`。
- `Enums.ts`：`SampleEnum`（示例枚举模板）。

### 10.2 鉴权（auth/）

`auth/AuthStore.ts`（Zustand）：状态 `accessToken` / `refreshToken` / `session`，持久化到 `localStorage`（`auth_token` / `refresh_token` / `auth_session`）。
- `setAuth(token, refresh, session)`：仅当三者同时有效才接受，否则整体清空（避免脏登录态）；状态或 session 未变化时跳过渲染；镜像写回 localStorage。
- `signOut()`：清空内存与 localStorage 凭证。
- `areSessionsEqual`：比较 `UserId`/`Email`/角色序列（顺序敏感）。

### 10.3 主题系统（lib/theme*）

- `theme.ts`：`THEME_LIST`（7 预设：red/orange/yellow/green/cyan/blue/purple，蓝默认）、`DEFAULT_THEME_ID='blue'`、`applyTheme(id?)` 将单一 hue 推导的全套 OKLCH 变量（primary/secondary/accent/muted/ring/chart/sidebar/glass 等，含明暗两套）写入独立 `<style id="dynamic-theme-vars">`，覆盖 `default.css` 静态声明。
- `themeStore.ts`：`useThemeStore`（Zustand），`themeId` 持久化到 `localStorage['app-theme-id']`；`setTheme`（用户切换，持久化）与 `_sync`（来自其它窗口同步，仅内存）。
- `useTheme.ts`：首次与变更时 `applyTheme(themeId)`；监听 `storage` 事件，使 Electron 各独立 `BrowserWindow` 无需 IPC 即保持主题同步；首次若未存储则写入默认。

### 10.4 文本高级后处理（lib/textTransforms）

`applyTextTransforms(text, config)` 管线（任一配置为空或整体 `disabled` 时对应步骤 no-op，无效正则收集到 `regexErrors` 并跳过，不中断整条管线）：
1. **过滤符号**：从文本中移除 `filterSymbols` 内字符；
2. **字符替换**：按 `charReplacements` 顺序做字面量（非正则）查找替换，空 `source` 跳过；
3. **正则规则**：`new RegExp(pattern, flags)`；`replace` 模式执行 `text.replace(re)`，`filter` 模式以空串替换（删除匹配）；失败的规则记入 `regexErrors`。

### 10.5 工具与组件

- `lib/utils.ts`：`cn(...)` = `twMerge(clsx(inputs))`，合并并消解 Tailwind 类名。
- `lib/fireworks.ts`：`triggerFireworks(durationMs=1000)` 全屏 `pointer-events:none` canvas 烟花动效，动画结束自动清理（用于启用高级功能/保存快捷键等反馈）。
- `components/utils.ts`：`IconProps`（自定义 SVG 图标 Props 类型）。
- `components/ErrorBoundary.tsx`：类组件错误边界，捕获子树错误并展示回退 UI（含 `componentStack`），`name` 标识出错片段。
- `utils/*`：`debounce`（防抖）、`localStorage`/`sessionStorage`（智能读写删，对象自动 JSON 序列化）、`roles`（`ADMIN_ROLE`/`USER_ROLE`/`Roles`）。

---

## 11. 关键数据流（端到端）

### 单次截图识别
```
用户触发（快捷键/面板按钮/托盘）
  → desktopHost.startScreenCapture()
  → main: 权限校验 → screen.getAllDisplays + desktopCapturer 截取 → 各显示器 createOverlayWindow
  → overlay 窗口 DesktopCaptureOverlay 拖拽框选 → onConfirm(selection)
  → main: completeScreenCapture → resolveCaptureFromOverlaySelection → cropScreenshot
  → finalizeSingleCapture → recognizeTextFromImage
       （写 /tmp/screen-ocr-*.png → spawn 打包内置二进制（或回退 swift）→ 解析 {"text":"..."} → 清临时文件）
  → 写入 hostState.recentCaptureResult（图片置 null）+ broadcastShellState
  → result 窗口渲染；用户可编辑/后处理/保存/复制
  → 按需 getRecentCaptureImages 拉取原图
```

### 截图到剪贴板（quick 模式）
```
用户触发（⌘⇧3 / 托盘「截图」）
  → startScreenCapture('quick') → 框选 → completeScreenCapture
  → 裁剪图像直接 clipboard.writeImage(...) → 结束（不触发 OCR、不弹结果窗口）
```

### 长截图
```
框选 → startScreenCapture('long') → longCaptureSession（默认 auto）
  → long-toolbar 控制条
  → auto：内容变化自动 captureLongSegment；manual：点击「继续采集」
  → 每段 OCR 累积 capturedTexts + capturedImages
  → finishLongCapture
       → stitchLongImage（stitcher 隐藏窗口拼接全图）
       → mergeLongCaptureText（8 行重叠去重）
       → 全图再 OCR 取更优
  → 写入 recentCaptureResult（含 longImageDataUrl）+ 广播
  → result 窗口可预览/保存长图（saveLongImage）/复制图片（copyResultText）
```

### 识别结果后处理
```
recentCaptureResult.text → applyTextTransforms(text, effectiveConfig)
  （filterSymbols → charReplacements → regexRules）
  → 编辑框展示 applied.text；高级功能面板内联展开，修改即 saveAdvancedFeatures + 自动停用
```

### 鉴权（远端服务）
```
视图调用 AuthManager.Login/SignUp/GetSession
  → ApiClient.invokeMethod("Api","AuthManager",method,params)
       · 注入 accessToken/refreshToken
       · 401 → signOut；403 → Forbidden
       · 响应信封带回新 token/session → authStore.setAuth
  → ProtectedRoute 据 session.Roles 做路由守卫
```

---

## 12. 配置与打包

### Vite（`vite.config.ts`）
- 插件：`@vitejs/plugin-react-swc` + `@tailwindcss/vite` + `vite-tsconfig-paths` + `checker({ typescript: true })`；
- 内联插件 `restartOnDepsChange`：监听 `vite.config.ts`/`package.json`/lock 文件变更时自动重启 dev server；
- 内联插件 `dynamicManifest`：依据 `VITE_APP_NAME`/`VITE_APP_DESCRIPTION`（回退 `package.json`）动态生成 `site.webmanifest`（dev 中间件 + build `generateBundle`）；
- `resolve.alias`：`@` → `src`（同时配置 `test.alias` 供 Vitest）；
- `server.port`：3000；`build.outDir`：`dist`；`test.environment`：`jsdom`，`include: ['**/*.test.*','**/*.spec.*']`。

### Tailwind CSS v4
- CSS-first 配置，无 `tailwind.config.js`；
- 主题 token 定义在 `src/default.css` 的 `@theme inline` 块；
- 颜色使用 OKLCH 色彩空间；字体由 `index.html` 经 Google Fonts 引入（Work Sans），运行时主题引擎覆盖 `:root`/`.dark` 变量。

### ESLint（`eslint.config.js`）
- 扁平配置（`typescript-eslint`）；忽略 `dist` 与 `**/*.test.*`/`**/*.spec.*`；
- 对 `**/*.{ts,tsx}` 启用 `js.configs.recommended` + `tseslint.configs.recommended` + `react-hooks` 推荐规则 + `react-refresh/only-export-components`；
- `globals.browser` 作为浏览器全局变量。

### 环境变量（构建期）
- `VITE_API_URL`（业务服务基地址）、`VITE_APP_NAME`/`VITE_APP_DESCRIPTION`（标题与 manifest）；
- `ELECTRON_RENDERER_URL`（dev 渲染地址）。

### 打包配置（`package.json` 的 `build` 字段）
| 字段 | 当前值 | 作用 |
|------|--------|------|
| `appId` | `com.idl.ocr` | 应用唯一标识 |
| `productName` | `mac-OCR` | 安装包与应用显示名 |
| `electronDist` | `node_modules/electron/dist` | 复用项目内已解压的 Electron 运行时，打包不再从网络下载 |
| `files` | `dist/**/*`、`electron/**/*`、`public/**/*`、`package.json` | 打进 asar 的资源 |
| `asarUnpack` | `electron/ocr.swift`、`electron/screen-ocr-engine.bin` | 将 OCR 脚本与编译好的二进制解包到 asar 外，供运行时直接执行 |
| `directories.output` | `release/` | 打包产物输出目录 |
| `mac.target` | `["dir"]`（arch `arm64`） | 产出未压缩 `.app`，最终 `.dmg` 由 `build.sh` 用系统 `hdiutil` 生成 |
| `mac.category` | `public.app-category.productivity` | 启动台分类 |
| `mac.identity` | `null` | 本地无开发者证书时跳过签名 |

---

## 13. 打包脚本（build.sh）

根目录 `build.sh` 是一键打包入口（`pnpm dist` 即调用它）。执行阶段：

1. **环境检查**：校验 macOS、hdiutil、Node、pnpm、swiftc（警告级，缺失仅影响 OCR 二进制编译）、electron-builder 及图标资源。
2. **编译 OCR 二进制**：`swiftc -O electron/ocr.swift -o electron/screen-ocr-engine.bin`（产物 git 忽略），随应用分发，使生产环境无需 `swiftc`/`swift`。
3. **前端构建**：`pnpm build`（`tsc -b` + `vite build --mode live`，输出 `dist/`）。
4. **产出 .app**：`electron-builder --dir` 生成未压缩的 `release/mac-arm64/mac-OCR.app`。
5. **生成 .dmg**（`make_dmg`）：
   - 创建可读写 DMG（UDRW）→ 挂载（`-nobrowse`，避免桌面图标闪烁）；
   - AppleScript 设置 Finder 窗口：背景图（`public/img/background.png` 自动缩放为窗口尺寸 800×450）、图标位置（`mac-OCR` 与 `Applications`）、窗口 bounds `{100,100,900,578}`、隐藏工具栏/状态栏、图标大小 56、文字大小 10；
   - Finder `eject` 确保 `.DS_Store` 落盘（光 `hdiutil detach` 不会触发 Finder 写盘）；
   - 转换为压缩 UDZO：`release/mac-OCR-<版本号>.dmg`（例如 `release/mac-OCR-0.3.15.dmg`）。
   - 健壮性：挂载前清理同名残留卷（如 `/Volumes/mac-OCR 1`）；卸载按真实挂载点循环重试直到设备释放；`hdiutil convert` 偶发 `资源暂时不可用`（EAGAIN）时退避重试。
6. **清理**：删除 `electron-builder` 生成的 `builder-effective-config.yaml` 等中间产物。

> 安装引导界面背景图来自 `public/img/background.png`，构建时被 `sips` 等比缩放为窗口内容区尺寸（800×450），确保完整显示不裁剪。

---

## 14. 注释规范

- **TS / TSX / .mjs**：文件头 `/** 文件：… 职责：… 依赖：… 导出：… */`；函数/类用 JSDoc（`@param`/`@returns`/`@template`），简体中文为主、关键类型保留英文。
- **Swift (ocr.swift)**：`///` / `//` 行注释。
- **CSS (default.css)**：`/* */` 区块注释。
- 重点标注核心逻辑与易错点（跨显示器坐标换算、OCR 二进制回退、长图去重、图片载荷广播剥离、DMG 资源占用处理），避免对显而易见的代码冗余说明。

> **文档维护**：项目迭代时请同步更新本文档与 `README.md`，尤其是新增 IPC 通道、窗口类型、OCR 逻辑或前端业务层变更时。
