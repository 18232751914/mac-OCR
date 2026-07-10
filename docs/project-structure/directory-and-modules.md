# 项目结构与模块说明

> 本文件由 `README.md` 第 4 节拆出，集中描述 `react-app/` 的目录布局、各模块职责以及 UI 组件清单，便于按需检索与维护。

## 目录布局

```
react-app/
├── README.md                  # 用户文档（总览 / 功能 / 架构 / 流程 / 配置 / 脚本 / 打包）
├── DEV_DOCS.md                # 详细开发文档（进程 / 窗口 / IPC / OCR / 前端业务层）
├── docs/                      # 拆分出的结构化子文档（项目结构 / 模块依赖）
├── build.sh                   # 一键打包脚本（环境检查 → 编译 OCR → 构建 → .app → .dmg）
├── index.html                 # HTML 入口（运行时按 VITE_APP_NAME 覆盖 <title>）
├── vite.config.ts             # Vite + 测试 + 动态 manifest 配置
├── tsconfig*.json             # TypeScript 配置
├── eslint.config.js           # ESLint 扁平配置
├── prettier.config.mjs        # Prettier 配置（printWidth 120）
├── components.json            # shadcn/ui 配置
├── electron/                  # 主进程相关（Node.js 端）
│   ├── main.mjs               # 主进程入口
│   ├── preload.mjs            # 预加载：contextBridge 暴露 window.desktopHost API
│   ├── dev.mjs                # 开发启动器（并行拉起 Vite + Electron）
│   ├── ocr.swift              # Swift 脚本：Vision 离线 OCR + 表格重建
│   └── stitcher.html          # 隐藏窗口：长图 Canvas 拼接与重叠检测
└── src/                       # 渲染进程（React 应用）
    ├── main.tsx               # React 入口，挂载 <MainApp/>
    ├── App.tsx                # 根组件：ErrorBoundary + TooltipProvider + Routes + useTheme
    ├── default.css            # 全局样式与玻璃拟态设计系统（CSS 变量 / @theme inline）
    ├── api/                   # 远端业务服务调用层
    │   ├── ApiClient.ts       # 通用 invoke / stream 封装（注入并刷新 token）
    │   ├── AppDtos.ts         # 请求 / 响应 DTO 类型定义
    │   ├── AuthManager.ts     # 鉴权业务方法（Login / SignUp / GetSession …）
    │   └── Enums.ts           # 示例枚举（SampleEnum）
    ├── auth/
    │   └── AuthStore.ts       # Zustand：登录态 + token / session 持久化
    ├── lib/                   # 通用库（桌面宿主 / 状态 / 主题 / 工具）
    │   ├── desktopHost.ts     # 环境检测：getSurface / isDesktopHostAvailable
    │   ├── desktopHostState.ts# 状态类型 + useDesktopHostState 订阅 Hook
    │   ├── textTransforms.ts  # 高级后处理：符号过滤 / 字符替换 / 正则
    │   ├── theme.ts           # 动态主题引擎（7 色调 OKLCH 推导）
    │   ├── themeStore.ts      # Zustand：主题色状态 + 持久化
    │   ├── useTheme.ts        # 挂载主题 + 跨窗口 storage 同步
    │   ├── fireworks.ts       # 轻量烟花动效（canvas + rAF）
    │   └── utils.ts           # cn() 类名合并工具
    ├── components/            # 可复用组件
    │   ├── DesktopCaptureOverlay.tsx # 截图框选覆盖层（拖拽 / 光标 / ESC）
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

## 模块职责

### 主进程（`electron/`）

| 文件 | 职责 |
|------|------|
| `main.mjs` | 窗口管理、截图采集、OCR 调度、长截图拼接、托盘、全局快捷键、自启动、权限检测与状态广播（IPC） |
| `preload.mjs` | 通过 `contextBridge` 暴露 `window.desktopHost.*` 窄接口，隔离渲染进程与 Node/Electron API |
| `dev.mjs` | 开发期并行启动 Vite 与 Electron，并互相等待退出以避免孤儿进程 |
| `ocr.swift` | Apple Vision 离线 OCR 实现；打包期由 `swiftc -O` 编译为 `screen-ocr-engine.bin` 随应用分发 |
| `stitcher.html` | 隐藏窗口，基于 Canvas 完成长图拼接与重叠检测 |

### 渲染进程（`src/`）

| 目录 | 职责 |
|------|------|
| `api/` | `ApiClient`（invoke / stream 封装、token 注入刷新）、`AuthManager`、`AppDtos`、`Enums` |
| `auth/` | `AuthStore`（Zustand）管理登录态与 token / session 持久化 |
| `lib/` | `desktopHost`（环境检测）、`desktopHostState`（状态订阅）、`textTransforms`（高级后处理）、`theme*`、`useTheme`、`fireworks`、`utils` |
| `components/` | `DesktopCaptureOverlay`（框选覆盖层）、`ErrorBoundary` 及 `ui/`（shadcn/ui） |
| `routes/` | `Routes`（路由表）、`ProtectedRoute`（鉴权守卫） |
| `views/` | `DesktopShellView`（多 surface 主视图）及各占位 / 错误页 |

## shadcn/ui 组件

`src/components/ui/` 共 19 个，基于 Radix UI 与 `cn()`（`clsx` + `tailwind-merge`）组合：

`badge` `button` `calendar` `card` `checkbox` `dialog` `dropdown-menu` `input` `label` `navigation-menu` `popover` `select` `separator` `sheet` `switch` `table` `tabs` `textarea` `tooltip`
