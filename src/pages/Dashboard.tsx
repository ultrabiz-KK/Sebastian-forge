import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { selectDb } from '../lib/db';
import { getSetting, SETTING_KEYS } from '../lib/settings';
import { ArrowRight, FileText, Pin, AlertCircle } from 'lucide-react';
import { MorningBriefingModal } from '../components/MorningBriefingModal';
import { OrnateCard, CardHeading } from '../components/ClassicUI';
import { TaskPeekModal } from '../components/TaskPeekModal';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../lib/constants';
import { loadDailyMemoContent, loadDailyReportExists } from '../lib/queries';

interface TaskSummary {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface CategorySummary {
  category: string;
  total: number;
  done_count: number;
}


export default function Dashboard() {
  const [todoCount, setTodoCount] = useState(0);
  const [memoLength, setMemoLength] = useState<number | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskSummary[]>([]);
  const [highPriorityTasks, setHighPriorityTasks] = useState<TaskSummary[]>([]);
  const [pinnedTasks, setPinnedTasks] = useState<TaskSummary[]>([]);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [reportExists, setReportExists] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [peekTaskId, setPeekTaskId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), 'M月d日（E）', { locale: ja });

  useEffect(() => {
    async function loadStats() {
      try {
        const [countResult, memo, todayTaskResult, highResult, reportExistsResult, pinnedResult, categoryResult] = await Promise.all([
          selectDb<{ count: number }>(
            "SELECT COUNT(*) as count FROM tasks WHERE status != 'done' AND archived = 0"
          ),
          loadDailyMemoContent(today),
          selectDb<TaskSummary>(
            "SELECT id, title, status, priority, due_date FROM tasks WHERE due_date = ? AND status != 'done' AND archived = 0 ORDER BY priority DESC",
            [today]
          ),
          selectDb<TaskSummary>(
            "SELECT id, title, status, priority, due_date FROM tasks WHERE priority = 'high' AND status != 'done' AND archived = 0 ORDER BY created_at DESC LIMIT 5",
          ),
          loadDailyReportExists(today),
          selectDb<TaskSummary>(
            "SELECT id, title, status, priority, due_date FROM tasks WHERE pinned = 1 AND archived = 0 AND status != 'done' ORDER BY priority DESC, due_date ASC"
          ),
          selectDb<CategorySummary>(
            `SELECT
               COALESCE(category, '未分類') as category,
               COUNT(*) as total,
               SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count
             FROM tasks
             WHERE archived = 0
             GROUP BY category
             ORDER BY total DESC
             LIMIT 8`
          ),
        ]);

        setTodoCount(countResult[0]?.count ?? 0);
        setMemoLength(memo !== null ? memo.length : null);
        setTodayTasks(todayTaskResult);
        setHighPriorityTasks(highResult);
        setReportExists(reportExistsResult);
        setPinnedTasks(pinnedResult);
        setCategorySummary(categoryResult);
      } catch (e) {
        console.error('Failed to load stats', e);
        setLoadError('データの読み込みに失敗しました。アプリを再起動してください。');
      }
    }
    loadStats();
  }, [today]);

  useEffect(() => {
    async function checkBriefing() {
      try {
        const lastDate = await getSetting(SETTING_KEYS.LAST_BRIEFING_DATE);
        if (lastDate !== today) setShowBriefing(true);
      } catch (e) {
        console.error('ブリーフィングチェック失敗:', e);
      }
    }
    checkBriefing();
  }, [today]);

  const memoUnorganized = (memoLength ?? 0) > 0 && !reportExists;

