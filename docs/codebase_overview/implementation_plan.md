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
- タイトルバー用 CSS 変数（`--titlebar-*`）も同じ仕組みで 3 テーマ対応。

### カスタムタイトルバー（2026-04-10 実装）

Windows 標準タイトルバーをゴールド系のモダンなカスタムタイトルバーに置き換えた。

#### 変更ファイル

| ファイル | 変更内容 |
|----------|---------|
| `src-tauri/tauri.conf.json` | `decorations: false` でネイティブタイトルバーを非表示、`shadow: true` でウィンドウシャドウを維持 |
| `src-tauri/capabilities/default.json` | ウィンドウ操作パーミッションを追加（下記参照） |
| `src/components/layout/TitleBar.tsx` | カスタムタイトルバーコンポーネント（新規作成） |
| `src/components/layout/MainLayout.tsx` | `<TitleBar />` を最上部に配置 |
| `src/index.css` | タイトルバー用スタイル・CSS 変数を追加 |

#### 追加 Tauri パーミッション（`capabilities/default.json`）

Tauri v2 ではウィンドウ操作ごとに明示的な許可が必要。

| パーミッション | 役割 |
|---|---|
| `core:window:allow-minimize` | 最小化 |
| `core:window:allow-maximize` | 最大化 |
| `core:window:allow-unmaximize` | 最大化解除 |
| `core:window:allow-close` | ウィンドウを閉じる |
| `core:window:allow-is-maximized` | 最大化状態の取得 |
| `core:window:allow-start-dragging` | ドラッグ移動 |
| `core:event:allow-listen` / `allow-unlisten` | ウィンドウリサイズイベント購読 |

#### TitleBar コンポーネント仕様

- **ドラッグ移動**: `data-tauri-drag-region` 属性でタイトルバー全体をドラッグ可能
- **ダブルクリック最大化**: タイトルバー本体のダブルクリックで最大化トグル（macOS 風）
- **最大化状態同期**: `useEffect` + `appWindow.onResized()` でリサイズイベントを購読し、最大/通常アイコンをリアルタイム同期
- **ボタンのダブルクリック伝播防止**: 各操作ボタンの `onDoubleClick` で `stopPropagation()` し、誤動作を防止
- **`appWindow` のスコープ**: モジュールスコープで一度だけ `getCurrentWindow()` を実行（レンダリングごとの再生成を防止）
- **テーマ対応**: `--titlebar-*` CSS 変数でライト / ダーク / セピア 3 テーマに自動追従

### AIProvider withModelOverride 実装（2026-04-10 完了）

各プロバイダークラスに `withModelOverride` メソッドを実装。

#### 変更内容

| プロバイダー | 実装方法 |
|-------------|---------|
| `GeminiProvider` | 新規インスタンス作成後 `_modelOverride` 設定 |
| `OllamaProvider` | 新規インスタンス作成後 `_modelOverride` 設定 |
| `ClaudeProvider` | 新規インスタンス作成後 `_modelOverride` 設定 |
| `OpenAIProvider` | 新規インスタンス作成後 `_modelOverride` 設定 |
| `OpenAICompatibleProvider` | コンストラクタ引数でモデルオーバーライドを受け取る新インスタンス作成 |
| `buildCustomProvider` | 内部関数でモデルオーバーライドを適用し、`withModelOverride` で再構築 |

#### エラー握りつぶし解消

空の `catch` ブロックに `console.error` でログ出力を追加。以下の箇所を修正:

- `getCachedModels` / `setCachedModels` のキャッシュエラー
- 各プロバイダーの `listModels` エラー（Gemini, Ollama, Claude, OpenAI, OpenAICompatible, カスタムプロバイダー）
- `getProvider` のカスタムプロバイダーパースエラー
- `getProviderForFeature` の機能別設定取得エラー
- `listAllProviders` のカスタムプロバイダー取得エラー



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
| `s3_upload_file` | ローカルファイルをS3にアップロード（PutObject） |
| `s3_download_file` | S3からローカルにダウンロード（GetObject） |
| `s3_get_object_mtime` | S3オブジェクトのLastModifiedをUnix秒で返す（HeadObject） |
| `s3_test_connection` | ListObjectsV2（1件）でS3疎通確認 |

### 暗号化実装詳細（T2-2 + IMP-1）

- **キー導出**: PBKDF2-HMAC-SHA256、イテレーション **210,000 回**（OWASP 2023推奨値）、32 バイトキー
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

#### フォルダ同期（`sync_mode: 'folder'`）

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

#### S3同期（`sync_mode: 's3'`）— T3-3 実装済

```
Settings.tsx: S3設定（endpoint/region/bucket/access_key/secret_key/prefix）を指定
       ↓
checkConflict(): lib/s3sync.ts
  ├── invoke('get_file_mtime', localDbPath) → localMtime
  ├── invoke('s3_get_object_mtime', s3Config, 'sebastian.db') → remoteMtime
  └── 比較 → 'local_newer' | 'remote_newer' | 'same'
       ↓
Push: lib/s3sync.ts: s3Push()
  ├── setSetting(LAST_SYNC_AT, now)
  ├── closeDb()
  └── invoke('s3_upload_file', s3Config, dbPath, 'sebastian.db')
       ↓
Pull: lib/s3sync.ts: s3Pull()
  ├── closeDb()
  ├── invoke('copy_file', dbPath → backup_yyyyMMdd_HHmmss.db)
  ├── invoke('s3_download_file', s3Config, 'sebastian.db', dbPath)
  └── window.location.reload()
```

