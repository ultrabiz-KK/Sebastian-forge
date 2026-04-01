import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, PenLine, ListTodo, Calendar,
  FileText, BookOpen, Settings, Sun, Moon, Sunset,
} from 'lucide-react';
import { type Theme, loadAndApplyTheme, saveTheme } from '../../lib/theme';
import { toggleDemoMode, isDemoMode } from '../../lib/demoMode';


const NAV_GROUPS = [
  {
    items: [
      { to: '/', icon: <LayoutDashboard size={15} />, label: 'ホーム', end: true },
      { to: '/memo', icon: <PenLine size={15} />, label: '今日のメモ' },
      { to: '/tasks', icon: <ListTodo size={15} />, label: 'タスク' },
      { to: '/calendar', icon: <Calendar size={15} />, label: '週スケジュール' },
    ],
  },
  {
    label: 'レポート',
    items: [
      { to: '/reports/daily', icon: <FileText size={15} />, label: '日報' },
      { to: '/reports/weekly', icon: <BookOpen size={15} />, label: '週報' },
    ],
  },
  {
    items: [
      { to: '/settings', icon: <Settings size={15} />, label: '設定' },
    ],
  },
];

const THEMES: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: 'light', icon: <Sun size={12} />, label: 'ライト' },
  { value: 'dark',  icon: <Moon size={12} />, label: 'ダーク' },
  { value: 'sepia', icon: <Sunset size={12} />, label: 'セピア' },
];

const SIDEBAR_BG    = 'var(--sidebar-bg)';
const SIDEBAR_DIVIDER = 'var(--sidebar-divider)';
const GOLD          = 'var(--sidebar-gold)';
const IVORY         = 'var(--sidebar-ivory)';

interface Props {
  onDemoToggle?: () => void;
}

export function Sidebar({ onDemoToggle }: Props) {
  const [theme, setTheme] = useState<Theme>('light');
  const [demo, setDemo] = useState(isDemoMode());

  useEffect(() => {
    loadAndApplyTheme().then(setTheme).catch(console.warn);
  }, []);

  const handleTheme = async (t: Theme) => {
    setTheme(t);
    await saveTheme(t);
  };

  return (
    <aside
      className="w-56 h-screen flex flex-col flex-shrink-0 select-none"
      style={{ backgroundColor: SIDEBAR_BG }}
    >
      {/* ─── ロゴ / メダリオン ─── */}
      <div
        className="px-5 py-5 flex items-center gap-3.5"
        style={{ borderBottom: `1px solid ${SIDEBAR_DIVIDER}` }}
      >
        {/* 二重円メダリオン */}
        <div className="relative flex-shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-display text-sm font-semibold"
            style={{
              backgroundColor: 'var(--sidebar-mid, #1a2540)',
              border: `1.5px solid ${GOLD}`,
              color: GOLD,
            }}
          >
            S
          </div>
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ inset: '-4px', border: `1px solid rgba(201,164,86,0.22)` }}
          />
        </div>
        <h1
          className="font-display text-[13px] tracking-[0.18em] uppercase"
          style={{ color: IVORY }}
        >
          Sebastian
        </h1>
      </div>

      {/* ─── ナビゲーション ─── */}
      <nav className="flex-1 py-5 px-3 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p
                className="font-display text-[9px] tracking-[0.25em] uppercase px-3 mb-2.5"
                style={{ color: 'rgba(212,201,168,0.28)' }}
              >
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={'end' in link ? link.end : false}
                  style={({ isActive }: { isActive: boolean }) => isActive
                    ? { borderColor: GOLD, color: GOLD }
                    : { borderColor: 'transparent', color: 'var(--sidebar-text-dim)' }
                  }
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 pl-2 pr-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 border-l-2 ${
                      isActive
                        ? 'bg-white/10'
                        : 'hover:bg-white/[0.04]'
                    }`
                  }
                >
                  <span className="flex-shrink-0 ml-1">{link.icon}</span>
                  <span className="font-serif tracking-wide">{link.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ─── 執事イラスト ─── */}
      <div className="relative w-full overflow-hidden flex-shrink-0" style={{ height: '260px' }}>
        <img
          src="/sebastian-butler.png"
          alt=""
          aria-hidden="true"
          className="butler-img absolute bottom-0 left-1/2 -translate-x-1/2 select-none"
          style={{
            height: '260px',
            width: 'auto',
            opacity: 0.75,
          }}
          draggable={false}
        />
        {/* 下端フェード */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 h-10 pointer-events-none"
          style={{ background: `linear-gradient(to top, ${SIDEBAR_BG} 0%, transparent 100%)` }}
        />
      </div>

      {/* ─── テーマ切り替え ─── */}
      <div
        className="px-3 pt-3 pb-3"
        style={{ borderTop: `1px solid ${SIDEBAR_DIVIDER}` }}
      >
        <div
          className="flex rounded-xl p-1"
          style={{ backgroundColor: 'var(--sidebar-dark, #0d1220)' }}
        >
          {THEMES.map(t => (
            <button
              key={t.value}
              onClick={() => handleTheme(t.value)}
              title={t.label}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-serif transition-all"
              style={
                theme === t.value
                  ? { color: GOLD, backgroundColor: 'rgba(201,164,86,0.13)' }
                  : { color: 'var(--sidebar-text-dim)' }
              }
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── バージョン / デモトグル ─── */}
      <button
        className="px-3 pb-4 text-[11px] text-center font-serif w-full transition-colors"
        style={{ color: demo ? 'var(--sidebar-gold)' : 'rgba(212,201,168,0.2)' }}
        title={demo ? 'デモモード ON — クリックで解除' : 'クリックでデモモード'}
        onClick={() => {
          const next = toggleDemoMode();
          setDemo(next);
          onDemoToggle?.();
        }}
      >
        {demo ? '◆ DEMO MODE ◆' : 'AI Work Supporter v1.0.0'}
      </button>
    </aside>
  );
}
