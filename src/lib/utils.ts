/**
 * 文件：src/lib/utils.ts
 * 职责：通用类名合并工具。结合 clsx 的条件类名与 tailwind-merge 的冲突消解，
 *       确保相同方向的 Tailwind 工具类以后者（更具体）为准。
 * 依赖：clsx、tailwind-merge
 * 导出：cn
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并并消解类名。
 * @param inputs 任意个数的类名（字符串 / 条件对象 / 数组，遵循 clsx 语法）
 * @returns 去重后的最终 className 字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
