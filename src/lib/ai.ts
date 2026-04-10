// AI呼び出しレイヤー — マルチプロバイダー対応
// callAI() / callAIForJson() の公開インターフェース（generateDailyReport等）は後方互換を維持

import { getSetting, setSetting, getDecryptedSetting, SETTING_KEYS } from './settings';
import { decrypt, isUnlocked } from './session';
import { STATUS_LABEL, PRIORITY_LABEL } from './constants';

// ─── 公開型定義 ──────────────────────────────────────────────────

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

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
}

export type FeatureKey = 'daily_report' | 'weekly_report' | 'briefing' | 'calendar_comment' | 'task_extract';

export interface CustomProviderDef {
  id: string;
  name: string;
  type: 'openai_compat' | 'claude_compat';
  endpoint: string;
  apiKey: string;
  modelOverride?: string;
}

// ─── プロバイダーインターフェース ────────────────────────────────

interface AIProvider {
  readonly id: string;
  readonly name: string;
  callText(system: string, user: string): Promise<string>;
  callJson(system: string, user: string): Promise<string>;
  listModels(): Promise<ModelInfo[]>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

// ─── モデルキャッシュ（TTL: 1時間） ─────────────────────────────

interface ModelCacheEntry { models: ModelInfo[]; fetchedAt: string; }
type ModelCache = Record<string, ModelCacheEntry>;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function getCachedModels(providerId: string): Promise<ModelInfo[] | null> {
  try {
    const raw = await getSetting(SETTING_KEYS.MODELS_CACHE);
    if (!raw) return null;
    const cache = JSON.parse(raw) as ModelCache;
    const entry = cache[providerId];
    if (!entry) return null;
    if (Date.now() - new Date(entry.fetchedAt).getTime() > CACHE_TTL_MS) return null;
    return entry.models;
  } catch { return null; }
}

async function setCachedModels(providerId: string, models: ModelInfo[]): Promise<void> {
  try {
    const raw = await getSetting(SETTING_KEYS.MODELS_CACHE);
    const cache: ModelCache = raw ? JSON.parse(raw) : {};
    cache[providerId] = { models, fetchedAt: new Date().toISOString() };
    await setSetting(SETTING_KEYS.MODELS_CACHE, JSON.stringify(cache));
  } catch { /* キャッシュ失敗は無視 */ }
}

// ─── JSONレスポンスクリーナー ────────────────────────────────────

function cleanJsonResponse(raw: string): string {
  const s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) return s.slice(start, end + 1);
  return s;
}

// ─── Gemini Provider ────────────────────────────────────────────

class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly name = 'Gemini API';
  _modelOverride?: string;

  private async getConfig() {
    const apiKey = await getDecryptedSetting(SETTING_KEYS.GEMINI_API_KEY);
    const model = this._modelOverride ?? (await getSetting(SETTING_KEYS.GEMINI_MODEL)) ?? 'gemini-2.0-flash';
    return { apiKey, model };
  }

  async callText(system: string, user: string): Promise<string> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) throw new Error('Gemini APIキーが設定されていません。設定画面から入力してください。');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
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
      throw new Error('Gemini の出力がトークン上限に達しました。メモを短くするか、モデルを変更してください。');
    }
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini からの応答が空です');
    return text.trim();
  }

  async callJson(system: string, user: string): Promise<string> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
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

  async listModels(): Promise<ModelInfo[]> {
    const cached = await getCachedModels(this.id);
    if (cached) return cached;
    const apiKey = await getDecryptedSetting(SETTING_KEYS.GEMINI_API_KEY);
    if (!apiKey) return [];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) return [];
      const data = await res.json() as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
      const allModels = (data.models ?? [])
        .filter(m => m.name.includes('gemini'))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName ?? m.name.replace('models/', ''), providerId: this.id }));
      const textModels = (data.models ?? [])
        .filter(m => m.name.includes('gemini') && (m.supportedGenerationMethods?.includes('generateContent') ?? false))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName ?? m.name.replace('models/', ''), providerId: this.id }));
      const models = textModels.length > 0 ? textModels : allModels;
      await setCachedModels(this.id, models);
      return models;
    } catch { return []; }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) return { ok: false, message: 'APIキーが設定されていません' };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'test' }] }] }),
          signal: AbortSignal.timeout(120_000),
        }
      );
      if (res.status === 400) return { ok: true, message: '接続成功 — Gemini APIに接続できました' };
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return { ok: true, message: '接続成功 — Gemini APIに接続できました' };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── Ollama Provider ────────────────────────────────────────────

