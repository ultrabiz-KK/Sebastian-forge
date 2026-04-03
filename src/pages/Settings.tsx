import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { FolderOpen, CheckCircle, AlertCircle, Wifi, WifiOff, RefreshCw, Eye, EyeOff, Upload, Download, Clock, FileDown } from 'lucide-react';
import { getSetting, setSetting, SETTING_KEYS } from '../lib/settings';
import { PageHeader, OrnateCard, CardHeading } from '../components/ClassicUI';
import { registerShortcut } from '../lib/shortcut';
import { checkOllamaConnection, checkGeminiConnection, type OllamaStatus } from '../lib/ai';
import { pushSync, pullSync, getSyncFolderDbMtime } from '../lib/sync';
import { selectDb } from '../lib/db';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

type AiProvider = 'gemini' | 'ollama' | 'disabled';

interface SettingsForm {
  dailyReportPath: string;
  weeklyReportPath: string;
  globalShortcut: string;
  autostartEnabled: boolean;
  aiProvider: AiProvider;
  geminiApiKey: string;
  geminiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderWeekdaysOnly: boolean;
  syncFolder: string;
}

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
    reminderEnabled: false,
    reminderTime: '18:00',
    reminderWeekdaysOnly: true,
    syncFolder: '',
  });
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
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    async function load() {
      const [daily, weekly, shortcut, autostart, autostartActual,
        provider, gemKey, gemModel, olEndpoint, olModel,
        reminderEnabled, reminderTime, reminderWeekdaysOnly,
        syncFolderSetting, lastSyncAtSetting] = await Promise.all([
        getSetting(SETTING_KEYS.DAILY_REPORT_PATH),
        getSetting(SETTING_KEYS.WEEKLY_REPORT_PATH),
        getSetting(SETTING_KEYS.GLOBAL_SHORTCUT),
        getSetting(SETTING_KEYS.AUTOSTART_ENABLED),
        isEnabled().catch(() => false),
        getSetting(SETTING_KEYS.AI_PROVIDER),
        getSetting(SETTING_KEYS.GEMINI_API_KEY),
        getSetting(SETTING_KEYS.GEMINI_MODEL),
        getSetting(SETTING_KEYS.OLLAMA_ENDPOINT),
        getSetting(SETTING_KEYS.OLLAMA_MODEL),
        getSetting(SETTING_KEYS.REMINDER_ENABLED),
        getSetting(SETTING_KEYS.REMINDER_TIME),
        getSetting(SETTING_KEYS.REMINDER_WEEKDAYS_ONLY),
        getSetting(SETTING_KEYS.SYNC_FOLDER),
        getSetting(SETTING_KEYS.LAST_SYNC_AT),
      ]);
      const syncFolderVal = syncFolderSetting ?? '';
      setLastSyncAt(lastSyncAtSetting ?? null);
      if (syncFolderVal) {
        getSyncFolderDbMtime(syncFolderVal).then(mtime => {
          if (mtime) setSyncFolderDbTime(format(new Date(mtime * 1000), 'M/d HH:mm', { locale: ja }));
        }).catch(() => {});
      }
      setForm({
        dailyReportPath: daily ?? '',
        weeklyReportPath: weekly ?? '',
        globalShortcut: shortcut ?? 'Ctrl+Shift+M',
        autostartEnabled: autostart === 'true' || autostartActual,
        aiProvider: (provider as AiProvider) ?? 'disabled',
        geminiApiKey: gemKey ?? '',
        geminiModel: gemModel ?? 'gemini-2.0-flash',
        ollamaEndpoint: olEndpoint ?? 'http://localhost:11434',
        ollamaModel: olModel ?? 'qwen2.5:7b',
        reminderEnabled: reminderEnabled === 'true',
        reminderTime: reminderTime ?? '18:00',
        reminderWeekdaysOnly: reminderWeekdaysOnly !== 'false',
        syncFolder: syncFolderVal,
      });
    }
    load();
  }, []);

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

  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      if (form.aiProvider === 'gemini') {
        const result = await checkGeminiConnection(form.geminiApiKey, form.geminiModel);
        setTestStatus(result.connected
          ? { ok: true, msg: '接続成功 — Gemini APIに接続できました' }
          : { ok: false, msg: `接続失敗: ${result.error ?? '不明なエラー'}` }
        );
      } else if (form.aiProvider === 'ollama') {
        const result: OllamaStatus = await checkOllamaConnection(form.ollamaEndpoint);
        setTestStatus(result.connected
          ? { ok: true, msg: `接続成功 — 利用可能なモデル: ${result.models.join(', ') || 'なし'}` }
          : { ok: false, msg: `接続失敗: ${result.error ?? '不明なエラー'}` }
        );
      }
    } finally {
      setTesting(false);
    }
  };

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
        setSetting(SETTING_KEYS.GEMINI_API_KEY, form.geminiApiKey),
        setSetting(SETTING_KEYS.GEMINI_MODEL, form.geminiModel),
        setSetting(SETTING_KEYS.OLLAMA_ENDPOINT, form.ollamaEndpoint),
        setSetting(SETTING_KEYS.OLLAMA_MODEL, form.ollamaModel),
        setSetting(SETTING_KEYS.REMINDER_ENABLED, String(form.reminderEnabled)),
        setSetting(SETTING_KEYS.REMINDER_TIME, form.reminderTime),
        setSetting(SETTING_KEYS.REMINDER_WEEKDAYS_ONLY, String(form.reminderWeekdaysOnly)),
        setSetting(SETTING_KEYS.SYNC_FOLDER, form.syncFolder),
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
          window.dispatchEvent(
            new CustomEvent('sebastian:shortcut-changed', { detail: form.globalShortcut })
          );
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
          } catch {
            errors.push(`日報 ${row.date} の書き出し失敗`);
          }
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
          } catch {
            errors.push(`週報 ${row.week_start_date} の書き出し失敗`);
          }
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

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader label="SETTINGS" title="設定" />

      {/* AI設定 */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
        <CardHeading>AI設定</CardHeading>

        {/* プロバイダー選択 */}
        <div className="space-y-2">
          <label className="block text-sm text-sebastian-gray font-serif">AIプロバイダー</label>
          <div className="flex gap-2">
            {([
              { value: 'gemini', label: 'Gemini API', sub: '無料・高速・推奨' },
              { value: 'ollama', label: 'Ollama', sub: 'ローカルLLM' },
              { value: 'disabled', label: '無効', sub: 'AI機能をオフ' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, aiProvider: opt.value }))}
                className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                  form.aiProvider === opt.value
                    ? 'border-sebastian-gold/60 bg-sebastian-gold/5'
                    : 'border-sebastian-border/50 hover:border-sebastian-border'
                }`}
              >
                <p className={`text-sm font-serif font-medium ${form.aiProvider === opt.value ? 'text-sebastian-navy' : 'text-sebastian-gray'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-sebastian-lightgray mt-0.5 font-serif">{opt.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Gemini設定 */}
        {form.aiProvider === 'gemini' && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <label className="block text-sm text-sebastian-gray">APIキー</label>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
                  placeholder="AIzaSy..."
                  value={form.geminiApiKey}
                  onChange={e => setForm(f => ({ ...f, geminiApiKey: e.target.value }))}
                />
                <button
                  onClick={() => setShowApiKey(v => !v)}
                  className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
                >
                  {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs text-sebastian-lightgray">
                取得先: <span className="font-mono">https://aistudio.google.com/apikey</span>（無料）
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-sebastian-gray">モデル</label>
              <input
                type="text"
                className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
                value={form.geminiModel}
                onChange={e => setForm(f => ({ ...f, geminiModel: e.target.value }))}
              />
              <p className="text-xs text-sebastian-lightgray">
                推奨: <span className="font-mono">gemini-2.5-flash</span>（無料・高速）
              </p>
            </div>
          </div>
        )}

        {/* Ollama設定 */}
        {form.aiProvider === 'ollama' && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <label className="block text-sm text-sebastian-gray">エンドポイントURL</label>
              <input
                type="text"
                className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
                value={form.ollamaEndpoint}
                onChange={e => setForm(f => ({ ...f, ollamaEndpoint: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-sebastian-gray">モデル</label>
              <input
                type="text"
                className="w-full bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
                placeholder="例: qwen2.5:3b"
                value={form.ollamaModel}
                onChange={e => setForm(f => ({ ...f, ollamaModel: e.target.value }))}
              />
            </div>
          </div>
        )}

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
                {testStatus.ok
                  ? <Wifi size={15} className="flex-shrink-0 mt-0.5" />
                  : <WifiOff size={15} className="flex-shrink-0 mt-0.5" />
                }
                {testStatus.msg}
              </div>
            )}
          </div>
        )}
        </div>
      </OrnateCard>

      {/* レポート保存先 */}
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

      {/* 操作・起動 */}
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
            onChange={e => setForm(f => ({ ...f, globalShortcut: e.target.value }))}
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
            onClick={() => setForm(f => ({ ...f, autostartEnabled: !f.autostartEnabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.autostartEnabled ? 'bg-sebastian-navy' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.autostartEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        </div>
      </OrnateCard>

      {/* 終業リマインド */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <CardHeading>終業リマインド</CardHeading>
            <p className="text-xs text-sebastian-lightgray mt-0.5">指定時刻に日報作成を通知します</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, reminderEnabled: !f.reminderEnabled }))}
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
                onChange={e => setForm(f => ({ ...f, reminderTime: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-sebastian-text">平日のみ通知</p>
                <p className="text-xs text-sebastian-lightgray mt-0.5">土日は通知しません</p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, reminderWeekdaysOnly: !f.reminderWeekdaysOnly }))}
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

      {/* レポートMD一括書き出し */}
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
              <CheckCircle size={15} />
              {exportMsg}
            </div>
          )}
          {exportStatus === 'error' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {exportMsg}
            </div>
          )}
        </div>
      </OrnateCard>

      {/* データ同期 */}
      <OrnateCard className="p-6">
        <div className="space-y-5">
        <CardHeading>データ同期</CardHeading>
        <p className="text-xs text-sebastian-lightgray -mt-3">OneDrive・USBなど共有フォルダ経由でPCを切り替えます</p>

        {/* 同期フォルダ */}
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

        {/* Push / Pull */}
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
                <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
                {syncMsg}
              </div>
            )}
            {syncStatus === 'error' && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {syncMsg}
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
    </div>
  );
}
