import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'hold';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high';

export interface TaskFormData {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  category: string;
}

interface Props {
  initialData?: Partial<TaskFormData>;
  onSave: (data: TaskFormData) => void;
  onClose: () => void;
  mode: 'create' | 'edit';
}

export function TaskModal({ initialData, onSave, onClose, mode }: Props) {
  const [form, setForm] = useState<TaskFormData>({
    title: initialData?.title ?? '',
    description: initialData?.description ?? '',
    status: initialData?.status ?? 'todo',
    priority: initialData?.priority ?? 'none',
    due_date: initialData?.due_date ?? '',
    category: initialData?.category ?? '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-serif text-sebastian-navy">
            {mode === 'create' ? 'タスクを追加' : 'タスクを編集'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">
              タイトル <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray transition-colors"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">メモ</label>
            <textarea
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray resize-none transition-colors"
              placeholder="詳細・背景・対応方針など"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">ステータス</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray transition-colors"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
              >
                <option value="todo">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="done">完了</option>
                <option value="hold">保留</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">優先度</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray transition-colors"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
              >
                <option value="none">なし</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">期日</label>
              <input
                type="date"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray transition-colors"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">カテゴリ</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sebastian-lightgray transition-colors"
                placeholder="例: 情シス, 研修, 採用"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-sebastian-navy text-white rounded-lg py-2 font-medium hover:bg-sebastian-dark transition-colors"
            >
              {mode === 'create' ? '追加する' : '保存する'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2 font-medium hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
