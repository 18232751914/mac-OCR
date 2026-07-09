/**
 * 文件：src/lib/theme.ts
 * 职责：动态主题引擎。每个预设仅声明一个 hue，其余 OKLCH 调色板由该 hue 推导，
 *       保证 7 种主色调下的浅色过渡与中性色协调一致。applyTheme 把推导结果
 *       写入独立 <style> 标签，覆盖 default.css 的静态 :root/.dark 变量。
 * 依赖：无（纯函数）
 * 导出：THEME_LIST、DEFAULT_THEME_ID、applyTheme、isThemeId、ThemeId 等
 */

/**
 * Dynamic theme engine.
 *
 * Each preset only declares a hue; the full OKLCH palette (primary / secondary /
 * accent / muted / ring / surface / charts) is derived from that hue so that the
 * "shallow transition" and "neutral" colors stay harmonious across every preset.
 *
 * `applyTheme` writes the resolved variables into a dedicated <style> tag so the
 * cascade overrides the static `:root` / `.dark` blocks in default.css and keeps
 * working when the `.dark` class toggles.
 */

export type ThemeId = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple';

export type ThemePreset = {
  id: ThemeId;
  name: string;
  hue: number;
};

/** The seven requested color families. Blue is the default (主色调). */
export const THEME_LIST: ThemePreset[] = [
  { id: 'red', name: '红', hue: 25 },
  { id: 'orange', name: '橙', hue: 50 },
  { id: 'yellow', name: '黄', hue: 95 },
  { id: 'green', name: '绿', hue: 142 },
  { id: 'cyan', name: '青', hue: 195 },
  { id: 'blue', name: '蓝', hue: 255 },
  { id: 'purple', name: '紫', hue: 285 },
];

export const DEFAULT_THEME_ID: ThemeId = 'blue';

const isThemeId = (value: string | null | undefined): value is ThemeId =>
  value != null && THEME_LIST.some((t) => t.id === value);

const hue = (id: ThemeId): number => THEME_LIST.find((t) => t.id === id)?.hue ?? 255;

type Vars = Record<string, string>;

/** Derive the full light-mode palette from a base hue. */
const lightVars = (h: number): Vars => ({
  '--theme-hue': `${h}`,
  '--background': `oklch(0.975 0.014 ${h})`,
  '--foreground': `oklch(0.22 0.03 ${h})`,
  '--card': `oklch(1 0.006 ${h})`,
  '--card-foreground': `oklch(0.22 0.03 ${h})`,
  '--popover': `oklch(1 0.006 ${h})`,
  '--popover-foreground': `oklch(0.22 0.03 ${h})`,
  '--primary': `oklch(0.55 0.17 ${h})`,
  '--primary-foreground': `oklch(0.99 0.004 ${h})`,
  '--secondary': `oklch(0.93 0.035 ${h})`,
  '--secondary-foreground': `oklch(0.30 0.05 ${h})`,
  '--muted': `oklch(0.955 0.012 ${h})`,
  '--muted-foreground': `oklch(0.50 0.025 ${h})`,
  '--accent': `oklch(0.94 0.04 ${h})`,
  '--accent-foreground': `oklch(0.28 0.05 ${h})`,
  '--destructive': `oklch(0.55 0.20 18)`,
  '--destructive-foreground': `oklch(0.99 0.004 ${h})`,
  '--border': `oklch(0.90 0.015 ${h})`,
  '--input': `oklch(0.92 0.012 ${h})`,
  '--ring': `oklch(0.55 0.17 ${h})`,
  '--chart-1': `oklch(0.55 0.17 ${h})`,
  '--chart-2': `oklch(0.52 0.15 ${(h + 20) % 360})`,
  '--chart-3': `oklch(0.58 0.13 ${(h + 320) % 360})`,
  '--chart-4': `oklch(0.62 0.12 ${(h + 60) % 360})`,
  '--chart-5': `oklch(0.50 0.16 30)`,
  '--sidebar': `oklch(0.97 0.01 ${h})`,
  '--sidebar-foreground': `oklch(0.22 0.03 ${h})`,
  '--sidebar-primary': `oklch(0.55 0.17 ${h})`,
  '--sidebar-primary-foreground': `oklch(0.99 0.004 ${h})`,
  '--sidebar-accent': `oklch(0.94 0.02 ${h})`,
  '--sidebar-accent-foreground': `oklch(0.26 0.04 ${h})`,
  '--sidebar-border': `oklch(0.90 0.015 ${h})`,
  '--sidebar-ring': `oklch(0.55 0.17 ${h})`,
  // Glass tokens: translucent white for the light scheme.
  '--glass-bg': `oklch(1 0 0 / 62%)`,
  '--glass-border': `oklch(1 0 0 / 70%)`,
});

