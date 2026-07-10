# 屏幕 OCR（Screen OCR）

基于 **Electron + React + TypeScript + Tailwind CSS (shadcn/ui)** 构建的 macOS 桌面离线 OCR 截图工具。支持多显示器跨屏框选、实时离线文字识别（Apple Vision 框架）、长截图自动/手动拼接合并，以及结果编辑、文本高级后处理、主题换色、开机自启动与全局快捷键。

> 更详细的开发文档（进程模型、窗口体系、完整 IPC 通道、OCR 原理、前端业务层实现等）见 [`DEV_DOCS.md`](./DEV_DOCS.md)。

---

## 1. 核心功能

| 功能 | 说明 |
|------|------|
| **离线 OCR** | 基于 Apple Vision 框架（`VNRecognizeTextRequest`），无需联网；支持简体中文、繁体中文、英文、日文、韩文；精确/快速双模式回退；对表格区域自动按列聚类重建为 TSV。 |
| **多显示器跨屏框选** | 每个显示器创建独立透明 overlay 窗口，可在任意显示器间拖拽框选；跨屏时自动重设截图光标并抢焦当前窗口，规避单窗口跨屏鼠标事件丢失问题。 |
| **单次截图识别** | 触发截图 → 框选区域 → 裁剪 → 写临时 PNG → 调用 `ocr.swift` 识别 → 结果写入状态并弹出结果编辑窗口。 |
| **长截图拼接合并** | 框选区域后进入长截图会话，自动（按内容变化）或手动采集多段；`stitcher.html` 隐藏窗口按重叠高度拼接为完整长图，文本按 8 行重叠去重合并，并对全图再识别取更优结果。 |
| **结果编辑与后处理** | 识别文本可编辑、去除换行符；「高级功能」支持符号过滤、字符替换、正则替换/过滤（修改即自动保存并自动停用）。 |
| **全局快捷键** | 默认 `⌘⇧1` 普通截图 / `⌘⇧2` 长截图 / `⌘⇧M` 唤起菜单；可在设置面板录制自定义组合键，去重与冲突检测。 |
| **动态主题** | 7 种主色调（红/橙/黄/绿/青/蓝/紫，蓝为默认），由单一 hue 推导全套 OKLCH 调色板；通过 `localStorage` 持久化并跨窗口 `storage` 事件同步。 |
| **托盘与自启动** | 菜单栏托盘（左键切换面板 / 右键快捷菜单）；支持开机自启动与屏幕录制权限引导。 |

---

## 2. 技术栈

| 类别 | 技术 | 版本 / 说明 |
|------|------|------|
| 运行时 | Electron | 43.0.0（主进程 + 多渲染窗口） |
| UI 框架 | React + TypeScript | 18.3.1 / 5.6.2 |
| 构建 | Vite + SWC | 5.4.20（`@vitejs/plugin-react-swc`） |
| 样式 | Tailwind CSS v4 | 4.3.0，CSS-first 配置（OKLCH 色彩空间） |
| 组件库 | shadcn/ui (Radix) | 基于 `radix-ui` 1.4.3，19 个基础组件 |
| 状态 | Zustand | 4.5.5（auth / theme / host-state） |
| 离线识别 | Apple Vision | `ocr.swift`（macOS 原生框架） |
| 长图拼接 | `stitcher.html` + Canvas | 隐藏窗口内按像素差拼接与重叠检测 |
| 图标 | lucide-react | 1.17.0 |
| 测试 / 检查 | Vitest / ESLint / Prettier | 2.0.5 / 9.9.0 / 3.3.3 |

> 平台限制：OCR 依赖 Apple Vision 框架，应用仅面向 **macOS**。

---

## 3. 系统架构

应用采用 **主进程 / 预加载脚本 / 多渲染窗口** 三层结构：

