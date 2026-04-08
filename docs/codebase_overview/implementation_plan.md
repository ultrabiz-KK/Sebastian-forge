# 全体アーキテクチャ — Sebastian v1.1.1

## プロダクト概要

**Sebastian** は執事キャラクターをコンセプトにした AI 業務支援デスクトップアプリ。
メモ・タスク管理・日報/週報 AI 生成・終業リマインドなどを一元管理する。

---

## 技術スタック

| 層 | 技術 |
|----|------|
| デスクトップランタイム | Tauri v2 (Rust) |
| フロントエンドフレームワーク | React 19 + TypeScript |
| スタイリング | TailwindCSS v4 |
| ルーティング | react-router-dom v7 |
| DB | SQLite（tauri-plugin-sql 経由） |
| AI プロバイダー | Gemini / Ollama / Claude / OpenAI / Groq / OpenRouter / nano-gpt / LM Studio（切替可） |
| 日付処理 | date-fns v4 |
| アイコン | lucide-react |
| フォント | Cinzel（display） / EB Garamond（serif） |

---

## レイヤー構造

```
┌─────────────────────────────────────┐
│          React UI (src/)            │
│  pages/    components/    lib/      │
├─────────────────────────────────────┤
│       Tauri IPC Layer               │
│  invoke() / tauri-plugin-sql        │
├─────────────────────────────────────┤
│        Rust Backend (src-tauri/)    │
│  コマンド / SQLite / トレイ         │
├─────────────────────────────────────┤
│        OS / ファイルシステム        │
│  %APPDATA%/sebastian.db             │
└─────────────────────────────────────┘
```

---

## フロントエンド設計方針

### ルーティング（App.tsx）

```
/ (MainLayout)
├── /            → Dashboard
├── /memo        → Memo
├── /tasks       → Tasks
├── /calendar    → WeeklyCalendar
├── /reports/daily   → DailyReport
├── /reports/weekly  → WeeklyReport
└── /settings    → Settings
```

### データアクセスパターン

- **全 DB 操作は `src/lib/db.ts` の `selectDb` / `executeDb` を経由する。**
- デモモードのときはクエリをインターセプトして `demoData.ts` のサンプルデータを返す（settings テーブルは実 DB を通す）。
- DB インスタンスはシングルトン（`getDb()` でキャッシュ）。

### 状態管理

- グローバルストアなし。各ページが独立した `useState` / `useEffect` で DB を直接読む。
- ページ間の状態共有は URL（react-router-dom）と DB を介して行う。

### AI 呼び出しパターン（Phase 1 改修済）

- `src/lib/ai.ts` がプロバイダー抽象化レイヤー。
- **`AIProvider` インターフェース**（`callText`, `callJson`, `listModels`, `testConnection`）を各プロバイダークラスが実装。
- **プリセットプロバイダー**: `GeminiProvider` / `OllamaProvider` / `ClaudeProvider` / `OpenAIProvider` / `OpenAICompatibleProvider`（Groq・OpenRouter・nano-gpt・LM Studio 共通）
- **`getProvider(id)`** でプリセット + カスタムプロバイダーを解決するファクトリ。
- **`getProviderForFeature(feature?)`** で機能別設定 → グローバル設定にフォールバック。
- JSON 呼び出しは各プロバイダーの `callJson()` で吸収（Gemini: `responseMimeType`、Ollama: `format: 'json'`、OpenAI: `response_format`、Claude: system prompt 指示）。
- モデル一覧は TTL 1時間のキャッシュ（`models_cache` キー）で管理。
- **モデルフィルタリング**: テキスト生成モデルのみを表示。Gemini は `supportedGenerationMethods` に `generateContent` が含まれるモデル、OpenAI/互換は `dall-e-*`/`whisper-*`/`tts-*`/`text-embedding-*`/`text-moderation-*` を除外。フィルタリングで空になる場合はフォールバックして全モデルを返す。
- **カスタムプロバイダー** は `SETTING_KEYS.CUSTOM_PROVIDERS` にJSON配列で保存。
- **タイムアウト設定**: `callText`/`callJson` は60秒、`testConnection` は120秒（2分）。接続テストはAPIサーバーのレスポンス遅延対策として長めに設定。
- 既存の公開関数（`generateDailyReport` 等）のシグネチャは変更なし。各ページへの影響ゼロ。

