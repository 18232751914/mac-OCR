# 模块依赖关系

> 本文件由 `README.md` 第 5 节拆出，描述主进程与渲染进程之间的通信边界、状态绑定方式，以及浏览器预览模式下的环境降级策略。

## 依赖拓扑

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

## 通信边界

- **主进程 ↔ 渲染进程**：仅通过 `window.desktopHost`（preload 桥接）通信，渲染进程**不直接**访问 Node / Electron API。安全约束为 `contextIsolation: true` 且 `nodeIntegration: false`；所有跨进程调用均返回 `Promise`，类型契约见 `src/types/desktop-host.d.ts` 的 `DesktopHostApi` 接口。
- **UI ↔ 状态**：视图通过 Zustand（`themeStore` / `authStore`，经 `useDesktopHostState` 隐式订阅）获取状态；主题与宿主状态的变更驱动组件重渲染，避免渲染进程直接持有主进程可变状态。
- **环境降级**：`isDesktopHostAvailable()` 判断是否存在 `window.desktopHost`。在浏览器预览模式（无 Electron 宿主）下，截图、权限检测与系统级窗体能力不可用，但 UI 仍可正常渲染，并提示相关能力受限。

## 远端服务依赖

视图与组件通过 `api/AuthManager` 调用业务服务，经由 `api/ApiClient` 注入并刷新 `accessToken` / `refreshToken`，最终由 `auth/AuthStore` 维护登录态与 session；请求 / 响应结构由 `api/AppDtos` 的 DTO 类型约束，保证前后端契约一致。
