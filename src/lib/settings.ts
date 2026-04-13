import { selectDb, executeDb } from './db';
import { encrypt, decrypt as sessionDecrypt, isUnlocked } from './session';

export const SETTING_KEYS = {
  DAILY_REPORT_PATH: 'daily_report_path',
  WEEKLY_REPORT_PATH: 'weekly_report_path',
  GLOBAL_SHORTCUT: 'global_shortcut',
  AUTOSTART_ENABLED: 'autostart_enabled',
  AI_PROVIDER: 'ai_provider',       // 'ollama' | 'gemini' | 'claude' | 'openai' | 'groq' | ... | 'disabled'
  OLLAMA_ENDPOINT: 'ollama_endpoint',
  OLLAMA_MODEL: 'ollama_model',
  GEMINI_API_KEY: 'gemini_api_key',
  GEMINI_MODEL: 'gemini_model',
  // Claude (Anthropic)
  CLAUDE_API_KEY: 'claude_api_key',
  CLAUDE_MODEL: 'claude_model',
  // OpenAI
  OPENAI_API_KEY: 'openai_api_key',
  OPENAI_MODEL: 'openai_model',
  // Groq
  GROQ_API_KEY: 'groq_api_key',
  GROQ_MODEL: 'groq_model',
  // OpenRouter
  OPENROUTER_API_KEY: 'openrouter_api_key',
  OPENROUTER_MODEL: 'openrouter_model',
  // nano-gpt
  NANOGPT_API_KEY: 'nanogpt_api_key',
  NANOGPT_MODEL: 'nanogpt_model',
  // LM Studio（エンドポイントはユーザー入力）
  LMSTUDIO_ENDPOINT: 'lmstudio_endpoint',
  LMSTUDIO_MODEL: 'lmstudio_model',
  // カスタムプロバイダー（JSON配列）
  CUSTOM_PROVIDERS: 'custom_providers',
  // 機能別プロバイダー（空文字はグローバル設定にフォールバック）
  FEATURE_PROVIDER_DAILY_REPORT: 'feature_provider_daily_report',
  FEATURE_PROVIDER_WEEKLY_REPORT: 'feature_provider_weekly_report',
  FEATURE_PROVIDER_BRIEFING: 'feature_provider_briefing',
  FEATURE_PROVIDER_CALENDAR_COMMENT: 'feature_provider_calendar_comment',
  FEATURE_PROVIDER_TASK_EXTRACT: 'feature_provider_task_extract',
  FEATURE_MODEL_DAILY_REPORT: 'feature_model_daily_report',
  FEATURE_MODEL_WEEKLY_REPORT: 'feature_model_weekly_report',
  FEATURE_MODEL_BRIEFING: 'feature_model_briefing',
  FEATURE_MODEL_CALENDAR_COMMENT: 'feature_model_calendar_comment',
  FEATURE_MODEL_TASK_EXTRACT: 'feature_model_task_extract',
  // モデル一覧キャッシュ（TTL: 1時間）
  MODELS_CACHE: 'models_cache',
  REMINDER_ENABLED: 'reminder_enabled',
  REMINDER_TIME: 'reminder_time',
  REMINDER_WEEKDAYS_ONLY: 'reminder_weekdays_only',
  LAST_BRIEFING_DATE: 'last_briefing_date',
  BUTLER_BRIEFING: 'butler_briefing',
  THEME: 'theme',
  SYNC_FOLDER: 'sync_folder',
  LAST_SYNC_AT: 'last_sync_at',
  // 同期モード
  SYNC_MODE: 'sync_mode', // 'folder' | 's3' | 'none'
  // S3同期設定
  S3_ENDPOINT: 's3_endpoint',
  S3_REGION: 's3_region',
  S3_BUCKET: 's3_bucket',
  S3_ACCESS_KEY: 's3_access_key',
  S3_SECRET_KEY: 's3_secret_key',
  S3_PREFIX: 's3_prefix',
  // S3同期タイミング設定
  S3_SYNC_INTERVAL: 's3_sync_interval', // 'realtime_only' | '1h' | '3h' | '6h'
  LAST_S3_SYNC_AT: 'last_s3_sync_at',
  // マスターパスワード
  MASTER_PASSWORD_HASH: 'master_password_hash',
  SESSION_DURATION: 'session_duration',
} as const;

export const ENCRYPTED_KEYS = [
  SETTING_KEYS.GEMINI_API_KEY,
  SETTING_KEYS.CLAUDE_API_KEY,
  SETTING_KEYS.OPENAI_API_KEY,
  SETTING_KEYS.GROQ_API_KEY,
  SETTING_KEYS.OPENROUTER_API_KEY,
  SETTING_KEYS.NANOGPT_API_KEY,
  SETTING_KEYS.S3_ACCESS_KEY,
  SETTING_KEYS.S3_SECRET_KEY,
] as const;

export async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await selectDb<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await executeDb(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await selectDb<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function shouldEncrypt(key: string): boolean {
  return ENCRYPTED_KEYS.includes(key as typeof ENCRYPTED_KEYS[number]);
}

export async function setEncryptedSetting(key: string, value: string): Promise<void> {
  if (shouldEncrypt(key) && value) {
    if (!isUnlocked()) {
      throw new Error('Session is locked. Unlock to save encrypted settings.');
    }
    const encrypted = await encrypt(value);
    await setSetting(key, encrypted);
    return;
  }
  await setSetting(key, value);
}

export async function getDecryptedSetting(key: string): Promise<string | null> {
  const value = await getSetting(key);
  if (!value) return null;
  
  if (value.startsWith('ENC:')) {
    if (!isUnlocked()) {
      return null;
    }
    try {
      return await sessionDecrypt(value);
    } catch {
      return null;
    }
  }
  
  return value;
}

export { encrypt, sessionDecrypt as decrypt, isUnlocked };

export interface CustomProviderDef {
  id: string;
  name: string;
  type: 'openai_compat' | 'claude_compat';
  endpoint: string;
  apiKey: string;
  modelOverride?: string;
}

export async function setEncryptedCustomProviders(providers: CustomProviderDef[]): Promise<void> {
  if (!isUnlocked()) {
    await setSetting(SETTING_KEYS.CUSTOM_PROVIDERS, JSON.stringify(providers));
    return;
  }
  
  const encryptedProviders: CustomProviderDef[] = [];
  for (const p of providers) {
    if (p.apiKey && !p.apiKey.startsWith('ENC:')) {
      try {
        encryptedProviders.push({ ...p, apiKey: await encrypt(p.apiKey) });
      } catch {
        encryptedProviders.push(p);
      }
    } else {
      encryptedProviders.push(p);
    }
  }
  
  await setSetting(SETTING_KEYS.CUSTOM_PROVIDERS, JSON.stringify(encryptedProviders));
}
