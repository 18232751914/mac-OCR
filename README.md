# Screen OCR

基于 **Electron + React + TypeScript + Tailwind CSS (shadcn/ui)** 构建的 macOS 桌面离线 OCR 截图工具。支持多显示器跨屏框选、实时离线文字识别（Apple Vision 框架）、长截图自动/手动拼接合并，以及结果编辑、主题换色、开机自启动与全局快捷键。

> 更详细的开发文档（进程模型、窗口体系、IPC 通道、OCR 原理等）见 [`DEV_DOCS.md`](./DEV_DOCS.md)。

---

## 1. 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 运行时 | Electron 43 | 桌面宿主，主进程 + 多渲染窗口 |
| UI 框架 | React 18 + TypeScript 5.6 | 渲染进程界面 |
| 构建 | Vite 5 + SWC | 开发服务器与生产打包 |
| 样式 | Tailwind CSS v4 + shadcn/ui | CSS-first 主题（OKLCH 色彩空间） |
| 状态 | Zustand 4.5 | 轻量全局状态（auth / theme） |
| 离线识别 | Apple Vision (`ocr.swift`) | 中/英/日/韩多语言，无需联网 |
| 长图拼接 | `stitcher.html` + Canvas | 在隐藏窗口内拼接与重叠检测 |

---

## 2. 整体架构

应用采用 **主进程 / 预加载脚本 / 多渲染窗口** 三层结构：

```
┌───────────────────────────────────────────────────────────┐
│ 主进程  electron/main.mjs                                   │
│  · 窗口管理（panel / result / settings / overlay / toolbar） │
│  · 截图采集（desktopCapturer + 多显示器 overlay）           │
│  · OCR 调度（swiftc 编译缓存 + Vision 调用）                │
│  · 长截图拼接（stitcher 隐藏窗口）与文本去重合并            │
│  · 托盘、全局快捷键、开机自启动、权限检测、状态广播         │
└───────────────────────────┬───────────────────────────────┘
                            │ contextBridge (ipcRenderer)
┌───────────────────────────▼───────────────────────────────┐
│ 预加载  electron/preload.mjs                                │
│  暴露 window.desktopHost.* API（类型见 types/desktop-host.d.ts）│
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│ 渲染进程  src/（React 应用，按 ?surface= 区分窗口身份）     │
│  · views/DesktopShellView 统一渲染所有 surface              │
│  · lib/desktopHostState 订阅主进程广播状态                  │
│  · api/ 调用远端业务服务（AuthManager / ApiClient）         │
└───────────────────────────────────────────────────────────┘
```

- **Surface 路由**：同一份打包产物通过 URL `?surface=panel|result|settings|overlay|long-toolbar` 加载，由 `getDesktopSurface()` 区分窗口身份，`DesktopShellView` 据此渲染不同界面。
- **状态同步**：主进程维护单一 `hostState`，通过 `broadcastShellState()` 向所有窗口推送；渲染进程用 `useDesktopHostState()` 订阅。图片等大体积数据不走广播，按需通过 `getRecentCaptureImages` 拉取。
- **跨窗口主题**：主题色以 `localStorage` 持久化，各 Electron `BrowserWindow` 通过 `storage` 事件保持同步（详见 `lib/useTheme.ts`）。

---

## 3. 目录与模块说明