```
┌───────────────────────────────────────────────────────────────┐
│ 主进程  electron/main.mjs                                        │
│  · 窗口管理（panel / result / settings / overlay / long-toolbar  │
│     + 隐藏 stitcher 窗口）                                        │
│  · 截图采集（desktopCapturer + 多显示器 overlay）                │
│  · OCR 调度（写临时 PNG → 调用 ocr.swift，多路回退）             │
│  · 长截图拼接（stitcher 隐藏窗口）与文本去重合并                 │
│  · 托盘、全局快捷键、开机自启动、权限检测、状态广播（IPC）        │
└───────────────────────────┬───────────────────────────────────┘
                            │ contextBridge (ipcRenderer)
┌───────────────────────────▼───────────────────────────────────┐
│ 预加载  electron/preload.mjs                                     │
│  暴露 window.desktopHost.* API（类型见 src/types/desktop-host.d.ts）│
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│ 渲染进程  src/（React 应用，按 ?surface= 区分窗口身份）          │
│  · views/DesktopShellView 统一渲染所有 surface                   │
│  · lib/desktopHostState 订阅主进程广播状态                       │
│  · lib/theme* 动态主题引擎与跨窗口同步                           │
│  · api/ 调用远端业务服务（AuthManager / ApiClient）             │
└──────────────────────────────────────────────────────────────┘
```

- **Surface 路由**：同一份打包产物通过 URL `?surface=panel|result|settings|overlay|long-toolbar` 加载，由 `getDesktopSurface()` 区分窗口身份，`DesktopShellView` 据此渲染不同界面。`stitcher` 为独立于 surface 体系的隐藏窗口（加载本地 `stitcher.html`）。
- **状态同步**：主进程维护单一 `hostState`，通过 `broadcastShellState()` 向所有窗口推送；渲染进程用 `useDesktopHostState()` 订阅。图片等大体积数据不走广播，按需通过 `getRecentCaptureImages` 拉取。
- **跨窗口主题**：主题色以 `localStorage` 持久化，各 Electron `BrowserWindow` 通过 `storage` 事件保持同步（详见 `lib/useTheme.ts`），无需 IPC。

---

## 4. 目录与模块说明

```
react-app/
├── README.md                  # 本文档
├── DEV_DOCS.md                # 详细开发文档（进程/窗口/IPC/OCR/前端）
├── index.html                 # HTML 入口（运行时按 VITE_APP_NAME 覆盖 <title>）
├── vite.config.ts             # Vite + 测试 + 动态 manifest 配置
├── tsconfig*.json             # TypeScript 配置
├── eslint.config.js           # ESLint 扁平配置
├── prettier.config.mjs        # Prettier 配置（printWidth 120）
├── components.json            # shadcn/ui 配置
├── electron/                  # 主进程相关（Node.js 端）
│   ├── main.mjs               # 主进程入口：窗口/截图/OCR/拼接/IPC/托盘/快捷键/自启动
│   ├── preload.mjs            # 预加载：暴露 window.desktopHost API
│   ├── dev.mjs                # 开发启动器（并行拉起 Vite + Electron）
│   ├── ocr.swift              # Swift 脚本：Vision 离线 OCR + 表格重建
│   └── stitcher.html          # 隐藏窗口：长图 Canvas 拼接与重叠检测
├── scripts/
│   └── resize_crop_images.py  # 工具脚本：按参考图 cover 裁剪批量图片
└── src/                       # 渲染进程（React 应用）
    ├── main.tsx               # React 入口，挂载 <MainApp/>
    ├── App.tsx                # 根组件：ErrorBoundary + TooltipProvider + Routes + useTheme
    ├── default.css            # 全局样式与玻璃拟态设计系统（CSS 变量 / @theme inline）
    ├── api/                   # 远端业务服务调用层
    │   ├── ApiClient.ts       # 通用 invoke / stream 封装（注入并刷新 token）
    │   ├── AppDtos.ts         # 请求/响应 DTO 类型定义
    │   ├── AuthManager.ts     # 鉴权业务方法（Login/SignUp/GetSession…）
    │   └── Enums.ts           # 示例枚举（SampleEnum）
    ├── auth/
    │   └── AuthStore.ts       # Zustand：登录态 + token/session 持久化
    ├── lib/                   # 通用库（桌面宿主/状态/主题/工具）
    │   ├── desktopHost.ts     # 环境检测：getSurface / isDesktopHostAvailable
    │   ├── desktopHostState.ts# 状态类型 + useDesktopHostState 订阅 Hook
    │   ├── textTransforms.ts  # 高级后处理：符号过滤/字符替换/正则
    │   ├── theme.ts           # 动态主题引擎（7 色调 OKLCH 推导）
    │   ├── themeStore.ts      # Zustand：主题色状态 + 持久化
    │   ├── useTheme.ts        # 挂载主题 + 跨窗口 storage 同步
    │   ├── fireworks.ts       # 轻量烟花动效（canvas + rAF）
    │   └── utils.ts           # cn() 类名合并工具
    ├── components/            # 可复用组件
    │   ├── DesktopCaptureOverlay.tsx # 截图框选覆盖层（拖拽/光标/ESC）
    │   ├── ErrorBoundary.tsx  # React 错误边界
    │   ├── utils.ts           # 自定义 SVG 图标 Props 类型
    │   └── ui/                # shadcn/ui 组件（19 个，见下表）
    ├── routes/
    │   ├── Routes.tsx         # 路由表（index / /unauthorized / *）
    │   └── ProtectedRoute.tsx # 鉴权守卫（会话恢复 + 角色校验）
    ├── utils/                 # 小工具
    │   ├── debounce.ts        # 防抖
    │   ├── localStorage.ts    # localStorage 智能读写删
    │   ├── sessionStorage.ts  # sessionStorage 智能读写删
    │   └── roles.ts           # 角色常量（admin / user）
    ├── types/
    │   ├── desktop-host.d.ts  # window.desktopHost API 类型声明
    │   └── json.d.ts          # JSON 模块声明
    └── views/                 # 页面视图
        ├── DesktopShellView.tsx # 多 surface 主视图（核心）
        ├── ExampleView.tsx    # 根路由占位页（临时）
        ├── NotFoundView.tsx   # 404
        └── UnauthorizedView.tsx # 无权限
```