  return (
    <div className="space-y-6">
      {showBriefing && (
        <MorningBriefingModal onDismiss={() => setShowBriefing(false)} />
      )}
      {peekTaskId !== null && (
        <TaskPeekModal taskId={peekTaskId} onClose={() => setPeekTaskId(null)} />
      )}

      {loadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {/* ─── ページヘッダー ─── */}
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-display tracking-[0.22em] text-sebastian-gray uppercase shrink-0">
            Dashboard
          </span>
          <div className="flex-1 h-px bg-sebastian-gold/20" />
          <span className="text-sebastian-gold/45 text-[10px] shrink-0">◆</span>
          <div className="w-10 h-px bg-sebastian-gold/20" />
        </div>
        <h1 className="text-3xl font-serif text-sebastian-navy">
          お疲れ様です、{todayLabel}の状況です。
        </h1>
      </header>

      {/* ─── サマリーカード ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/tasks">
          <OrnateCard className="p-5 hover:border-sebastian-gold/40 transition-colors">
            <p className="text-xs font-display tracking-wider text-sebastian-gray uppercase">未完了タスク</p>
            <p className="text-4xl font-light text-sebastian-navy mt-2 font-serif">
              {todoCount}
              <span className="text-base text-sebastian-lightgray ml-2">件</span>
            </p>
          </OrnateCard>
        </Link>

        <Link to="/memo">
          <OrnateCard className="p-5 hover:border-sebastian-gold/40 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display tracking-wider text-sebastian-gray uppercase">本日のメモ</p>
              {memoUnorganized && (
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded font-serif">
                  未整理
                </span>
              )}
            </div>
            <p className="text-4xl font-light text-sebastian-navy mt-2 font-serif">
              {memoLength === null ? (
                <span className="text-2xl text-sebastian-lightgray">未記録</span>
              ) : (
                <>
                  {memoLength}
                  <span className="text-base text-sebastian-lightgray ml-2">文字</span>
                </>
              )}
            </p>
          </OrnateCard>
        </Link>

        <Link to="/reports/daily">
          <OrnateCard
            className={`p-5 transition-colors ${
              reportExists
                ? 'hover:border-sebastian-gold/50'
                : 'hover:border-sebastian-gold/40'
            }`}
            style={reportExists ? { backgroundColor: 'rgba(201,164,86,0.06)', borderColor: 'rgba(201,164,86,0.3)' } as React.CSSProperties : undefined}
          >
            <p className="text-xs font-display tracking-wider text-sebastian-gray uppercase">本日の日報</p>
            <p className={`text-xl font-medium mt-2 font-serif ${reportExists ? 'text-sebastian-gold-dark' : 'text-sebastian-gray'}`}>
              {reportExists ? '✦ 承認済' : '未作成'}
            </p>
            <p className="text-xs text-sebastian-lightgray mt-1 flex items-center gap-1">
              {reportExists ? '内容を確認する' : '1日を締める'}
              <ArrowRight size={11} />
            </p>
          </OrnateCard>
        </Link>
      </div>

      {/* ─── 本日の注力（ピン留め） ─── */}
      {pinnedTasks.length > 0 && (
        <OrnateCard className="p-5">
          <CardHeading>
            <span className="flex items-center gap-1.5"><Pin size={13} />本日の注力</span>
          </CardHeading>
          <ul className="space-y-2">
            {pinnedTasks.map(t => (
              <li
                key={t.id}
                className="flex items-center gap-2 text-sm text-sebastian-gray hover:text-sebastian-navy cursor-pointer transition-colors"
                onClick={() => setPeekTaskId(t.id)}
              >
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_COLOR[t.priority]}`}>
                  {PRIORITY_LABEL[t.priority] || '—'}
                </span>
                <span className="flex-1">{t.title}</span>
                {t.due_date && (
                  <span className="text-xs text-sebastian-lightgray flex-shrink-0">
                    {format(new Date(t.due_date + 'T00:00:00'), 'M/d')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-sebastian-lightgray mt-3">
            タスク一覧のピンアイコンで管理できます
          </p>
        </OrnateCard>
      )}

      {/* ─── 今日が期日 / 優先度高 ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrnateCard className="p-5">
          <CardHeading
            action={
              <Link to="/tasks" className="text-xs text-sebastian-lightgray hover:text-sebastian-gold flex items-center gap-0.5 transition-colors">
                すべて <ArrowRight size={11} />
              </Link>
            }
          >
            今日が期日のタスク
          </CardHeading>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-sebastian-lightgray italic">本日期日のタスクはありません</p>
          ) : (
            <ul className="space-y-2">
              {todayTasks.map(t => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-sm text-sebastian-gray hover:text-sebastian-navy cursor-pointer transition-colors"
                  onClick={() => setPeekTaskId(t.id)}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority]}`}>
                    {PRIORITY_LABEL[t.priority] || '—'}
                  </span>
                  {t.title}
                </li>
              ))}
            </ul>
          )}
        </OrnateCard>

        <OrnateCard className="p-5">
          <CardHeading
            action={
              <Link to="/tasks" className="text-xs text-sebastian-lightgray hover:text-sebastian-gold flex items-center gap-0.5 transition-colors">
                すべて <ArrowRight size={11} />
              </Link>
            }
          >
            優先度が高いタスク
          </CardHeading>
          {highPriorityTasks.length === 0 ? (
            <p className="text-sm text-sebastian-lightgray italic">優先度が高いタスクはありません</p>
          ) : (
            <ul className="space-y-2">
              {highPriorityTasks.map(t => (
                <li
                  key={t.id}
                  className="text-sm text-sebastian-gray flex items-center gap-2 hover:text-sebastian-navy cursor-pointer transition-colors"
                  onClick={() => setPeekTaskId(t.id)}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sebastian-gold/60 flex-shrink-0" />
                  {t.title}
                  {t.due_date && (
                    <span className="text-xs text-sebastian-lightgray ml-auto">
                      {format(new Date(t.due_date + 'T00:00:00'), 'M/d')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </OrnateCard>
      </div>

      {/* ─── カテゴリ別稼働サマリ ─── */}
      {categorySummary.length > 0 && (
        <OrnateCard className="p-5">
          <CardHeading>カテゴリ別サマリ</CardHeading>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categorySummary.map(c => {
              const pct = c.total > 0 ? Math.round((c.done_count / c.total) * 100) : 0;
              return (
                <div key={c.category} className="bg-sebastian-parchment/60 rounded-lg p-3 border border-sebastian-border/50">
                  <p className="text-xs font-medium text-sebastian-gray truncate mb-2">{c.category}</p>
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-xs text-sebastian-lightgray">{c.done_count}/{c.total}</span>
                    <span className="text-xs font-medium text-sebastian-gold-dark">{pct}%</span>
                  </div>
                  <div className="h-1 bg-sebastian-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sebastian-gold rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </OrnateCard>
      )}

      {/* ─── 1日を締めるCTA ─── */}
      {!reportExists && (
        <Link
          to="/reports/daily"
          className="flex items-center justify-between rounded-xl p-5 transition-colors border"
          style={{
            backgroundColor: '#131929',
            borderColor: 'rgba(201,164,86,0.3)',
            color: '#d4c9a8',
          }}
        >
          <div className="flex items-center gap-3">
            <FileText size={20} style={{ color: 'rgba(201,164,86,0.6)' }} />
            <div>
              <p className="font-serif font-medium">本日の業務を締めますか？</p>
              <p className="text-sm mt-0.5 font-serif" style={{ color: 'rgba(212,201,168,0.55)' }}>
                セバスチャンが本日のメモとタスクから日報案を整えます
              </p>
            </div>
          </div>
          <ArrowRight size={20} style={{ color: 'rgba(201,164,86,0.5)' }} />
        </Link>
      )}
    </div>
  );
}
