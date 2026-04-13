/**
 * 複数ページで共有する DB クエリ関数。
 * ページ固有の UI 状態管理はここに持ち込まない。
 */
import { selectDb } from './db';
import { type TaskEntry } from './ai';

/** 指定日のメモ本文を返す（未記録は null） */
export async function loadDailyMemoContent(date: string): Promise<string | null> {
  const rows = await selectDb<{ content: string }>(
    'SELECT content FROM daily_memos WHERE date = ?',
    [date]
  );
  return rows[0]?.content ?? null;
}

/** 指定日の日報が存在するか返す */
export async function loadDailyReportExists(date: string): Promise<boolean> {
  const rows = await selectDb<{ id: number }>(
    'SELECT id FROM reports_daily WHERE date = ?',
    [date]
  );
  return rows.length > 0;
}

/** 全タスク一覧（AI生成用） */
export async function loadAllTasks(): Promise<TaskEntry[]> {
  return selectDb<TaskEntry>(
    'SELECT id, title, status, priority, category FROM tasks ORDER BY created_at DESC'
  );
}
