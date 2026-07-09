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
