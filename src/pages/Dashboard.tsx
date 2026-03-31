import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { selectDb } from '../lib/db';
import { getSetting, SETTING_KEYS } from '../lib/settings';
import { ArrowRight, FileText } from 'lucide-react';
import { MorningBriefingModal } from '../components/MorningBriefingModal';

interface TaskSummary {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

export default function Dashboard() {
  const [todoCount, setTodoCount] = useState(0);
  const [memoLength, setMemoLength] = useState<number | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskSummary[]>([]);
  const [highPriorityTasks, setHighPriorityTasks] = useState<TaskSummary[]>([]);
  const [reportExists, setReportExists] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), 'M月d日（E）', { locale: ja });

  useEffect(() => {
    async function loadStats() {
      try {
        const [countResult, memoResult, todayTaskResult, highResult, reportResult] = await Promise.all([
          selectDb<{ count: number }>(
            "SELECT COUNT(*) as count FROM tasks WHERE status != 'done'"
          ),
          selectDb<{ content: string }>(
            'SELECT content FROM daily_memos WHERE date = ?',
            [today]
          ),
          selectDb<TaskSummary>(
            "SELECT id, title, status, priority, due_date FROM tasks WHERE due_date = ? AND status != 'done' ORDER BY priority DESC",
            [today]
          ),
          selectDb<TaskSummary>(
            "SELECT id, title, status, priority, due_date FROM tasks WHERE priority = 'high' AND status != 'done' ORDER BY created_at DESC LIMIT 5",
          ),
          selectDb<{ id: number }>(
            'SELECT id FROM reports_daily WHERE date = ?',
            [today]
          ),
        ]);

        setTodoCount(countResult[0]?.count ?? 0);
        setMemoLength(memoResult[0]?.content?.length ?? null);
        setTodayTasks(todayTaskResult);
        setHighPriorityTasks(highResult);
        setReportExists(reportResult.length > 0);
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    }
    loadStats();
  }, [today]);

  // 朝のブリーフィング: 今日まだ表示していなければ表示
  useEffect(() => {
    async function checkBriefing() {
      try {
        const lastDate = await getSetting(SETTING_KEYS.LAST_BRIEFING_DATE);
        if (lastDate !== today) {
          setShowBriefing(true);
        }
      } catch (e) {
        console.error('ブリーフィングチェック失敗:', e);
      }
    }
    checkBriefing();
  }, [today]);

  const PRIORITY_COLOR: Record<string, string> = {
    high: 'bg-red-50 text-red-600',
    medium: 'bg-blue-50 text-blue-600',
    low: 'bg-gray-100 text-gray-500',
    none: 'bg-gray-50 text-gray-400',
  };

  const PRIORITY_LABEL: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低',
    none: '',
  };

  const memoUnorganized = (memoLength ?? 0) > 0 && !reportExists;

  return (
    <div className="space-y-6">
      {showBriefing && (
        <MorningBriefingModal onDismiss={() => setShowBriefing(false)} />
      )}

      <header className="mb-6">
        <h2 className="text-sm font-medium text-sebastian-gray mb-1">DASHBOARD</h2>
        <h1 className="text-3xl font-serif text-sebastian-navy">
          お疲れ様です、<span className="font-sans">{todayLabel}</span>の状況です。
        </h1>
      </header>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/tasks" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:border-sebastian-lightgray transition-colors">
          <h3 className="text-gray-500 text-sm font-medium">未完了タスク</h3>
          <p className="text-4xl font-light text-sebastian-navy mt-2">
            {todoCount}
            <span className="text-base text-gray-400 ml-2">件</span>
          </p>
        </Link>

        <Link to="/memo" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:border-sebastian-lightgray transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 text-sm font-medium">本日のメモ</h3>
            {memoUnorganized && (
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded">
                未整理
              </span>
            )}
          </div>
          <p className="text-4xl font-light text-sebastian-navy mt-2">
            {memoLength === null ? (
              <span className="text-2xl text-gray-300">未記録</span>
            ) : (
              <>
                {memoLength}
                <span className="text-base text-gray-400 ml-2">文字</span>
              </>
            )}
          </p>
        </Link>

        <Link
          to="/reports/daily"
          className={`p-5 rounded-xl shadow-sm border transition-colors ${
            reportExists
              ? 'bg-green-50 border-green-100 hover:border-green-200'
              : 'bg-white border-gray-100 hover:border-sebastian-lightgray'
          }`}
        >
          <h3 className="text-gray-500 text-sm font-medium">本日の日報</h3>
          <p className={`text-xl font-medium mt-2 flex items-center gap-2 ${reportExists ? 'text-green-600' : 'text-sebastian-gray'}`}>
            {reportExists ? '承認済' : '未作成'}
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            {reportExists ? '内容を確認する' : '1日を締める'}
            <ArrowRight size={11} />
          </p>
        </Link>
      </div>

      {/* 今日の予定・ブリーフィング */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-sebastian-navy mb-3 flex items-center justify-between">
            今日が期日のタスク
            <Link to="/tasks" className="text-xs text-sebastian-lightgray hover:text-sebastian-navy flex items-center gap-0.5">
              すべて <ArrowRight size={11} />
            </Link>
          </h3>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-gray-400">本日期日のタスクはありません</p>
          ) : (
            <ul className="space-y-2">
              {todayTasks.map(t => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority]}`}>
                    {PRIORITY_LABEL[t.priority] || '—'}
                  </span>
                  {t.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-sebastian-navy mb-3 flex items-center justify-between">
            優先度が高いタスク
            <Link to="/tasks" className="text-xs text-sebastian-lightgray hover:text-sebastian-navy flex items-center gap-0.5">
              すべて <ArrowRight size={11} />
            </Link>
          </h3>
          {highPriorityTasks.length === 0 ? (
            <p className="text-sm text-gray-400">優先度が高いタスクはありません</p>
          ) : (
            <ul className="space-y-2">
              {highPriorityTasks.map(t => (
                <li key={t.id} className="text-sm text-gray-700 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  {t.title}
                  {t.due_date && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {format(new Date(t.due_date + 'T00:00:00'), 'M/d')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 1日を締めるCTA */}
      {!reportExists && (
        <Link
          to="/reports/daily"
          className="flex items-center justify-between bg-sebastian-navy text-sebastian-ivory rounded-xl p-5 hover:bg-sebastian-dark transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-sebastian-ivory/70" />
            <div>
              <p className="font-medium">本日の業務を締めますか？</p>
              <p className="text-sm text-sebastian-ivory/60 mt-0.5">
                セバスチャンが本日のメモとタスクから日報案を整えます
              </p>
            </div>
          </div>
          <ArrowRight size={20} className="text-sebastian-ivory/50" />
        </Link>
      )}
    </div>
  );
}
