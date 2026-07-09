import ErrorBoundary from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import Routes from '@/routes/Routes';
import { useTheme } from '@/lib/useTheme';

/**
 * 文件：src/App.tsx
 * 职责：根组件。包裹 ErrorBoundary + TooltipProvider 并渲染 Routes，
 *       同时挂载 useTheme 以应用动态主题。
 * 依赖：react、@/components/ErrorBoundary、@/components/ui/tooltip、@/routes/Routes、@/lib/useTheme
 * 导出：默认 MainApp
 */

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