**S3設定キー**（`ENCRYPTED_KEYS` に `S3_ACCESS_KEY` / `S3_SECRET_KEY` 追加済み）:
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PREFIX`
- `S3_ACCESS_KEY` (暗号化保存), `S3_SECRET_KEY` (暗号化保存)
- `SYNC_MODE`: `'folder' | 's3' | 'none'`

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

---

## Phase 2 修正: マスターパスワード関連バグ修正（完了）

> 詳細は `docs/phase2_fixes/` を参照

Phase 2 実装完了後に発見された4件のバグを修正済み。

### Task A: Settings.tsx 修正（3サブタスク・順次処理）

| # | 内容 | 対象箇所 | ステータス |
|---|------|----------|------------|
| A-1 | マスターパスワードのスイッチデザインを他のトグルと統一 | セキュリティセクション | ✅ 完了 |
| A-2 | APIキー読み込みを `getDecryptedSetting()` に変更（二重暗号化防止） | `load()` / `handleSave()` | ✅ 完了 |
| A-3 | APIキーフィールドのグレーアウト＋編集ボタン追加 | `ApiKeyField` コンポーネント | ✅ 完了 |

### Task B: セッション自動有効化（並列実行可能）

| # | 内容 | 対象箇所 | ステータス |
|---|------|----------|------------|
| B | パスワード設定後に `unlock()` を呼び出してセッション即時有効化 | `MasterPasswordSetupModal.tsx` | ✅ 完了 |

### 修正内容詳細

**A-1**: セキュリティセクションのマスターパスワードトグルを他のスイッチ（自動起動・リマインド等）と同じレイアウト構造に統一。

**A-2**: APIキー読み込みを `getSetting()` から `getDecryptedSetting()` に変更。セッション有効時は復号された値、無効時は `null`（空欄）を返す。これにより二重暗号化を防止。

**A-3**: `ApiKeyField` コンポーネントに編集モードを追加。保存済みAPIキーがある場合、フィールドをグレーアウトして「編集」ボタンを表示。マスターパスワード有効時は編集開始でフィールドをクリア。

**B**: `handleSetup()` / `handleChangeConfirm()` でハッシュ保存後に `unlock(newPassword)` を呼び出し、即座にセッションを有効化。

### Root Cause and Resolution

```
Bug 2: handleSetup() で unlock() 未呼出 → セッション無効のまま
  → Bug 3: getDecryptedSetting() が null → API接続不可
  → Settings load で getSetting() 使用 → ENC:... がフォームに → 再保存で二重暗号化

解決:
  - B: unlock() 呼び出し追加 → セッション即時有効化
  - A-2: getDecryptedSetting() 使用 → 正常に復号
  - A-3: 編集モード管理 → 意図しない上書き防止
```

---

## Security Fix: Path Traversal Prevention (SR-1)

`write_text_file`, `read_text_file`, `copy_file` コマンドにパス検証を追加し、任意ファイルアクセスを防止。

### 実装内容

| コマンド | 変更 |
|----------|------|
| `write_text_file` | `validate_path(&path)?` 追加 |
| `read_text_file` | `validate_path(&path)?` 追加 |
| `copy_file` | `validate_path(&src)?` + `validate_path(&dest)?` 追加 |

### validate_path() 関数

```rust
fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    for component in p.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Access denied".to_string());
        }
    }
    Ok(())
}
```

- パスに `..`（ParentDir）が含まれる場合、`Err("Access denied")` を返す
- 新しいクレートは追加せず、標準ライブラリ `std::path::Component` を使用
- 日報/週報保存先・同期フォルダへの正規操作には影響なし
## Phase 2 追加修正: 暗号化フロー・カスタムプロバイダー復号（2026-04-10）

### SR-3: 暗号化失敗時の平文フォールバックを除去

`src/lib/settings.ts` の `setEncryptedSetting` 関数から、暗号化失敗時の平文保存フォールバックを削除。

**修正前:**
```typescript
export async function setEncryptedSetting(key: string, value: string): Promise<void> {
  if (shouldEncrypt(key) && value && isUnlocked()) {
    try {
      const encrypted = await encrypt(value);
      await setSetting(key, encrypted);
      return;
    } catch {
      // 暗号化失敗時は平文保存（フォールバック）  ← セキュリティリスク
    }
  }
  await setSetting(key, value);
}
```

**修正後:**
```typescript
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
```

**変更点:**
- セッションがロックされている場合、明示的にエラーをスロー
- 暗号化失敗時は平文保存ではなく例外を発生させる
- セキュリティ観点: 暗号化すべき値を平文で保存することを防止

### SR-5: カスタムプロバイダーのAPIキーが復号されない問題を修正

`src/pages/Settings.tsx` のカスタムプロバイダー読み込み時の復号ロジックを修正。

**修正前:**
```typescript
const decrypted = await getDecryptedSetting('__custom_' + p.id);  // 存在しないキーを指定
decryptedProviders.push({ ...p, apiKey: decrypted ?? p.apiKey });
```

**修正後:**
```typescript
const decrypted = await decrypt(p.apiKey);  // 直接暗号化された値を復号
decryptedProviders.push({ ...p, apiKey: decrypted });
```

**原因:**
- カスタムプロバイダーのAPIキーは `SETTING_KEYS.CUSTOM_PROVIDERS` のJSON配列内に `ENC:` 形式で保存される
- `getDecryptedSetting` は独立した設定キー用の関数であり、JSON内の値には使用できない
- `decrypt` 関数（`sessionDecrypt` のエクスポート）を直接使用する必要がある

**修正ファイル:**
- `src/lib/settings.ts`: `setEncryptedSetting` のフォールバック削除
- `src/pages/Settings.tsx`: インポートに `decrypt` を追加、カスタムプロバイダー復号ロジックを修正
