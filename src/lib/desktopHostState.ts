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
  mode: 'single' | 'long';
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
  },
  shortcutRegistrationError: null,
  autoLaunch: true,
  advancedFeatures: defaultAdvancedFeatures,
};

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