/** Derive the full dark-mode palette from a base hue. */
const darkVars = (h: number): Vars => ({
  '--theme-hue': `${h}`,
  '--background': `oklch(0.16 0.02 ${h})`,
  '--foreground': `oklch(0.95 0.008 ${h})`,
  '--card': `oklch(0.20 0.02 ${h})`,
  '--card-foreground': `oklch(0.95 0.008 ${h})`,
  '--popover': `oklch(0.20 0.02 ${h})`,
  '--popover-foreground': `oklch(0.95 0.008 ${h})`,
  '--primary': `oklch(0.66 0.17 ${h})`,
  '--primary-foreground': `oklch(0.16 0.02 ${h})`,
  '--secondary': `oklch(0.24 0.04 ${h})`,
  '--secondary-foreground': `oklch(0.94 0.012 ${h})`,
  '--muted': `oklch(0.22 0.018 ${h})`,
  '--muted-foreground': `oklch(0.62 0.025 ${h})`,
  '--accent': `oklch(0.25 0.045 ${h})`,
  '--accent-foreground': `oklch(0.95 0.008 ${h})`,
  '--destructive': `oklch(0.58 0.20 18)`,
  '--destructive-foreground': `oklch(0.99 0.004 ${h})`,
  '--border': `oklch(1 0 0 / 12%)`,
  '--input': `oklch(1 0 0 / 16%)`,
  '--ring': `oklch(0.66 0.17 ${h})`,
  '--chart-1': `oklch(0.66 0.17 ${h})`,
  '--chart-2': `oklch(0.62 0.15 ${(h + 20) % 360})`,
  '--chart-3': `oklch(0.68 0.13 ${(h + 320) % 360})`,
  '--chart-4': `oklch(0.72 0.12 ${(h + 60) % 360})`,
  '--chart-5': `oklch(0.62 0.16 30)`,
  '--sidebar': `oklch(0.17 0.02 ${h})`,
  '--sidebar-foreground': `oklch(0.95 0.008 ${h})`,
  '--sidebar-primary': `oklch(0.66 0.17 ${h})`,
  '--sidebar-primary-foreground': `oklch(0.16 0.02 ${h})`,
  '--sidebar-accent': `oklch(0.22 0.04 ${h})`,
  '--sidebar-accent-foreground': `oklch(0.95 0.008 ${h})`,
  '--sidebar-border': `oklch(1 0 0 / 12%)`,
  '--sidebar-ring': `oklch(0.66 0.17 ${h})`,
  // Glass tokens: dark tinted translucent surface + faint white hairline.
  '--glass-bg': `oklch(0.22 0.025 ${h} / 60%)`,
  '--glass-border': `oklch(1 0 0 / 18%)`,
});

const toCss = (vars: Vars): string =>
  Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

const STYLE_ID = 'dynamic-theme-vars';

/**
 * Inject (or update) the resolved theme variables into a dedicated <style> tag.
 * Inserting it into <head> after the bundled stylesheet guarantees these rules
 * win over the static `:root` / `.dark` declarations in default.css.
 */
/**
 * 注入（或更新）推导后的主题变量到独立 <style> 标签。
 * 置于打包样式之后，确保覆盖 default.css 的静态 `:root` / `.dark` 声明。
 * @param id 主题 ID，缺省为 DEFAULT_THEME_ID（蓝）
 */
export const applyTheme = (id: ThemeId = DEFAULT_THEME_ID): void => {
  if (typeof document === 'undefined') return;
  const h = hue(id);
  const css = `:root {\n${toCss(lightVars(h))}\n}\n\n.dark {\n${toCss(darkVars(h))}\n}`;

  const doc = document;
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = css;
};

export { isThemeId };
