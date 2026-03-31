import React, { useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register } from '@tauri-apps/plugin-global-shortcut';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MainLayout } from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Memo from './pages/Memo';
import Tasks from './pages/Tasks';
import DailyReport from './pages/DailyReport';
import WeeklyCalendar from './pages/WeeklyCalendar';
import WeeklyReport from './pages/WeeklyReport';
import Settings from './pages/Settings';
import { getSetting, SETTING_KEYS } from './lib/settings';
import { selectDb } from './lib/db';

function AppRoutes() {
  const navigate = useNavigate();
  const lastReminderRef = useRef('');

  useEffect(() => {
    const appWindow = getCurrentWindow();

    // グローバルショートカット登録
    async function setupShortcut() {
      const shortcut = await getSetting(SETTING_KEYS.GLOBAL_SHORTCUT) ?? 'Ctrl+Shift+M';
      try {
        await register(shortcut, async () => {
          await appWindow.show();
          await appWindow.setFocus();
          navigate('/memo');
        });
      } catch (e) {
        console.warn('グローバルショートカット登録失敗:', e);
      }
    }
    setupShortcut();
  }, [navigate]);

  // 終業リマインド
  useEffect(() => {
    // 通知許可をリクエスト
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkReminder = async () => {
      try {
        const enabled = await getSetting(SETTING_KEYS.REMINDER_ENABLED);
        if (enabled !== 'true') return;

        const now = new Date();
        const timeKey = format(now, 'yyyy-MM-dd HH:mm');
        if (lastReminderRef.current === timeKey) return;

        const weekdaysOnly = await getSetting(SETTING_KEYS.REMINDER_WEEKDAYS_ONLY);
        const day = now.getDay(); // 0=日, 6=土
        if (weekdaysOnly !== 'false' && (day === 0 || day === 6)) return;

        const reminderTime = (await getSetting(SETTING_KEYS.REMINDER_TIME)) ?? '18:00';
        const [rh, rm] = reminderTime.split(':').map(Number);

        if (now.getHours() === rh && now.getMinutes() === rm) {
          const today = format(now, 'yyyy-MM-dd');
          const reports = await selectDb<{ id: number }>(
            'SELECT id FROM reports_daily WHERE date = ?',
            [today]
          );
          if (reports.length === 0) {
            lastReminderRef.current = timeKey;
            if ('Notification' in window && Notification.permission === 'granted') {
              const notif = new Notification('Sebastian', {
                body: '本日の業務を締めますか？セバスチャンが日報案を整えます。',
              });
              notif.onclick = async () => {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const win = getCurrentWindow();
                await win.show();
                await win.setFocus();
                navigate('/reports/daily');
              };
            }
          }
        }
      } catch (e) {
        console.warn('リマインダーチェック失敗:', e);
      }
    };

    const interval = setInterval(checkReminder, 60_000);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="memo" element={<Memo />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<WeeklyCalendar />} />
        <Route path="reports/daily" element={<DailyReport />} />
        <Route path="reports/weekly" element={<WeeklyReport />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
