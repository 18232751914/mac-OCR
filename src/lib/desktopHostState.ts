/**
 * 文件：src/lib/desktopHostState.ts
 * 职责：定义主进程广播的桌面宿主状态 `HostShellState` 及全部子类型
 *       （截图会话、长截图会话、快捷键偏好、高级功能配置等），并提供
 *       `useDesktopHostState` Hook 订阅状态（首屏主动拉取 + 后续增量监听）。
 * 依赖：react、@/types/desktop-host、window.desktopHost
 * 导出：全部状态类型 + emptyState + useDesktopHostState
 */

import { useCallback, useEffect, useState } from 'react';

export type ScreenPermissionState = 'granted' | 'denied' | 'restricted' | 'unknown';

export type HostCaptureResult = {
  text: string;
  capturedAt: string;
  wasEmpty: boolean;
  imageDataUrl: string | null;
  longImageDataUrl?: string | null;
  loading?: boolean;
};

export type HostCaptureSession = {
  mode: 'single' | 'long' | 'quick';
  overlayBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
} | null;

export type CaptureSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlaySelection = CaptureSelection;

export type LongCaptureSession = {
  selection: CaptureSelection;
  displayId: string;
  displayBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  segmentsCaptured: number;
  latestSegmentPreview?: string | null;
  latestSegmentThumbnail?: string | null;
  capturedTexts?: string[];
  mode: 'auto' | 'manual';
  isPaused: boolean;
  capturedImages?: string[];
} | null;

export type CaptureShortcutPreference = {
  accelerator: string;
  displayText: string;
};

export type ShortcutPreferences = {
  single: CaptureShortcutPreference;
  long: CaptureShortcutPreference;
  menu: CaptureShortcutPreference;
  quick: CaptureShortcutPreference;
};

export type CharReplacement = {
  source: string;
  target: string;
};

export type RegexRule = {
  pattern: string;
  replacement: string;
  flags: string;
  mode: 'replace' | 'filter';
};

export type AdvancedFeaturesConfig = {
  enabled: boolean;
  filterSymbols: string[];
  charReplacements: CharReplacement[];
  regexRules: RegexRule[];
};

export const defaultAdvancedFeatures: AdvancedFeaturesConfig = {
  enabled: true,
  filterSymbols: [],
  charReplacements: [],
  regexRules: [],
};

export type HostShellState = {
  platform: string;
  surfaces: string[];
  permissions: {
    screenCapture: ScreenPermissionState;
  };
  recentCaptureResult: HostCaptureResult | null;
  activeCaptureSession: HostCaptureSession;
  longCaptureSession: LongCaptureSession;
  captureErrorMessage: string | null;
  shortcutPreferences: ShortcutPreferences;
  shortcutRegistrationError: string | null;
  autoLaunch: boolean;
  advancedFeatures: AdvancedFeaturesConfig;
};

const emptyState: HostShellState = {
  platform: 'web',
  surfaces: ['panel'],
  permissions: {
    screenCapture: 'unknown',
  },
  recentCaptureResult: null,
  activeCaptureSession: null,
  longCaptureSession: null,
  captureErrorMessage: null,
  shortcutPreferences: {
    single: {
      accelerator: 'CommandOrControl+Shift+1',
      displayText: '⌘/Ctrl + ⇧ + 1',
    },
    long: {
      accelerator: 'CommandOrControl+Shift+2',
      displayText: '⌘/Ctrl + ⇧ + 2',
    },
    menu: {
      accelerator: 'CommandOrControl+Shift+M',
      displayText: '⌘/Ctrl + ⇧ + M',
    },
    quick: {
      accelerator: 'CommandOrControl+Shift+3',
      displayText: '⌘/Ctrl + ⇧ + 3',
    },
  },
  shortcutRegistrationError: null,
  autoLaunch: true,
  advancedFeatures: defaultAdvancedFeatures,
};

/**
 * 订阅桌面宿主状态。
 * 首屏主动调用 getShellState 拉取一次；之后若存在 subscribeShellState 则
 * 通过监听增量更新（多窗口共享同一 auth/主题等）。无宿主时回退到 emptyState。
 * @returns { state, refresh } —— 当前状态与手动刷新函数
 */
export function useDesktopHostState() {
  const [state, setState] = useState<HostShellState>(emptyState);

  const refresh = useCallback(async () => {
    if (!window.desktopHost) {
      setState(emptyState);
      return emptyState;
    }

    const nextState = await window.desktopHost.getShellState();
    setState(nextState);
    return nextState;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!window.desktopHost?.subscribeShellState) {
      return undefined;
    }

    return window.desktopHost.subscribeShellState((nextState) => {
      setState(nextState);
    });
  }, []);

  return {
    state,
    refresh,
  };
}
