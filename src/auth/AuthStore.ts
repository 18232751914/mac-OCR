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

  signOut() {
    set({ accessToken: null, refreshToken: null, session: null });
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
  },
}));

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
