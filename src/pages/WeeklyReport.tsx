import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ja } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { selectDb, executeDb } from '../lib/db';
import { generateWeeklyReport, type TaskLogEntry, type TaskEntry } from '../lib/ai';
import { getSetting, SETTING_KEYS } from '../lib/settings';

type PageState = 'idle' | 'generating' | 'draft' | 'saving' | 'saved';

export default function WeeklyReport() {
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [pageState, setPageState] = useState<PageState>('idle');
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [savePath, setSavePath] = useState('');
  const [dailyReportStatus, setDailyReportStatus] = useState<Record<string, boolean>>({});

  const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 });
  const weekStartStr = format(selectedWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  useEffect(() => {
    async function init() {
      const [reportRows, path] = await Promise.all([
        selectDb<{ content: string }>(
          'SELECT content FROM reports_weekly WHERE week_start_date = ?',
          [weekStartStr]
        ),
        getSetting(SETTING_KEYS.WEEKLY_REPORT_PATH),
      ]);
      setSavePath(path ?? '');
      if (reportRows.length > 0) {
        setSavedContent(reportRows[0].content);
        setPageState('saved');
      } else {
        setSavedContent('');
        setPageState('idle');
      }
    }

    async function loadDailyStatus() {
      const rows = await selectDb<{ date: string }>(
        'SELECT date FROM reports_daily WHERE date BETWEEN ? AND ?',
        [weekStartStr, weekEndStr]
      );
      const status: Record<string, boolean> = {};
      rows.forEach(r => { status[r.date] = true; });
      setDailyReportStatus(status);
    }

    init();
    loadDailyStatus();
    setDraft('');
  }, [weekStartStr, weekEndStr]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() + i);
    return format(d, 'yyyy-MM-dd');
  });

  const handleGenerate = async () => {
    setPageState('generating');
    setErrorMsg('');
    try {
      const [dailyReports, taskLogs, tasks] = await Promise.all([
        selectDb<{ date: string; content: string }>(
          'SELECT date, content FROM reports_daily WHERE date BETWEEN ? AND ? ORDER BY date ASC',
          [weekStartStr, weekEndStr]
        ),
        selectDb<TaskLogEntry>(
          "SELECT task_id, action_type, before_json, after_json, actor_type, note, created_at FROM task_logs WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at ASC",
          [weekStartStr, weekEndStr]
        ),
        selectDb<TaskEntry>('SELECT id, title, status, priority, category FROM tasks ORDER BY created_at DESC'),
      ]);

      const generated = await generateWeeklyReport({
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        dailyReports,
        taskLogs,
        activeTasks: tasks,
      });

      setDraft(generated);
      setPageState('draft');
    } catch (e) {
      console.error(e);
      setErrorMsg('生成中にエラーが発生しました。再度お試しください。');
      setPageState('idle');
    }
  };

  const handleApprove = async (content: string) => {
    setPageState('saving');
    setErrorMsg('');
    try {
      await executeDb(
        `INSERT INTO reports_weekly (week_start_date, content) VALUES (?, ?)
         ON CONFLICT(week_start_date) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP`,
        [weekStartStr, content]
      );

      if (savePath) {
        const fileName = `Shuho_${weekStartStr.replace(/-/g, '')}.md`;
        const filePath = `${savePath}/${fileName}`.replace(/\\/g, '/');
        await invoke<void>('write_text_file', { path: filePath, content });
      }

      setSavedContent(content);
      setDraft('');
      setPageState('saved');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
      setPageState('draft');
    }
  };

  const savePathNote = savePath
    ? `保存先: ${savePath}/Shuho_${weekStartStr.replace(/-/g, '')}.md`
    : '※ 設定から保存先フォルダを指定するとMarkdownファイルも保存されます';

  const dailyCount = weekDays.filter(d => dailyReportStatus[d]).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-sebastian-gray mb-1">WEEKLY REPORT</h2>
          <h1 className="text-2xl font-serif text-sebastian-navy">週報</h1>
        </div>
        {/* 週選択 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 text-gray-400 hover:text-sebastian-navy hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600 font-medium min-w-[200px] text-center">
            {format(selectedWeekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(weekEnd, 'M月d日', { locale: ja })}
          </span>
          <button
            onClick={() => setSelectedWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 text-gray-400 hover:text-sebastian-navy hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {/* 日報カバレッジ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm text-gray-500 mb-3">今週の日報: {dailyCount} / 5 日分</p>
        <div className="flex gap-1.5">
          {weekDays.slice(0, 5).map((d, i) => {
            const dayName = ['月', '火', '水', '木', '金'][i];
            const exists = dailyReportStatus[d];
            return (
              <div
                key={d}
                className={`flex-1 rounded-lg p-2 text-center text-xs ${
                  exists
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-gray-50 text-gray-400 border border-gray-100'
                }`}
              >
                <div className="font-medium">{dayName}</div>
                <div className="text-xs mt-0.5">{exists ? '✓' : '—'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {/* 承認済み */}
      {pageState === 'saved' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle size={16} />
              週報は承認済みです
            </div>
            <button
              onClick={() => { setDraft(savedContent); setPageState('draft'); }}
              className="flex items-center gap-1.5 text-sm text-sebastian-gray hover:text-sebastian-navy transition-colors"
            >
              <Pencil size={14} />
              再編集
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
              {savedContent}
            </pre>
          </div>
        </div>
      )}

      {/* 未生成 */}
      {pageState === 'idle' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-sebastian-navy/5 flex items-center justify-center mx-auto">
            <Sparkles size={24} className="text-sebastian-navy" />
          </div>
          <div>
            <p className="font-serif text-sebastian-navy text-xl">今週の内容を整理しますか？</p>
            <p className="text-sm text-gray-500 mt-2">
              今週の日報とタスク変更から、セバスチャンが週報案を整えます。
            </p>
          </div>
          <button
            onClick={handleGenerate}
            className="bg-sebastian-navy text-white px-8 py-2.5 rounded-lg hover:bg-sebastian-dark transition-colors text-sm font-medium"
          >
            週報案を生成する
          </button>
          <p className="text-xs text-gray-400">{savePathNote}</p>
        </div>
      )}

      {/* 生成中 */}
      {pageState === 'generating' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="flex items-center justify-center gap-2 text-sebastian-gray">
            <Sparkles size={18} className="animate-pulse" />
            <span className="text-sm">セバスチャンが週報案を整えています...</span>
          </div>
        </div>
      )}

      {/* ドラフト */}
      {(pageState === 'draft' || pageState === 'saving') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-sebastian-gray">内容をご確認・編集のうえ、承認してください。</p>
            <button
              onClick={handleGenerate}
              disabled={pageState === 'saving'}
              className="text-xs text-gray-400 hover:text-sebastian-gray flex items-center gap-1 transition-colors disabled:opacity-40"
            >
              <Sparkles size={12} />
              再生成
            </button>
          </div>

          <textarea
            className="w-full h-[480px] bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed outline-none focus:border-sebastian-lightgray resize-none transition-colors font-mono"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={pageState === 'saving'}
          />

          <div className="flex gap-3">
            <button
              onClick={() => handleApprove(draft)}
              disabled={pageState === 'saving'}
              className="flex-1 bg-sebastian-navy text-white rounded-lg py-2.5 font-medium hover:bg-sebastian-dark transition-colors disabled:opacity-60 text-sm"
            >
              {pageState === 'saving' ? '保存中...' : '承認・保存する'}
            </button>
            <button
              onClick={() => { setPageState('idle'); setDraft(''); }}
              disabled={pageState === 'saving'}
              className="px-5 bg-gray-100 text-gray-600 rounded-lg py-2.5 font-medium hover:bg-gray-200 transition-colors disabled:opacity-60 text-sm"
            >
              やり直す
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">{savePathNote}</p>
        </div>
      )}
    </div>
  );
}
