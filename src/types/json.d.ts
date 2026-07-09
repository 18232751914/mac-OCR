/**
 * 文件：src/types/json.d.ts
 * 职责：声明 *.json 模块的默认导入类型，便于直接 import JSON 资源。
 * 依赖：无
 * 导出：模块声明
 */

declare module "*.json" {
  const value: any;
  export default value;
}
