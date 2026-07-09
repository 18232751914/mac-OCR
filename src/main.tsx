/**
 * 文件：src/main.tsx
 * 职责：React 应用入口。挂载 <MainApp/> 到 #root，并引入全局样式 default.css。
 *       （React.StrictMode 默认关闭，注释中保留以便需要时开启。）
 * 依赖：react-dom、./App、./default.css
 * 导出：无
 */

import ReactDOM from 'react-dom/client';
import MainApp from './App';
import './default.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <MainApp />
  // </React.StrictMode>
);
