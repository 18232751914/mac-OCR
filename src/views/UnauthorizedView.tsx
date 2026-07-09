import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link as RouterLink } from 'react-router-dom';

const UnauthorizedView = () => {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center">
        <Card className="w-full border-border/70 bg-card shadow-sm">
          <CardContent className="space-y-5 p-8 sm:p-10">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Unauthorized
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                You do not have permission to access this page.
              </p>
            </div>

            <Button asChild>
              <RouterLink to="/">Go home</RouterLink>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default UnauthorizedView;
