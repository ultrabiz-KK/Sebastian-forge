import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, PenLine, ListTodo, Calendar,
  FileText, BookOpen, Settings, Sun, Moon, Sunset,
} from 'lucide-react';
import { format } from 'date-fns';
import { type Theme, loadAndApplyTheme, saveTheme } from '../../lib/theme';
import { getSetting, setSetting, SETTING_KEYS } from '../../lib/settings';
import { selectDb } from '../../lib/db';
import {
  generateButlerBriefing,
  FALLBACK_BUTLER_BRIEFING,
  type ButlerBriefing,
} from '../../lib/ai';

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

const SIDEBAR_BG      = 'var(--sidebar-bg)';
const SIDEBAR_DIVIDER = 'var(--sidebar-divider)';
const GOLD            = 'var(--sidebar-gold)';
const IVORY           = 'var(--sidebar-ivory)';

function getTimeSlot(hour: number): keyof Omit<ButlerBriefing, 'date'> {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 19) return 'afternoon';
  return 'night';
}

export function Sidebar() {
  const [theme, setTheme] = useState<Theme>('light');

  // ── ブリーフィング
  const [briefing, setBriefing] = useState<ButlerBriefing | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── 吹き出し
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAndApplyTheme().then(setTheme).catch(console.warn);
    loadBriefing();
    return () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  }, []);

  const loadBriefing = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const provider = await getSetting(SETTING_KEYS.AI_PROVIDER);

    // AI無効 → フォールバック固定フレーズ
    if (!provider || provider === 'disabled') {
      setBriefing({ date: today, ...FALLBACK_BUTLER_BRIEFING });
      return;
    }

    // キャッシュ確認（当日生成済みなら再利用）
    const cached = await getSetting(SETTING_KEYS.BUTLER_BRIEFING);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ButlerBriefing;
        if (parsed.date === today && parsed.morning?.length > 0) {
          setBriefing(parsed);
          return;
        }
      } catch {
        // 破損データは再生成
      }
    }

    // AI生成
    setIsGenerating(true);
    try {
      const tasks = await selectDb<{ title: string; priority: string; due_date: string | null }>(
        `SELECT title, priority, due_date FROM tasks
         WHERE archived = 0 AND status != 'done'
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
                  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
                  due_date ASC
         LIMIT 8`
      );
      const generated = await generateButlerBriefing(tasks, today);
      await setSetting(SETTING_KEYS.BUTLER_BRIEFING, JSON.stringify(generated));
      setBriefing(generated);
    } catch (e) {
      console.warn('ブリーフィング生成失敗:', e);
      setBriefing({ date: today, ...FALLBACK_BUTLER_BRIEFING });
    } finally {
      setIsGenerating(false);
    }
  };

  const showBubble = (text: string) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = setTimeout(() => setBubble(null), 5000);
  };

  const handleButlerClick = () => {
    if (isGenerating) {
      showBubble('只今、本日のご報告を準備しております...');
      return;
    }
    if (!briefing) return;

    const slot = getTimeSlot(new Date().getHours());
    const comments = briefing[slot];
    if (comments.length === 0) return;

    const next = comments[Math.floor(Math.random() * comments.length)];
    showBubble(next);
  };

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
                      isActive ? 'bg-white/10' : 'hover:bg-white/[0.04]'
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
      <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ height: '260px' }}>

        {/* 吹き出し */}
        {bubble && (
          <div
            className="absolute bottom-3 left-3 right-3 z-20 rounded-xl px-3 py-2.5 text-[11px] font-serif leading-relaxed shadow-md"
            style={{
              backgroundColor: 'rgba(236,230,212,0.97)',
              border: '1px solid rgba(201,164,86,0.5)',
              color: '#1e2e4a',
            }}
          >
            {/* 上向き三角 */}
            <span
              style={{
                position: 'absolute',
                top: '-7px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                display: 'block',
                width: '12px',
                height: '12px',
                backgroundColor: 'rgba(236,230,212,0.97)',
                borderTop: '1px solid rgba(201,164,86,0.5)',
                borderLeft: '1px solid rgba(201,164,86,0.5)',
              }}
            />
            {bubble}
          </div>
        )}

        {/* イラスト（クリック可能） */}
        <button
          onClick={handleButlerClick}
          className="absolute inset-0 w-full h-full cursor-pointer group"
          title="セバスチャンに話しかける"
          aria-label="セバスチャンに話しかける"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <img
            src="/sebastian-butler.png"
            alt=""
            aria-hidden="true"
            className="butler-img absolute bottom-0 left-1/2 -translate-x-1/2 select-none transition-opacity duration-300"
            style={{
              height: '260px',
              width: 'auto',
              opacity: 0.75,
            }}
            draggable={false}
          />
          {/* ホバーで少し明るく */}
          <span
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center bottom, rgba(201,164,86,0.08) 0%, transparent 70%)',
            }}
          />
        </button>

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

      {/* ─── バージョン ─── */}
      <p
        className="px-3 pb-4 text-[11px] text-center font-serif w-full"
        style={{ color: 'rgba(212,201,168,0.2)' }}
      >
        AI Work Supporter v1.1.1
      </p>
    </aside>
  );
}
