import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, CheckCircle, AlertCircle, Pencil } from 'lucide-react';
import { selectDb, executeDb } from '../lib/db';
import { PageHeader, OrnateCard, CardHeading } from '../components/ClassicUI';
import { generateDailyReport, extractTaskCandidates, type TaskLogEntry, type TaskEntry, type TaskCandidate } from '../lib/ai';
import { getSetting, SETTING_KEYS } from '../lib/settings';
import { TaskCandidatesPanel } from '../components/TaskCandidatesPanel';
import { GeneratingAnimation } from '../components/GeneratingAnimation';

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
      <PageHeader label="DAILY REPORT" title={<>日報 — <span className="font-sans text-2xl">{today}</span></>} />

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
          <OrnateCard className="p-6">
            <pre className="whitespace-pre-wrap text-sm text-sebastian-text leading-relaxed font-sans">
              {savedContent}
            </pre>
          </OrnateCard>

          {/* タスク候補抽出セクション */}
          <OrnateCard className="p-5">
            <CardHeading
              action={candidateState === 'idle' ? (
                <button
                  onClick={handleExtractCandidates}
                  className="flex items-center gap-1.5 text-xs text-sebastian-lightgray hover:text-sebastian-gold transition-colors font-serif"
                >
                  <Sparkles size={12} />
                  タスク候補を抽出する
                </button>
              ) : undefined}
            >
              メモからタスクを追加しますか？
            </CardHeading>

            {candidateState === 'extracting' && (
              <div className="flex items-center gap-2 text-sm text-sebastian-gray bg-sebastian-parchment/50 rounded-xl p-4 font-serif">
                <Sparkles size={15} className="animate-pulse text-sebastian-gold" />
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
                className="text-xs text-sebastian-lightgray hover:text-sebastian-gray flex items-center gap-1 transition-colors font-serif"
              >
                <Sparkles size={11} />
                再度抽出する
              </button>
            )}
          </OrnateCard>
        </div>
      )}

      {/* 未生成 */}
      {pageState === 'idle' && (
        <OrnateCard className="p-10 text-center">
          <div className="space-y-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: 'rgba(201,164,86,0.1)', border: '1px solid rgba(201,164,86,0.3)' }}>
              <Sparkles size={24} style={{ color: '#c9a456' }} />
            </div>
            <div>
              <p className="font-serif text-sebastian-navy text-xl">本日の業務を締めますか？</p>
              <p className="text-sm text-sebastian-gray mt-2 font-serif">
                本日のメモとタスク変更から、セバスチャンが日報案を整えます。
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="px-8 py-2.5 rounded-lg text-sm font-serif transition-colors"
              style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
            >
              日報案を生成する
            </button>
            <p className="text-xs text-sebastian-lightgray font-serif">{savePathNote}</p>
          </div>
        </OrnateCard>
      )}

      {/* 生成中 */}
      {pageState === 'generating' && (
        <OrnateCard>
          <GeneratingAnimation reportType="daily" />
        </OrnateCard>
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
            className="w-full h-96 bg-white border border-sebastian-border rounded-xl p-4 text-sm text-sebastian-text leading-relaxed outline-none focus:border-sebastian-gold/50 resize-none transition-colors font-mono"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={pageState === 'saving'}
          />

          <div className="flex gap-3">
            <button
              onClick={() => handleApprove(draft)}
              disabled={pageState === 'saving'}
              className="flex-1 rounded-lg py-2.5 font-serif transition-colors disabled:opacity-60 text-sm"
              style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
            >
              {pageState === 'saving' ? '保存中...' : '承認・保存する'}
            </button>
            <button
              onClick={() => { setPageState('idle'); setDraft(''); }}
              disabled={pageState === 'saving'}
              className="px-5 bg-sebastian-border/30 text-sebastian-gray rounded-lg py-2.5 font-serif hover:bg-sebastian-border/50 transition-colors disabled:opacity-60 text-sm"
            >
              やり直す
            </button>
          </div>

          <p className="text-xs text-sebastian-lightgray text-center font-serif">{savePathNote}</p>
        </div>
      )}
    </div>
  );
}
