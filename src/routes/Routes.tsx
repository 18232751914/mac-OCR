import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
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