### shadcn/ui 组件（`src/components/ui/`，共 19 个）

`badge` `button` `calendar` `card` `checkbox` `dialog` `dropdown-menu` `input` `label` `navigation-menu` `popover` `select` `separator` `sheet` `switch` `table` `tabs` `textarea` `tooltip` —— 基于 Radix UI 与 `cn()`（`clsx` + `tailwind-merge`）组合。

---

## 5. 模块依赖关系

```
main.mjs ──preload.mjs──▶ desktop-host.d.ts (Window.desktopHost)
                                  │
                                  ▼
DesktopShellView ──▶ desktopHostState (useDesktopHostState)
        │           ──▶ desktopHost (环境检测)
        │           ──▶ themeStore / theme / useTheme
        │           ──▶ textTransforms
        │           ──▶ components/ui/* ──▶ lib/utils (cn)
        └──▶ routes/* ──▶ views/*

远端业务服务依赖链：
视图/组件 ──▶ api/AuthManager ──▶ api/ApiClient ──▶ auth/AuthStore (token/session)
                              └──▶ api/AppDtos (DTO 类型)
```

- **主进程 ↔ 渲染进程**：仅通过 `window.desktopHost`（preload 桥接）通信，渲染进程不直接访问 Node/Electron API（`contextIsolation` 开启、`nodeIntegration` 关闭）。
- **UI ↔ 状态**：视图通过 Zustand（`themeStore` / `authStore` 经 `useDesktopHostState` 隐式）获取状态；主题与宿主状态变更驱动重渲染。
- **环境降级**：`isDesktopHostAvailable()` 判断是否存在 `window.desktopHost`；浏览器预览模式下截图/权限/窗体能力不可用，但 UI 仍可渲染。

---

## 6. 关键业务流程

### 6.1 单次截图识别
`startScreenCapture('single')` → 权限校验 → `screen.getAllDisplays()` + `desktopCapturer` 截取所有显示器并为每个显示器创建 overlay 窗口 → 用户在 overlay 拖拽框选 → `completeScreenCapture` 定位显示器并裁剪（`cropScreenshot`）→ `finalizeSingleCapture` → `recognizeTextFromImage`（写临时 PNG → 调用 `ocr.swift`）→ 结果写入 `hostState` 并广播 → 弹出 result 窗口展示/编辑。

### 6.2 长截图
首段框选后进入 `longCaptureSession`（默认 `auto` 模式，按内容变化自动采集；可切 `manual` 手动）。每段独立 OCR 并累积文本；`finishLongCapture` 时 `stitchLongImage` 在 `stitcher` 隐藏窗口内拼接全图 + `mergeLongCaptureText` 按 8 行重叠去重合并，最后对全图再做一次 OCR 取更优结果。长图可保存为文件或复制图片到剪贴板。

