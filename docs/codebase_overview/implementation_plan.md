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
| 暗号化（Rust） | bcrypt（パスワードハッシュ）/ aes-gcm（AES-256-GCM）/ pbkdf2+hmac+sha2（キー導出）/ base64（エンコード）/ rand（ソルト・IV生成） |

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
- **機能別プロバイダー・モデル設定**: 各機能（日報生成、週報生成、ブリーフィング、カレンダーコメント、タスク抽出）ごとにプロバイダーとモデルを個別指定可能。
  - 設定画面の「機能別プロバイダー設定」でプロバイダー選択後にモデル選択ドロップダウンが表示
  - 機能別モデル未設定時はプロバイダーのデフォルトモデルを使用
  - 各プロバイダークラス（Gemini, Ollama, Claude, OpenAI, OpenAICompatible）に `_modelOverride` プロパティを追加し、`getConfig()` で優先的に使用
  - カスタムプロバイダーも `buildCustomProvider(def, featureModelOverride)` でモデルオーバーライドに対応
- JSON 呼び出しは各プロバイダーの `callJson()` で吸収（Gemini: `responseMimeType`、Ollama: `format: 'json'`、OpenAI: `response_format`、Claude: system prompt 指示）。
- モデル一覧は TTL 1時間のキャッシュ（`models_cache` キー）で管理。
- **モデルフィルタリング**: テキスト生成モデルのみを表示。Gemini は `supportedGenerationMethods` に `generateContent` が含まれるモデル、OpenAI/互換は `dall-e-*`/`whisper-*`/`tts-*`/`text-embedding-*`/`text-moderation-*` を除外。フィルタリングで空になる場合はフォールバックして全モデルを返す。
- **カスタムプロバイダー** は `SETTING_KEYS.CUSTOM_PROVIDERS` にJSON配列で保存。
- **タイムアウト設定**: `callText`/`callJson` は60秒、`testConnection` は120秒（2分）。接続テストはAPIサーバーのレスポンス遅延対策として長めに設定。
- 既存の公開関数（`generateDailyReport` 等）のシグネチャは変更なし。各ページへの影響ゼロ。
- **ModelSelectorコンポーネント** (`src/components/ModelSelector.tsx`) はモデル一覧をプロバイダー/ファミリーごとにグループ表示。
  - プレフィックス形式（`claude-*`, `gpt-*`, `gemini-*`）とスラッシュ形式（`anthropic/*`, `openai/*` 等）の両方に対応
  - OpenRouter/nano-gpt等のモデルID（`provider/model` 形式）からプロバイダー名を抽出してグループ化
  - 各グループ内はモデルID順でソート、検索フィルタリングも維持

### セッション管理（Phase 2 T2-3〜T2-6 実装済）

`src/lib/session.ts` がセッション状態を一元管理する。

- **セッション期間定数** (`SessionDuration`): `APP_RESTART` / `1h` / `6h` / `1d` / `2w` / `1m` / `3m` / `FOREVER`
- **メモリ管理**: パスワード生値 (`_password`) と有効期限 (`_expiresAt`) はモジュールスコープ変数でメモリのみに保持
- **localStorage**: `APP_RESTART` / `FOREVER` 以外の有効期限のみ `session_expires_at` キーに保存（パスワードは保存しない）
- **API**:
  - `unlock(password)` → Rust の `verify_password` で検証、成功時セッション開始
  - `lock()` → メモリと localStorage をクリア
  - `isUnlocked()` → 有効期限も含めて現在の状態をチェック（期限切れ時は自動ロック）
  - `getPassword()` → セッション有効時のみパスワードを返す
  - `getState()` → `SessionState` スナップショットを返す
  - `encrypt(value)` → Rust `encrypt_value` のラッパー。戻り値に `"ENC:"` プレフィックスを付加
  - `decrypt(value)` → `"ENC:"` プレフィックス付き値を復号、なければ平文とみなして通過（後方互換）
- **設定キー追加** (`src/lib/settings.ts`): `MASTER_PASSWORD_HASH` / `SESSION_DURATION`

### マスターパスワード設定モーダル（Phase 2 T2-4 実装済）

`src/components/MasterPasswordSetupModal.tsx` がパスワード設定・変更・削除UIを提供する。

- **状態管理**: `step` で `setup` | `change_confirm` | `change_set` | `delete_confirm` を管理
- **パスワード設定フロー**:
  1. 新パスワード + 確認パスワード入力（8文字以上バリデーション、一致確認）
  2. Rust `hash_password` コマンドで bcrypt ハッシュ生成（コスト係数12）
  3. `SETTING_KEYS.MASTER_PASSWORD_HASH` にハッシュを保存
- **パスワード変更フロー**:
  1. 現在のパスワード確認（`verify_password` コマンドで検証）
  2. 新パスワード設定
- **パスワード削除フロー**:
  1. 現在のパスワード確認
  2. `SETTING_KEYS.MASTER_PASSWORD_HASH` を空文字に設定
- **UI 特徴**:
  - 入力フィールドは全て `type="password"`（平文表示トグル付き）
  - 成功/エラーメッセージはモーダル内に表示
  - Sebastian デザインテーマの OrnateCard スタイルを踏襲
- **Settings.tsx 連携**: セキュリティセクションに「パスワードを設定・変更」ボタンを配置

### Settings.tsx セキュリティセクション（Phase 2 T2-8 実装済）

`src/pages/Settings.tsx` のセキュリティセクションを拡張。

- **表示内容**:
  - マスターパスワード有効/無効トグル（トグルスイッチ）
  - セッション期間選択ドロップダウン（`APP_RESTART` / `1h` / `6h` / `1d` / `2w` / `1m` / `3m` / `FOREVER`）
  - 現在のセッション状態表示（「セッション有効（あと○時間）」/ 「セッション期限切れ」）
  - 「パスワードを変更」ボタン
