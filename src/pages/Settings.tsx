import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import {
  FolderOpen, CheckCircle, AlertCircle, Wifi, WifiOff, RefreshCw,
  Eye, EyeOff, Upload, Download, Clock, FileDown, Plus, Trash2, Pencil, X,
  Lock,
} from 'lucide-react';
import { getSetting, setSetting, setEncryptedSetting, setEncryptedCustomProviders, getDecryptedSetting, SETTING_KEYS } from '../lib/settings';
import { isUnlocked, getState, type SessionDuration } from '../lib/session';
import type { CustomProviderDef } from '../lib/settings';
import { PageHeader, OrnateCard, CardHeading } from '../components/ClassicUI';
import { ModelSelector } from '../components/ModelSelector';
import { registerShortcut } from '../lib/shortcut';
import { MasterPasswordSetupModal } from '../components/MasterPasswordSetupModal';
import { getProvider, PRESET_PROVIDER_LIST, type FeatureKey } from '../lib/ai';
import { pushSync, pullSync, getSyncFolderDbMtime } from '../lib/sync';
import { selectDb } from '../lib/db';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// ─── 型定義 ──────────────────────────────────────────────────────

interface SettingsForm {
  dailyReportPath: string;
  weeklyReportPath: string;
  globalShortcut: string;
  autostartEnabled: boolean;
  // グローバルAIプロバイダー
  aiProvider: string;
  // Gemini
  geminiApiKey: string;
  geminiModel: string;
  // Ollama
  ollamaEndpoint: string;
  ollamaModel: string;
  // Claude
  claudeApiKey: string;
  claudeModel: string;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  // Groq
  groqApiKey: string;
  groqModel: string;
  // OpenRouter
  openrouterApiKey: string;
  openrouterModel: string;
  // nano-gpt
  nanogptApiKey: string;
  nanogptModel: string;
  // LM Studio
  lmstudioEndpoint: string;
  lmstudioModel: string;
  // 機能別プロバイダー（空文字=グローバル設定に従う）
  featureProviderDailyReport: string;
  featureProviderWeeklyReport: string;
  featureProviderBriefing: string;
  featureProviderCalendarComment: string;
  featureProviderTaskExtract: string;
  featureModelDailyReport: string;
  featureModelWeeklyReport: string;
  featureModelBriefing: string;
  featureModelCalendarComment: string;
  featureModelTaskExtract: string;
  // その他
  reminderEnabled: boolean;
  reminderTime: string;
  reminderWeekdaysOnly: boolean;
  syncFolder: string;
  // マスターパスワード
  masterPasswordEnabled: boolean;
  sessionDuration: SessionDuration;
}

// カスタムプロバイダー編集用フォーム
interface CustomProviderForm {
  id: string;
  name: string;
  type: 'openai_compat' | 'claude_compat';
  endpoint: string;
  apiKey: string;
  modelOverride: string;
}

const EMPTY_CUSTOM_FORM: CustomProviderForm = {
  id: '',
  name: '',
  type: 'openai_compat',
  endpoint: '',
  apiKey: '',
  modelOverride: '',
};

const SESSION_DURATION_OPTIONS: { value: SessionDuration; label: string }[] = [
  { value: 'APP_RESTART', label: 'アプリ再起動まで' },
  { value: '1h', label: '1時間' },
  { value: '6h', label: '6時間' },
  { value: '1d', label: '1日' },
  { value: '2w', label: '2週間' },
  { value: '1m', label: '1ヶ月' },
  { value: '3m', label: '3ヶ月' },
  { value: 'FOREVER', label: '無期限（手動ロックまで）' },
];

// 全プロバイダー選択肢（カスタムを含む場合は動的に追加）
const ALL_PROVIDER_OPTIONS = [
  ...PRESET_PROVIDER_LIST,
  { id: 'disabled', name: '無効', sub: 'AI機能をオフ' },
] as const;

// 機能別プロバイダー設定の定義
const FEATURE_SETTINGS: { key: FeatureKey; label: string; formKey: keyof SettingsForm; modelKey: keyof SettingsForm }[] = [
  { key: 'daily_report',    label: '日報生成',         formKey: 'featureProviderDailyReport',    modelKey: 'featureModelDailyReport' },
  { key: 'weekly_report',   label: '週報生成',         formKey: 'featureProviderWeeklyReport',   modelKey: 'featureModelWeeklyReport' },
  { key: 'briefing',       label: 'ブリーフィング',   formKey: 'featureProviderBriefing',       modelKey: 'featureModelBriefing' },
  { key: 'calendar_comment', label: 'カレンダーコメント', formKey: 'featureProviderCalendarComment', modelKey: 'featureModelCalendarComment' },
  { key: 'task_extract',   label: 'タスク抽出',       formKey: 'featureProviderTaskExtract',    modelKey: 'featureModelTaskExtract' },
];

// ─── コンポーネント ──────────────────────────────────────────────