### テーマシステム

- `light` / `dark` / `sepia` の 3 テーマ。
- `document.documentElement` に `theme-dark` / `theme-sepia` クラスを付与。
- CSS カスタムプロパティ（`--sidebar-bg` 等）でサイドバー色を制御。

---

## Rust バックエンド設計方針

### Tauri コマンド一覧（lib.rs）

| コマンド | 役割 |
|----------|------|
| `write_text_file` | 指定パスにテキストファイルを書き込む（親ディレクトリ自動作成） |
| `read_text_file` | テキストファイルを読み込む |
| `get_db_path` | `%APPDATA%/sebastian.db` のフルパスを返す |
| `copy_file` | ファイルをコピー（同期機能で使用） |
| `file_exists` | ファイルの存在確認 |
| `get_file_mtime` | ファイルの最終更新日時（Unix 秒）を取得 |

### SQLite マイグレーション

`tauri_plugin_sql::Migration` で起動時に自動適用。

| Version | 内容 |
|---------|------|
| 1 | 初期テーブル（daily_memos, tasks, task_logs, reports_daily, reports_weekly, settings）|
| 2 | tasks に `archived` カラム追加 |
| 3 | tasks に `pinned` カラム追加 |

### システムトレイ（デスクトップのみ）

- 左クリック / "Sebastianを開く" メニューでウィンドウ表示。
- "終了" メニューでアプリ終了。

---

## 主要機能フロー

### メモ → 日報生成フロー

```
Memo.tsx: textarea 入力（1秒デバウンス自動保存 → daily_memos）
       ↓
DailyReport.tsx: 「日報案を生成する」ボタン
       ↓
lib/ai.ts: generateDailyReport()
  ├── daily_memos から当日メモ取得
  ├── task_logs から当日の変更ログ取得
  └── AI プロバイダー呼び出し
       ↓
ドラフト表示 → ユーザー編集 → 「承認・保存する」
       ↓
reports_daily テーブルに保存 + Markdown ファイル書き出し（設定有時）
       ↓
タスク候補抽出ボタン → extractTaskCandidates() → TaskCandidatesPanel で確認・登録
```

### 執事ブリーフィング生成フロー

```
Sidebar.tsx: マウント時に loadBriefing() 呼び出し
       ↓
settings から last_briefing_date を確認（当日未生成の場合のみ生成）
       ↓
tasks から高優先度タスク（最大8件）取得
       ↓
lib/ai.ts: generateButlerBriefing()
  → 時間帯別（morning/noon/afternoon/night）5コメント×4スロット生成
       ↓
settings に butler_briefing として JSON キャッシュ保存
       ↓
執事イラストをクリック → 現在時間帯のコメントをランダム表示（5秒で消える）
```

### DB 同期フロー

```
Settings.tsx: 同期フォルダを指定
       ↓
Push: lib/sync.ts: pushSync()
  ├── DB を closeDb() で閉じる
  └── invoke('copy_file', {src: dbPath, dest: syncFolder/sebastian.db})
       ↓
Pull: lib/sync.ts: pullSync()
  ├── 現在の DB を自動バックアップ
  └── 同期フォルダの DB を上書きコピー → window.location.reload()
```

---

## CSP（コンテンツセキュリティポリシー）

```
connect-src: 'self'
             https://generativelanguage.googleapis.com  ← Gemini API
             http://localhost:11434                      ← Ollama（ローカル）
             https://api.anthropic.com                  ← Claude API
             https://api.openai.com                     ← OpenAI API
             https://api.groq.com                       ← Groq
             https://openrouter.ai                      ← OpenRouter
             https://nano-gpt.com                       ← nano-gpt
             http://localhost:1234                       ← LM Studio（ローカル）
```

カスタムプロバイダーにローカルアドレス以外を使用する場合は `tauri.conf.json` への手動追加が必要。
