/**
 * 文件：src/lib/themeStore.ts
 * 职责：基于 Zustand 的主题色状态。持久化到 localStorage；用户主动切换走
 *       setTheme（会持久化），来自其它窗口同步走 _sync（仅内存更新）。
 * 依赖：zustand、./theme（DEFAULT_THEME_ID / isThemeId / ThemeId）
 * 导出：useThemeStore、STORAGE_KEY、isThemeId
 */

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
