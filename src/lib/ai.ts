// AI呼び出しレイヤー
// プロバイダー: Gemini API / Ollama / 無効
// 設定画面でプロバイダーを切り替えられます。

import { getSetting, SETTING_KEYS } from './settings';
import { STATUS_LABEL, PRIORITY_LABEL } from './constants';

export interface TaskLogEntry {
  task_id: number;
  action_type: string;
  before_json: string | null;
  after_json: string | null;
  actor_type: string;
  note: string | null;
  created_at: string;
}

export interface TaskEntry {
  id: number;
  title: string;
  status: string;
  priority: string;
  category: string | null;
}

export interface DailyReportInput {
  date: string;
  memoContent: string;
  taskLogs: TaskLogEntry[];
  activeTasks: TaskEntry[];
}

export interface WeeklyReportInput {
  weekStart: string;
  weekEnd: string;
  dailyReports: { date: string; content: string }[];
  taskLogs: TaskLogEntry[];
  activeTasks: TaskEntry[];
}

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error?: string;
}

export interface TaskCandidate {
  type: 'new' | 'update';
  title: string;
  description: string;
  priority: 'none' | 'low' | 'medium' | 'high';
  due_date: string;
  category: string;
  reason: string;
  target_task_id?: number;
}

// ─── Ollama ────────────────────────────────────────────────────

