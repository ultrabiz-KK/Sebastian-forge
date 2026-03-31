import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, CheckCircle, AlertCircle, Pencil } from 'lucide-react';
import { selectDb, executeDb } from '../lib/db';
import { generateDailyReport, extractTaskCandidates, type TaskLogEntry, type TaskEntry, type TaskCandidate } from '../lib/ai';
import { getSetting, SETTING_KEYS } from '../lib/settings';
import { TaskCandidatesPanel } from '../components/TaskCandidatesPanel';

type PageState = 'idle' | 'generating' | 'draft' | 'saving' | 'saved';
type CandidateState = 'idle' | 'extracting' | 'ready' | 'done';

export default function DailyReport() {
  const [pageState, setPageState] = useState<PageState>('idle');
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [savePath, setSavePath] = useState('');

  const [candidateState, setCandidateState] = useState<CandidateState>('idle');
  const [candidates, setCandidates] = useState<TaskCandidate[]>([]);
  const [memoContent, setMemoContent] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    async function init() {
      const [reportRows, memoRows, path] = await Promise.all([
        selectDb<{ content: string }>('SELECT content FROM reports_daily WHERE date = ?', [today]),
        selectDb<{ content: string }>('SELECT content FROM daily_memos WHERE date = ?', [today]),
        getSetting(SETTING_KEYS.DAILY_REPORT_PATH),
      ]);
      if (reportRows.length > 0) {
        setSavedContent(reportRows[0].content);
        setPageState('saved');
      }
      setMemoContent(memoRows[0]?.content ?? '');
      setSavePath(path ?? '');
    }
    init();
  }, [today]);

  const handleGenerate = async () => {
    setPageState('generating');
    setErrorMsg('');
    try {
      const [memoRows, taskLogs, tasks] = await Promise.all([
        selectDb<{ content: string }>('SELECT content FROM daily_memos WHERE date = ?', [today]),
        selectDb<TaskLogEntry>(
          'SELECT task_id, action_type, before_json, after_json, actor_type, note, created_at FROM task_logs WHERE DATE(created_at) = ? ORDER BY created_at ASC',
          [today]
        ),
        selectDb<TaskEntry>('SELECT id, title, status, priority, category FROM tasks ORDER BY created_at DESC'),
      ]);

      const memo = memoRows[0]?.content ?? '';
      setMemoContent(memo);

      const generated = await generateDailyReport({
        date: today,
        memoContent: memo,
        taskLogs,
        activeTasks: tasks,
      });

      setDraft(generated);
      setPageState('draft');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setPageState('idle');
    }
  };

  const handleApprove = async (content: string) => {
    setPageState('saving');
    setErrorMsg('');
    try {
      await executeDb(
        `INSERT INTO reports_daily (date, content) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP`,
        [today, content]
      );

      if (savePath) {
        const fileName = `Nippo_${today.replace(/-/g, '')}.md`;
        const filePath = `${savePath}/${fileName}`.replace(/\\/g, '/');
        await invoke<void>('write_text_file', { path: filePath, content });
      }

      setSavedContent(content);
      setDraft('');
      setPageState('saved');
      setCandidateState('idle');
      setCandidates([]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
      setPageState('draft');
    }
  };

  const handleExtractCandidates = async () => {
    setCandidateState('extracting');
    setErrorMsg('');
    try {
      const tasks = await selectDb<TaskEntry>('SELECT id, title, status, priority, category FROM tasks ORDER BY created_at DESC');
      const result = await extractTaskCandidates(memoContent, tasks, today);
      setCandidates(result);
      setCandidateState('ready');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setCandidateState('idle');
    }
  };

  const savePathNote = savePath
    ? `保存先: ${savePath}/Nippo_${today.replace(/-/g, '')}.md`
    : '※ 設定から保存先フォルダを指定するとMarkdownファイルも保存されます';

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h2 className="text-sm font-medium text-sebastian-gray mb-1">DAILY REPORT</h2>
        <h1 className="text-2xl font-serif text-sebastian-navy">日報 — <span className="font-sans">{today}</span></h1>
      </header>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{errorMsg}</span>
        </div>
      )}

      {/* 承認済み */}
      {pageState === 'saved' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle size={16} />
              本日の日報は承認済みです
            </div>
            <button
              onClick={() => { setDraft(savedContent); setPageState('draft'); setCandidateState('idle'); }}
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

          {/* タスク候補抽出セクション */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-sebastian-gray font-medium">メモからタスクを追加しますか？</p>
              {candidateState === 'idle' && (
                <button
                  onClick={handleExtractCandidates}
                  className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-600 px-4 py-1.5 rounded-lg hover:border-sebastian-lightgray hover:text-sebastian-navy transition-colors"
                >
                  <Sparkles size={14} />
                  タスク候補を抽出する
                </button>
              )}
            </div>

            {candidateState === 'extracting' && (
              <div className="flex items-center gap-2 text-sm text-sebastian-gray bg-gray-50 rounded-xl p-4">
                <Sparkles size={15} className="animate-pulse" />
                セバスチャンがメモからタスク候補を抽出しています...
              </div>
            )}

            {candidateState === 'ready' && (
              <TaskCandidatesPanel
                candidates={candidates}
                sourceDate={today}
                onApplied={() => setCandidateState('done')}
              />
            )}

            {candidateState === 'done' && (
              <button
                onClick={handleExtractCandidates}
                className="text-xs text-gray-400 hover:text-sebastian-gray flex items-center gap-1 transition-colors"
              >
                <Sparkles size={11} />
                再度抽出する
              </button>
            )}
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
            <p className="font-serif text-sebastian-navy text-xl">本日の業務を締めますか？</p>
            <p className="text-sm text-gray-500 mt-2">
              本日のメモとタスク変更から、セバスチャンが日報案を整えます。
            </p>
          </div>
          <button
            onClick={handleGenerate}
            className="bg-sebastian-navy text-white px-8 py-2.5 rounded-lg hover:bg-sebastian-dark transition-colors text-sm font-medium"
          >
            日報案を生成する
          </button>
          <p className="text-xs text-gray-400">{savePathNote}</p>
        </div>
      )}

      {/* 生成中 */}
      {pageState === 'generating' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="flex items-center justify-center gap-2 text-sebastian-gray">
            <Sparkles size={18} className="animate-pulse" />
            <span className="text-sm">セバスチャンが日報案を整えています...</span>
          </div>
        </div>
      )}

      {/* ドラフト編集・承認 */}
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
            className="w-full h-96 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed outline-none focus:border-sebastian-lightgray resize-none transition-colors font-mono"
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