### 6.3 OCR 离线识别
主进程将 data URL 解码写入临时 PNG（`/tmp/screen-ocr-{timestamp}.png`），`spawn('swift', [ocrScriptPath, tempPng])` 调用 Swift 脚本；超大图先降采样到 2000px 内；脚本经 `CGImageSource → VNImageRequestHandler(url) → NSImage` 三路回退确保读取；输出 `{"text":"..."}` JSON，主进程解析后清理临时文件（无论成败均在 `finally` 中清理）。

### 6.4 主题切换
`useThemeStore` 持久化 `themeId` → `applyTheme` 把由单一 hue 推导的全套 OKLCH 变量写入独立 `<style id="dynamic-theme-vars">`（覆盖 `default.css` 的静态 `:root`/`.dark`）→ `storage` 事件驱动其它窗口 `_sync`。

---

## 7. 配置说明

### 环境变量（构建期，Vite `import.meta.env`）
| 变量 | 用途 |
|------|------|
| `VITE_API_URL` | 远端业务服务基地址（`ApiClient` 调用 `POST {VITE_API_URL}/{service}/invoke|stream`） |
| `VITE_APP_NAME` | 运行时覆盖 `<title>` 与动态 manifest 名称 |
| `VITE_APP_DESCRIPTION` | 动态 manifest 描述 |
| `ELECTRON_RENDERER_URL` | 开发模式下渲染进程加载地址（默认 `http://localhost:3000`）；生产模式走 `file://dist/index.html` |

### 快捷键（默认）
| 动作 | 默认组合 |
|------|----------|
| 普通截图 | `CommandOrControl+Shift+1`（`⌘/Ctrl + ⇧ + 1`） |
| 长截图 | `CommandOrControl+Shift+2`（`⌘/Ctrl + ⇧ + 2`） |
| 唤起菜单 | `CommandOrControl+Shift+M`（`⌘/Ctrl + ⇧ + M`） |

设置面板可重新录制；同一组合键在三处重复会报错，组合键被系统占用也会提示注册失败。

### 主题
设置面板「主题色」提供 7 种预设：红(hue 25) / 橙(50) / 黄(95) / 绿(142) / 青(195) / 蓝(255, 默认) / 紫(285)。选择后界面实时切换，并持久化到 `localStorage['app-theme-id']`。

---

## 8. 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run desktop:dev` | Electron + Vite 开发模式（`electron/dev.mjs` 并行拉起两者） |
| `npm run build` | `tsc -b` 类型检查 + Vite 生产构建（输出 `dist/`） |
| `npm run desktop:build` | 生产构建（等同 `npm run build`） |
| `npm run desktop:start` | 以 Electron 启动（`ELECTRON_RENDERER_URL=http://localhost:3000 electron .`，需先启动 dev 服务器） |
| `npm run preview` | 预览生产构建 |
| `npm run test` | Vitest 测试（`**/*.test.*` / `**/*.spec.*`，jsdom 环境） |
| `npm run type` / `check-ts` | TypeScript 类型检查 |
| `npm run lint` / `format` | ESLint / Prettier |

---

## 9. 打包与安装

> 平台说明：本应用 OCR 依赖 Apple **Vision** 框架、`screen recording` 等 macOS 原生能力，运行时仅支持 **macOS**。以下打包命令均在 macOS 上执行；`electron-builder` 本身支持交叉构建 Windows/Linux 目标，但本项目代码为 macOS 专属，不提供其它平台的可用产物。

### 9.1 环境准备

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| 操作系统 | macOS 11.0（Big Sur）及以上 | OCR 依赖 Vision 框架；M1/M2/M3 等 Apple Silicon 与 Intel 均支持 |
| Node.js | 18.x 及以上（推荐 20 LTS） | 提供 `npm` 与构建工具链 |
| 包管理器 | npm（随 Node 附带）或 pnpm | 本文以 `npm` 为例 |
| Xcode Command Line Tools | 随系统或 `xcode-select --install` | 提供 `swiftc`/`swift`，离线 OCR 编译 `ocr.swift` 必需 |
| electron-builder | `devDependencies`（已安装，^26） | 负责将 Electron 运行时 + `dist/` 打包为 `.app`，再由 `hdiutil` 封装 `.dmg` |
| Electron | `43.0.0`（`devDependencies`） | 桌面运行时 |

