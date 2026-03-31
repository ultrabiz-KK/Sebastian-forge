import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, RefreshCw, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { executeDb, selectDb } from '../lib/db';
import { logTaskAction } from '../lib/taskLogs';
import { type TaskCandidate } from '../lib/ai';

interface Props {
  candidates: TaskCandidate[];
  sourceDate: string;
  onApplied: () => void;
}

interface FullTask {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  category: string | null;
}

const PRIORITY_LABEL: Record<string, string> = {
  high: '高', medium: '中', low: '低', none: 'なし',
};
const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-50 text-red-600 border-red-100',
  medium: 'bg-blue-50 text-blue-600 border-blue-100',
  low: 'bg-gray-50 text-gray-500 border-gray-100',
  none: 'bg-gray-50 text-gray-400 border-gray-100',
};
const FIELD_LABEL: Record<string, string> = {
  description: '詳細',
  priority: '優先度',
  due_date: '期日',
  category: 'カテゴリ',
};

export function TaskCandidatesPanel({ candidates, sourceDate, onApplied }: Props) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set(candidates.map((_, i) => i)));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [taskDetails, setTaskDetails] = useState<Record<number, FullTask>>({});

  // update候補の現在タスクデータを取得
  useEffect(() => {
    async function fetchDetails() {
      const updateCandidates = candidates.filter(c => c.type === 'update' && c.target_task_id);
      if (updateCandidates.length === 0) return;
      const details: Record<number, FullTask> = {};
      for (const c of updateCandidates) {
        if (!c.target_task_id) continue;
        const rows = await selectDb<FullTask>(
          'SELECT id, title, description, priority, due_date, category FROM tasks WHERE id = ?',
          [c.target_task_id]
        );
        if (rows[0]) details[c.target_task_id] = rows[0];
      }
      setTaskDetails(details);
    }
    fetchDetails().catch(console.error);
  }, [candidates]);

  const toggleCheck = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleApply = async () => {
    setApplying(true);
    setErrorMsg('');
    const selected = candidates.filter((_, i) => checked.has(i));
    try {
      for (const c of selected) {
        if (c.type === 'new') {
          const result = await executeDb(
            'INSERT INTO tasks (title, description, status, priority, due_date, category) VALUES (?, ?, ?, ?, ?, ?)',
            [c.title, c.description || null, 'todo', c.priority, c.due_date || null, c.category || null]
          );
          await logTaskAction({
            taskId: result.lastInsertId as number,
            actionType: 'create',
            afterJson: c,
            actorType: 'ai',
            sourceType: 'daily_report',
            sourceId: sourceDate,
            note: c.reason,
          });
        } else if (c.type === 'update' && c.target_task_id) {
          await executeDb(
            'UPDATE tasks SET description=?, priority=?, due_date=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [c.description || null, c.priority, c.due_date || null, c.category || null, c.target_task_id]
          );
          await logTaskAction({
            taskId: c.target_task_id,
            actionType: 'update',
            beforeJson: taskDetails[c.target_task_id],
            afterJson: c,
            actorType: 'ai',
            sourceType: 'daily_report',
            sourceId: sourceDate,
            note: c.reason,
          });
        }
      }
      setApplied(true);
      onApplied();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`適用に失敗しました: ${msg}`);
    } finally {
      setApplying(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-400 text-center">
        メモからタスク候補は見つかりませんでした
      </div>
    );
  }

  if (applied) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
        <CheckCircle size={16} />
        {checked.size} 件のタスクをタスク一覧に追加しました
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-sebastian-navy">
          <Sparkles size={15} />
          タスク候補をご確認ください（{candidates.length}件）
        </div>
        <div className="flex gap-2 text-xs text-gray-400">
          <button onClick={() => setChecked(new Set(candidates.map((_, i) => i)))} className="hover:text-gray-600">すべて選択</button>
          <span>/</span>
          <button onClick={() => setChecked(new Set())} className="hover:text-gray-600">すべて解除</button>
        </div>
      </div>

      <div className="space-y-2">
        {candidates.map((c, i) => {
          const currentTask = c.type === 'update' && c.target_task_id ? taskDetails[c.target_task_id] : null;
          return (
            <div
              key={i}
              className={`border rounded-xl overflow-hidden transition-colors ${
                checked.has(i) ? 'border-sebastian-lightgray bg-white' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={checked.has(i)}
                  onChange={() => toggleCheck(i)}
                  className="w-4 h-4 accent-sebastian-navy flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      c.type === 'new' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {c.type === 'new' ? '新規' : '更新'}
                    </span>
                    <span className="text-sm text-gray-800 font-medium">{c.title}</span>
                    {c.priority !== 'none' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[c.priority]}`}>
                        優先度: {PRIORITY_LABEL[c.priority]}
                      </span>
                    )}
                    {c.due_date && (
                      <span className="text-xs text-gray-400">期日: {c.due_date}</span>
                    )}
                    {c.category && (
                      <span className="text-xs text-sebastian-lightgray">{c.category}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                >
                  {expandedIdx === i ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>

              {expandedIdx === i && (
                <div className="px-4 pb-3 space-y-3 border-t border-gray-100 pt-3">
                  {/* 差分プレビュー (update候補のみ) */}
                  {c.type === 'update' && currentTask && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-500">変更内容</p>
                      {(
                        ['priority', 'due_date', 'category', 'description'] as const
                      ).map(field => {
                        const before = String(currentTask[field] ?? '');
                        const after = String(field === 'priority' ? c.priority : field === 'due_date' ? c.due_date : field === 'category' ? c.category : c.description ?? '');
                        const beforeDisplay = field === 'priority' ? (PRIORITY_LABEL[before] ?? before) : before;
                        const afterDisplay = field === 'priority' ? (PRIORITY_LABEL[after] ?? after) : after;
                        if (before === after) return null;
                        return (
                          <div key={field} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 w-14 flex-shrink-0">{FIELD_LABEL[field]}</span>
                            <span className="text-red-500 line-through">{beforeDisplay || '（なし）'}</span>
                            <span className="text-gray-300">→</span>
                            <span className="text-green-600">{afterDisplay || '（なし）'}</span>
                          </div>
                        );
                      })}
                      {(['priority', 'due_date', 'category', 'description'] as const).every(field => {
                        const before = String(currentTask[field] ?? '');
                        const after = String(field === 'priority' ? c.priority : field === 'due_date' ? c.due_date : field === 'category' ? c.category : c.description ?? '');
                        return before === after;
                      }) && (
                        <p className="text-xs text-gray-400">変更なし（情報の確認のみ）</p>
                      )}
                    </div>
                  )}

                  {c.description && c.type === 'new' && (
                    <p className="text-xs text-gray-600">{c.description}</p>
                  )}
                  <p className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1">
                    抽出元: 「{c.reason}」
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleApply}
          disabled={applying || checked.size === 0}
          className="flex items-center gap-2 bg-sebastian-navy text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-sebastian-dark transition-colors disabled:opacity-50"
        >
          {applying
            ? <><RefreshCw size={14} className="animate-spin" />適用中...</>
            : <><Plus size={14} />{checked.size}件をタスクに追加する</>
          }
        </button>
        <button
          onClick={onApplied}
          disabled={applying}
          className="px-5 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          スキップ
        </button>
      </div>
      <p className="text-xs text-gray-400">AI提案はすべて監査ログに記録されます</p>
    </div>
  );
}
