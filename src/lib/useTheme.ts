/**
 * 文件：src/lib/useTheme.ts
 * 职责：在 React 中挂载动态主题。首次渲染应用已持久化的主题色；主题变化时
 *       重新应用；并监听 localStorage 的 `storage` 事件，使 Electron 各独立
 *       BrowserWindow 无需 IPC 即可保持主题同步。
 * 依赖：react、./themeStore、./theme
 * 导出：useTheme（无返回值，仅产生副作用）
 */

import { useEffect } from 'react';
import { useThemeStore, STORAGE_KEY } from './themeStore';
import { applyTheme, isThemeId, DEFAULT_THEME_ID, type ThemeId } from './theme';

/**
 * Mounts the dynamic theme:
 *  - applies the stored/persisted theme on first render,
 *  - re-applies whenever the theme changes (in this window),
 *  - listens for `storage` events so Electron's separate BrowserWindows stay
 *    in sync without any IPC (they share localStorage).
 */
export const useTheme = () => {
  const themeId = useThemeStore((s) => s.themeId);
  const _sync = useThemeStore((s) => s._sync);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue;
      if (isThemeId(next)) {
        _sync(next as ThemeId);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [_sync]);

  // Guard: if nothing was stored yet, persist the default so other windows
  // pick up a consistent initial theme.
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, DEFAULT_THEME_ID);
      }
    } catch {
      /* ignore */
    }
  }, []);
};
