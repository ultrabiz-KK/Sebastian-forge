import {
  DEMO_TASKS, DEMO_CATEGORY_SUMMARY, DEMO_MEMOS,
  DEMO_DAILY_REPORTS, DEMO_WEEKLY_REPORTS, today,
} from './demoData';

// ─── デモモードフラグ ───────────────────────────────────────────
let _isDemoMode = false;

export const isDemoMode = () => _isDemoMode;

export function toggleDemoMode(): boolean {
  _isDemoMode = !_isDemoMode;
  return _isDemoMode;
}

// ─── クエリインターセプター ─────────────────────────────────────
export function selectDemo<T>(query: string, params: unknown[]): T[] {
  const q = query.toLowerCase();

  // ── tasks ──
  if (q.includes('from tasks')) {
    // カテゴリ集計
    if (q.includes('group by category')) {
      return DEMO_CATEGORY_SUMMARY as unknown as T[];
    }
    // COUNT(*)
    if (q.includes('count(*)')) {
      const count = DEMO_TASKS.filter(t => t.status !== 'done' && !t.archived).length;
      return [{ count }] as unknown as T[];
    }

    let tasks = [...DEMO_TASKS];

    if (q.includes("status != 'done'") || q.includes('status != "done"')) {
      tasks = tasks.filter(t => t.status !== 'done');
    }
    if (q.includes('archived = 0')) tasks = tasks.filter(t => !t.archived);
    if (q.includes("priority = 'high'")) tasks = tasks.filter(t => t.priority === 'high');
    if (q.includes('pinned = 1')) tasks = tasks.filter(t => t.pinned);
    if (q.includes('due_date between') || q.includes('due_date between')) {
      const [start, end] = params as string[];
      tasks = tasks.filter(t => t.due_date && t.due_date >= start && t.due_date <= end);
    } else if (q.includes('due_date =') && params[0]) {
      tasks = tasks.filter(t => t.due_date === params[0]);
    }
    if (q.includes('where id =') && params[0]) {
      tasks = tasks.filter(t => t.id === Number(params[0]));
    }
    if (q.includes('limit 5')) tasks = tasks.slice(0, 5);

    return tasks as unknown as T[];
  }

  // ── daily_memos ──
  if (q.includes('from daily_memos')) {
    if (q.includes('between') && params.length >= 2) {
      const [start, end] = params as string[];
      return DEMO_MEMOS.filter(m => m.date >= start && m.date <= end) as unknown as T[];
    }
    const target = (params[0] as string) ?? today;
    return DEMO_MEMOS.filter(m => m.date === target) as unknown as T[];
  }

  // ── reports_daily ──
  if (q.includes('from reports_daily')) {
    if (q.includes('between') && params.length >= 2) {
      const [start, end] = params as string[];
      return DEMO_DAILY_REPORTS.filter(r => r.date >= start && r.date <= end) as unknown as T[];
    }
    const target = (params[0] as string) ?? today;
    return DEMO_DAILY_REPORTS.filter(r => r.date === target) as unknown as T[];
  }

  // ── reports_weekly ──
  if (q.includes('from reports_weekly')) {
    if (params[0]) {
      return DEMO_WEEKLY_REPORTS.filter(r => r.week_start_date === params[0]) as unknown as T[];
    }
    return DEMO_WEEKLY_REPORTS as unknown as T[];
  }

  // ── task_logs ──
  if (q.includes('from task_logs')) return [];

  // ── settings ──
  if (q.includes('from settings')) {
    const key = params[0] as string;
    // 朝のブリーフィングを抑制（今日実行済み扱い）
    if (key === 'last_briefing_date') return [{ value: today }] as unknown as T[];
    // AIは無効扱い（デモ中にAPI呼ばない）
    if (key === 'ai_provider') return [{ value: 'disabled' }] as unknown as T[];
    return [];
  }

  return [];
}
