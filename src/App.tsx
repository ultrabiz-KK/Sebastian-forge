import { useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { registerShortcut } from './lib/shortcut';
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
import { loadAndApplyTheme } from './lib/theme';
import { isUnlocked } from './lib/session';
import { UnlockModal } from './components/UnlockModal';

function AppRoutes() {
  const navigate = useNavigate();
  const lastReminderRef = useRef('');

  // テーマ初期適用
  useEffect(() => {
    loadAndApplyTheme().catch(console.warn);
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const openMemo = async () => {
      await appWindow.show();
      await appWindow.setFocus();
      navigate('/memo');
    };

    // 起動時にショートカットを登録
    async function setupShortcut() {
      const shortcut = await getSetting(SETTING_KEYS.GLOBAL_SHORTCUT) ?? 'Ctrl+Shift+M';
      await registerShortcut(shortcut, openMemo);
    }
    setupShortcut();

    // 設定変更時に再登録
    const handleShortcutChanged = (e: Event) => {
      const newKey = (e as CustomEvent<string>).detail;
      registerShortcut(newKey, openMemo);
    };
    window.addEventListener('sebastian:shortcut-changed', handleShortcutChanged);
    return () => window.removeEventListener('sebastian:shortcut-changed', handleShortcutChanged);
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
  const [showUnlock, setShowUnlock] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function checkPassword() {
      const hash = await getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH);
      if (hash && !isUnlocked()) {
        setShowUnlock(true);
      }
      setInitialized(true);
    }
    checkPassword().catch(console.error);
  }, []);

  if (!initialized) {
    return null;
  }

  if (showUnlock) {
    return <UnlockModal onUnlock={() => setShowUnlock(false)} />;
  }

  return <AppRoutes />;
}
