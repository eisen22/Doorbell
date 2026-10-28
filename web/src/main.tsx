import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles/tokens.css';
import './styles/app.css';
import { RepoProvider } from './lib/repo';
import { Shell } from './components/Shell';
import { Dashboard } from './pages/Dashboard';
import { Attendance } from './pages/Attendance';
import { Students } from './pages/Students';
import { Scanner } from './pages/Scanner';
import { Reports } from './pages/Reports';
import { Notifications } from './pages/Notifications';
import { SettingsPage } from './pages/Settings';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RepoProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="students" element={<Students />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="reports" element={<Reports />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RepoProvider>
  </React.StrictMode>,
);
