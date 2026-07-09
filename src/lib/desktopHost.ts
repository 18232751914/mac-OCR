/**
 * 文件：src/lib/desktopHost.ts
 * 职责：桌面宿主环境检测小工具。封装对 window.desktopHost 的安全访问，
 *       使渲染进程在浏览器预览（无 Electron 宿主）下也能优雅降级。
 * 依赖：@/types/desktop-host（DesktopSurface）、window.desktopHost
 * 导出：getDesktopSurface、isDesktopHostAvailable
 */

import type { DesktopSurface } from '@/types/desktop-host';

export function getDesktopSurface(): DesktopSurface {
  return window.desktopHost?.getSurface() ?? 'panel';
}

export function isDesktopHostAvailable(): boolean {
  return typeof window.desktopHost !== 'undefined';
}
