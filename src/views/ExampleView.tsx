import { Card, CardContent } from '@/components/ui/card';

/**
 * Temporary starter placeholder for the root route.
 *
 * Replace this view as soon as the application has a real first screen.
 * Do not use this placeholder as a visual style reference, layout pattern,
 * or default posture for product screens. Its centered card/title/description
 * composition only exists so a newly generated project has a harmless page.
 *
 * url: /
 * @page Temporary Placeholder
 */
const HomeView = () => {
  const configuredAppName = import.meta.env.VITE_APP_NAME?.trim();
  const configuredAppDescription = import.meta.env.VITE_APP_DESCRIPTION?.trim();

  const appName = configuredAppName || 'Your App';
  const appDescription =
    configuredAppDescription ||
    'A focused starting point for building something useful.';

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl items-center">
        <Card className="w-full border-border/70 bg-card shadow-sm">
          <CardContent className="p-8 sm:p-12 lg:p-16">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-medium text-muted-foreground">
                Built with CodeBuddy Studio
              </p>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {appName}
              </h1>

              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {appDescription}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default HomeView;
