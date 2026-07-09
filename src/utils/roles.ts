/**
 * 文件：src/utils/roles.ts
 * 职责：角色常量定义。集中维护 admin / user 角色，供鉴权与路由守卫复用。
 * 依赖：无
 * 导出：ADMIN_ROLE、USER_ROLE、Roles
 */

export const ADMIN_ROLE = 'admin';
export const USER_ROLE = 'user';

export const Roles = [ADMIN_ROLE, USER_ROLE];
