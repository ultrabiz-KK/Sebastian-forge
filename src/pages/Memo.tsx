import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { executeDb, selectDb } from '../lib/db';

export default function Memo() {
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'typing' | 'saving' | 'saved' | 'error'>('idle');
  const [reportExists, setReportExists] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    async function loadMemo() {
      try {
        const [rows, reportRows] = await Promise.all([
          selectDb<{ content: string }>(
            'SELECT content FROM daily_memos WHERE date = ?',
            [today]
          ),
          selectDb<{ id: number }>(
            'SELECT id FROM reports_daily WHERE date = ?',
            [today]
          ),
        ]);
        if (rows.length > 0) {
          setContent(rows[0].content);
          setSaveStatus('saved');
        } else {
          setSaveStatus('idle');
        }
        setReportExists(reportRows.length > 0);
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
    idle: 'text-gray-300',
    typing: 'text-gray-400',
    saving: 'text-gray-400',
    saved: 'text-green-500',
    error: 'text-red-400',
  };

  const charCount = content.length;
  const memoUnorganized = charCount > 0 && !reportExists;

  return (
    <div className="h-full flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-sebastian-gray mb-1">MEMO</h2>
          <h1 className="text-2xl font-serif text-sebastian-navy">本日の記録（<span className="font-sans">{today}</span>）</h1>
        </div>
        <div className="text-right">
          <div className={`text-sm ${statusColor[saveStatus]}`}>{statusText[saveStatus]}</div>
          {charCount > 0 && (
            <div className="text-xs text-gray-300 mt-0.5">{charCount} 文字</div>
          )}
        </div>
      </header>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-h-0">
        <textarea
          className="w-full h-full resize-none outline-none text-gray-700 leading-relaxed bg-transparent text-sm"
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
