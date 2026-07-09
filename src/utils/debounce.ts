/**
 * 文件：src/utils/debounce.ts
 * 职责：通用防抖函数。在 wait 毫秒内的重复调用只执行最后一次。
 * 依赖：无
 * 导出：debounce
 */

export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return function(this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), wait);
  };
}