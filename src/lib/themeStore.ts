import { create } from 'zustand';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from './theme';

const STORAGE_KEY = 'app-theme-id';

const readStored = (): ThemeId => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isThemeId(raw) ? (raw as ThemeId) : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
};

type ThemeState = {
  themeId: ThemeId;
  /** User-initiated change: persists to localStorage and notifies other windows. */
  setTheme: (id: ThemeId) => void;
  /** Silent apply (used when another window changed the theme). */
  _sync: (id: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: readStored(),

  setTheme: (id) => {
    if (!isThemeId(id)) return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage may be unavailable; keep in-memory state */
    }
    set({ themeId: id });
  },

  _sync: (id) => set({ themeId: id }),
}));

export { STORAGE_KEY, isThemeId };
