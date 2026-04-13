import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { executeDb } from '../lib/db';
import { PageHeader } from '../components/ClassicUI';
import { loadDailyMemoContent, loadDailyReportExists } from '../lib/queries';

export default function Memo() {
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'typing' | 'saving' | 'saved' | 'error'>('idle');
  const [reportExists, setReportExists] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    async function loadMemo() {
      try {
        const [memo, reportExistsResult] = await Promise.all([
          loadDailyMemoContent(today),
          loadDailyReportExists(today),
        ]);
        if (memo !== null) {
          setContent(memo);
          setSaveStatus('saved');
        } else {
          setSaveStatus('idle');
        }
        setReportExists(reportExistsResult);
      } catch (err) {
        console.error(err);
      }
    }
    loadMemo();
  }, [today]);

  const saveMemo = async (newContent: string) => {
    setSaveStatus('saving');
    try {
      await executeDb(
        `INSERT INTO daily_memos (date, content) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP`,
        [today, newContent]
      );
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSaveStatus('typing');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveMemo(newContent);
    }, 1000);
  };

  const statusText: Record<typeof saveStatus, string> = {
    idle: '',
    typing: '入力中...',
    saving: '保存中...',
    saved: '保存済',
    error: '保存失敗 — 再入力で再試行',
  };

  const statusColor: Record<typeof saveStatus, string> = {
    idle: 'text-sebastian-lightgray/50',
    typing: 'text-sebastian-lightgray',
    saving: 'text-sebastian-lightgray',
    saved: 'text-green-600',
    error: 'text-red-500',
  };

  const charCount = content.length;
  const memoUnorganized = charCount > 0 && !reportExists;

  return (
    <div className="h-full flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      <div className="flex items-start justify-between mb-4">
        <PageHeader
          label="MEMO"
          title={<>本日の記録（<span className="font-sans text-2xl">{today}</span>）</>}
        />
        <div className="text-right mt-1 shrink-0">
          <div className={`text-sm font-serif ${statusColor[saveStatus]}`}>{statusText[saveStatus]}</div>
          {charCount > 0 && (
            <div className="text-xs text-sebastian-lightgray/60 mt-0.5 font-serif">{charCount} 文字</div>
          )}
        </div>
      </div>

      <div className="relative flex-1 bg-white rounded-xl shadow-sm border border-sebastian-border p-4 min-h-0">
        <span className="absolute top-2.5 left-2.5 w-4 h-4 border-t border-l border-sebastian-gold/30 pointer-events-none rounded-tl-sm" />
        <span className="absolute top-2.5 right-2.5 w-4 h-4 border-t border-r border-sebastian-gold/30 pointer-events-none rounded-tr-sm" />
        <span className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b border-l border-sebastian-gold/30 pointer-events-none rounded-bl-sm" />
        <span className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b border-r border-sebastian-gold/30 pointer-events-none rounded-br-sm" />
        <textarea
          className="w-full h-full resize-none outline-none text-sebastian-text leading-relaxed bg-transparent text-sm font-serif"
          placeholder={`業務の断片、思いついたことなどを自由に入力してください。\nセバスチャンが後で整理します。\n\n例:\n・〇〇さんからTeamsで問い合わせ → 対応済\n・△△の件、週末までに確認が必要\n・研修資料の差し替えを依頼された`}
          value={content}
          onChange={handleChange}
        />
      </div>

      {memoUnorganized && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex-shrink-0">
          <AlertCircle size={13} className="flex-shrink-0" />
          <span>このメモはまだ日報に反映されていません</span>
          <Link
            to="/reports/daily"
            className="ml-auto underline underline-offset-2 hover:text-amber-700 whitespace-nowrap"
          >
            日報を作成する →
          </Link>
        </div>
      )}
    </div>
  );
}
