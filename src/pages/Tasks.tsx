import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Circle, CheckCircle, Clock, Loader, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { selectDb, executeDb } from '../lib/db';
import { logTaskAction } from '../lib/taskLogs';
import { TaskModal, type TaskFormData, type TaskStatus, type TaskPriority } from '../components/TaskModal';

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

type FilterTab = 'all' | 'todo' | 'in_progress' | 'done' | 'hold';

const PRIORITY_BADGE: Record<string, React.ReactNode> = {
  high: <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">高</span>,
  medium: <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">中</span>,
  low: <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">低</span>,
  none: null,
};

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle size={20} className="text-green-600 flex-shrink-0" />;
    case 'in_progress':
      return <Loader size={20} className="text-blue-500 flex-shrink-0" />;
    case 'hold':
      return <Clock size={20} className="text-orange-400 flex-shrink-0" />;
    default:
      return <Circle size={20} className="text-gray-300 flex-shrink-0" />;
  }
}

const FILTER_LABELS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'todo', label: '未着手' },
  { key: 'in_progress', label: '進行中' },
  { key: 'hold', label: '保留' },
  { key: 'done', label: '完了' },
];

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadTasks = async () => {
    const rows = await selectDb<Task>(
      'SELECT id, title, description, status, priority, due_date, category, created_at, updated_at FROM tasks ORDER BY created_at DESC'
    );
    setTasks(rows);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  const handleCreate = async (data: TaskFormData) => {
    setErrorMsg('');
    try {
      const result = await executeDb(
        'INSERT INTO tasks (title, description, status, priority, due_date, category) VALUES (?, ?, ?, ?, ?, ?)',
        [data.title, data.description || null, data.status, data.priority, data.due_date || null, data.category || null]
      );
      await logTaskAction({
        taskId: result.lastInsertId as number,
        actionType: 'create',
        afterJson: data,
        actorType: 'user',
      });
      setModalMode(null);
      loadTasks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`タスクの追加に失敗しました: ${msg}`);
    }
  };

  const handleEdit = async (data: TaskFormData) => {
    if (!editingTask) return;
    setErrorMsg('');
    try {
      await executeDb(
        'UPDATE tasks SET title=?, description=?, status=?, priority=?, due_date=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [data.title, data.description || null, data.status, data.priority, data.due_date || null, data.category || null, editingTask.id]
      );
      await logTaskAction({
        taskId: editingTask.id,
        actionType: editingTask.status !== data.status ? 'status_change' : 'update',
        beforeJson: editingTask,
        afterJson: data,
        actorType: 'user',
      });
      setModalMode(null);
      setEditingTask(null);
      loadTasks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`タスクの更新に失敗しました: ${msg}`);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await executeDb(
        'UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [newStatus, task.id]
      );
      await logTaskAction({
        taskId: task.id,
        actionType: 'status_change',
        beforeJson: { status: task.status },
        afterJson: { status: newStatus },
        actorType: 'user',
      });
      loadTasks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`ステータス更新に失敗しました: ${msg}`);
    }
  };

  const handleDelete = async (id: number) => {
    const task = tasks.find(t => t.id === id);
    try {
      await executeDb('DELETE FROM tasks WHERE id=?', [id]);
      await logTaskAction({
        taskId: id,
        actionType: 'delete',
        beforeJson: task ?? undefined,
        actorType: 'user',
      });
      setDeletingId(null);
      loadTasks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`タスクの削除に失敗しました: ${msg}`);
      setDeletingId(null);
    }
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setModalMode('edit');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-medium text-sebastian-gray mb-1">TASKS</h2>
          <h1 className="text-2xl font-serif text-sebastian-navy">タスク一覧</h1>
        </div>
        <button
          onClick={() => { setEditingTask(null); setModalMode('create'); }}
          className="bg-sebastian-navy text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sebastian-dark transition-colors text-sm"
        >
          <Plus size={16} />
          タスクを追加
        </button>
      </header>

      {/* エラー表示 */}
      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* フィルタタブ */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {FILTER_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-white text-sebastian-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {key !== 'all' && (
              <span className="ml-1.5 text-xs text-gray-400">
                {tasks.filter(t => t.status === key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* タスクリスト */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {filteredTasks.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">タスクがありません</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filteredTasks.map(task => (
              <li key={task.id} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                {/* ステータスアイコン（クリックで完了/未着手トグル） */}
                <button
                  onClick={() => handleToggleStatus(task)}
                  className="hover:scale-110 transition-transform"
                  title="ステータスを切り替え"
                >
                  <StatusIcon status={task.status} />
                </button>

                {/* タスク情報 */}
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {task.title}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {task.category && (
                      <span className="text-xs text-sebastian-lightgray">{task.category}</span>
                    )}
                    {task.due_date && (
                      <span className="text-xs text-gray-400">
                        期日: {format(new Date(task.due_date + 'T00:00:00'), 'M/d')}
                      </span>
                    )}
                    {task.description && (
                      <span className="text-xs text-gray-300 truncate max-w-[200px]">{task.description}</span>
                    )}
                  </div>
                </div>

                {/* 優先度・操作ボタン */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {PRIORITY_BADGE[task.priority]}

                  {deletingId === task.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">削除しますか？</span>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition-colors"
                      >
                        削除
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(task)}
                        className="p-1.5 text-gray-400 hover:text-sebastian-navy hover:bg-gray-100 rounded-lg transition-colors"
                        title="編集"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeletingId(task.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* モーダル */}
      {modalMode === 'create' && (
        <TaskModal
          mode="create"
          onSave={handleCreate}
          onClose={() => setModalMode(null)}
        />
      )}
      {modalMode === 'edit' && editingTask && (
        <TaskModal
          mode="edit"
          initialData={{
            title: editingTask.title,
            description: editingTask.description ?? '',
            status: editingTask.status,
            priority: editingTask.priority,
            due_date: editingTask.due_date ?? '',
            category: editingTask.category ?? '',
          }}
          onSave={handleEdit}
          onClose={() => { setModalMode(null); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
