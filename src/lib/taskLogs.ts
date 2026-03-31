import { executeDb } from './db';

export type ActorType = 'user' | 'ai';
export type SourceType = 'manual' | 'memo' | 'daily_report' | 'weekly_report';
export type ActionType = 'create' | 'update' | 'status_change' | 'delete';

export async function logTaskAction(params: {
  taskId: number;
  actionType: ActionType;
  beforeJson?: object;
  afterJson?: object;
  actorType: ActorType;
  sourceType?: SourceType;
  sourceId?: string;
  suggestionGroupId?: string;
  appliedBy?: string;
  note?: string;
}): Promise<void> {
  await executeDb(
    `INSERT INTO task_logs
     (task_id, action_type, before_json, after_json, actor_type, source_type, source_id, suggestion_group_id, applied_by, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.taskId,
      params.actionType,
      params.beforeJson ? JSON.stringify(params.beforeJson) : null,
      params.afterJson ? JSON.stringify(params.afterJson) : null,
      params.actorType,
      params.sourceType ?? 'manual',
      params.sourceId ?? null,
      params.suggestionGroupId ?? null,
      params.appliedBy ?? null,
      params.note ?? null,
    ]
  );
}
