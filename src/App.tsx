import ErrorBoundary from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import Routes from '@/routes/Routes';
import { useTheme } from '@/lib/useTheme';

/**
 * Root Application Component
 * @component MainApp
 */
const MainApp = () => {
  useTheme();
  return (
    <ErrorBoundary name="App">
      <TooltipProvider>
        <Routes />
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default MainApp;
