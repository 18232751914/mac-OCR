/**
 * 文件：src/auth/AuthStore.ts
 * 职责：基于 Zustand 的全局鉴权状态。保存 access/refresh token 与 session，
 *       并镜像持久化到 localStorage；setAuth 在登录态不完整时清空凭证，
 *       并通过 areSessionsEqual 避免无意义的重复渲染。
 * 依赖：zustand、@/api/AppDtos（SessionDto）、localStorage
 * 导出：默认 useAuthStore（含 setAuth / signOut）
 */

import { create } from 'zustand';
import { SessionDto } from '@/api/AppDtos';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  session: SessionDto | null;

  setAuth: (accessToken: string | null, refreshToken: string | null, session: SessionDto | null) => void;
  signOut: () => void;
};

const AUTH_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const AUTH_SESSION_KEY = 'auth_session';

const readStoredSession = (): SessionDto | null => {
  const stored = localStorage.getItem(AUTH_SESSION_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as SessionDto;
  } catch {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
};

const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem(AUTH_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  session: readStoredSession(),

  /**
   * 写入登录态。仅当 accessToken、refreshToken、session 三者同时有效时才接受，
   * 否则整体清空（避免脏登录态）。状态或 session 未变化时跳过，减少无意义渲染。
   * 同时镜像持久化到 localStorage。
   */
  setAuth(accessToken, refreshToken, session) {
    const current = useAuthStore.getState();
    const hasCompleteAuth = Boolean(accessToken && refreshToken && session);
    const nextAccessToken = hasCompleteAuth ? accessToken : null;
    const nextRefreshToken = hasCompleteAuth ? refreshToken : null;
    const nextSession = hasCompleteAuth ? session : null;

    if (
      current.accessToken === nextAccessToken &&
      current.refreshToken === nextRefreshToken &&
      areSessionsEqual(current.session, nextSession)
    ) {
      return;
    }

    set({ accessToken: nextAccessToken, refreshToken: nextRefreshToken, session: nextSession });

    if (nextAccessToken) localStorage.setItem(AUTH_TOKEN_KEY, nextAccessToken);
    else localStorage.removeItem(AUTH_TOKEN_KEY);

    if (nextRefreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);

    if (nextSession) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
    else localStorage.removeItem(AUTH_SESSION_KEY);
  },

  /** 清空内存与 localStorage 中的全部登录凭证。 */
  signOut() {
    set({ accessToken: null, refreshToken: null, session: null });
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
  },
}));

/** 比较两个 SessionDto 是否在用户、邮箱与角色序列上等价（角色顺序敏感）。 */
const areSessionsEqual = (oldSession: SessionDto | null, newSession: SessionDto | null) => {
  if (oldSession === newSession) return true;
  if (!oldSession || !newSession) return false;

  const oldRoles = oldSession.Roles ?? [];
  const newRoles = newSession.Roles ?? [];

  return oldSession.UserId === newSession.UserId &&
    oldSession.Email === newSession.Email &&
    oldRoles.length === newRoles.length &&
    oldRoles.every((role, index) => role === newRoles[index]);
};

export default useAuthStore;