export async function checkOllamaConnection(endpoint?: string): Promise<OllamaStatus> {
  const url = endpoint ?? (await getSetting(SETTING_KEYS.OLLAMA_ENDPOINT)) ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { models: { name: string }[] };
    return { connected: true, models: data.models?.map(m => m.name) ?? [] };
  } catch (e: unknown) {
    return { connected: false, models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function callOllama(systemPrompt: string, userMessage: string): Promise<string> {
  const endpoint = (await getSetting(SETTING_KEYS.OLLAMA_ENDPOINT)) ?? 'http://localhost:11434';
  const model = (await getSetting(SETTING_KEYS.OLLAMA_MODEL)) ?? 'qwen2.5:7b';

  const res = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.3, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama エラー (${res.status}): ${body || res.statusText}`);
  }
  const data = await res.json() as { message?: { content: string } };
  const content = data.message?.content;
  if (!content) throw new Error('Ollama からの応答が空です');
  return content.trim();
}

// ─── Gemini API ────────────────────────────────────────────────

export async function checkGeminiConnection(apiKey?: string, model?: string): Promise<{ connected: boolean; error?: string }> {
  const key = apiKey ?? (await getSetting(SETTING_KEYS.GEMINI_API_KEY)) ?? '';
  const mdl = model ?? (await getSetting(SETTING_KEYS.GEMINI_MODEL)) ?? 'gemini-2.0-flash';
  if (!key) return { connected: false, error: 'APIキーが設定されていません' };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'test' }] }] }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.status === 400) return { connected: true }; // 400はリクエスト形式エラーだが疎通はOK
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    return { connected: true };
  } catch (e: unknown) {
    return { connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = await getSetting(SETTING_KEYS.GEMINI_API_KEY);
  const model = (await getSetting(SETTING_KEYS.GEMINI_MODEL)) ?? 'gemini-2.0-flash';

  if (!apiKey) throw new Error('Gemini APIキーが設定されていません。設定画面から入力してください。');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gemini エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini の出力がトークン上限に達したため、生成が途中で打ち切られました。メモを短くするか、モデルを変更してください。');
  }
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini からの応答が空です');
  return text.trim();
}

// ─── プロバイダー振り分け ───────────────────────────────────────

async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = (await getSetting(SETTING_KEYS.AI_PROVIDER)) ?? 'disabled';

  switch (provider) {
    case 'gemini':
      return callGemini(systemPrompt, userMessage);
    case 'ollama':
      return callOllama(systemPrompt, userMessage);
    default:
      throw new Error('AIプロバイダーが設定されていません。設定画面からGeminiまたはOllamaを選択してください。');
  }
}

// ─── プロンプト定義 ────────────────────────────────────────────

const DAILY_SYSTEM = `あなたは業務支援AIアシスタント「Sebastian」です。
ユーザーが業務中に記録した雑多なメモと、タスクの変更ログをもとに、日報を丁寧な実務文体で作成します。

出力はMarkdown形式で、以下の構成にしてください:

# 日報 - {DATE}

## 本日の実施内容
（メモから実際に行った業務を箇条書きで整理・清書。断片的なメモも完全な文に整形する）

## 対応したタスク・変更
（タスクログから今日変更があったタスクを整理）

## 進捗（完了）
（完了したタスク）

## 残件
（未完了・進行中のタスク）

## 保留
（保留中のタスク）

---
*生成: Sebastian v1.1.1*
*このドラフトを確認・編集のうえ承認してください*

ルール: 丁寧で実務的な文体。メモの口語表現・略語を適切に整形。推測や意見は含めない。`;

const WEEKLY_SYSTEM = `あなたは業務支援AIアシスタント「Sebastian」です。
今週の日報とタスクログをもとに、週報を丁寧な実務文体で作成します。

出力はMarkdown形式で、以下の構成にしてください:

# 週報 - {WEEK_START} 〜 {WEEK_END}

## 今週やったこと
（今週の日報から主な業務を集約・整理）

## 進んだこと（完了）
（今週完了したタスク）

## 保留・持ち越し
（保留・未完了で来週に持ち越すタスク）

## 来週の注力点
（優先度・期限から来週注力すべきタスク）

---
*生成: Sebastian v1.1.1*
*このドラフトを確認・編集のうえ承認してください*

ルール: 日報の断片をそのままコピーせず週単位で集約。丁寧で実務的な文体。`;

// ─── 週カレンダー用コメント ────────────────────────────────────

export async function generateWeeklyCalendarComment(params: {
  weekStart: string;
  weekEnd: string;
  total: number;
  done: number;
  undone: number;
  highPriority: number;
  busiestDayName: string;
  busiestDayCount: number;
}): Promise<string> {
  const { weekStart, weekEnd, total, done, undone, highPriority, busiestDayName, busiestDayCount } = params;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  const systemPrompt = `あなたは執事AIアシスタント「Sebastian」です。
主人の今週の業務状況を見て、一言コメントをします。
執事らしい丁寧な口調で、60〜100文字程度の自然な一言を返してください。
テキストのみ返してください（JSON・マークダウン不要）。`;

  const userMessage = `今週（${weekStart} 〜 ${weekEnd}）:
- 期日タスク合計: ${total}件（完了${done}件、未完了${undone}件、達成率${rate}%）
- 高優先度タスク（未完了）: ${highPriority}件
- 最もタスクが多い日: ${busiestDayName}（${busiestDayCount}件）`;

  return callAI(systemPrompt, userMessage);
}

// ─── 公開関数 ──────────────────────────────────────────────────



export async function generateDailyReport(input: DailyReportInput): Promise<string> {
  const { date, memoContent, taskLogs, activeTasks } = input;

  const changedIds = [...new Set(taskLogs.map(l => l.task_id))];
  const taskLogsSummary = changedIds.map(id => {
    const task = activeTasks.find(t => t.id === id);
    if (!task) return null;
    const actions = taskLogs.filter(l => l.task_id === id).map(l => l.action_type).join(' → ');
    return `- ${task.title}（${STATUS_LABEL[task.status] ?? task.status}）[${actions}]`;
  }).filter(Boolean).join('\n') || '（本日のタスク変更なし）';

  const tasksSummary = activeTasks.map(t =>
    `- [${STATUS_LABEL[t.status] ?? t.status}][優先度:${PRIORITY_LABEL[t.priority] ?? t.priority}] ${t.title}${t.category ? ` (${t.category})` : ''}`
  ).join('\n') || '（タスクなし）';

  const userMessage = `日付: ${date}

【本日のメモ】
${memoContent.trim() || '（記録なし）'}

【本日のタスク変更】
${taskLogsSummary}

【現在のタスク一覧】
${tasksSummary}

${date} の日報を作成してください。{DATE} は ${date} に置換してください。`;

  try {
    return await callAI(DAILY_SYSTEM.replace(/{DATE}/g, date), userMessage);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}

export async function generateWeeklyReport(input: WeeklyReportInput): Promise<string> {
  const { weekStart, weekEnd, dailyReports, activeTasks } = input;

  const dailySummary = dailyReports.length > 0
    ? dailyReports.map(r => `=== ${r.date} ===\n${r.content}`).join('\n\n')
    : '（今週の日報なし）';

  const tasksSummary = activeTasks.map(t =>
    `- [${STATUS_LABEL[t.status] ?? t.status}][優先度:${PRIORITY_LABEL[t.priority] ?? t.priority}] ${t.title}${t.category ? ` (${t.category})` : ''}`
  ).join('\n') || '（タスクなし）';

  const userMessage = `対象週: ${weekStart} 〜 ${weekEnd}

【今週の日報】
${dailySummary}

【現在のタスク一覧】
${tasksSummary}

${weekStart} 〜 ${weekEnd} の週報を作成してください。{WEEK_START} は ${weekStart}、{WEEK_END} は ${weekEnd} に置換してください。`;

  const systemPrompt = WEEKLY_SYSTEM
    .replace(/{WEEK_START}/g, weekStart)
    .replace(/{WEEK_END}/g, weekEnd);

  try {
    return await callAI(systemPrompt, userMessage);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}

// ─── タスク候補抽出 ────────────────────────────────────────────

const TASK_EXTRACT_SYSTEM = `あなたは業務支援AIアシスタント「Sebastian」です。
ユーザーの業務メモから、新規タスクや既存タスクの更新候補を抽出します。

必ず以下のJSON形式のみで返してください。説明文は不要です。

{
  "candidates": [
    {
      "type": "new",
      "title": "タスクのタイトル（簡潔に）",
      "description": "詳細・背景（任意）",
      "priority": "high|medium|low|none",
      "due_date": "yyyy-MM-dd形式、不明な場合は空文字",
      "category": "カテゴリ（情シス・研修・採用など、不明なら空文字）",
      "reason": "メモのどの部分からこの候補を抽出したか（原文の引用）"
    }
  ]
}

ルール:
- 明確にタスクとして読み取れるものだけを抽出する
- 曖昧なもの・すでに完了している作業は含めない
- 既存タスクと重複する場合は type を "update" にして target_task_id を設定する
- due_date は today を基準に「3週間後」などを計算して設定する
- 候補がない場合は candidates を空配列にする`;

// JSONレスポンスからコードフェンスや余分なテキストを除去する
function cleanJsonResponse(raw: string): string {
  const s = raw.trim();
  // ```json ... ``` または ``` ... ``` 形式を除去
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // { で始まる場合はそのまま
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) return s.slice(start, end + 1);
  return s;
}

async function callAIForJson(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = (await getSetting(SETTING_KEYS.AI_PROVIDER)) ?? 'disabled';

  if (provider === 'gemini') {
    const apiKey = await getSetting(SETTING_KEYS.GEMINI_API_KEY);
    const model = (await getSetting(SETTING_KEYS.GEMINI_MODEL)) ?? 'gemini-2.0-flash';
    if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Gemini エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"candidates":[]}';
    return cleanJsonResponse(raw);
  }

  if (provider === 'ollama') {
    const endpoint = (await getSetting(SETTING_KEYS.OLLAMA_ENDPOINT)) ?? 'http://localhost:11434';
    const model = (await getSetting(SETTING_KEYS.OLLAMA_MODEL)) ?? 'qwen2.5:7b';
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama エラー: HTTP ${res.status}`);
    const data = await res.json() as { message?: { content: string } };
    const raw = data.message?.content ?? '{"candidates":[]}';
    return cleanJsonResponse(raw);
  }

  throw new Error('AIプロバイダーが設定されていません');
}