- **無効化時の確認ダイアログ**:
  - トグルでオフにする際、確認ダイアログを表示
  - 「無効化する」「キャンセル」ボタン
  - 警告メッセージで暗号化設定が復号できなくなることを通知
- **状態管理**:
  - `masterPasswordEnabled`: `MASTER_PASSWORD_HASH` 設定の有無から判定
  - `sessionDuration`: `SETTING_KEYS.SESSION_DURATION` から読み込み
  - `sessionState`: `getState()` から現在のセッション状態を取得
- **保存処理**: セッション期間は他の設定と同様に `handleSave` で一括保存

### ロック解除モーダル（Phase 2 T2-5 実装済）

`src/components/UnlockModal.tsx` がアプリ起動時のパスワード入力UIを提供。

- **起動時チェック** (`App.tsx`):
  - マウント時に `MASTER_PASSWORD_HASH` 設定を確認
  - ハッシュが存在し、かつセッションが無効（`isUnlocked() === false`）の場合にモーダル表示
  - ハッシュ未設定（機能オフ）の場合はモーダルを表示しない
- **UI構成**:
  - パスワード入力フィールド（表示/非表示切り替えボタン付き）
  - 「ロック解除」ボタン
  - 誤入力時：「パスワードが違います」エラーメッセージ
  - 空入力時：「パスワードを入力してください」エラーメッセージ
- **制約**:
  - モーダルは閉じるボタンなし（正しいパスワード入力のみで解除可能）
  - ロード中は入力・ボタンを無効化

### APIキー暗号化保存フロー（Phase 2 T2-7 実装済）

`src/lib/settings.ts` に暗号化/復号関数を追加。

- **暗号化対象キー** (`ENCRYPTED_KEYS`):
  - `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `NANOGPT_API_KEY`
  - カスタムプロバイダーの `apiKey` フィールド（JSON配列内）
- **保存時 (`setEncryptedSetting`)**:
  - マスターパスワードが設定済みかつセッション解除済み → `encrypt()` で暗号化して `"ENC:"` プレフィックス付きで保存
  - マスターパスワード未設定またはセッション無効 → 平文保存（後方互換）
- **読み出し時 (`getDecryptedSetting`)**:
  - 値が `"ENC:"` で始まる場合:
    - セッション有効 → `decrypt()` で復号して返す
    - セッション無効 → `null` を返す（API呼び出しエラー）
  - 値が `"ENC:"` で始まらない → 平文としてそのまま返す（後方互換）
- **カスタムプロバイダー対応** (`setEncryptedCustomProviders`):
  - プロバイダー配列内の `apiKey` を暗号化して保存
- **AI呼び出し側** (`src/lib/ai.ts`):
  - 各プロバイダーの `getConfig()` で `getDecryptedSetting()` を使用
  - セッション期限切れ時は `null` が返り、APIキー未設定エラーになる
- **Settings.tsx連携**:
  - APIキー保存時は `setEncryptedSetting()` を使用
  - カスタムプロバイダー保存時は `setEncryptedCustomProviders()` を使用

### テーマシステム

- `light` / `dark` / `sepia` の 3 テーマ。
- `document.documentElement` に `theme-dark` / `theme-sepia` クラスを付与。
- CSS カスタムプロパティ（`--sidebar-bg` 等）でサイドバー色を制御。

---

## Rust バックエンド設計方針

### 依存クレート（暗号化関連）

| クレート | 用途 |
|----------|------|
| `bcrypt` | パスワードハッシュ（コストファクター付き） |
| `aes-gcm` | AES-256-GCM 対称暗号化（認証付き暗号化） |
| `pbkdf2` | PBKDF2 キー導出関数 |
| `hmac` | HMAC 認証コード生成 |
| `sha2` | SHA-256/512 ハッシュ関数 |
| `base64` | 暗号化データの Base64 エンコード/デコード |
| `rand` | 安全な乱数生成（ソルト・IV 生成用） |

### Tauri コマンド一覧（lib.rs）

| コマンド | 役割 |
|----------|------|
| `write_text_file` | 指定パスにテキストファイルを書き込む（親ディレクトリ自動作成） |
| `read_text_file` | テキストファイルを読み込む |
| `get_db_path` | `%APPDATA%/sebastian.db` のフルパスを返す |
| `copy_file` | ファイルをコピー（同期機能で使用） |
| `file_exists` | ファイルの存在確認 |
| `get_file_mtime` | ファイルの最終更新日時（Unix 秒）を取得 |
| `hash_password` | bcrypt（コスト係数12）でパスワードをハッシュ化 |
| `verify_password` | bcrypt ハッシュとパスワードを照合 |
| `encrypt_value` | AES-256-GCM + PBKDF2 で平文を暗号化し `base64(salt\|\|iv\|\|ciphertext)` を返す |
| `decrypt_value` | `encrypt_value` の出力を復号。パスワード誤り時は `Err` を返す |

### 暗号化実装詳細（T2-2）

- **キー導出**: PBKDF2-HMAC-SHA256、イテレーション 100,000 回、32 バイトキー
- **ソルト**: 16 バイト（毎回 `rand::thread_rng()` でランダム生成）
- **IV/Nonce**: 12 バイト（毎回 `rand::thread_rng()` でランダム生成）
- **出力フォーマット**: `salt(16B) || iv(12B) || ciphertext` を Base64 エンコード
- **セキュリティ方針**: パスワードをログ・永続化しない。復号失敗時は詳細を漏らさない汎用エラーメッセージ

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