安装依赖与命令行工具：

```bash
# 1. 安装 Node 依赖（含 dev 期的 electron 与 electron-builder）
npm install

```

### 9.2 打包步骤

打包分两步：先用 Vite 产出渲染产物 `dist/`，再用 `electron-builder` 把 Electron 运行时、`dist/`、`electron/`、`public/` 打进安装包。

```bash
# 步骤 1：前端生产构建（tsc -b 类型检查 + vite build --mode live，输出 dist/）
npm run desktop:build

# 步骤 2-a：生成未压缩的 .app（调试/本地验证用，速度快）
npm run pack
#   等价：npm run desktop:build && ./node_modules/.bin/electron-builder --dir
#   产物：mac-arm64/mac-OCR.app 或 mac/mac-OCR.app

# 步骤 2-b：生成可分发安装包 .dmg（发布用，推荐）
npm run dist
#   等价：npm run desktop:build && npm run pack && npm run dist:dmg && rm -rf release/mac-arm64
#   流程：Vite 构建 → electron-builder 产出未压缩 .app（--dir，不写 zip）→
#         hdiutil 封装为 .dmg（自带「拖入应用程序」引导）→ 清理中间 .app
#   产物：release/mac-OCR-0.3.15-arm64.dmg
```

**关键配置参数**（`package.json` 的 `build` 字段，可按需修改）：

| 字段 | 当前值 | 作用 |
|------|--------|------|
| `appId` | `com.idl.ocr` | 应用唯一标识，分发/签名用 |
| `productName` | `mac-OCR` | 安装包与应用显示名 |
| `electronDist` | `node_modules/electron/dist` | 复用项目内已解压的 Electron 运行时，**打包不再从网络下载发行包** |
| `files` | `dist/**/*`、`electron/**/*`、`public/**/*`、`package.json` | 打进 asar 的资源（主进程、`ocr.swift`、`stitcher.html`、图标均在其中） |
| `asar` | `true` | 将源码归档为只读 asar，提升加载与安全性 |
| `directories.output` | `release/` | 打包产物输出目录（最终仅含 `.dmg`，中间 `.app` 已清理） |
| `mac.target` | `["dir"]` | `pack` 以 `--dir` 产出未压缩 `.app`（位于 `release/mac-arm64/`），**不写 zip**；最终 `.dmg` 由 `scripts/build-dmg.sh` 用系统 `hdiutil` 生成，无需联网下载 dmg-builder |
| `mac.category` | `public.app-category.productivity` | App Store / 启动台分类 |
| `mac.identity` | `null` | 本地无开发者证书时跳过签名（见 9.4 与 9.3） |

> 说明：主进程通过 `app.isPackaged` 自动区分打包态，生产模式以 `file://dist/index.html?surface=` 加载，无需改动代码即可打包。托盘图标路径已做 `dist/` 优先、`public/` 回退的兼容处理。

### 9.3 安装指南

**方式一：开发/调试安装（`.app` 直接拖放）**
1. 执行 `npm run pack` 得到 `<平台>/mac-OCR.app`。
2. 将 `mac-OCR.app` 拖入「应用程序」文件夹，或在 Finder 中双击运行。
3. 首次启动若被 Gatekeeper 拦截（见 9.4），右键 `mac-OCR.app` →「打开」一次即可；或清除隔离属性：
   ```bash
   xattr -cr /Applications/mac-OCR.app
   ```

**方式二：分发安装（`.dmg`）**
1. 执行 `npm run dist` 得到 `release/mac-OCR-0.3.15-arm64.dmg`。
2. 双击 `.dmg` 挂载，将 `mac-OCR.app` 拖入「应用程序」文件夹完成安装。
3. 从启动台或 Spotlight 启动 `mac-OCR`。

**首次运行配置**
- 授予屏幕录制权限：系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 `mac-OCR`，并重启应用使权限生效（否则截图/框选为空）。
- 如需开机自启动：在应用设置面板开启（由主进程注册登录项）。
- 快捷键与主题在设置面板配置，持久化于本地。

