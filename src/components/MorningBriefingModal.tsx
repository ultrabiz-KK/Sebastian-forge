import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { Bell, X, ArrowRight } from 'lucide-react';
import { selectDb } from '../lib/db';
import { setSetting, SETTING_KEYS } from '../lib/settings';

interface TaskBrief {
  id: number;
  title: string;
  priority: string;
  due_date: string | null;
  status: string;
}

interface Props {
  onDismiss: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-50 text-red-600',
  medium: 'bg-blue-50 text-blue-600',
  low: 'bg-gray-100 text-gray-500',
  none: 'bg-gray-50 text-gray-400',
};
const PRIORITY_LABEL: Record<string, string> = {
  high: '高', medium: '中', low: '低', none: '',
};

export function MorningBriefingModal({ onDismiss }: Props) {
  const [todayTasks, setTodayTasks] = useState<TaskBrief[]>([]);
  const [soonTasks, setSoonTasks] = useState<TaskBrief[]>([]);
  const [highTasks, setHighTasks] = useState<TaskBrief[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const in3days = format(addDays(new Date(), 3), 'yyyy-MM-dd');

  useEffect(() => {
    async function load() {
      const [todayResult, soonResult, highResult] = await Promise.all([
        selectDb<TaskBrief>(
          "SELECT id, title, priority, due_date, status FROM tasks WHERE due_date = ? AND status != 'done' ORDER BY priority DESC",
          [today]
        ),
        selectDb<TaskBrief>(
          "SELECT id, title, priority, due_date, status FROM tasks WHERE due_date >= ? AND due_date <= ? AND status != 'done' ORDER BY due_date ASC, priority DESC LIMIT 5",
          [tomorrow, in3days]
        ),
        selectDb<TaskBrief>(
          "SELECT id, title, priority, due_date, status FROM tasks WHERE priority = 'high' AND status != 'done' ORDER BY due_date ASC NULLS LAST LIMIT 5"
        ),
      ]);
      setTodayTasks(todayResult);
      setSoonTasks(soonResult);
      // 高優先度タスクのうち今日期日のものは todayTasks に含まれるので除外
      setHighTasks(highResult.filter(t => t.due_date !== today));
    }
    load().catch(console.error);
  }, [today, tomorrow, in3days]);

  const handleDismiss = async () => {
    await setSetting(SETTING_KEYS.LAST_BRIEFING_DATE, today);
    onDismiss();
  };

  const hasTasks = todayTasks.length > 0 || soonTasks.length > 0 || highTasks.length > 0;

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-sebastian-navy/5 flex items-center justify-center">
              <Bell size={18} className="text-sebastian-navy" />
            </div>
            <div>
              <h2 className="font-serif text-sebastian-navy text-lg">おはようございます</h2>
              <p className="text-xs text-gray-400 mt-0.5">本日の状況をお知らせします</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {!hasTasks && (
            <p className="text-sm text-gray-400 text-center py-6">
              本日期日・優先度の高いタスクはありません。<br />
              <span className="text-xs">良い1日を。</span>
            </p>
          )}

          {todayTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sebastian-gray uppercase tracking-wide mb-2">
                今日が期日
              </h3>
              <ul className="space-y-2">
                {todayTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_COLOR[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority] || '—'}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soonTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sebastian-gray uppercase tracking-wide mb-2">
                3日以内が期日
              </h3>
              <ul className="space-y-2">
                {soonTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_COLOR[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority] || '—'}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {format(new Date(t.due_date + 'T00:00:00'), 'M/d')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {highTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sebastian-gray uppercase tracking-wide mb-2">
                優先度が高いタスク
              </h3>
              <ul className="space-y-2">
                {highTasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {format(new Date(t.due_date + 'T00:00:00'), 'M/d')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-5 border-t border-gray-100 flex items-center gap-3 flex-shrink-0">
          <Link
            to="/tasks"
            onClick={handleDismiss}
            className="flex items-center gap-1 text-sm text-sebastian-gray hover:text-sebastian-navy transition-colors"
          >
            タスク一覧 <ArrowRight size={13} />
          </Link>
          <button
            onClick={handleDismiss}
            className="ml-auto bg-sebastian-navy text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-sebastian-dark transition-colors"
          >
            確認しました
          </button>
        </div>
      </div>
    </div>
  );
}
