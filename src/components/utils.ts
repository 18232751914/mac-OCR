/**
 * 文件：src/components/utils.ts
 * 职责：自定义 SVG 图标组件的 Props 类型定义（参考通用 Icon Props 形态），
 *       供项目内联 SVG 图标复用。
 * 依赖：react（SVGAttributes）
 * 导出：IconProps
 */

import { SVGAttributes } from 'react';

/**
 * Props to use with custom SVG icons, similar to AppIcon's Props
 */
export interface IconProps extends SVGAttributes<SVGElement> {
  color?: string;
  icon?: string;
  size?: string | number;
  title?: string;
}