**本地开发运行（非打包）**
```bash
npm install
npm run desktop:dev      # 并行启动 Vite(3000) + Electron，自动加载渲染进程
# 仅预览前端（无 Electron 能力）：npm run dev
```

### 9.4 故障排除

| 现象 / 报错 | 原因 | 解决方案 |
|------|------|----------|
| `Package "electron" is only allowed in "devDependencies"` | `electron` 写在 `dependencies` | 将其移至 `devDependencies`（本项目已完成）。 |
| 打包后托盘无图标 / 找不到图标文件 | 打包后 `public/` 不在 asar 内，而图标仍指向 `public/` | 已修复：`trayIconPath` 改为优先 `dist/img/favicon/...`、回退 `public/`。 |
| `“mac-OCR” 已损坏，无法打开` / 来自 unidentified developer | 未签名应用被 Gatekeeper 拦截 | 右键 →「打开」；或 `xattr -cr /Applications/mac-OCR.app`；若需对外分发，配置开发者证书并公证（见下）。 |
| `Cannot find code signature identity` | `mac.identity` 设为具体证书但本机无该证书 | 本机自用设 `"identity": null`（已完成）；对外分发填入 `Developer ID Application: <证书>` 并开启 `notarize`。 |
| OCR 失败：`离线 OCR 当前仅支持 macOS` 或识别为空 | 未授予屏幕录制权限，或 `swiftc` 缺失 | 系统设置授予屏幕录制权限并重启；`xcode-select --install` 安装 Swift 工具链。 |
| 打包后窗口空白 / `dist/index.html` 加载失败 | `dist/` 未生成或被 `files` 排除 | 确认先执行 `npm run desktop:build` 生成 `dist/`，且 `build.files` 含 `dist/**/*`。 |
| `npm run dist` 卡在下载 Electron | 默认会从 GitHub 拉取对应版本 Electron 发行包 | 已配置 `build.electronDist=node_modules/electron/dist` 复用项目内 Electron，不再下载；若仍触发下载，确认该目录存在（`npm install` 后应含 `Electron.app` + `version`）且版本与 `electron` 依赖一致。 |
| `dmgbuild-bundle-xxx.tar.gz` 下载超时 | 该包是 electron-builder 内置 dmg 工具，本流程**不使用** | 本项目 `.dmg` 由 `scripts/build-dmg.sh` 调用系统 `hdiutil` 生成，完全不依赖 dmg-builder，无需下载；若误跑默认 `electron-builder`（不带 `--dir`）触发下载，请改用 `npm run dist`（已封装正确流程）。 |

**对外分发（他人机器安装）**：需 Apple Developer ID 证书并公证，将 `build.mac` 改为：
```json
"mac": {
  "target": ["dir"],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "identity": "Developer ID Application: <你的证书>",
  "notarize": { "teamId": "<10位 Team ID>" }
}
```
> 本流程 `.dmg` 始终由系统 `hdiutil` 生成（见 `scripts/build-dmg.sh`），与目标格式无关，无需下载 dmg-builder；对外分发时仅需在 `mac` 段补充证书与 `notarize` 配置并重新 `npm run dist` 即可。

### 9.5 系统要求
- macOS 11.0+（OCR 依赖 Vision 框架）
- Node.js 18+（仅构建期需要）
- 首次使用需在「系统设置 → 隐私与安全性 → 屏幕录制」授予本应用权限

---

## 10. 注释与文档规范

为保持一致性，本项目注释遵循：

- **TypeScript / TSX**：文件头使用 `/** 文件：… 职责：… 依赖：… 导出：… */`；函数/类使用 JSDoc（`@param` / `@returns` / `@template`），语言以简体中文为主、关键类型保留英文。
- **Electron (.mjs) / 前端 (.ts)**：同 JSDoc 风格块注释。
- **Swift (ocr.swift)**：`///` / `//` 行注释。
- **Python**：模块与函数 docstring。
- **CSS (default.css)**：`/* */` 区块注释。

> 文档与注释应随业务迭代同步更新，尤其是新增 IPC 通道、窗口类型或后处理逻辑时（详见 `DEV_DOCS.md`）。
