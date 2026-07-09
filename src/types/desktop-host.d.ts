/**
 * 文件：src/types/desktop-host.d.ts
 * 职责：声明 window.desktopHost 的类型契约，作为渲染进程与主进程 IPC 的桥。
 *       所有方法均经 preload.mjs 的 contextBridge 暴露，返回 Promise。
 * 依赖：@/lib/desktopHostState（类型）
 * 导出：DesktopSurface、DesktopHostApi 及全局 Window.desktopHost 声明
 */

import type { CaptureSelection, HostShellState, OverlaySelection } from '@/lib/desktopHostState';

export type DesktopSurface = 'panel' | 'result' | 'settings' | 'overlay' | 'long-toolbar';

export interface DesktopHostApi {
  getSurface: () => DesktopSurface;
  getShellState: () => Promise<HostShellState>;
  showResultWindow: () => Promise<{ success: boolean }>;
  showSettingsWindow: () => Promise<{ success: boolean }>;
  togglePanelWindow: () => Promise<{ success: boolean }>;
  startScreenCapture: () => Promise<{ success: boolean }>;
  startLongScreenCapture: () => Promise<{ success: boolean }>;
  activateOverlay: () => Promise<{ success: boolean }>;
  completeScreenCapture: (selection: OverlaySelection) => Promise<{ success: boolean }>;
  cancelCaptureSession: () => Promise<{ success: boolean }>;
  captureLongSegment: () => Promise<{ success: boolean }>;
  finishLongCapture: () => Promise<{ success: boolean }>;
  setLongCaptureMode: (request: { mode: 'auto' | 'manual' }) => Promise<{ success: boolean }>;
  toggleLongCapturePause: () => Promise<{ success: boolean }>;
  saveLongImage: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
  saveRecentResultText: (request: { text: string }) => Promise<{ success: boolean }>;
  copyResultText: (request: { text: string }) => Promise<{ success: boolean }>;
  getRecentCaptureImages: () => Promise<{ imageDataUrl: string | null; longImageDataUrl: string | null }>;
  saveShortcutPreference: (request: { mode: 'single' | 'long' | 'menu'; accelerator: string }) => Promise<{ success: boolean }>;
  saveAdvancedFeatures: (request: { config: import('@/lib/desktopHostState').AdvancedFeaturesConfig }) => Promise<{ success: boolean }>;
  openScreenCapturePreferences: () => Promise<{ success: boolean }>;
  setAutoLaunch: (request: { enabled: boolean }) => Promise<{ success: boolean; error?: string }>;
  closeCurrentWindow: () => Promise<{ success: boolean }>;
  requestWindowFit: (contentHeight: number) => Promise<{ success: boolean }>;
  subscribeShellState: (listener: (state: HostShellState) => void) => () => void;
}

declare global {
  interface Window {
    desktopHost?: DesktopHostApi;
  }
}