// ─── 執事ブリーフィング ────────────────────────────────────────

export interface ButlerBriefing {
  date: string;
  morning: string[];   // 6:00〜10:59
  noon: string[];      // 11:00〜14:59
  afternoon: string[]; // 15:00〜18:59
  night: string[];     // 19:00〜5:59
}

export const FALLBACK_BUTLER_BRIEFING: Omit<ButlerBriefing, 'date'> = {
  morning: [
    'おはようございます。本日もよろしくお願いいたします。',
    '朝食はお済みになられましたか？',
    '本日のタスクをご確認くださいませ。',
    '清々しい朝でございます。良い一日になりますよう。',
    '私の健康の秘訣ですか？早寝早起きにございます。',
  ],
  noon: [
    'そろそろ昼食のお時間になります。',
    '午前中お疲れ様でございました。少し休まれてはいかがでしょう。',
    '水分補給もお忘れなきよう。',
    'お昼の休憩は大切にございます。',
    '区切りの良いところで一息つきましょう。',
  ],
  afternoon: [
    '夕方が近づいてまいりました。',
    '根を詰めすぎるとお体に毒でございます。',
    '少し画面から目を離されてはいかがでしょう。',
    '夕餉の支度をしてまいります。',
    'お疲れではございませんか？',
  ],
  night: [
    '夜もふけてまいりました。',
    '温かいお飲み物でもいかがでしょうか。',
    '本日もお疲れさまでございます。',
    '夜風にあたって少し気分転換などいかがでしょう。',
    'そろそろゆっくりとお休みになる時間にございます。',
  ],
};