```
react-app/
├── README.md                  # 本文档
├── DEV_DOCS.md                # 详细开发文档（进程/窗口/IPC/OCR）
├── index.html                 # HTML 入口（运行时覆盖 <title>）
├── vite.config.ts             # Vite + 测试 + 动态 manifest 配置
├── tsconfig*.json             # TypeScript 配置（由 RIDE 生成）
├── eslint.config.js           # ESLint 配置
├── prettier.config.mjs        # Prettier 配置（printWidth 120）
├── electron/                  # 主进程相关（Node.js 端）
│   ├── main.mjs               # 主进程入口：窗口/截图/OCR/IPC/托盘/快捷键
│   ├── preload.mjs            # 预加载：暴露 window.desktopHost API
│   ├── dev.mjs                # 开发启动器（Vite + Electron 并行）
│   ├── ocr.swift              # Swift 脚本：Vision 离线 OCR + 表格重建
│   └── stitcher.html          # 隐藏窗口：长图 Canvas 拼接与重叠检测
├── scripts/
│   └── resize_crop_images.py  # 工具脚本：按参考图 cover 裁剪批量图片
└── src/                       # 渲染进程（React 应用）
    ├── main.tsx               # React 入口，挂载 <App/>
    ├── App.tsx                # 根组件：ErrorBoundary + Tooltip + Routes
    ├── default.css            # 全局样式与玻璃拟态设计系统（CSS 变量）
    ├── api/                   # 远端业务服务调用层
    │   ├── ApiClient.ts       # 通用 invoke / stream 封装（注入 token）
    │   ├── AppDtos.ts         # 请求/响应 DTO 类型定义
    │   ├── AuthManager.ts     # 鉴权业务方法（Login/SignUp/GetSession…）
    │   └── Enums.ts           # 示例枚举（SampleEnum）
    ├── auth/
    │   └── AuthStore.ts       # Zustand：登录态 + token 持久化
    ├── lib/                   # 通用库（桌面宿主/状态/主题/工具）
    │   ├── desktopHost.ts     # 环境检测：getSurface / isDesktopHostAvailable
    │   ├── desktopHostState.ts# 状态类型 + useDesktopHostState 订阅 Hook
    │   ├── textTransforms.ts  # 高级后处理：符号过滤/替换/正则
    │   ├── theme.ts           # 动态主题引擎（7 色调 OKLCH 派生）
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

### shadcn/ui 组件（`src/components/ui/`）

`button` `card` `input` `textarea` `dialog` `switch` `separator` `badge` `label`
`checkbox` `select` `tabs` `table` `tooltip` `popover` `sheet` `dropdown-menu`
`navigation-menu` `calendar` —— 均由 shadcn 生成，基于 Radix UI 与 `cn()` 组合。

---

## 4. 关键数据流

### 4.1 单次截图识别
`startScreenCapture('single')` → 权限检查 → 多显示器截图+各建 overlay 窗口 → 用户在 overlay 拖拽框选 → `completeScreenCapture` 定位显示器并裁剪 → `finalizeSingleCapture` → `recognizeTextFromImage`（写临时 PNG → 调用 `ocr.swift`）→ 结果写入 `hostState` 并广播 → 显示 result 窗口。

### 4.2 长截图
首段框选后进入 `longCaptureSession`（默认 auto 模式，定时器按内容变化自动采集）；每段独立 OCR 并累积文本；`finishLongCapture` 时 `stitchLongImage` 拼接全图 + `mergeLongCaptureText` 按 8 行重叠去重合并，最后对全图再做一次 OCR 取更优结果。

### 4.3 主题切换
`useThemeStore` 持久化 `themeId` → `applyTheme` 把 7 色调推导的全套 OKLCH 变量写入独立 `<style>`（覆盖 `default.css` 的静态 `:root`/`.dark`）→ `storage` 事件驱动其它窗口 `_sync`。

---

## 5. 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器（浏览器预览） |
| `npm run desktop:dev` | Electron + Vite 开发模式 |
| `npm run build` | `tsc -b` 类型检查 + Vite 生产构建 |
| `npm run test` | Vitest 测试 |
| `npm run lint` / `format` | ESLint / Prettier |

---

## 6. 注释规范

为保持一致性，本项目注释遵循以下约定：

- **TypeScript / TSX**：文件头使用 `/** 文件：… 职责：… 依赖：… 导出：… */`；函数/类使用 JSDoc（`@param` / `@returns` / `@template`），语言以简体中文为主、关键类型保留英文。
- **Electron (.mjs)**：同 JSDoc 风格块注释。
- **Swift (ocr.swift)**：`///` / `//` 行注释。
- **Python**：模块与函数 docstring。
- **CSS (default.css)**：`/* */` 区块注释。
- 重点标注核心逻辑与易错点（如跨显示器坐标换算、OCR 二进制缓存、长图去重），避免对显而易见的代码冗余说明。

> 文档与注释应随业务迭代同步更新，尤其是新增 IPC 通道、窗口类型或后处理逻辑时。
