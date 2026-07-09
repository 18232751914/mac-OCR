import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AuthManager from '@/api/AuthManager';
import useAuthStore from '@/auth/AuthStore';
import { Button } from '@/components/ui/button';

const SESSION_RESTORE_TIMEOUT_MS = 15000;

interface ProtectedRouteProps {
  roles?: string[];
}

const ProtectedRoute = ({ roles }: ProtectedRouteProps) => {
  const session = useAuthStore((state) => state.session);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const signOut = useAuthStore((state) => state.signOut);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!accessToken || !refreshToken || session) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const hydrate = async () => {
      setError(null);
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('Session restore timed out. Check your connection and try again.')), SESSION_RESTORE_TIMEOUT_MS);
        });

        await Promise.race([
          AuthManager.GetSession({}),
          timeout,
        ]);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Unable to restore your session.');
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    hydrate();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, refreshToken, session, retryKey]);

  if (!accessToken || !refreshToken) {
    return <Navigate to="/" replace />;
  }

  if (!session) {
    if (error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
          <section className="w-full max-w-md space-y-4">
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
            >
              {error}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRetryKey((value) => value + 1)}>
                Retry
              </Button>
              <Button variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div
            aria-hidden="true"
            className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          />
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (roles && !roles.some((role) => session.Roles?.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