export async function generateButlerBriefing(
  tasks: { title: string; priority: string; due_date: string | null }[],
  date: string
): Promise<ButlerBriefing> {
  const taskList = tasks.length > 0
    ? tasks.map(t =>
        `・${t.title}（優先度: ${PRIORITY_LABEL[t.priority] ?? t.priority}${t.due_date ? `、期日: ${t.due_date}` : ''}）`
      ).join('\n')
    : '（急ぎのタスクはありません）';

  const systemPrompt = `あなたは執事AIアシスタント「Sebastian」です。
主人の本日のタスク状況をもとに、時間帯ごとの声かけコメントを生成します。

ルール:
- 執事らしい丁寧な口調（〜でございます、〜いかがでしょうか、〜ませんか 等）
- 各コメントは40〜80文字程度
- タスクに言及するものと、体調・休憩・時間帯への気遣いを自然に混ぜる
- 明るく温かみのある表現
- JSON形式のみで返す（説明文・コードフェンス不要）`;

  const userMessage = `今日の日付: ${date}

【本日の重要タスク】
${taskList}

時間帯ごとにコメントを5つずつ生成してください:
- morning（朝 6〜11時）: 挨拶＋タスク案内＋気遣い
- noon（昼 11〜15時）: 昼食・休憩提案＋タスクへの一言
- afternoon（夕方 15〜19時）: 区切り・気遣い
- night（夜 19〜6時）: 締め・リラックス

{"morning":["","","","",""],"noon":["","","","",""],"afternoon":["","","","",""],"night":["","","","",""]}`;

  const raw = await callAIForJson(systemPrompt, userMessage);
  const parsed = JSON.parse(raw) as {
    morning?: string[];
    noon?: string[];
    afternoon?: string[];
    night?: string[];
  };

  return {
    date,
    morning:   parsed.morning?.slice(0, 5).filter(Boolean)   ?? FALLBACK_BUTLER_BRIEFING.morning,
    noon:      parsed.noon?.slice(0, 5).filter(Boolean)      ?? FALLBACK_BUTLER_BRIEFING.noon,
    afternoon: parsed.afternoon?.slice(0, 5).filter(Boolean) ?? FALLBACK_BUTLER_BRIEFING.afternoon,
    night:     parsed.night?.slice(0, 5).filter(Boolean)     ?? FALLBACK_BUTLER_BRIEFING.night,
  };
}

export async function extractTaskCandidates(
  memoContent: string,
  existingTasks: TaskEntry[],
  date: string
): Promise<TaskCandidate[]> {
  const existingTasksSummary = existingTasks.length > 0
    ? existingTasks.map(t => `- [ID:${t.id}] ${t.title}（${t.status}）`).join('\n')
    : '（既存タスクなし）';

  const userMessage = `今日の日付: ${date}

【業務メモ】
${memoContent.trim() || '（メモなし）'}

【既存タスク一覧】
${existingTasksSummary}

上記のメモから新規タスク候補・既存タスクの更新候補を抽出してください。`;

  let raw = '';
  try {
    raw = await callAIForJson(TASK_EXTRACT_SYSTEM, userMessage);
    const parsed = JSON.parse(raw) as { candidates?: TaskCandidate[] };
    return parsed.candidates ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const preview = raw.length > 0 ? `\n受信内容(先頭100文字): ${raw.slice(0, 100)}` : '';
    throw new Error(`タスク候補の抽出に失敗しました: ${msg}${preview}`);
  }
}
