/**
 * 文件：src/routes/Routes.tsx
 * 职责：应用路由表。index 渲染 DesktopShellView；/unauthorized 与 * 分别为
 *       无权限页与 404 页，全部包在 BrowserRouter 内。
 * 依赖：react-router-dom、@/views/*
 * 导出：默认 AppRoutes
 */

import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import DesktopShellView from '@/views/DesktopShellView';
import NotFoundView from '@/views/NotFoundView';
import UnauthorizedView from '@/views/UnauthorizedView';

const AppRoutes = () => {
  return (
    <Router>
      <Routes>
        <Route index element={<DesktopShellView />} />
        <Route path="/unauthorized" element={<UnauthorizedView />} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </Router>
  );
};

export default AppRoutes;
