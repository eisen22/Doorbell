import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles/tokens.css';
import './styles/app.css';
import './styles/admin.css';
import { RepoProvider } from './lib/repo';
import { Shell } from './components/Shell';
import { Dashboard } from './pages/Dashboard';
import { Attendance } from './pages/Attendance';
import { Students } from './pages/Students';
import { CalendarPage } from './pages/Calendar';
import { Scanner } from './pages/Scanner';
import { Reports } from './pages/Reports';
import { Notifications } from './pages/Notifications';
import { SettingsPage } from './pages/Settings';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminCalendar } from './pages/admin/AdminCalendar';
import { Sections } from './pages/admin/Sections';
import { Teachers } from './pages/admin/Teachers';
import { AdminStudents } from './pages/admin/AdminStudents';
import { QrCards } from './pages/admin/QrCards';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AuditLog } from './pages/admin/AuditLog';
import { AbsenceWatch } from './pages/admin/AbsenceWatch';
import { Login } from './pages/Login';
import { SmsMessages } from './pages/SmsMessages';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RepoProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="students" element={<Students />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="reports" element={<Reports />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="sms" element={<SmsMessages />} />
            <Route path="admin/sms" element={<SmsMessages />} />
            <Route path="admin/absences" element={<AbsenceWatch />} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/calendar" element={<AdminCalendar />} />
            <Route path="admin/sections" element={<Sections />} />
            <Route path="admin/teachers" element={<Teachers />} />
            <Route path="admin/students" element={<AdminStudents />} />
            <Route path="admin/cards" element={<QrCards />} />
            <Route path="admin/settings" element={<AdminSettings />} />
            <Route path="admin/audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </RepoProvider>
  </React.StrictMode>,
);