export default function Settings() {
  const [form, setForm] = useState<SettingsForm>({
    dailyReportPath: '',
    weeklyReportPath: '',
    globalShortcut: 'Ctrl+Shift+M',
    autostartEnabled: false,
    aiProvider: 'disabled',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'qwen2.5:7b',
    claudeApiKey: '',
    claudeModel: 'claude-3-5-haiku-20241022',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    groqApiKey: '',
    groqModel: 'llama-3.3-70b-versatile',
    openrouterApiKey: '',
    openrouterModel: 'openai/gpt-4o-mini',
    nanogptApiKey: '',
    nanogptModel: 'gpt-4o-mini',
    lmstudioEndpoint: 'http://localhost:1234',
    lmstudioModel: '',
    featureProviderDailyReport: '',
    featureProviderWeeklyReport: '',
    featureProviderBriefing: '',
    featureProviderCalendarComment: '',
    featureProviderTaskExtract: '',
    featureModelDailyReport: '',
    featureModelWeeklyReport: '',
    featureModelBriefing: '',
    featureModelCalendarComment: '',
    featureModelTaskExtract: '',
    reminderEnabled: false,
    reminderTime: '18:00',
    reminderWeekdaysOnly: true,
    syncFolder: '',
    masterPasswordEnabled: false,
    sessionDuration: 'APP_RESTART',
  });

  // カスタムプロバイダー管理
  const [customProviders, setCustomProviders] = useState<CustomProviderDef[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState<CustomProviderForm>(EMPTY_CUSTOM_FORM);

  // API キー表示トグル（プロバイダーIDをキーに管理）
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // 接続テスト
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // 機能別プロバイダー折りたたみ
  const [showFeatureSettings, setShowFeatureSettings] = useState(false);

  // その他
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
  const [exportMsg, setExportMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pushing' | 'pulling' | 'done' | 'error'>('idle');
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncFolderDbTime, setSyncFolderDbTime] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [shortcutStatus, setShortcutStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [shortcutError, setShortcutError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sessionState, setSessionState] = useState<{ unlocked: boolean; expiresAt: Date | null }>({ unlocked: false, expiresAt: null });
  const [confirmDisablePassword, setConfirmDisablePassword] = useState(false);

  // ─── 初期ロード ───────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [
        daily, weekly, shortcut, autostart, autostartActual,
        provider,
        gemModel,
        olEndpoint, olModel,
        claudeModel,
        openaiModel,
        groqModel,
        openrouterModel,
        nanogptModel,
        lmstudioEndpoint, lmstudioModel,
        customRaw,
        fpDaily, fpWeekly, fpBriefing, fpCalendar, fpTask,
        fmDaily, fmWeekly, fmBriefing, fmCalendar, fmTask,
        reminderEnabled, reminderTime, reminderWeekdaysOnly,
        syncFolderSetting, lastSyncAtSetting,
        masterPasswordHash, sessionDurationSetting,
      ] = await Promise.all([
        getSetting(SETTING_KEYS.DAILY_REPORT_PATH),
        getSetting(SETTING_KEYS.WEEKLY_REPORT_PATH),
        getSetting(SETTING_KEYS.GLOBAL_SHORTCUT),
        getSetting(SETTING_KEYS.AUTOSTART_ENABLED),
        isEnabled().catch(() => false),
        getSetting(SETTING_KEYS.AI_PROVIDER),
        getSetting(SETTING_KEYS.GEMINI_MODEL),
        getSetting(SETTING_KEYS.OLLAMA_ENDPOINT),
        getSetting(SETTING_KEYS.OLLAMA_MODEL),
        getSetting(SETTING_KEYS.CLAUDE_MODEL),
        getSetting(SETTING_KEYS.OPENAI_MODEL),
        getSetting(SETTING_KEYS.GROQ_MODEL),
        getSetting(SETTING_KEYS.OPENROUTER_MODEL),
        getSetting(SETTING_KEYS.NANOGPT_MODEL),
        getSetting(SETTING_KEYS.LMSTUDIO_ENDPOINT),
        getSetting(SETTING_KEYS.LMSTUDIO_MODEL),
        getSetting(SETTING_KEYS.CUSTOM_PROVIDERS),
        getSetting(SETTING_KEYS.FEATURE_PROVIDER_DAILY_REPORT),
        getSetting(SETTING_KEYS.FEATURE_PROVIDER_WEEKLY_REPORT),
        getSetting(SETTING_KEYS.FEATURE_PROVIDER_BRIEFING),
        getSetting(SETTING_KEYS.FEATURE_PROVIDER_CALENDAR_COMMENT),
        getSetting(SETTING_KEYS.FEATURE_PROVIDER_TASK_EXTRACT),
        getSetting(SETTING_KEYS.FEATURE_MODEL_DAILY_REPORT),
        getSetting(SETTING_KEYS.FEATURE_MODEL_WEEKLY_REPORT),
        getSetting(SETTING_KEYS.FEATURE_MODEL_BRIEFING),
        getSetting(SETTING_KEYS.FEATURE_MODEL_CALENDAR_COMMENT),
        getSetting(SETTING_KEYS.FEATURE_MODEL_TASK_EXTRACT),
        getSetting(SETTING_KEYS.REMINDER_ENABLED),
        getSetting(SETTING_KEYS.REMINDER_TIME),
        getSetting(SETTING_KEYS.REMINDER_WEEKDAYS_ONLY),
        getSetting(SETTING_KEYS.SYNC_FOLDER),
        getSetting(SETTING_KEYS.LAST_SYNC_AT),
        getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH),
        getSetting(SETTING_KEYS.SESSION_DURATION),
      ]);

      const [
        gemKey, claudeKey, openaiKey, groqKey, openrouterKey, nanogptKey,
      ] = await Promise.all([
        getDecryptedSetting(SETTING_KEYS.GEMINI_API_KEY),
        getDecryptedSetting(SETTING_KEYS.CLAUDE_API_KEY),
        getDecryptedSetting(SETTING_KEYS.OPENAI_API_KEY),
        getDecryptedSetting(SETTING_KEYS.GROQ_API_KEY),
        getDecryptedSetting(SETTING_KEYS.OPENROUTER_API_KEY),
        getDecryptedSetting(SETTING_KEYS.NANOGPT_API_KEY),
      ]);

      const syncFolderVal = syncFolderSetting ?? '';
      setLastSyncAt(lastSyncAtSetting ?? null);
      if (syncFolderVal) {
        getSyncFolderDbMtime(syncFolderVal).then(mtime => {
          if (mtime) setSyncFolderDbTime(format(new Date(mtime * 1000), 'M/d HH:mm', { locale: ja }));
        }).catch(() => {});
      }

      let customProvidersList: CustomProviderDef[] = [];
      try {
        if (customRaw) customProvidersList = JSON.parse(customRaw) as CustomProviderDef[];
      } catch { /* パース失敗は無視 */ }

      if (customProvidersList.length > 0 && isUnlocked()) {
        const decryptedProviders: CustomProviderDef[] = [];
        for (const p of customProvidersList) {
          if (p.apiKey && p.apiKey.startsWith('ENC:')) {
            try {
              const decrypted = await getDecryptedSetting('__custom_' + p.id);
              decryptedProviders.push({ ...p, apiKey: decrypted ?? p.apiKey });
            } catch {
              decryptedProviders.push(p);
            }
          } else {
            decryptedProviders.push(p);
          }
        }
        customProvidersList = decryptedProviders;
      }
      setCustomProviders(customProvidersList);

      setForm({
        dailyReportPath: daily ?? '',
        weeklyReportPath: weekly ?? '',
        globalShortcut: shortcut ?? 'Ctrl+Shift+M',
        autostartEnabled: autostart === 'true' || autostartActual,
        aiProvider: provider ?? 'disabled',
        geminiApiKey: gemKey ?? '',
        geminiModel: gemModel ?? 'gemini-2.5-flash',
        ollamaEndpoint: olEndpoint ?? 'http://localhost:11434',
        ollamaModel: olModel ?? 'qwen2.5:7b',
        claudeApiKey: claudeKey ?? '',
        claudeModel: claudeModel ?? 'claude-3-5-haiku-20241022',
        openaiApiKey: openaiKey ?? '',
        openaiModel: openaiModel ?? 'gpt-4o-mini',
        groqApiKey: groqKey ?? '',
        groqModel: groqModel ?? 'llama-3.3-70b-versatile',
        openrouterApiKey: openrouterKey ?? '',
        openrouterModel: openrouterModel ?? 'openai/gpt-4o-mini',
        nanogptApiKey: nanogptKey ?? '',
        nanogptModel: nanogptModel ?? 'gpt-4o-mini',
        lmstudioEndpoint: lmstudioEndpoint ?? 'http://localhost:1234',
        lmstudioModel: lmstudioModel ?? '',
        featureProviderDailyReport: fpDaily ?? '',
        featureProviderWeeklyReport: fpWeekly ?? '',
        featureProviderBriefing: fpBriefing ?? '',
        featureProviderCalendarComment: fpCalendar ?? '',
        featureProviderTaskExtract: fpTask ?? '',
        featureModelDailyReport: fmDaily ?? '',
        featureModelWeeklyReport: fmWeekly ?? '',
        featureModelBriefing: fmBriefing ?? '',
        featureModelCalendarComment: fmCalendar ?? '',
        featureModelTaskExtract: fmTask ?? '',
        reminderEnabled: reminderEnabled === 'true',
        reminderTime: reminderTime ?? '18:00',
        reminderWeekdaysOnly: reminderWeekdaysOnly !== 'false',
        syncFolder: syncFolderVal,
        masterPasswordEnabled: !!masterPasswordHash,
        sessionDuration: (sessionDurationSetting as SessionDuration) ?? 'APP_RESTART',
      });
      
      setSessionState(getState());
    }
    load();
  }, []);

  // ─── ヘルパー ─────────────────────────────────────────────────

  const setF = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const toggleKey = (id: string) => setShowKeys(k => ({ ...k, [id]: !k[id] }));

  /** 現在選択中のプロバイダー設定をDBに保存してから接続テストを実行 */
  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      // テスト前に現在のプロバイダー設定をDBへ保存
      await saveProviderSettings(form.aiProvider);

      const provider = await getProvider(form.aiProvider);
      const result = await provider.testConnection();
      setTestStatus({ ok: result.ok, msg: result.message });
    } catch (e: unknown) {
      setTestStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const saveProviderSettings = async (providerId: string) => {
    const saves: Promise<void>[] = [];
    switch (providerId) {
      case 'gemini':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.GEMINI_API_KEY, form.geminiApiKey),
          setSetting(SETTING_KEYS.GEMINI_MODEL, form.geminiModel),
        );
        break;
      case 'ollama':
        saves.push(
          setSetting(SETTING_KEYS.OLLAMA_ENDPOINT, form.ollamaEndpoint),
          setSetting(SETTING_KEYS.OLLAMA_MODEL, form.ollamaModel),
        );
        break;
      case 'claude':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.CLAUDE_API_KEY, form.claudeApiKey),
          setSetting(SETTING_KEYS.CLAUDE_MODEL, form.claudeModel),
        );
        break;
      case 'openai':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.OPENAI_API_KEY, form.openaiApiKey),
          setSetting(SETTING_KEYS.OPENAI_MODEL, form.openaiModel),
        );
        break;
      case 'groq':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.GROQ_API_KEY, form.groqApiKey),
          setSetting(SETTING_KEYS.GROQ_MODEL, form.groqModel),
        );
        break;
      case 'openrouter':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.OPENROUTER_API_KEY, form.openrouterApiKey),
          setSetting(SETTING_KEYS.OPENROUTER_MODEL, form.openrouterModel),
        );
        break;
      case 'nanogpt':
        saves.push(
          setEncryptedSetting(SETTING_KEYS.NANOGPT_API_KEY, form.nanogptApiKey),
          setSetting(SETTING_KEYS.NANOGPT_MODEL, form.nanogptModel),
        );
        break;
      case 'lmstudio':
        saves.push(
          setSetting(SETTING_KEYS.LMSTUDIO_ENDPOINT, form.lmstudioEndpoint),
          setSetting(SETTING_KEYS.LMSTUDIO_MODEL, form.lmstudioModel),
        );
        break;
      // カスタムプロバイダーは既にDB上に保存されているため追加処理不要
    }
    await Promise.all(saves);
  };

  // ─── カスタムプロバイダー CRUD ────────────────────────────────

  const openCustomAdd = () => {
    setEditingCustomId(null);
    setCustomForm(EMPTY_CUSTOM_FORM);
    setShowCustomForm(true);
  };

  const openCustomEdit = (def: CustomProviderDef) => {
    setEditingCustomId(def.id);
    setCustomForm({ id: def.id, name: def.name, type: def.type, endpoint: def.endpoint, apiKey: def.apiKey, modelOverride: def.modelOverride ?? '' });
    setShowCustomForm(true);
  };

  const saveCustomProvider = async () => {
    if (!customForm.id.trim() || !customForm.name.trim() || !customForm.endpoint.trim()) return;
    const def: CustomProviderDef = {
      id: customForm.id.trim(),
      name: customForm.name.trim(),
      type: customForm.type,
      endpoint: customForm.endpoint.trim(),
      apiKey: customForm.apiKey,
      modelOverride: customForm.modelOverride.trim() || undefined,
    };
    const updated = editingCustomId
      ? customProviders.map(c => c.id === editingCustomId ? def : c)
      : [...customProviders, def];
    setCustomProviders(updated);
    await setEncryptedCustomProviders(updated);
    setShowCustomForm(false);
    setEditingCustomId(null);
  };

  const deleteCustomProvider = async (id: string) => {
    if (!window.confirm(`カスタムプロバイダー "${id}" を削除しますか？`)) return;
    const updated = customProviders.filter(c => c.id !== id);
    setCustomProviders(updated);
    await setEncryptedCustomProviders(updated);
  };

  // ─── 保存 ────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      await Promise.all([
        setSetting(SETTING_KEYS.DAILY_REPORT_PATH, form.dailyReportPath),
        setSetting(SETTING_KEYS.WEEKLY_REPORT_PATH, form.weeklyReportPath),
        setSetting(SETTING_KEYS.GLOBAL_SHORTCUT, form.globalShortcut),
        setSetting(SETTING_KEYS.AUTOSTART_ENABLED, String(form.autostartEnabled)),
        setSetting(SETTING_KEYS.AI_PROVIDER, form.aiProvider),
        setEncryptedSetting(SETTING_KEYS.GEMINI_API_KEY, form.geminiApiKey),
        setSetting(SETTING_KEYS.GEMINI_MODEL, form.geminiModel),
        setSetting(SETTING_KEYS.OLLAMA_ENDPOINT, form.ollamaEndpoint),
        setSetting(SETTING_KEYS.OLLAMA_MODEL, form.ollamaModel),
        setEncryptedSetting(SETTING_KEYS.CLAUDE_API_KEY, form.claudeApiKey),
        setSetting(SETTING_KEYS.CLAUDE_MODEL, form.claudeModel),
        setEncryptedSetting(SETTING_KEYS.OPENAI_API_KEY, form.openaiApiKey),
        setSetting(SETTING_KEYS.OPENAI_MODEL, form.openaiModel),
        setEncryptedSetting(SETTING_KEYS.GROQ_API_KEY, form.groqApiKey),
        setSetting(SETTING_KEYS.GROQ_MODEL, form.groqModel),
        setEncryptedSetting(SETTING_KEYS.OPENROUTER_API_KEY, form.openrouterApiKey),
        setSetting(SETTING_KEYS.OPENROUTER_MODEL, form.openrouterModel),
        setEncryptedSetting(SETTING_KEYS.NANOGPT_API_KEY, form.nanogptApiKey),
        setSetting(SETTING_KEYS.NANOGPT_MODEL, form.nanogptModel),
        setSetting(SETTING_KEYS.LMSTUDIO_ENDPOINT, form.lmstudioEndpoint),
        setSetting(SETTING_KEYS.LMSTUDIO_MODEL, form.lmstudioModel),
        setSetting(SETTING_KEYS.FEATURE_PROVIDER_DAILY_REPORT, form.featureProviderDailyReport),
        setSetting(SETTING_KEYS.FEATURE_PROVIDER_WEEKLY_REPORT, form.featureProviderWeeklyReport),
        setSetting(SETTING_KEYS.FEATURE_PROVIDER_BRIEFING, form.featureProviderBriefing),
        setSetting(SETTING_KEYS.FEATURE_PROVIDER_CALENDAR_COMMENT, form.featureProviderCalendarComment),
        setSetting(SETTING_KEYS.FEATURE_PROVIDER_TASK_EXTRACT, form.featureProviderTaskExtract),
        setSetting(SETTING_KEYS.FEATURE_MODEL_DAILY_REPORT, form.featureModelDailyReport),
        setSetting(SETTING_KEYS.FEATURE_MODEL_WEEKLY_REPORT, form.featureModelWeeklyReport),
        setSetting(SETTING_KEYS.FEATURE_MODEL_BRIEFING, form.featureModelBriefing),
        setSetting(SETTING_KEYS.FEATURE_MODEL_CALENDAR_COMMENT, form.featureModelCalendarComment),
        setSetting(SETTING_KEYS.FEATURE_MODEL_TASK_EXTRACT, form.featureModelTaskExtract),
        setSetting(SETTING_KEYS.REMINDER_ENABLED, String(form.reminderEnabled)),
        setSetting(SETTING_KEYS.REMINDER_TIME, form.reminderTime),
        setSetting(SETTING_KEYS.REMINDER_WEEKDAYS_ONLY, String(form.reminderWeekdaysOnly)),
        setSetting(SETTING_KEYS.SYNC_FOLDER, form.syncFolder),
        setSetting(SETTING_KEYS.SESSION_DURATION, form.sessionDuration),
      ]);

      try {
        if (form.autostartEnabled) { await enable(); } else { await disable(); }
      } catch { /* 開発モードではスキップ */ }

      if (form.globalShortcut) {
        setShortcutStatus('idle');
        setShortcutError('');
        const ok = await registerShortcut(form.globalShortcut, async () => {
          window.dispatchEvent(new CustomEvent('sebastian:open-memo'));
        });
        if (ok) {
          window.dispatchEvent(new CustomEvent('sebastian:shortcut-changed', { detail: form.globalShortcut }));
          setShortcutStatus('ok');
        } else {
          setShortcutStatus('error');
          setShortcutError(`「${form.globalShortcut}」の登録に失敗しました。キーの形式を確認してください（例: Ctrl+Shift+N、Alt+F2）`);
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`保存に失敗しました: ${msg}`);
      setSaveStatus('error');
    }
  };

  // ─── その他のハンドラ（変更なし） ────────────────────────────

  const pickFolder = async (field: 'dailyReportPath' | 'weeklyReportPath' | 'syncFolder') => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setForm(f => ({ ...f, [field]: selected }));
      if (field === 'syncFolder') {
        getSyncFolderDbMtime(selected).then(mtime => {
          setSyncFolderDbTime(mtime ? format(new Date(mtime * 1000), 'M/d HH:mm', { locale: ja }) : null);
        }).catch(() => setSyncFolderDbTime(null));
      }
    }
  };

  const handleExportAll = async () => {
    setExportStatus('exporting');
    setExportMsg('');
    let dailyCount = 0;
    let weeklyCount = 0;
    const errors: string[] = [];
    try {
      if (form.dailyReportPath) {
        const rows = await selectDb<{ date: string; content: string }>(
          'SELECT date, content FROM reports_daily ORDER BY date ASC'
        );
        for (const row of rows) {
          try {
            const fileName = `Nippo_${row.date.replace(/-/g, '')}.md`;
            const filePath = `${form.dailyReportPath}/${fileName}`.replace(/\\/g, '/');
            await invoke<void>('write_text_file', { path: filePath, content: row.content });
            dailyCount++;
          } catch { errors.push(`日報 ${row.date} の書き出し失敗`); }
        }
      }
      if (form.weeklyReportPath) {
        const rows = await selectDb<{ week_start_date: string; content: string }>(
          'SELECT week_start_date, content FROM reports_weekly ORDER BY week_start_date ASC'
        );
        for (const row of rows) {
          try {
            const fileName = `Shuho_${row.week_start_date.replace(/-/g, '')}.md`;
            const filePath = `${form.weeklyReportPath}/${fileName}`.replace(/\\/g, '/');
            await invoke<void>('write_text_file', { path: filePath, content: row.content });
            weeklyCount++;
          } catch { errors.push(`週報 ${row.week_start_date} の書き出し失敗`); }
        }
      }
      if (errors.length > 0) {
        setExportStatus('error');
        setExportMsg(errors.join(' / '));
      } else {
        setExportStatus('done');
        setExportMsg(`日報 ${dailyCount} 件・週報 ${weeklyCount} 件を書き出しました`);
        setTimeout(() => setExportStatus('idle'), 5000);
      }
    } catch (e: unknown) {
      setExportStatus('error');
      setExportMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePush = async () => {
    if (!form.syncFolder) return;
    setSyncStatus('pushing');
    setSyncMsg('');
    try {
      await pushSync(form.syncFolder);
      const now = new Date().toISOString();
      setLastSyncAt(now);
      setSyncFolderDbTime(format(new Date(), 'M/d HH:mm', { locale: ja }));
      setSyncStatus('done');
      setSyncMsg('同期フォルダに送り出しました');
      setTimeout(() => setSyncStatus('idle'), 4000);
    } catch (e: unknown) {
      setSyncStatus('error');
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePull = async () => {
    if (!form.syncFolder) return;
    const ok = window.confirm(
      '同期フォルダのDBで現在のデータを上書きします。\n現在のDBは自動的にバックアップされます。\n続けますか？'
    );
    if (!ok) return;
    setSyncStatus('pulling');
    setSyncMsg('');
    try {
      const backupPath = await pullSync(form.syncFolder);
      setSyncStatus('done');
      setSyncMsg(`取り込みました。バックアップ: ${backupPath}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: unknown) {
      setSyncStatus('error');
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // ─── プロバイダー別設定フォーム ───────────────────────────────

  const renderProviderSettings = () => {
    const p = form.aiProvider;

    if (p === 'gemini') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://aistudio.google.com/apikey（無料）"
          placeholder="AIzaSy..."
          id="gemini"
          value={form.geminiApiKey}
          onChange={v => setF('geminiApiKey', v)}
          showKey={showKeys['gemini']}
          onToggle={() => toggleKey('gemini')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="gemini" value={form.geminiModel} onChange={v => setF('geminiModel', v)} placeholder="gemini-2.5-flash" />
          <p className="text-xs text-sebastian-lightgray">推奨: <span className="font-mono">gemini-2.5-flash</span></p>
        </div>
      </div>
    );

    if (p === 'ollama') return (
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">エンドポイントURL</label>
          <input type="text" className={inputCls} value={form.ollamaEndpoint} onChange={e => setF('ollamaEndpoint', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="ollama" value={form.ollamaModel} onChange={v => setF('ollamaModel', v)} placeholder="qwen2.5:7b" />
        </div>
      </div>
    );

    if (p === 'claude') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://console.anthropic.com/"
          placeholder="sk-ant-..."
          id="claude"
          value={form.claudeApiKey}
          onChange={v => setF('claudeApiKey', v)}
          showKey={showKeys['claude']}
          onToggle={() => toggleKey('claude')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="claude" value={form.claudeModel} onChange={v => setF('claudeModel', v)} placeholder="claude-3-5-haiku-20241022" />
          <p className="text-xs text-sebastian-lightgray">推奨: <span className="font-mono">claude-3-5-haiku-20241022</span>（高速・低コスト）</p>
        </div>
      </div>
    );

    if (p === 'openai') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://platform.openai.com/api-keys"
          placeholder="sk-..."
          id="openai"
          value={form.openaiApiKey}
          onChange={v => setF('openaiApiKey', v)}
          showKey={showKeys['openai']}
          onToggle={() => toggleKey('openai')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="openai" value={form.openaiModel} onChange={v => setF('openaiModel', v)} placeholder="gpt-4o-mini" />
          <p className="text-xs text-sebastian-lightgray">推奨: <span className="font-mono">gpt-4o-mini</span></p>
        </div>
      </div>
    );

    if (p === 'groq') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://console.groq.com/keys（無料）"
          placeholder="gsk_..."
          id="groq"
          value={form.groqApiKey}
          onChange={v => setF('groqApiKey', v)}
          showKey={showKeys['groq']}
          onToggle={() => toggleKey('groq')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="groq" value={form.groqModel} onChange={v => setF('groqModel', v)} placeholder="llama-3.3-70b-versatile" />
        </div>
      </div>
    );

    if (p === 'openrouter') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://openrouter.ai/keys"
          placeholder="sk-or-..."
          id="openrouter"
          value={form.openrouterApiKey}
          onChange={v => setF('openrouterApiKey', v)}
          showKey={showKeys['openrouter']}
          onToggle={() => toggleKey('openrouter')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="openrouter" value={form.openrouterModel} onChange={v => setF('openrouterModel', v)} placeholder="openai/gpt-4o-mini" />
        </div>
      </div>
    );

    if (p === 'nanogpt') return (
      <div className="space-y-4 pt-1">
        <ApiKeyField
          label="APIキー"
          hint="取得先: https://nano-gpt.com/"
          placeholder="nano-..."
          id="nanogpt"
          value={form.nanogptApiKey}
          onChange={v => setF('nanogptApiKey', v)}
          showKey={showKeys['nanogpt']}
          onToggle={() => toggleKey('nanogpt')}
          masterPasswordEnabled={form.masterPasswordEnabled}
        />
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="nanogpt" value={form.nanogptModel} onChange={v => setF('nanogptModel', v)} placeholder="gpt-4o-mini" />
        </div>
      </div>
    );

    if (p === 'lmstudio') return (
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">エンドポイントURL</label>
          <input type="text" className={inputCls} value={form.lmstudioEndpoint} onChange={e => setF('lmstudioEndpoint', e.target.value)} placeholder="http://localhost:1234" />
          <p className="text-xs text-sebastian-lightgray">LM Studio のローカルサーバーアドレス</p>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">モデル</label>
          <ModelSelector providerId="lmstudio" value={form.lmstudioModel} onChange={v => setF('lmstudioModel', v)} placeholder="（LM Studio でロード中のモデル）" />
        </div>
      </div>
    );

    // カスタムプロバイダー
    const customDef = customProviders.find(c => c.id === p);
    if (customDef) return (
      <div className="pt-1 space-y-2">
        <div className="bg-sebastian-parchment/50 border border-sebastian-border/40 rounded-lg px-3 py-2.5 text-xs space-y-1">
          <p><span className="text-sebastian-lightgray">タイプ:</span> <span className="font-medium">{customDef.type === 'openai_compat' ? 'OpenAI互換' : 'Claude互換'}</span></p>
          <p><span className="text-sebastian-lightgray">エンドポイント:</span> <span className="font-mono">{customDef.endpoint}</span></p>
          {customDef.modelOverride && <p><span className="text-sebastian-lightgray">モデル:</span> <span className="font-mono">{customDef.modelOverride}</span></p>}
        </div>
        <p className="text-xs text-sebastian-lightgray">設定変更は「カスタムプロバイダー」セクションから行ってください。</p>
      </div>
    );

    return null;
  };

  // ─── プロバイダー選択肢（カスタム含む） ─────────────────────

  const allProviderOptions = [
    ...ALL_PROVIDER_OPTIONS,
    ...customProviders.map(c => ({ id: c.id, name: c.name, sub: 'カスタム' })),
  ];

  // ─── スタイル定数 ────────────────────────────────────────────

  const inputCls = 'w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors';

  // ─── レンダリング ────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader label="SETTINGS" title="設定" />

      {/* ── AI設定 ───────────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
          <CardHeading>AI設定</CardHeading>

          {/* グローバルプロバイダー選択 */}
          <div className="space-y-2">
            <label className="block text-sm text-sebastian-gray font-serif">AIプロバイダー（グローバル）</label>
            <select
              className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors"
              value={form.aiProvider}
              onChange={e => { setF('aiProvider', e.target.value); setTestStatus(null); }}
            >
              {allProviderOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}{'sub' in opt && opt.sub ? ` — ${opt.sub}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* プロバイダー別設定 */}
          {form.aiProvider !== 'disabled' && renderProviderSettings()}

          {/* 接続テスト */}
          {form.aiProvider !== 'disabled' && (
            <div className="space-y-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-sebastian-text rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
                {testing ? '確認中...' : '接続テスト'}
              </button>
              {testStatus && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                  testStatus.ok
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {testStatus.ok ? <Wifi size={15} className="flex-shrink-0 mt-0.5" /> : <WifiOff size={15} className="flex-shrink-0 mt-0.5" />}
                  {testStatus.msg}
                </div>
              )}
            </div>
          )}

          {/* 機能別プロバイダー設定 */}
          <div className="border-t border-sebastian-border/30 pt-4">
            <button
              type="button"
              onClick={() => setShowFeatureSettings(v => !v)}
              className="flex items-center gap-2 text-sm text-sebastian-gray hover:text-sebastian-navy transition-colors font-serif"
            >
              <span className="text-sebastian-gold/60 text-[9px]">◆</span>
              機能別プロバイダー設定
              <span className="text-xs text-sebastian-lightgray ml-1">
                {showFeatureSettings ? '▲ 折りたたむ' : '▼ 展開する'}
              </span>
            </button>
            {showFeatureSettings && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-sebastian-lightgray">
                  機能ごとに別プロバイダーを使用できます。未設定の場合はグローバル設定に従います。
                </p>
                {FEATURE_SETTINGS.map(feat => (
                  <div key={feat.key} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-sebastian-gray w-36 shrink-0">{feat.label}</label>
                      <select
                        className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-sebastian-gold/50 transition-colors"
                        value={(form[feat.formKey] as string)}
                        onChange={e => setF(feat.formKey, e.target.value)}
                      >
                        <option value="">グローバル設定に従う</option>
                        {allProviderOptions.filter(o => o.id !== 'disabled').map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                    {(form[feat.formKey] as string) && (
                      <div className="ml-36 flex items-center gap-2">
                        <label className="text-[11px] text-sebastian-lightgray">モデル</label>
                        <div className="flex-1">
                          <ModelSelector
                            providerId={form[feat.formKey] as string}
                            value={form[feat.modelKey] as string}
                            onChange={v => setF(feat.modelKey, v)}
                            placeholder="デフォルトを使用"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </OrnateCard>

      {/* ── カスタムプロバイダー ──────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-4">
          <CardHeading
            action={
              <button
                onClick={openCustomAdd}
                className="flex items-center gap-1 text-xs text-sebastian-lightgray hover:text-sebastian-navy transition-colors px-2 py-1 rounded hover:bg-sebastian-parchment/50"
              >
                <Plus size={12} />
                追加
              </button>
            }
          >
            カスタムプロバイダー
          </CardHeading>
          <p className="text-xs text-sebastian-lightgray -mt-2">
            任意のOpenAI互換・Claude互換エンドポイントを登録できます。APIキーはPhase 2で暗号化対応予定（現在は平文保存）。
          </p>

          {customProviders.length === 0 ? (
            <p className="text-xs text-sebastian-lightgray">登録されたカスタムプロバイダーはありません。</p>
          ) : (
            <ul className="space-y-2">
              {customProviders.map(def => (
                <li key={def.id} className="flex items-center gap-2 bg-sebastian-parchment/30 border border-sebastian-border/40 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sebastian-navy truncate">{def.name}</p>
                    <p className="text-xs text-sebastian-lightgray font-mono truncate">{def.endpoint}</p>
                  </div>
                  <span className="text-[10px] text-sebastian-lightgray shrink-0 px-1.5 py-0.5 border border-sebastian-border/50 rounded">
                    {def.type === 'openai_compat' ? 'OpenAI互換' : 'Claude互換'}
                  </span>
                  <button onClick={() => openCustomEdit(def)} className="p-1.5 text-sebastian-lightgray hover:text-sebastian-navy transition-colors rounded">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteCustomProvider(def.id)} className="p-1.5 text-sebastian-lightgray hover:text-red-600 transition-colors rounded">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* カスタムプロバイダー追加/編集フォーム */}
          {showCustomForm && (
            <div className="border border-sebastian-gold/20 rounded-xl p-4 space-y-3 bg-sebastian-parchment/20">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-sebastian-navy font-serif">
                  {editingCustomId ? 'プロバイダーを編集' : '新しいプロバイダーを追加'}
                </p>
                <button onClick={() => setShowCustomForm(false)} className="text-sebastian-lightgray hover:text-sebastian-gray">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-sebastian-gray">ID（英数字・ハイフン）</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="my-provider"
                    value={customForm.id}
                    onChange={e => setCustomForm(f => ({ ...f, id: e.target.value }))}
                    disabled={!!editingCustomId}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-sebastian-gray">表示名</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="My Custom Provider"
                    value={customForm.name}
                    onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-sebastian-gray">タイプ</label>
                <select
                  className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors"
                  value={customForm.type}
                  onChange={e => setCustomForm(f => ({ ...f, type: e.target.value as 'openai_compat' | 'claude_compat' }))}
                >
                  <option value="openai_compat">OpenAI互換（/v1/chat/completions）</option>
                  <option value="claude_compat">Claude互換（/v1/messages）</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-sebastian-gray">エンドポイントURL</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="https://example.com/api"
                  value={customForm.endpoint}
                  onChange={e => setCustomForm(f => ({ ...f, endpoint: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-sebastian-gray">APIキー（省略可）</label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="sk-..."
                  value={customForm.apiKey}
                  onChange={e => setCustomForm(f => ({ ...f, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-sebastian-gray">モデルID</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="model-name-here"
                  value={customForm.modelOverride}
                  onChange={e => setCustomForm(f => ({ ...f, modelOverride: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveCustomProvider}
                  disabled={!customForm.id || !customForm.name || !customForm.endpoint}
                  className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 transition-colors font-serif"
                  style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
                >
                  保存
                </button>
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      </OrnateCard>

      {/* ── レポート保存先 ──────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
          <CardHeading>レポート保存先</CardHeading>
          {(['dailyReportPath', 'weeklyReportPath'] as const).map(field => (
            <div key={field} className="space-y-2">
              <label className="block text-sm text-sebastian-gray">
                {field === 'dailyReportPath' ? '日報の保存フォルダ' : '週報の保存フォルダ'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm text-sebastian-text outline-none cursor-pointer"
                  placeholder="フォルダを選択してください"
                  value={form[field]}
                  onClick={() => pickFolder(field)}
                />
                <button
                  onClick={() => pickFolder(field)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-sebastian-border/30 text-sebastian-gray rounded-lg hover:bg-sebastian-border/50 transition-colors text-sm font-serif"
                >
                  <FolderOpen size={16} />
                  参照
                </button>
              </div>
              {form[field] && (
                <p className="text-xs text-sebastian-lightgray">
                  例: {form[field]}/{field === 'dailyReportPath' ? 'Nippo' : 'Shuho'}_20260331.md
                </p>
              )}
            </div>
          ))}
        </div>
      </OrnateCard>

      {/* ── 操作・起動 ───────────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
          <CardHeading>操作・起動</CardHeading>
          <div className="space-y-2">
            <label className="block text-sm text-sebastian-gray">クイックメモ ショートカットキー</label>
            <input
              type="text"
              className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors"
              placeholder="例: Ctrl+Shift+M"
              value={form.globalShortcut}
              onChange={e => setF('globalShortcut', e.target.value)}
            />
            <p className="text-xs text-sebastian-lightgray">キーの組み合わせを入力（例: Ctrl+Shift+M、Alt+F1）</p>
            {shortcutStatus === 'ok' && (
              <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} />ショートカットを登録しました</p>
            )}
            {shortcutStatus === 'error' && (
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{shortcutError}</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-sebastian-text">PC起動時に自動起動</p>
              <p className="text-xs text-sebastian-lightgray mt-0.5">Windowsのスタートアップに登録します</p>
            </div>
            <button
              onClick={() => setF('autostartEnabled', !form.autostartEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.autostartEnabled ? 'bg-sebastian-navy' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.autostartEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </OrnateCard>

      {/* ── 終業リマインド ───────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <CardHeading>終業リマインド</CardHeading>
              <p className="text-xs text-sebastian-lightgray mt-0.5">指定時刻に日報作成を通知します</p>
            </div>
            <button
              onClick={() => setF('reminderEnabled', !form.reminderEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.reminderEnabled ? 'bg-sebastian-navy' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.reminderEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {form.reminderEnabled && (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <label className="block text-sm text-sebastian-gray">通知時刻</label>
                <input
                  type="time"
                  className="bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors"
                  value={form.reminderTime}
                  onChange={e => setF('reminderTime', e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-sebastian-text">平日のみ通知</p>
                  <p className="text-xs text-sebastian-lightgray mt-0.5">土日は通知しません</p>
                </div>
                <button
                  onClick={() => setF('reminderWeekdaysOnly', !form.reminderWeekdaysOnly)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.reminderWeekdaysOnly ? 'bg-sebastian-navy' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.reminderWeekdaysOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className="text-xs text-sebastian-lightgray">
                ※ 初回起動時にブラウザの通知許可が求められます。許可してください。
              </p>
            </div>
          )}
        </div>
      </OrnateCard>

      {/* ── レポートMD一括書き出し ──────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-4">
          <CardHeading>レポートMD一括書き出し</CardHeading>
          <p className="text-xs text-sebastian-lightgray -mt-2">
            DBに保存されている全ての日報・週報をMarkdownファイルとして書き出します。<br />
            別端末でDB同期後に実行すると、過去分も含めて一括で取り出せます。
          </p>
          <div className="bg-sebastian-parchment/50 rounded-lg px-3 py-2.5 border border-sebastian-border/40 text-xs text-sebastian-lightgray space-y-0.5">
            <p>日報 → {form.dailyReportPath || '（設定から保存先フォルダを指定してください）'}</p>
            <p>週報 → {form.weeklyReportPath || '（設定から保存先フォルダを指定してください）'}</p>
          </div>
          <button
            onClick={handleExportAll}
            disabled={exportStatus === 'exporting' || (!form.dailyReportPath && !form.weeklyReportPath)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-serif transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
          >
            <FileDown size={15} />
            {exportStatus === 'exporting' ? '書き出し中...' : '全レポートをMDで書き出す'}
          </button>
          {exportStatus === 'done' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 text-sm text-green-700">
              <CheckCircle size={15} />{exportMsg}
            </div>
          )}
          {exportStatus === 'error' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{exportMsg}
            </div>
          )}
        </div>
      </OrnateCard>

      {/* ── データ同期 ───────────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
          <CardHeading>データ同期</CardHeading>
          <p className="text-xs text-sebastian-lightgray -mt-3">OneDrive・USBなど共有フォルダ経由でPCを切り替えます</p>
          <div className="space-y-2">
            <label className="block text-sm text-sebastian-gray">同期フォルダ</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm text-sebastian-text outline-none cursor-pointer"
                placeholder="フォルダを選択してください（例: OneDrive\Sebastian）"
                value={form.syncFolder}
                onClick={() => pickFolder('syncFolder')}
              />
              <button
                onClick={() => pickFolder('syncFolder')}
                className="flex items-center gap-1.5 px-3 py-2 bg-sebastian-border/30 text-sebastian-gray rounded-lg hover:bg-sebastian-border/50 transition-colors text-sm font-serif"
              >
                <FolderOpen size={16} />
                参照
              </button>
            </div>
            {form.syncFolder && syncFolderDbTime && (
              <p className="text-xs text-sebastian-lightgray flex items-center gap-1">
                <Clock size={11} />
                同期フォルダのDB: {syncFolderDbTime} に更新
              </p>
            )}
            {form.syncFolder && !syncFolderDbTime && (
              <p className="text-xs text-sebastian-lightgray">同期フォルダにDBファイルはまだありません（Push後に作成されます）</p>
            )}
          </div>
          {form.syncFolder && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handlePush}
                  disabled={syncStatus === 'pushing' || syncStatus === 'pulling'}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-sebastian-navy text-white rounded-lg hover:bg-sebastian-dark transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Upload size={15} />
                  {syncStatus === 'pushing' ? '送り出し中...' : 'Push（このPCから送り出す）'}
                </button>
                <button
                  onClick={handlePull}
                  disabled={syncStatus === 'pushing' || syncStatus === 'pulling' || !syncFolderDbTime}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Download size={15} />
                  {syncStatus === 'pulling' ? '取り込み中...' : 'Pull（このPCに取り込む）'}
                </button>
              </div>
              {syncStatus === 'done' && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 text-sm text-green-700">
                  <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />{syncMsg}
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{syncMsg}
                </div>
              )}
              <div className="bg-sebastian-parchment/50 rounded-lg px-3 py-2.5 space-y-1 border border-sebastian-border/40">
                <p className="text-xs font-medium text-sebastian-gray font-serif">使い方</p>
                <p className="text-xs text-sebastian-lightgray">出発前：メインPCで Push → サブPCで Pull して作業</p>
                <p className="text-xs text-sebastian-lightgray">帰宅後：サブPCで Push → メインPCで Pull して引き継ぎ</p>
                <p className="text-xs text-sebastian-lightgray">Pull 実行時は現在のDBが自動バックアップされます</p>
              </div>
              {lastSyncAt && (
                <p className="text-xs text-sebastian-lightgray flex items-center gap-1">
                  <Clock size={11} />
                  最終同期: {format(new Date(lastSyncAt), 'M月d日 HH:mm', { locale: ja })}
                </p>
              )}
            </div>
          )}
        </div>
      </OrnateCard>

      {/* ── セキュリティ ───────────────────────────────────────────── */}
      <OrnateCard className="p-6">
        <div className="space-y-4">
          <CardHeading>セキュリティ</CardHeading>
          <p className="text-xs text-sebastian-lightgray -mt-2">
            マスターパスワードでAPIキーなどの機密情報を暗号化保存します。
          </p>

          {/* マスターパスワード有効/無効トグル */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-sebastian-text">マスターパスワード</p>
                {form.masterPasswordEnabled && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-200">有効</span>
                )}
              </div>
              <p className="text-xs text-sebastian-lightgray mt-0.5">APIキーなどの機密情報を暗号化保存します</p>
            </div>
            <button
              onClick={() => {
                if (form.masterPasswordEnabled) {
                  setConfirmDisablePassword(true);
                } else {
                  setShowPasswordModal(true);
                }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.masterPasswordEnabled ? 'bg-sebastian-navy' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.masterPasswordEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          
          {form.masterPasswordEnabled && (
            <div className="space-y-3 pt-2">
              {/* セッション期間選択 */}
              <div className="space-y-1.5">
                <label className="block text-sm text-sebastian-gray">セッション期間</label>
                <select
                  className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors"
                  value={form.sessionDuration}
                  onChange={e => setF('sessionDuration', e.target.value as SessionDuration)}
                >
                  {SESSION_DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* 現在のセッション状態 */}
              <div className="bg-white/50 border border-sebastian-border/30 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {sessionState.unlocked ? (
                    <>
                      <CheckCircle size={14} className="text-green-600" />
                      <span className="text-green-700 font-medium">セッション有効</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} className="text-amber-600" />
                      <span className="text-amber-700 font-medium">セッション期限切れ</span>
                    </>
                  )}
                </div>
                {sessionState.unlocked && sessionState.expiresAt && (
                  <p className="text-xs text-sebastian-lightgray mt-1 ml-5">
                    あと {format(sessionState.expiresAt, 'H時間m分', { locale: ja })} まで有効
                  </p>
                )}
                {sessionState.unlocked && !sessionState.expiresAt && (
                  <p className="text-xs text-sebastian-lightgray mt-1 ml-5">
                    手動ロックまたはアプリ終了まで有効
                  </p>
                )}
              </div>
              
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-sebastian-navy text-white rounded-lg hover:bg-sebastian-dark transition-colors text-sm font-medium"
              >
                <Lock size={14} />
                パスワードを変更
              </button>
            </div>
          )}
          
          {/* 無効化確認ダイアログ */}
          {confirmDisablePassword && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">マスターパスワードを無効化しますか？</p>
                  <p className="text-xs text-red-700 mt-1">
                    無効化すると、暗号化されたAPIキーなどは復号できなくなります。
                    引き続きアプリは使用できますが、機密設定を再入力する必要があります。
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (window.confirm('本当にマスターパスワードを削除しますか？この操作は取り消せません。')) {
                      await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, '');
                      setForm(f => ({ ...f, masterPasswordEnabled: false }));
                      setConfirmDisablePassword(false);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  無効化する
                </button>
                <button
                  onClick={() => setConfirmDisablePassword(false)}
                  className="px-4 py-2 bg-gray-100 text-sebastian-gray rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      </OrnateCard>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-8 py-2.5 rounded-lg text-sm font-serif transition-colors"
          style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
        >
          設定を保存する
        </button>
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-green-600 text-sm font-serif">
            <CheckCircle size={16} />
            保存しました
          </div>
        )}
      </div>

      <div className="text-xs text-sebastian-lightgray/50 border-t border-sebastian-border/30 pt-4 font-serif">
        Sebastian v1.1.1 — AI Work Supporter
      </div>

      {showPasswordModal && (
        <MasterPasswordSetupModal
          onClose={() => {
            setShowPasswordModal(false);
            setSessionState(getState());
          }}
          onPasswordSet={async () => {
            const hash = await getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH);
            setForm(f => ({ ...f, masterPasswordEnabled: !!hash }));
            setSessionState(getState());
          }}
        />
      )}
    </div>
  );
}

// ─── APIキー入力フィールド（共通コンポーネント） ─────────────────

function ApiKeyField({
  label, hint, placeholder, id, value, onChange, showKey, onToggle, masterPasswordEnabled,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  showKey: boolean;
  onToggle: () => void;
  masterPasswordEnabled: boolean;
}) {
  const [editing, setEditing] = useState(!value);
  const [originalValue, setOriginalValue] = useState(value);
  const [wasEditing, setWasEditing] = useState(false);

  // valueが外部から変更された場合（ロード完了時など）に同期
  useEffect(() => {
    if (!wasEditing && value && !originalValue) {
      setOriginalValue(value);
      setEditing(false);
    }
  }, [value, wasEditing, originalValue]);

  const handleStartEdit = () => {
    setOriginalValue(value);
    setWasEditing(true);
    if (masterPasswordEnabled) {
      onChange(''); // マスターパスワード有効時は暗号化キーを表示しないためクリア
    }
    setEditing(true);
  };

  const handleCancel = () => {
    onChange(originalValue);
    setEditing(false);
    setWasEditing(false);
  };

  const hasValue = originalValue || value;

  if (!editing && hasValue) {
    // 読み取り専用モード（保存済み値あり）
    return (
      <div className="space-y-1.5">
        <label className="block text-sm text-sebastian-gray">{label}</label>
        <div className="flex gap-2">
          <input
            type="password"
            className="flex-1 bg-gray-100 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono text-sebastian-lightgray cursor-not-allowed"
            value="••••••••••••••••"
            readOnly
          />
          <button
            type="button"
            onClick={handleStartEdit}
            className="px-3 text-sebastian-lightgray hover:text-sebastian-navy bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
            title="編集"
          >
            <Pencil size={15} />
          </button>
        </div>
        {hint && <p className="text-xs text-sebastian-lightgray">{hint}</p>}
      </div>
    );
  }

  // 編集モード（新規入力または編集中）
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-sebastian-gray">{label}</label>
      <div className="flex gap-2">
        <input
          type={showKey ? 'text' : 'password'}
          className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={`new-password-${id}`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
        >
          {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        {hasValue && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-gray-100 border border-sebastian-border rounded-lg transition-colors"
            title="キャンセル"
          >
            <X size={15} />
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-sebastian-lightgray">{hint}</p>}
    </div>
  );
}