class OllamaProvider implements AIProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  _modelOverride?: string;

  private async getConfig() {
    const endpoint = (await getSetting(SETTING_KEYS.OLLAMA_ENDPOINT)) ?? 'http://localhost:11434';
    const model = this._modelOverride ?? (await getSetting(SETTING_KEYS.OLLAMA_MODEL)) ?? 'qwen2.5:7b';
    return { endpoint, model };
  }

  async callText(system: string, user: string): Promise<string> {
    const { endpoint, model } = await this.getConfig();
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
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

  async callJson(system: string, user: string): Promise<string> {
    const { endpoint, model } = await this.getConfig();
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
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

  async listModels(): Promise<ModelInfo[]> {
    const cached = await getCachedModels(this.id);
    if (cached) return cached;
    const { endpoint } = await this.getConfig();
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = await res.json() as { models?: { name: string }[] };
      const models: ModelInfo[] = (data.models ?? []).map(m => ({ id: m.name, name: m.name, providerId: this.id }));
      await setCachedModels(this.id, models);
      return models;
    } catch { return []; }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { endpoint } = await this.getConfig();
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models: { name: string }[] };
      const models = data.models?.map(m => m.name) ?? [];
      return { ok: true, message: `接続成功 — 利用可能なモデル: ${models.join(', ') || 'なし'}` };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── Claude Provider (Anthropic) ────────────────────────────────

class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  readonly name = 'Claude (Anthropic)';
  _modelOverride?: string;

  private async getConfig() {
    const apiKey = await getDecryptedSetting(SETTING_KEYS.CLAUDE_API_KEY);
    const model = this._modelOverride ?? (await getSetting(SETTING_KEYS.CLAUDE_MODEL)) ?? 'claude-3-5-haiku-20241022';
    return { apiKey, model };
  }

  async callText(system: string, user: string): Promise<string> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) throw new Error('Claude APIキーが設定されていません。設定画面から入力してください。');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Claude エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { content?: { type: string; text: string }[] };
    const text = data.content?.find(c => c.type === 'text')?.text;
    if (!text) throw new Error('Claude からの応答が空です');
    return text.trim();
  }

  async callJson(system: string, user: string): Promise<string> {
    // Claude はネイティブJSONモード非対応のため、system promptで指示する
    const jsonSystem = `${system}\n\n必ず有効なJSONのみを返してください。説明文・コードフェンス不要。`;
    const raw = await this.callText(jsonSystem, user);
    return cleanJsonResponse(raw);
  }

  async listModels(): Promise<ModelInfo[]> {
    const cached = await getCachedModels(this.id);
    if (cached) return cached;
    const apiKey = await getDecryptedSetting(SETTING_KEYS.CLAUDE_API_KEY);
    if (!apiKey) return [];
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: { id: string; display_name?: string }[] };
      const models: ModelInfo[] = (data.data ?? []).map(m => ({ id: m.id, name: m.display_name ?? m.id, providerId: this.id }));
      await setCachedModels(this.id, models);
      return models;
    } catch { return []; }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) return { ok: false, message: 'APIキーが設定されていません' };
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return { ok: true, message: '接続成功 — Claude APIに接続できました' };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── OpenAI Provider ────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  _modelOverride?: string;

  private async getConfig() {
    const apiKey = await getDecryptedSetting(SETTING_KEYS.OPENAI_API_KEY);
    const model = this._modelOverride ?? (await getSetting(SETTING_KEYS.OPENAI_MODEL)) ?? 'gpt-4o-mini';
    return { apiKey, model };
  }

  async callText(system: string, user: string): Promise<string> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) throw new Error('OpenAI APIキーが設定されていません。設定画面から入力してください。');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI からの応答が空です');
    return text.trim();
  }

  async callJson(system: string, user: string): Promise<string> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) throw new Error('OpenAI APIキーが設定されていません');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? '{"candidates":[]}';
    return cleanJsonResponse(raw);
  }

  async listModels(): Promise<ModelInfo[]> {
    const cached = await getCachedModels(this.id);
    if (cached) return cached;
    const apiKey = await getDecryptedSetting(SETTING_KEYS.OPENAI_API_KEY);
    if (!apiKey) return [];
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: { id: string }[] };
      const excludePrefixes = ['dall-e-', 'whisper-', 'tts-', 'text-embedding-', 'text-moderation-'];
      const models: ModelInfo[] = (data.data ?? [])
        .filter(m => !excludePrefixes.some(p => m.id.startsWith(p)))
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('chatgpt-') || /^o\d/.test(m.id))
        .map(m => ({ id: m.id, name: m.id, providerId: this.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
      await setCachedModels(this.id, models);
      return models;
    } catch { return []; }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { apiKey, model } = await this.getConfig();
    if (!apiKey) return { ok: false, message: 'APIキーが設定されていません' };
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return { ok: true, message: '接続成功 — OpenAI APIに接続できました' };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── OpenAI互換プロバイダー（Groq/OpenRouter/nano-gpt/LM Studio） ─

class OpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly endpointSettingKey: string | null,
    private readonly apiKeySettingKey: string | null,
    private readonly modelSettingKey: string,
    private readonly defaultEndpoint: string,
    private readonly defaultModel: string,
    private readonly modelOverride?: string,
  ) {}

  private async getConfig() {
    const endpoint = (this.endpointSettingKey ? await getSetting(this.endpointSettingKey) : null) ?? this.defaultEndpoint;
    const apiKey = (this.apiKeySettingKey ? await getDecryptedSetting(this.apiKeySettingKey) : null) ?? '';
    const model = this.modelOverride ?? (await getSetting(this.modelSettingKey)) ?? this.defaultModel;
    return { endpoint, apiKey, model };
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
    return h;
  }

  async callText(system: string, user: string): Promise<string> {
    const { endpoint, apiKey, model } = await this.getConfig();
    if (this.apiKeySettingKey && !apiKey) throw new Error(`${this.name} APIキーが設定されていません。設定画面から入力してください。`);

    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`${this.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.name} からの応答が空です`);
    return text.trim();
  }

  async callJson(system: string, user: string): Promise<string> {
    const { endpoint, apiKey, model } = await this.getConfig();
    if (this.apiKeySettingKey && !apiKey) throw new Error(`${this.name} APIキーが設定されていません`);

    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`${this.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? '{"candidates":[]}';
    return cleanJsonResponse(raw);
  }

  async listModels(): Promise<ModelInfo[]> {
    const cached = await getCachedModels(this.id);
    if (cached) return cached;
    const { endpoint, apiKey } = await this.getConfig();
    try {
      const res = await fetch(`${endpoint}/v1/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: { id: string }[] };
      const excludePrefixes = ['dall-e-', 'whisper-', 'tts-', 'text-embedding-', 'text-moderation-'];
      const allModels: ModelInfo[] = (data.data ?? []).map(m => ({ id: m.id, name: m.id, providerId: this.id }));
      const filteredModels = allModels.filter(m => !excludePrefixes.some(p => m.id.startsWith(p)));
      const models = filteredModels.length > 0 ? filteredModels : allModels;
      await setCachedModels(this.id, models);
      return models;
    } catch { return []; }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const { endpoint, apiKey, model } = await this.getConfig();
    if (this.apiKeySettingKey && !apiKey) return { ok: false, message: 'APIキーが設定されていません' };
    try {
      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return { ok: true, message: `接続成功 — ${this.name} に接続できました` };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── カスタムプロバイダービルダー ────────────────────────────────────

function buildCustomProvider(def: CustomProviderDef, featureModelOverride?: string): AIProvider {
  const modelToUse = featureModelOverride ?? def.modelOverride ?? '';
  if (def.type === 'openai_compat') {
    const headers = (key: string): Record<string, string> => {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) h['Authorization'] = `Bearer ${key}`;
      return h;
    };
    return {
      id: def.id,
      name: def.name,
      callText: async (system, user) => {
        const res = await fetch(`${def.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: headers(def.apiKey),
          body: JSON.stringify({
            model: modelToUse,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: 0.3,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(`${def.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
        }
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error(`${def.name} からの応答が空です`);
        return text.trim();
      },
      callJson: async (system, user) => {
        const jsonSystem = `${system}\n\n必ず有効なJSONのみを返してください。説明文・コードフェンス不要。`;
        const res = await fetch(`${def.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: headers(def.apiKey),
          body: JSON.stringify({
            model: modelToUse,
            messages: [{ role: 'system', content: jsonSystem }, { role: 'user', content: user }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(`${def.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
        }
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        const raw = data.choices?.[0]?.message?.content ?? '{"candidates":[]}';
        return cleanJsonResponse(raw);
      },
      listModels: async () => {
        const cached = await getCachedModels(def.id);
        if (cached) return cached;
        try {
          const res = await fetch(`${def.endpoint}/v1/models`, {
            headers: def.apiKey ? { 'Authorization': `Bearer ${def.apiKey}` } : {},
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return [];
          const data = await res.json() as { data?: { id: string }[] };
          const excludePrefixes = ['dall-e-', 'whisper-', 'tts-', 'text-embedding-', 'text-moderation-'];
          const allModels: ModelInfo[] = (data.data ?? []).map(m => ({ id: m.id, name: m.id, providerId: def.id }));
          const filteredModels = allModels.filter(m => !excludePrefixes.some(p => m.id.startsWith(p)));
          const models = filteredModels.length > 0 ? filteredModels : allModels;
          await setCachedModels(def.id, models);
          return models;
        } catch { return []; }
      },
      testConnection: async () => {
        try {
          const res = await fetch(`${def.endpoint}/v1/chat/completions`, {
            method: 'POST',
            headers: headers(def.apiKey),
            body: JSON.stringify({ model: modelToUse, messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
            throw new Error(body.error?.message ?? `HTTP ${res.status}`);
          }
          return { ok: true, message: `接続成功 — ${def.name} に接続できました` };
        } catch (e: unknown) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
    };
  }

  const claudeModelToUse = featureModelOverride ?? def.modelOverride ?? 'claude-3-5-haiku-20241022';
  return {
    id: def.id,
    name: def.name,
    callText: async (system, user) => {
      if (!def.apiKey) throw new Error(`${def.name} APIキーが設定されていません`);
      const res = await fetch(`${def.endpoint}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': def.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: claudeModelToUse, max_tokens: 8192, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(`${def.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
      }
      const data = await res.json() as { content?: { type: string; text: string }[] };
      const text = data.content?.find(c => c.type === 'text')?.text;
      if (!text) throw new Error(`${def.name} からの応答が空です`);
      return text.trim();
    },
    callJson: async (system, user) => {
      if (!def.apiKey) throw new Error(`${def.name} APIキーが設定されていません`);
      const jsonSystem = `${system}\n\n必ず有効なJSONのみを返してください。説明文・コードフェンス不要。`;
      const res = await fetch(`${def.endpoint}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': def.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: claudeModelToUse, max_tokens: 8192, system: jsonSystem, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(`${def.name} エラー: ${body.error?.message ?? `HTTP ${res.status}`}`);
      }
      const data = await res.json() as { content?: { type: string; text: string }[] };
      const raw = data.content?.find(c => c.type === 'text')?.text ?? '{"candidates":[]}';
      return cleanJsonResponse(raw);
    },
    listModels: async () => [],
    testConnection: async () => {
      if (!def.apiKey) return { ok: false, message: 'APIキーが設定されていません' };
      try {
        const res = await fetch(`${def.endpoint}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': def.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: claudeModelToUse, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        }
        return { ok: true, message: `接続成功 — ${def.name} に接続できました` };
      } catch (e: unknown) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// ─── プリセットプロバイダー ──────────────────────────────────────

const PRESET_PROVIDERS: Record<string, AIProvider> = {
  gemini:      new GeminiProvider(),
  ollama:      new OllamaProvider(),
  claude:      new ClaudeProvider(),
  openai:      new OpenAIProvider(),
  groq:        new OpenAICompatibleProvider('groq',       'Groq',       null,                          SETTING_KEYS.GROQ_API_KEY,       SETTING_KEYS.GROQ_MODEL,       'https://api.groq.com/openai',   'llama-3.3-70b-versatile'),
  openrouter:  new OpenAICompatibleProvider('openrouter', 'OpenRouter',  null,                          SETTING_KEYS.OPENROUTER_API_KEY, SETTING_KEYS.OPENROUTER_MODEL, 'https://openrouter.ai/api',     'openai/gpt-4o-mini'),
  nanogpt:     new OpenAICompatibleProvider('nanogpt',    'nano-gpt',    null,                          SETTING_KEYS.NANOGPT_API_KEY,    SETTING_KEYS.NANOGPT_MODEL,    'https://nano-gpt.com/api',      'gpt-4o-mini'),
  lmstudio:    new OpenAICompatibleProvider('lmstudio',   'LM Studio',   SETTING_KEYS.LMSTUDIO_ENDPOINT, null,                           SETTING_KEYS.LMSTUDIO_MODEL,   'http://localhost:1234',         ''),
};

export const PRESET_PROVIDER_LIST = [
  { id: 'gemini',     name: 'Gemini API',    sub: '推奨・無料' },
  { id: 'claude',     name: 'Claude',        sub: 'Anthropic' },
  { id: 'openai',     name: 'OpenAI',        sub: 'GPT-4o 等' },
  { id: 'groq',       name: 'Groq',          sub: '高速推論' },
  { id: 'openrouter', name: 'OpenRouter',    sub: '多モデル対応' },
  { id: 'nanogpt',    name: 'nano-gpt',      sub: 'OpenAI互換' },
  { id: 'lmstudio',   name: 'LM Studio',     sub: 'ローカル' },
  { id: 'ollama',     name: 'Ollama',        sub: 'ローカル' },
] as const;

// ─── ファクトリ ──────────────────────────────────────────────────

export async function getProvider(providerId: string, featureModelOverride?: string): Promise<AIProvider> {
  const preset = PRESET_PROVIDERS[providerId];
  if (preset) {
    if (featureModelOverride) {
      (preset as any)._modelOverride = featureModelOverride;
    }
    return preset;
  }

  // カスタムプロバイダー検索
  try {
    const raw = await getSetting(SETTING_KEYS.CUSTOM_PROVIDERS);
    if (raw) {
      const customs = JSON.parse(raw) as CustomProviderDef[];
      const custom = customs.find(c => c.id === providerId);
      if (custom) {
        const decryptedCustom = { ...custom };
        if (custom.apiKey && custom.apiKey.startsWith('ENC:')) {
          if (!isUnlocked()) {
            throw new Error('セッションが期限切れです。パスワードを再入力してください。');
          }
          try {
            decryptedCustom.apiKey = await decrypt(custom.apiKey);
          } catch {
            throw new Error('カスタムプロバイダーのAPIキー復号に失敗しました。');
          }
        }
        return buildCustomProvider(decryptedCustom, featureModelOverride);
      }
    }
  } catch { /* パース失敗は無視 */ }

  throw new Error(`プロバイダー "${providerId}" が見つかりません`);
}

const FEATURE_PROVIDER_KEYS: Record<FeatureKey, string> = {
  daily_report:    SETTING_KEYS.FEATURE_PROVIDER_DAILY_REPORT,
  weekly_report:   SETTING_KEYS.FEATURE_PROVIDER_WEEKLY_REPORT,
  briefing:        SETTING_KEYS.FEATURE_PROVIDER_BRIEFING,
  calendar_comment: SETTING_KEYS.FEATURE_PROVIDER_CALENDAR_COMMENT,
  task_extract:    SETTING_KEYS.FEATURE_PROVIDER_TASK_EXTRACT,
};

const FEATURE_MODEL_KEYS: Record<FeatureKey, string> = {
  daily_report:    SETTING_KEYS.FEATURE_MODEL_DAILY_REPORT,
  weekly_report:   SETTING_KEYS.FEATURE_MODEL_WEEKLY_REPORT,
  briefing:        SETTING_KEYS.FEATURE_MODEL_BRIEFING,
  calendar_comment: SETTING_KEYS.FEATURE_MODEL_CALENDAR_COMMENT,
  task_extract:    SETTING_KEYS.FEATURE_MODEL_TASK_EXTRACT,
};

export async function getProviderForFeature(feature?: FeatureKey): Promise<AIProvider> {
  if (feature) {
    const featureProviderId = await getSetting(FEATURE_PROVIDER_KEYS[feature]);
    if (featureProviderId && featureProviderId !== 'disabled' && featureProviderId !== '') {
      try {
        const featureModel = await getSetting(FEATURE_MODEL_KEYS[feature]);
        return await getProvider(featureProviderId, featureModel || undefined);
      } catch { /* グローバル設定にフォールバック */ }
    }
  }

  const globalProviderId = (await getSetting(SETTING_KEYS.AI_PROVIDER)) ?? 'disabled';
  if (globalProviderId === 'disabled' || !globalProviderId) {
    throw new Error('AIプロバイダーが設定されていません。設定画面からプロバイダーを選択してください。');
  }
  return getProvider(globalProviderId);
}

export async function listAllProviders(): Promise<{ id: string; name: string; isCustom?: boolean }[]> {
  const customs: { id: string; name: string; isCustom: boolean }[] = [];
  try {
    const raw = await getSetting(SETTING_KEYS.CUSTOM_PROVIDERS);
    if (raw) {
      const defs = JSON.parse(raw) as CustomProviderDef[];
      customs.push(...defs.map(d => ({ id: d.id, name: d.name, isCustom: true })));
    }
  } catch { /* 無視 */ }
  return [...PRESET_PROVIDER_LIST.map(p => ({ id: p.id, name: p.name })), ...customs];
}

// ─── 互換レイヤー（既存コードとの後方互換） ─────────────────────

/** @deprecated Settings.tsx から直接 getProvider().testConnection() を使用してください */
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

/** @deprecated Settings.tsx から直接 getProvider().testConnection() を使用してください */
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
          signal: AbortSignal.timeout(120_000),
      }
    );
    if (res.status === 400) return { connected: true };
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    return { connected: true };
  } catch (e: unknown) {
    return { connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── 内部 callAI / callAIForJson ────────────────────────────────

async function callAI(systemPrompt: string, userMessage: string, feature?: FeatureKey): Promise<string> {
  const provider = await getProviderForFeature(feature);
  return provider.callText(systemPrompt, userMessage);
}

async function callAIForJson(systemPrompt: string, userMessage: string, feature?: FeatureKey): Promise<string> {
  const provider = await getProviderForFeature(feature);
  return provider.callJson(systemPrompt, userMessage);
}

// ─── プロンプト定義 ─────────────────────────────────────────────

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

// ─── 公開関数 ──────────────────────────────────────────────────

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

  return callAI(systemPrompt, userMessage, 'calendar_comment');
}

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
    return await callAI(DAILY_SYSTEM.replace(/{DATE}/g, date), userMessage, 'daily_report');
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : String(e));
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
    return await callAI(systemPrompt, userMessage, 'weekly_report');
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

// ─── タスク候補抽出 ─────────────────────────────────────────────

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
    raw = await callAIForJson(TASK_EXTRACT_SYSTEM, userMessage, 'task_extract');
    const parsed = JSON.parse(raw) as { candidates?: TaskCandidate[] };
    return parsed.candidates ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const preview = raw.length > 0 ? `\n受信内容(先頭100文字): ${raw.slice(0, 100)}` : '';
    throw new Error(`タスク候補の抽出に失敗しました: ${msg}${preview}`);
  }
}

// ─── 執事ブリーフィング ─────────────────────────────────────────

export interface ButlerBriefing {
  date: string;
  morning: string[];
  noon: string[];
  afternoon: string[];
  night: string[];
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

  const raw = await callAIForJson(systemPrompt, userMessage, 'briefing');
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
