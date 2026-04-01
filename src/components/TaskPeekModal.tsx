import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { selectDb } from '../lib/db';
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_LABEL } from '../lib/constants';

interface TaskDetail {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  category: string | null;
}

interface Props {
  taskId: number;
  onClose: () => void;
}

export function TaskPeekModal({ taskId, onClose }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);

  useEffect(() => {
    selectDb<TaskDetail>(
      'SELECT id, title, description, priority, status, due_date, category FROM tasks WHERE id = ?',
      [taskId]
    ).then(rows => setTask(rows[0] ?? null));
  }, [taskId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: 'var(--color-white)', border: '1px solid var(--color-sebastian-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 角飾り */}
        <span className="absolute top-2.5 left-2.5 w-4 h-4 border-t border-l border-sebastian-gold/30 pointer-events-none rounded-tl-sm" />
        <span className="absolute top-2.5 right-2.5 w-4 h-4 border-t border-r border-sebastian-gold/30 pointer-events-none rounded-tr-sm" />
        <span className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b border-l border-sebastian-gold/30 pointer-events-none rounded-bl-sm" />
        <span className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b border-r border-sebastian-gold/30 pointer-events-none rounded-br-sm" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-sebastian-lightgray hover:text-sebastian-gray transition-colors"
        >
          <X size={16} />
        </button>

        {!task ? (
          <p className="text-sm text-sebastian-lightgray font-serif">読み込み中...</p>
        ) : (
          <div className="space-y-3">
            <h2 className="text-base font-serif text-sebastian-navy pr-6 leading-snug">{task.title}</h2>

            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[task.priority]}`}>
                優先度: {PRIORITY_LABEL[task.priority]}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-100">
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
              {task.due_date && (
                <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-100">
                  期日: {task.due_date}
                </span>
              )}
              {task.category && (
                <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-100">
                  {task.category}
                </span>
              )}
            </div>

            {task.description ? (
              <p className="text-sm text-sebastian-gray leading-relaxed font-serif whitespace-pre-wrap border-t border-sebastian-border/40 pt-3">
                {task.description}
              </p>
            ) : (
              <p className="text-xs text-sebastian-lightgray italic font-serif border-t border-sebastian-border/40 pt-3">
                詳細メモなし
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
