import { Link } from 'react-router-dom';

const NotFoundView = () => {
  return (
    <main className="min-h-screen px-6 py-16 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-xl border bg-card p-8 shadow-sm sm:p-10">
          <span className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">404</span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
            The page you requested does not exist or is no longer available.
          </p>
          <div className="mt-8">
            <Link className="inline-flex items-center font-medium" to="/">
              Return home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default NotFoundView;
